const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const DEFAULT_CONFIG = { agent: 'claude-code', user: null, skitHome: null, discovered: false };

function readConfig(skitHome) {
  const configPath = path.join(skitHome, 'config.json');
  try {
    const raw = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Warning: could not parse ${configPath}, using defaults`);
    }
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(skitHome, config) {
  fs.mkdirSync(skitHome, { recursive: true });
  const configPath = path.join(skitHome, 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

function getConfigValue(skitHome, key) {
  const config = readConfig(skitHome);
  return config[key];
}

function setConfigValue(skitHome, key, value) {
  const config = readConfig(skitHome);
  config[key] = value;
  writeConfig(skitHome, config);
}

function resolveSkitHome() {
  if (process.env.SKIT_HOME) {
    return process.env.SKIT_HOME;
  }
  return path.join(os.homedir(), '.skit');
}

module.exports = { readConfig, writeConfig, getConfigValue, setConfigValue, resolveSkitHome };
