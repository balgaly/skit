'use strict';

const format = require('../ui/format');
const { resolveSkitHome, ensureDirs } = require('../index');
const { getConfigValue, setConfigValue } = require('../core/config');
const { listAdapters } = require('../agents/index');

const VALID_KEYS = ['agent', 'user', 'skitHome'];

/**
 * Handle `skit config get <key>`
 * @param {string} key
 * @param {object} options — commander options (unused for now)
 */
function configGet(key, options) {
  if (!VALID_KEYS.includes(key)) {
    console.log(format.error(`Invalid config key: "${key}". Valid keys: ${VALID_KEYS.join(', ')}`));
    return;
  }

  const skitHome = resolveSkitHome();
  ensureDirs(skitHome);

  const value = getConfigValue(skitHome, key);

  if (value === null || value === undefined) {
    console.log(format.warn(`${key} is not set`));
  } else {
    console.log(value);
  }
}

/**
 * Handle `skit config set <key> <value>`
 * @param {string} key
 * @param {string} value
 * @param {object} options — commander options (unused for now)
 */
function configSet(key, value, options) {
  if (!VALID_KEYS.includes(key)) {
    console.log(format.error(`Invalid config key: "${key}". Valid keys: ${VALID_KEYS.join(', ')}`));
    return;
  }

  if (key === 'agent') {
    const valid = listAdapters();
    if (!valid.includes(value)) {
      console.log(format.error(`Unknown agent: "${value}". Available: ${valid.join(', ')}`));
      return;
    }
  }

  const skitHome = resolveSkitHome();
  ensureDirs(skitHome);

  setConfigValue(skitHome, key, value);
  console.log(format.success(`Set ${key} = ${value}`));
}

module.exports = { configGet, configSet, VALID_KEYS };
