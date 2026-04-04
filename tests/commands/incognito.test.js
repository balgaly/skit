'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { incognitoOn, incognitoOff, incognitoStatus, incognitoAllow } = require('../../src/commands/incognito');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-incognito-test-'));
}

function cleanTmpDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

function captureOutput(fn) {
  const chunks = [];
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(typeof chunk === 'string' ? chunk : chunk.toString());
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = originalWrite;
  }
  return chunks.join('');
}

describe('skit incognito on', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanTmpDir(tmpDir);
  });

  it('prints enabled message on first call', () => {
    const output = captureOutput(() => incognitoOn());
    assert.ok(output.includes('enabled'), `Expected "enabled" in output, got: ${output}`);
  });

  it('creates .claude/settings.local.json', () => {
    incognitoOn();
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'settings.local.json')));
  });

  it('creates .claude/quarantine-plugins.js', () => {
    incognitoOn();
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'quarantine-plugins.js')));
  });

  it('prints already-on message when called twice', () => {
    incognitoOn();
    const output = captureOutput(() => incognitoOn());
    assert.ok(output.includes('already'), `Expected "already" in output, got: ${output}`);
  });
});

describe('skit incognito off', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanTmpDir(tmpDir);
  });

  it('prints already-off message when not enabled', () => {
    const output = captureOutput(() => incognitoOff());
    assert.ok(output.includes('already'), `Expected "already" in output, got: ${output}`);
  });

  it('prints disabled message after enabling', () => {
    incognitoOn();
    const output = captureOutput(() => incognitoOff());
    assert.ok(output.includes('disabled'), `Expected "disabled" in output, got: ${output}`);
  });

  it('removes quarantine-plugins.js', () => {
    incognitoOn();
    incognitoOff();
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'quarantine-plugins.js')));
  });
});

describe('skit incognito status', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanTmpDir(tmpDir);
  });

  it('shows OFF when not enabled', () => {
    const output = captureOutput(() => incognitoStatus());
    assert.ok(output.includes('OFF'), `Expected "OFF" in output, got: ${output}`);
  });

  it('shows ON when enabled', () => {
    incognitoOn();
    const output = captureOutput(() => incognitoStatus());
    assert.ok(output.includes('ON'), `Expected "ON" in output, got: ${output}`);
  });
});

describe('skit incognito allow', () => {
  let tmpDir;
  let originalCwd;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    originalCwd = process.cwd();
    process.chdir(tmpDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    cleanTmpDir(tmpDir);
  });

  it('prints not-enabled message when incognito is off', () => {
    const output = captureOutput(() => incognitoAllow('ship'));
    assert.ok(output.includes('not enabled'), `Expected "not enabled" in output, got: ${output}`);
  });

  it('prints allowed message for a skill', () => {
    incognitoOn();
    const output = captureOutput(() => incognitoAllow('ship'));
    assert.ok(output.includes('ship'), `Expected skill name in output, got: ${output}`);
  });

  it('prints allowed message for a plugin', () => {
    incognitoOn();
    const output = captureOutput(() => incognitoAllow('superpowers@claude-plugins-official'));
    assert.ok(output.includes('superpowers@claude-plugins-official'), `Expected plugin name in output, got: ${output}`);
  });

  it('writes Skill(name) to settings.local.json allow list', () => {
    incognitoOn();
    incognitoAllow('ship');
    const settings = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.local.json'), 'utf-8'));
    assert.ok((settings.permissions.allow || []).includes('Skill(ship)'));
  });
});
