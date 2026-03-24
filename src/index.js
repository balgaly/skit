const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { readConfig, writeConfig } = require('./core/config');
const { readManifest, writeManifest } = require('./core/manifest');
const { getAdapter } = require('./agents/index');

/**
 * Resolve the SKIT_HOME directory.
 * 1. Check SKIT_HOME env var
 * 2. Fall back to ~/.skit
 * @returns {string} absolute path to skit home
 */
function resolveSkitHome() {
  if (process.env.SKIT_HOME) {
    return process.env.SKIT_HOME;
  }
  return path.join(os.homedir(), '.skit');
}

/**
 * Create the skit directory structure if missing.
 * @param {string} skitHome — absolute path to skit home
 */
function ensureDirs(skitHome) {
  fs.mkdirSync(path.join(skitHome, 'sources', 'own'), { recursive: true });
  fs.mkdirSync(path.join(skitHome, 'sources', 'external', '_standalone'), { recursive: true });
  fs.mkdirSync(path.join(skitHome, 'profiles'), { recursive: true });
}

/**
 * Load config from skitHome.
 * @param {string} skitHome
 * @returns {object} config
 */
function loadConfig(skitHome) {
  return readConfig(skitHome);
}

/**
 * Load manifest from skitHome.
 * @param {string} skitHome
 * @returns {object} manifest
 */
function loadManifest(skitHome) {
  return readManifest(skitHome);
}

/**
 * Save config to skitHome.
 * @param {string} skitHome
 * @param {object} config
 */
function saveConfig(skitHome, config) {
  writeConfig(skitHome, config);
}

/**
 * Save manifest to skitHome.
 * @param {string} skitHome
 * @param {object} manifest
 */
function saveManifest(skitHome, manifest) {
  writeManifest(skitHome, manifest);
}

/**
 * Get agent adapter by name.
 * If no name given, loads config and uses config.agent.
 * @param {string} [name] — adapter name
 * @returns {object} adapter module
 */
function getAgentAdapter(name) {
  if (!name) {
    const skitHome = resolveSkitHome();
    const config = loadConfig(skitHome);
    name = config.agent;
  }
  return getAdapter(name);
}

module.exports = {
  resolveSkitHome,
  ensureDirs,
  loadConfig,
  loadManifest,
  saveConfig,
  saveManifest,
  getAgentAdapter,
};
