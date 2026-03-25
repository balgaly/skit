'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { profileExport } = require('../../src/commands/profile');
const { writeManifest } = require('../../src/core/manifest');
const { writeConfig } = require('../../src/core/config');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-profile-export-test-'));
}

/**
 * Capture stdout during a function call.
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

describe('skit profile export', () => {
  let tmpDir;
  let skitHome;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    fs.mkdirSync(skitHome, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates valid JSON matching the spec format', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'snir' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'snirs-skills': { type: 'own', origin: 'https://github.com/balgaly/snirs-skills', path: '/tmp/snirs-skills' },
      },
      skills: {
        'view-md': { source: 'snirs-skills', path: 'view-md' },
      },
    });

    const output = await captureStdout(() => profileExport({ skitHome }));
    const profile = JSON.parse(output);

    assert.equal(profile.skit, '1.0');
    assert.ok(profile.exported, 'Should have an exported timestamp');
    assert.ok(Array.isArray(profile.sources), 'sources should be an array');
    assert.ok(Array.isArray(profile.skills), 'skills should be an array');
  });

  it('includes user from config', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'snir' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const output = await captureStdout(() => profileExport({ skitHome }));
    const profile = JSON.parse(output);

    assert.equal(profile.user, 'snir');
  });

  it('includes all sources with origin and type', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'snirs-skills': { type: 'own', origin: 'https://github.com/balgaly/snirs-skills', path: '/tmp/snirs-skills' },
        'their-skills': { type: 'external', origin: 'https://github.com/someone/their-skills', path: '/tmp/their-skills' },
      },
      skills: {},
    });

    const output = await captureStdout(() => profileExport({ skitHome }));
    const profile = JSON.parse(output);

    assert.equal(profile.sources.length, 2);

    const own = profile.sources.find((s) => s.name === 'snirs-skills');
    assert.ok(own, 'Should include snirs-skills source');
    assert.equal(own.origin, 'https://github.com/balgaly/snirs-skills');
    assert.equal(own.type, 'own');

    const ext = profile.sources.find((s) => s.name === 'their-skills');
    assert.ok(ext, 'Should include their-skills source');
    assert.equal(ext.origin, 'https://github.com/someone/their-skills');
    assert.equal(ext.type, 'external');
  });

  it('includes all skills with source reference', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'snirs-skills': { type: 'own', origin: 'https://github.com/balgaly/snirs-skills', path: '/tmp/snirs-skills' },
        'their-skills': { type: 'external', origin: 'https://github.com/someone/their-skills', path: '/tmp/their-skills' },
      },
      skills: {
        'view-md': { source: 'snirs-skills', path: 'view-md' },
        'cool-skill': { source: 'their-skills', path: 'cool-skill' },
      },
    });

    const output = await captureStdout(() => profileExport({ skitHome }));
    const profile = JSON.parse(output);

    assert.equal(profile.skills.length, 2);

    const viewMd = profile.skills.find((s) => s.name === 'view-md');
    assert.ok(viewMd, 'Should include view-md skill');
    assert.equal(viewMd.source, 'snirs-skills');

    const coolSkill = profile.skills.find((s) => s.name === 'cool-skill');
    assert.ok(coolSkill, 'Should include cool-skill');
    assert.equal(coolSkill.source, 'their-skills');
  });

  it('includes importedFrom for standalone skills', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, {
      version: 1,
      sources: {
        _standalone: { type: 'external', path: '/tmp/_standalone' },
      },
      skills: {
        'pr-helper': {
          source: '_standalone',
          path: 'pr-helper',
          importedFrom: 'https://gist.github.com/someone/abc123',
        },
      },
    });

    const output = await captureStdout(() => profileExport({ skitHome }));
    const profile = JSON.parse(output);

    const prHelper = profile.skills.find((s) => s.name === 'pr-helper');
    assert.ok(prHelper, 'Should include pr-helper skill');
    assert.equal(prHelper.source, '_standalone');
    assert.equal(prHelper.importedFrom, 'https://gist.github.com/someone/abc123');
  });

  it('returns empty arrays with empty manifest', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const output = await captureStdout(() => profileExport({ skitHome }));
    const profile = JSON.parse(output);

    assert.equal(profile.skit, '1.0');
    assert.equal(profile.user, 'testuser');
    assert.deepStrictEqual(profile.sources, []);
    assert.deepStrictEqual(profile.skills, []);
  });

  it('outputs valid JSON to stdout (pipeable)', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'snir' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const output = await captureStdout(() => profileExport({ skitHome }));

    // Should be valid JSON with 2-space indent
    assert.doesNotThrow(() => JSON.parse(output), 'Output should be valid JSON');
    assert.ok(output.includes('\n'), 'Output should be pretty-printed');
    // Verify 2-space indentation
    assert.ok(output.includes('  "skit"'), 'Should use 2-space indent');
  });

  it('includes exported timestamp in ISO format', async () => {
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const before = new Date().toISOString();
    const output = await captureStdout(() => profileExport({ skitHome }));
    const after = new Date().toISOString();
    const profile = JSON.parse(output);

    // Exported timestamp should be a valid ISO date between before and after
    assert.ok(profile.exported >= before.slice(0, 19), 'Exported should be after test start');
    assert.ok(profile.exported <= after.slice(0, 19) + 'Z', 'Exported should be before test end');
  });

  it('uses null user when config has no user set', async () => {
    writeConfig(skitHome, { agent: 'claude-code' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const output = await captureStdout(() => profileExport({ skitHome }));
    const profile = JSON.parse(output);

    assert.equal(profile.user, null);
  });
});
