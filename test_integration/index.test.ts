/* eslint-env mocha */
import chai = require('chai');
const expect = chai.expect;

import { run } from '../src/index';

describe('run', () => {
  const jobID = '278c97ffadb54a5bbb93cfec5f7b5503';

  context('when specifying a coin and market', () => {
    const req: InputParams = {
      id: jobID,
      data: {
        coin: 'AMPL',
        interval: '1d'
      }
    };

    it('returns data to the node', async () => {
      const [statusCode, data] = await run(req);
      expect(200).to.equal(statusCode);
      expect(jobID).to.equal(data.jobRunID);
      expect(data.data).to.not.be.empty;
    }).timeout(30000);
  });

  context('when using default parameters', () => {
    const req = {
      id: jobID,
      data: {}
    };
    it('returns data to the node', async () => {
      const [statusCode, data] = await run(req);
      expect(200).to.equal(statusCode);
      expect(jobID).to.equal(data.jobRunID);
      expect(data.data).to.not.be.empty;
    }).timeout(30000);
  });
});
