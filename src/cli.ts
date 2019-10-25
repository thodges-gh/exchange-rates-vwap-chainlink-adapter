import { calculateRate } from './index'

calculateRate('ampl', ['usdt', 'usd'], '1d').then(result => {
  process.stdout.write(JSON.stringify(result, undefined, 2));
});
