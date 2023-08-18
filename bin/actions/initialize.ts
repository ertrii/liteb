import config from '../config';
import { exec } from 'child_process';

export function initialize(a) {
  config();
  console.log(a);
  exec('git status', function (err, stdout, stderr) {
    console.log(err);
    console.log(stdout);
    console.log(stderr);
  });
}
