const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { readConfig, writeConfig, getConfigValue, setConfigValue, resolveSkitHome } = require('../../src/core/config');

const DEFAULT_CONFIG = { agent: 'claude-code', user: null, skitHome: null };

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-config-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('readConfig', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns default config when no file exists', () => {
    const config = readConfig(tmpDir);
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });

  it('reads config from file when it exists', () => {
    const custom = { agent: 'cursor', user: 'alice', skitHome: '/custom/path' };
    fs.writeFileSync(path.join(tmpDir, 'config.json'), JSON.stringify(custom));
    const config = readConfig(tmpDir);
    assert.deepStrictEqual(config, custom);
  });

  it('returns defaults when config.json contains invalid JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'config.json'), '{not valid json!!!');
    const config = readConfig(tmpDir);
    assert.deepStrictEqual(config, DEFAULT_CONFIG);
  });
});

describe('writeConfig', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('creates file and directory, then readConfig reads it back', () => {
    const nested = path.join(tmpDir, 'sub', 'dir');
    const custom = { agent: 'codex', user: 'bob', skitHome: null };
    writeConfig(nested, custom);
    const result = readConfig(nested);
    assert.deepStrictEqual(result, custom);
  });

  it('overwrites existing config', () => {
    writeConfig(tmpDir, { agent: 'a', user: 'x', skitHome: null });
    writeConfig(tmpDir, { agent: 'b', user: 'y', skitHome: '/z' });
    const result = readConfig(tmpDir);
    assert.strictEqual(result.agent, 'b');
    assert.strictEqual(result.user, 'y');
  });
});

describe('getConfigValue', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('returns value for existing key', () => {
    writeConfig(tmpDir, { agent: 'cursor', user: 'carol', skitHome: null });
    assert.strictEqual(getConfigValue(tmpDir, 'agent'), 'cursor');
    assert.strictEqual(getConfigValue(tmpDir, 'user'), 'carol');
  });

  it('returns undefined for missing key', () => {
    assert.strictEqual(getConfigValue(tmpDir, 'nonexistent'), undefined);
  });
});

describe('setConfigValue', () => {
  let tmpDir;
  beforeEach(() => { tmpDir = makeTmpDir(); });
  afterEach(() => { cleanTmpDir(tmpDir); });

  it('sets a value on existing config', () => {
    writeConfig(tmpDir, { agent: 'claude-code', user: null, skitHome: null });
    setConfigValue(tmpDir, 'user', 'dave');
    assert.strictEqual(getConfigValue(tmpDir, 'user'), 'dave');
    // other keys unchanged
    assert.strictEqual(getConfigValue(tmpDir, 'agent'), 'claude-code');
  });

  it('sets a value when no config file exists yet', () => {
    setConfigValue(tmpDir, 'agent', 'gemini');
    const config = readConfig(tmpDir);
    assert.strictEqual(config.agent, 'gemini');
    assert.strictEqual(config.user, null);
  });
});

describe('resolveSkitHome', () => {
  const originalEnv = process.env.SKIT_HOME;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SKIT_HOME;
    } else {
      process.env.SKIT_HOME = originalEnv;
    }
  });

  it('uses SKIT_HOME env var when set', () => {
    process.env.SKIT_HOME = '/custom/skit/home';
    assert.strictEqual(resolveSkitHome(), '/custom/skit/home');
  });

  it('falls back to ~/.skit when env var is not set', () => {
    delete process.env.SKIT_HOME;
    const expected = path.join(os.homedir(), '.skit');
    assert.strictEqual(resolveSkitHome(), expected);
  });
});
