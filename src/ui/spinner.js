'use strict';

/**
 * Create a spinner with ora, falling back to plain console.log if ora is unavailable.
 * Returns an object with start(), succeed(msg), fail(msg), stop().
 *
 * @param {string} text — initial spinner text
 * @returns {{ start: Function, succeed: Function, fail: Function, stop: Function }}
 */
function spinner(text) {
  let instance = null;

  try {
    const ora = require('ora');
    instance = ora(text);
  } catch {
    // ora unavailable — use console fallback
  }

  return {
    start() {
      if (instance) {
        instance.start();
      } else {
        console.log(text);
      }
      return this;
    },
    succeed(msg) {
      if (instance) {
        instance.succeed(msg !== undefined ? msg : text);
      } else {
        console.log(msg !== undefined ? msg : text);
      }
    },
    fail(msg) {
      if (instance) {
        instance.fail(msg !== undefined ? msg : text);
      } else {
        console.error(msg !== undefined ? msg : text);
      }
    },
    stop() {
      if (instance) instance.stop();
    },
  };
}

module.exports = { spinner };
