const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  resolveSkitHome,
  ensureDirs,
  loadConfig,
  loadManifest,
  saveConfig,
  saveManifest,
  getAgentAdapter,
} = require('../../src/index');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-setup-test-'));
}

describe('resolveSkitHome', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.SKIT_HOME;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SKIT_HOME;
    } else {
      process.env.SKIT_HOME = originalEnv;
    }
  });

  it('uses SKIT_HOME env var when set', () => {
    process.env.SKIT_HOME = '/custom/skit/home';
    assert.equal(resolveSkitHome(), '/custom/skit/home');
  });

  it('falls back to ~/.skit when SKIT_HOME is not set', () => {
    delete process.env.SKIT_HOME;
    const expected = path.join(os.homedir(), '.skit');
    assert.equal(resolveSkitHome(), expected);
  });
});

describe('ensureDirs', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates expected directory structure', () => {
    ensureDirs(tmpDir);

    assert.ok(fs.existsSync(path.join(tmpDir, 'sources', 'own')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'sources', 'external', '_standalone')));
    assert.ok(fs.existsSync(path.join(tmpDir, 'profiles')));
  });

  it('is idempotent — calling twice does not throw', () => {
    ensureDirs(tmpDir);
    ensureDirs(tmpDir);

    assert.ok(fs.existsSync(path.join(tmpDir, 'sources', 'own')));
  });
});

describe('loadConfig', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns default config for empty skitHome', () => {
    const config = loadConfig(tmpDir);
    assert.equal(config.agent, 'claude-code');
    assert.equal(config.user, null);
  });
});

describe('loadManifest', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty manifest for empty skitHome', () => {
    const manifest = loadManifest(tmpDir);
    assert.equal(manifest.version, 1);
    assert.deepEqual(manifest.sources, {});
    assert.deepEqual(manifest.skills, {});
  });
});

describe('saveConfig / saveManifest', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saveConfig persists and loadConfig reads back', () => {
    saveConfig(tmpDir, { agent: 'cursor', user: 'bob' });
    const config = loadConfig(tmpDir);
    assert.equal(config.agent, 'cursor');
    assert.equal(config.user, 'bob');
  });

  it('saveManifest persists and loadManifest reads back', () => {
    const m = { version: 1, sources: { foo: {} }, skills: { bar: { source: 'foo' } } };
    saveManifest(tmpDir, m);
    const loaded = loadManifest(tmpDir);
    assert.deepEqual(loaded.sources, { foo: {} });
    assert.equal(loaded.skills.bar.source, 'foo');
  });
});

describe('getAgentAdapter', () => {
  let tmpDir;
  let originalEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalEnv = process.env.SKIT_HOME;
    process.env.SKIT_HOME = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnv === undefined) {
      delete process.env.SKIT_HOME;
    } else {
      process.env.SKIT_HOME = originalEnv;
    }
  });

  it('returns claude-code adapter by default', () => {
    const adapter = getAgentAdapter();
    assert.ok(adapter);
    assert.equal(typeof adapter, 'object');
  });

  it('returns claude-code adapter when explicitly requested', () => {
    const adapter = getAgentAdapter('claude-code');
    assert.ok(adapter);
  });

  it('throws for unknown adapter', () => {
    assert.throws(() => getAgentAdapter('unknown-agent'), /Unknown agent adapter/);
  });
});
