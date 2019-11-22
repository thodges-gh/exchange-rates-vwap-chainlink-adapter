import { calculateRate } from './index';

calculateRate('ampl', '1d').then(result => {
  process.stdout.write(JSON.stringify(result, undefined, 2));
});
