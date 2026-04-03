const adapters = {
  'claude-code': require('./claude-code'),
  'cursor': require('./cursor'),
  'windsurf': require('./windsurf'),
};

/**
 * Returns the adapter module for the given agent name.
 * @param {string} name — adapter name (e.g. 'claude-code')
 * @returns {object} adapter module
 */
function getAdapter(name) {
  const adapter = adapters[name];
  if (!adapter) {
    throw new Error(`Unknown agent adapter: "${name}". Available adapters: ${listAdapters().join(', ')}`);
  }
  return adapter;
}

/**
 * Returns array of available adapter names.
 * @returns {string[]}
 */
function listAdapters() {
  return Object.keys(adapters);
}

module.exports = { getAdapter, listAdapters };
