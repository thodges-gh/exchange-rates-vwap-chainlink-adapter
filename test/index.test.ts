/* eslint-env mocha */
import chai = require('chai');
const expect = chai.expect;
import Big from 'big.js';

import { calculateVWAP } from '../src/index';

describe('vwap', () => {
	it('correctly aggregates four intervals', () => {
		const entries = [
			{
				price: new Big('3.2'),
				volume: new Big('526.58')
			},
			{
				price: new Big('10.2'),
				volume: new Big('523.58')
			},
			{
				price: new Big('0.2'),
				volume: new Big('528.98')
			},
			{
				price: new Big('1.4'),
				volume: new Big('524.455')
			},
		];
		const { price, volume } = calculateVWAP(entries);
		expect(price).to.deep.equal(new Big('3.73912516430206384784'));
		expect(volume).to.deep.equal(new Big('2103.595'));
	});
});
