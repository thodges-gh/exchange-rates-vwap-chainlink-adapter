"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const request = require("request-promise-native");
const big_js_1 = require("big.js");
const winston = require("winston");
const gcloud_logger_1 = require("./gcloud-logger");
const MAX_QUOTE_ASSETS = 5;
let logger = winston.createLogger({
    level: 'info',
    transports: [
        new winston.transports.Console(),
    ],
});
exports.fetchQuoteAssets = async (baseAsset) => {
    const url = 'https://reference-data-api.kaiko.io/v1/instruments';
    const instrumentsResponse = await request({
        url,
        json: true
    });
    logger.info('Forwarding request', {
        url
    });
    const quoteAssets = Array.from(new Set(instrumentsResponse.data
        .filter((instrument) => !!instrument.quote_asset && instrument.base_asset === baseAsset)
        .map((instrument) => instrument.quote_asset)))
        .slice(0, MAX_QUOTE_ASSETS);
    return quoteAssets;
};
exports.fetchMarketData = async (region, endpoint, params) => {
    const url = `https://${region}.market-api.kaiko.io/v1/data/trades.v1/${endpoint}?${params}`;
    const headers = {
        'X-Api-Key': process.env.API_KEY,
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
    if (quoteAsset === 'usd') {
        return await exports.fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval);
    }
    const [baseQuote, quoteUSD] = await Promise.all([
        exports.fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval),
        exports.fetchDirectSpotExchangeRate(quoteAsset, 'usd', interval)
    ]);
    return {
        quoteAsset,
        volume: baseQuote.volume,
        price: baseQuote.price.mul(quoteUSD.price)
    };
};
exports.calculateVWAP = (entries) => {
    const volume = entries.reduce(((acc, { volume: v }) => acc.plus(v)), new big_js_1.default(0));
    const price = entries.reduce(((acc, { price: p, volume: v }) => acc.plus(p.mul(v))), new big_js_1.default(0)).div(volume);
    return {
        price,
        volume
    };
};
exports.calculateRate = async (baseAsset, interval) => {
    const quoteAssets = await exports.fetchQuoteAssets(baseAsset);
    const constituents = await Promise.all(quoteAssets.map(async (quoteAsset) => await exports.fetchRate(baseAsset, quoteAsset, interval)));
    const { price, volume } = exports.calculateVWAP(constituents);
    const result = {
        baseAsset,
        quoteAssets,
        price: price.toString(),
        volume: volume.toString(),
        result: parseFloat(price.toString()),
        constituents: constituents.map(c => ({
            quoteAsset: c.quoteAsset,
            volume: c.volume.toString(),
            price: c.price.toString(),
        }))
    };
    return result;
};
exports.run = async (input) => {
    if (!/^[a-zA-Z0-9]{1,100}$/.test(process.env.API_KEY)) {
        logger.error(`Invalid or missing API_KEY ${process.env.API_KEY}`);
    }
    const baseAsset = (input.data.coin || process.env.BASE_ASSET || 'ampl').toLowerCase();
    const interval = input.data.interval || '5m';
    if (!/^[a-zA-Z0-9_]{1,50}$/.test(baseAsset)) {
        logger.error(`Invalid or missing BASE_ASSET ${baseAsset}`);
    }
    logger.info('Received request', {
        ...input,
        data: {
            ...input.data,
            baseAsset,
            interval
        }
    });
    try {
        const data = await exports.calculateRate(baseAsset, interval);
        return [200, {
                jobRunID: input.id,
                status: 'completed',
                result: data.result,
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
    exports.run(req.body).then(([statusCode, data]) => {
        res.status(statusCode).send(data);
    });
};
// AWS Lambda handler
exports.handler = (event, context, callback) => {
    exports.run(event).then(([statusCode, data]) => {
        callback(null, data);
    });
};
//# sourceMappingURL=index.js.map