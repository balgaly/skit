const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { configGet, configSet } = require('../../src/commands/config');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-config-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

/**
 * Capture stdout during an async function call.
 */
async function captureStdout(fn) {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join('');
}

describe('skit config set', () => {
  let tmpDir;
  let originalEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalEnv = process.env.SKIT_HOME;
    process.env.SKIT_HOME = tmpDir;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SKIT_HOME;
    } else {
      process.env.SKIT_HOME = originalEnv;
    }
    cleanTmpDir(tmpDir);
  });

  it('sets a value that config get can read back', async () => {
    await configSet('agent', 'cursor', {});
    const output = await captureStdout(() => configGet('agent', {}));
    assert.ok(output.includes('cursor'), `Expected output to contain "cursor", got: ${output}`);
  });

  it('sets user config value', async () => {
    await configSet('user', 'alice', {});
    const output = await captureStdout(() => configGet('user', {}));
    assert.ok(output.includes('alice'), `Expected output to contain "alice", got: ${output}`);
  });

  it('sets skitHome config value', async () => {
    await configSet('skitHome', '/custom/path', {});
    const output = await captureStdout(() => configGet('skitHome', {}));
    assert.ok(output.includes('/custom/path'), `Expected output to contain "/custom/path", got: ${output}`);
  });

  it('shows error for invalid key', async () => {
    const output = await captureStdout(() => configSet('invalidKey', 'value', {}));
    assert.ok(output.includes('Invalid'), `Expected error about invalid key, got: ${output}`);
  });

  it('shows error for unknown agent value', async () => {
    const output = await captureStdout(() => configSet('agent', 'windsurf', {}));
    assert.ok(output.includes('Unknown agent'), `Expected error about unknown agent, got: ${output}`);
  });

  it('does not persist an unknown agent value', async () => {
    await configSet('agent', 'windsurf', {});
    const output = await captureStdout(() => configGet('agent', {}));
    assert.ok(!output.includes('windsurf'), `Expected windsurf not to be stored, got: ${output}`);
  });
});

describe('skit config get', () => {
  let tmpDir;
  let originalEnv;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalEnv = process.env.SKIT_HOME;
    process.env.SKIT_HOME = tmpDir;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.SKIT_HOME;
    } else {
      process.env.SKIT_HOME = originalEnv;
    }
    cleanTmpDir(tmpDir);
  });

  it('prints value to stdout', async () => {
    await configSet('agent', 'cursor', {});
    const output = await captureStdout(() => configGet('agent', {}));
    assert.ok(output.includes('cursor'), `Expected "cursor" in output, got: ${output}`);
  });

  it('shows appropriate output for missing/unset key', async () => {
    const output = await captureStdout(() => configGet('user', {}));
    // user defaults to null, should show "not set" or similar
    assert.ok(
      output.includes('not set') || output.includes('null') || output.includes('undefined'),
      `Expected "not set" indicator for unset key, got: ${output}`
    );
  });

  it('shows error for invalid key', async () => {
    const output = await captureStdout(() => configGet('badKey', {}));
    assert.ok(output.includes('Invalid'), `Expected error about invalid key, got: ${output}`);
  });
});
