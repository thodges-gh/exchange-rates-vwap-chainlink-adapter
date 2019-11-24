import request = require('request-promise-native');

import Big from 'big.js';
import { RequestPart } from 'request';
import winston = require('winston');
import gcloudLogger from './gcloud-logger';

const MAX_QUOTE_ASSETS = 5;

let logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console(),
  ],
});

export interface VWAPEntry {
  volume: Big;
  price: Big;
}

export const fetchQuoteAssets = async (baseAsset: string): Promise<string[]> => {
  const url = 'https://reference-data-api.kaiko.io/v1/instruments';
  const instrumentsResponse = await request({
    url,
    json: true
  });
  logger.info('Forwarding request', {
    url
  });
  const quoteAssets: string[] = Array.from(new Set<string>(instrumentsResponse.data
    .filter((instrument: any) => !!instrument.quote_asset && instrument.base_asset === baseAsset)
    .map((instrument: any) => instrument.quote_asset)))
    .slice(0, MAX_QUOTE_ASSETS);
  return quoteAssets;
};

export const fetchMarketData = async (region: string, endpoint: string, params: string): Promise<any> => {
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

export const fetchDirectSpotExchangeRate = async (baseAsset: string, quoteAsset: string, interval: string) => {
  const response = await fetchMarketData('us', `spot_direct_exchange_rate/${baseAsset}/${quoteAsset}/recent`, `interval=${interval}&limit=1`);
  return {
    quoteAsset,
    volume: new Big(response.data[0].volume),
    price: new Big(response.data[0].price)
  };
};

export const fetchRate = async (baseAsset: string, quoteAsset: string, interval: string) => {
  if (quoteAsset === 'usd') {
    return await fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval);
  }
  const [baseQuote, quoteUSD] = await Promise.all([
    fetchDirectSpotExchangeRate(baseAsset, quoteAsset, interval),
    fetchDirectSpotExchangeRate(quoteAsset, 'usd', interval)
  ]);
  return {
    quoteAsset,
    volume: baseQuote.volume,
    price: baseQuote.price.mul(quoteUSD.price)
  };
};

export const calculateVWAP = (entries: VWAPEntry[]): VWAPEntry => {
  const volume = entries.reduce(((acc: Big, { volume: v }) => acc.plus(v)), new Big(0));
  const price = entries.reduce(((acc: Big, { price: p, volume: v }) => acc.plus(p.mul(v))), new Big(0)).div(volume);
  return {
    price,
    volume
  };
};

export const calculateRate = async (baseAsset: string, interval: string) => {
  const quoteAssets = await fetchQuoteAssets(baseAsset);
  const constituents = await Promise.all(quoteAssets.map(async quoteAsset =>
    await fetchRate(baseAsset, quoteAsset, interval)
  ));
  const { price, volume } = calculateVWAP(constituents);
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

export const run = async (input: InputParams): Promise<[number, ChainlinkResult]> => {
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
    const data = await calculateRate(baseAsset, interval);
    return [200, {
      jobRunID: input.id,
      status: 'completed',
      result: data.result,
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
