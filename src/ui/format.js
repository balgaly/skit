'use strict';

const chalk = require('chalk');

module.exports = {
  success: (text) => chalk.green(text),
  error:   (text) => chalk.red(text),
  warn:    (text) => chalk.yellow(text),
  dim:     (text) => chalk.dim(text),
  header:  (text) => chalk.cyan.bold(text),
  info:    (text) => chalk.cyan(text),
  bold:    (text) => chalk.bold(text),
};
