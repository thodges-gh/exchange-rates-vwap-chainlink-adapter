import request = require('request-promise-native');

import { RequestPart } from 'request';
import gcloudLogger from './gcloud-logger';
import Big from 'big.js';
import winston = require('winston');

let logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
  ],
});

interface VWAPEntry {
  volume: Big,
  price: Big
}

export const fetchMarketData = async (region: string, endpoint: string, params: string): Promise<any> => {
  const url = `https://${region}.market-api.kaiko.io/v1/data/trades.v1/${endpoint}?${params}`
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

export const fetchDirectSpotExchangeRate = async (baseAsset: string, quoteAsset: string, interval: string) => {
  const response = await fetchMarketData('us', `spot_direct_exchange_rate/${baseAsset}/${quoteAsset}/recent`, `interval=${interval}&limit=1`);
  return {
    quoteAsset,
    volume: new Big(response.data[0].volume),
    price: new Big(response.data[0].price)
  };
};

export const fetchRate = async (baseAsset: string, quoteAsset: string, interval: string) => {
  if (quoteAsset == 'usd') {
    return await fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval);
  }
  const baseQuote = await fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval);
  const quoteUSD = await fetchDirectSpotExchangeRate(quoteAsset, 'usd', interval);
  return {
    quoteAsset: quoteAsset,
    volume: baseQuote.volume,
    price: baseQuote.price.mul(quoteUSD.price)
  }
}

export const calculateVWAP = (entries: VWAPEntry[]): VWAPEntry => {
  const volume = entries.reduce(((acc: Big, { volume }) => acc.plus(volume)), new Big(0));
  const price = entries.reduce(((acc: Big, { price, volume }) => acc.plus(price.mul(volume))), new Big(0)).div(volume);
  return {
    price,
    volume
  }
};

export const calculateRate = async (baseAsset: string, quoteAssets: string[], interval: string) => {
  const constituents = await Promise.all(quoteAssets.map(async quoteAsset =>
    await fetchRate(baseAsset, quoteAsset, interval)
  ));
  const { price, volume } = calculateVWAP(constituents);
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

const run = async (input: InputParams): Promise<[Number, ChainlinkResult]> => {
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

  gcloudLogger.info('Received request', input);
  try {
    const data = await calculateRate(baseAsset, quoteAssets, input.data.interval);
    return [200, {
      jobRunID: input.id,
      status: 'completed',
      data
    }];
  } catch (err) {
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
export const gcpservice = (req: RequestPart, res: any) => {
  logger = gcloudLogger;
  run(req.body).then(([statusCode, data]) => {
    res.status(statusCode).send(data);
  });
};

// AWS Lambda handler
export const handler = (event: InputParams, context: any, callback: Callback) => {
  run(event).then(([statusCode, data]) => {
    callback(null, data);
  });
};
