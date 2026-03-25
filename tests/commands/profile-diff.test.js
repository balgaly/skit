'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { profileDiff } = require('../../src/commands/profile');
const { writeManifest } = require('../../src/core/manifest');
const { writeConfig } = require('../../src/core/config');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-profile-diff-test-'));
}

/**
 * Capture console.log output during a function call.
 */
async function captureLog(fn) {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => {
    lines.push(args.join(' '));
  };
  try {
    await fn();
  } finally {
    console.log = originalLog;
  }
  return lines.join('\n');
}

/**
 * Write a profile JSON file to disk.
 */
function writeProfile(filePath, profile) {
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
}

function makeProfile(skills = [], sources = []) {
  return {
    skit: '1.0',
    user: 'other-user',
    exported: new Date().toISOString(),
    sources,
    skills,
  };
}

describe('skit profile diff', () => {
  let tmpDir;
  let skitHome;
  let profilePath;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    fs.mkdirSync(skitHome, { recursive: true });
    profilePath = path.join(tmpDir, 'other-profile.json');
    writeConfig(skitHome, { agent: 'claude-code', user: 'me' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('shows skills in profile but not installed (missing)', async () => {
    // Local manifest has no skills
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    // Profile has 2 skills
    writeProfile(profilePath, makeProfile(
      [
        { name: 'code-reviewer', source: 'snirs-skills' },
        { name: 'test-runner', source: 'their-skills' },
      ],
      [
        { name: 'snirs-skills', type: 'own', origin: 'https://github.com/snir/skills' },
        { name: 'their-skills', type: 'external', origin: 'https://github.com/them/skills' },
      ]
    ));

    const output = await captureLog(() => profileDiff(profilePath, { skitHome }));

    assert.ok(output.includes('code-reviewer'), 'Should list code-reviewer as missing');
    assert.ok(output.includes('snirs-skills'), 'Should show source for code-reviewer');
    assert.ok(output.includes('test-runner'), 'Should list test-runner as missing');
    assert.ok(output.includes('their-skills'), 'Should show source for test-runner');
    // Should mention "missing" section header
    assert.ok(output.includes('missing') || output.includes('Missing'), 'Should have missing section');
  });

  it('shows skills installed but not in profile (extra)', async () => {
    // Local manifest has 1 skill
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'my-stuff': { type: 'own', origin: 'https://github.com/me/stuff' },
      },
      skills: {
        'my-custom-tool': { source: 'my-stuff', path: 'my-custom-tool' },
      },
    });

    // Profile is empty
    writeProfile(profilePath, makeProfile([], []));

    const output = await captureLog(() => profileDiff(profilePath, { skitHome }));

    assert.ok(output.includes('my-custom-tool'), 'Should list my-custom-tool as extra');
    assert.ok(output.includes('my-stuff'), 'Should show source for my-custom-tool');
    // Should mention "only you have" section header
    assert.ok(output.includes('only you') || output.includes('Only you'), 'Should have extra section');
  });

  it('shows same skill from different source', async () => {
    // Local has code-reviewer from my-skills
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'my-skills': { type: 'own', origin: 'https://github.com/me/skills' },
      },
      skills: {
        'code-reviewer': { source: 'my-skills', path: 'code-reviewer' },
      },
    });

    // Profile has code-reviewer from snirs-skills
    writeProfile(profilePath, makeProfile(
      [{ name: 'code-reviewer', source: 'snirs-skills' }],
      [{ name: 'snirs-skills', type: 'own', origin: 'https://github.com/snir/skills' }]
    ));

    const output = await captureLog(() => profileDiff(profilePath, { skitHome }));

    assert.ok(output.includes('code-reviewer'), 'Should list code-reviewer as different source');
    assert.ok(output.includes('my-skills'), 'Should show local source');
    assert.ok(output.includes('snirs-skills'), 'Should show their source');
    assert.ok(output.includes('different source') || output.includes('Different source'),
      'Should have different source section');
  });

  it('shows no differences when setups are identical', async () => {
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'shared-skills': { type: 'external', origin: 'https://github.com/org/skills' },
      },
      skills: {
        'code-reviewer': { source: 'shared-skills', path: 'code-reviewer' },
        'test-runner': { source: 'shared-skills', path: 'test-runner' },
      },
    });

    writeProfile(profilePath, makeProfile(
      [
        { name: 'code-reviewer', source: 'shared-skills' },
        { name: 'test-runner', source: 'shared-skills' },
      ],
      [{ name: 'shared-skills', type: 'external', origin: 'https://github.com/org/skills' }]
    ));

    const output = await captureLog(() => profileDiff(profilePath, { skitHome }));

    // All counts should be 0
    assert.ok(output.includes('(0)'), 'Should show (0) for all categories');
    // Should not list any skill names in a diff context
    assert.ok(!output.includes('+'), 'Should have no + entries');
    assert.ok(!output.includes('-'), 'Should have no - entries');
    assert.ok(!output.includes('~'), 'Should have no ~ entries');
  });

  it('handles empty profile file', async () => {
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'my-skills': { type: 'own', origin: 'https://github.com/me/skills' },
      },
      skills: {
        'my-tool': { source: 'my-skills', path: 'my-tool' },
      },
    });

    writeProfile(profilePath, makeProfile([], []));

    const output = await captureLog(() => profileDiff(profilePath, { skitHome }));

    // Missing should be 0
    assert.ok(output.includes('missing (0)') || output.includes('Missing (0)'),
      'Should show 0 missing skills');
    // Extra should show my-tool
    assert.ok(output.includes('my-tool'), 'Should show my-tool as extra');
  });

  it('errors on non-existent file', async () => {
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

    const output = await captureLog(() =>
      profileDiff(path.join(tmpDir, 'nonexistent.json'), { skitHome })
    );

    assert.ok(output.includes('Error') || output.includes('error'),
      'Should show an error message');
    assert.ok(output.includes('not found') || output.includes('ENOENT'),
      'Should mention file not found');
  });

  it('errors on invalid JSON', async () => {
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });
    fs.writeFileSync(profilePath, 'not valid json {{{', 'utf-8');

    const output = await captureLog(() => profileDiff(profilePath, { skitHome }));

    assert.ok(output.includes('Error') || output.includes('error'),
      'Should show an error message');
  });
});
