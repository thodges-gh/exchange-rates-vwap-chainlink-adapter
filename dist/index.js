"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request-promise-native");
const gcloud_logger_1 = require("./gcloud-logger");
const big_js_1 = require("big.js");
const winston = require("winston");
let logger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console(),
    ],
});
exports.fetchMarketData = async (region, endpoint, params) => {
    const url = `https://${region}.market-api.kaiko.io/v1/data/trades.v1/${endpoint}?${params}`;
    const headers = {
        'X-Api-Key': process.env.CUBIT_API_KEY,
        'User-Agent': 'Kaiko Chainlink Adapter (VWAP edition)'
    };
    logger.info('Forwarding request', {
        url
    });
    const options = {
        url,
        headers,
        json: true
    };
    const response = await request(options);
    logger.info('Got response');
    return response;
};
exports.fetchDirectSpotExchangeRate = async (baseAsset, quoteAsset, interval) => {
    const response = await exports.fetchMarketData('us', `spot_direct_exchange_rate/${baseAsset}/${quoteAsset}/recent`, `interval=${interval}&limit=1`);
    return {
        quoteAsset,
        volume: new big_js_1.default(response.data[0].volume),
        price: new big_js_1.default(response.data[0].price)
    };
};
exports.fetchRate = async (baseAsset, quoteAsset, interval) => {
    if (quoteAsset == 'usd') {
        return await exports.fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval);
    }
    const baseQuote = await exports.fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval);
    const quoteUSD = await exports.fetchDirectSpotExchangeRate(quoteAsset, 'usd', interval);
    return {
        quoteAsset: quoteAsset,
        volume: baseQuote.volume,
        price: baseQuote.price.mul(quoteUSD.price)
    };
};
exports.calculateVWAP = (entries) => {
    const volume = entries.reduce(((acc, { volume }) => acc.plus(volume)), new big_js_1.default(0));
    const price = entries.reduce(((acc, { price, volume }) => acc.plus(price.mul(volume))), new big_js_1.default(0)).div(volume);
    return {
        price,
        volume
    };
};
exports.calculateRate = async (baseAsset, quoteAssets, interval) => {
    const constituents = await Promise.all(quoteAssets.map(async (quoteAsset) => await exports.fetchRate(baseAsset, quoteAsset, interval)));
    const { price, volume } = exports.calculateVWAP(constituents);
    const result = {
        baseAsset,
        quoteAssets,
        price: price.toString(),
        volume: volume.toString(),
        constituents: constituents.map(c => ({
            quoteAsset: c.quoteAsset,
            volume: c.volume.toString(),
            price: c.price.toString(),
        }))
    };
    return result;
};
const run = async (input) => {
    if (!/^[a-zA-Z0-9]{1,100}$/.test(process.env.CUBIT_API_KEY)) {
        logger.error(`Invalid or missing.CUBIT_API_KEY ${process.env.CUBIT_API_KEY}`);
    }
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(process.env.BASE_ASSET)) {
        logger.error(`Invalid or missing BASE_ASSET ${process.env.BASE_ASSET}`);
    }
    if (!/^[a-zA-Z0-9_,]{1,200}$/.test(process.env.QUOTE_ASSETS)) {
        logger.error(`Invalid or missing QUOTE_ASSETS ${process.env.QUOTE_ASSETS}`);
    }
    const baseAsset = process.env.BASE_ASSET;
    const quoteAssets = process.env.QUOTE_ASSETS.split(',');
    quoteAssets.forEach(q => {
        if (!/^[a-zA-Z0-9_]{1,50}$/.test(q)) {
            logger.error(`Invalid quote asset ${q}`);
        }
    });
    gcloud_logger_1.default.info('Received request', input);
    try {
        const data = await exports.calculateRate(baseAsset, quoteAssets, input.data.interval);
        return [200, {
                jobRunID: input.id,
                status: 'completed',
                data
            }];
    }
    catch (err) {
        const statusCode = err.statusCode || 500;
        const details = err.body || err.message;
        logger.error(err);
        return [statusCode, {
                jobRunID: input.id,
                status: 'errored',
                error: details
            }];
    }
};
// GCP Cloud Fuction handler 
exports.gcpservice = (req, res) => {
    logger = gcloud_logger_1.default;
    run(req.body).then(([statusCode, data]) => {
        res.status(statusCode).send(data);
    });
};
// AWS Lambda handler
exports.handler = (event, context, callback) => {
    run(event).then(([statusCode, data]) => {
        callback(null, data);
    });
};
//# sourceMappingURL=index.js.map