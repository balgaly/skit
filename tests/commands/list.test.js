'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { list } = require('../../src/commands/list');
const { writeManifest } = require('../../src/core/manifest');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-list-test-'));
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

/**
 * Strip ANSI escape codes from a string for easier assertions.
 */
function stripAnsi(str) {
  return str.replace(/\x1B\[[0-9;]*m/g, '');
}

describe('skit list', () => {
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

  describe('no skills installed', () => {
    it('shows a helpful message when no skills are installed', async () => {
      const output = await captureStdout(() => list({ skitHome }));
      const plain = stripAnsi(output);
      assert.ok(
        plain.includes('No skills installed'),
        `Expected "No skills installed" message, got: ${plain}`
      );
    });

    it('shows helpful message with empty manifest', async () => {
      writeManifest(skitHome, { version: 1, sources: {}, skills: {} });
      const output = await captureStdout(() => list({ skitHome }));
      const plain = stripAnsi(output);
      assert.ok(
        plain.includes('No skills installed'),
        `Expected "No skills installed" message, got: ${plain}`
      );
    });
  });

  describe('skills grouped by source', () => {
    it('shows skills grouped by source with descriptions', async () => {
      writeManifest(skitHome, {
        version: 1,
        sources: {
          'my-skills': { type: 'own', path: '/tmp/my-skills' },
          'community-pack': { type: 'external', path: '/tmp/community-pack' },
        },
        skills: {
          'code-review': {
            source: 'my-skills',
            path: 'code-review',
            description: 'Automated code review',
          },
          'test-gen': {
            source: 'my-skills',
            path: 'test-gen',
            description: 'Generate unit tests',
          },
          'deploy-helper': {
            source: 'community-pack',
            path: 'deploy-helper',
            description: 'Deployment automation',
          },
        },
      });

      const output = await captureStdout(() => list({ skitHome }));
      const plain = stripAnsi(output);

      // Should show source names as group headers
      assert.ok(plain.includes('my-skills'), `Should show source "my-skills", got: ${plain}`);
      assert.ok(plain.includes('community-pack'), `Should show source "community-pack", got: ${plain}`);

      // Should show skill names
      assert.ok(plain.includes('code-review'), `Should show skill "code-review", got: ${plain}`);
      assert.ok(plain.includes('test-gen'), `Should show skill "test-gen", got: ${plain}`);
      assert.ok(plain.includes('deploy-helper'), `Should show skill "deploy-helper", got: ${plain}`);

      // Should show descriptions
      assert.ok(plain.includes('Automated code review'), `Should show description, got: ${plain}`);
      assert.ok(plain.includes('Generate unit tests'), `Should show description, got: ${plain}`);
      assert.ok(plain.includes('Deployment automation'), `Should show description, got: ${plain}`);
    });

    it('handles skills with no description', async () => {
      writeManifest(skitHome, {
        version: 1,
        sources: {
          'my-skills': { type: 'own', path: '/tmp/my-skills' },
        },
        skills: {
          'no-desc-skill': {
            source: 'my-skills',
            path: 'no-desc-skill',
          },
        },
      });

      const output = await captureStdout(() => list({ skitHome }));
      const plain = stripAnsi(output);

      assert.ok(plain.includes('no-desc-skill'), `Should show skill name, got: ${plain}`);
      assert.ok(plain.includes('No description'), `Should show fallback description, got: ${plain}`);
    });
  });

  describe('--source filter', () => {
    beforeEach(() => {
      writeManifest(skitHome, {
        version: 1,
        sources: {
          'alpha-pack': { type: 'external', path: '/tmp/alpha' },
          'beta-pack': { type: 'external', path: '/tmp/beta' },
        },
        skills: {
          'alpha-skill': {
            source: 'alpha-pack',
            path: 'alpha-skill',
            description: 'From alpha',
          },
          'beta-skill': {
            source: 'beta-pack',
            path: 'beta-skill',
            description: 'From beta',
          },
          'another-alpha': {
            source: 'alpha-pack',
            path: 'another-alpha',
            description: 'Also from alpha',
          },
        },
      });
    });

    it('filters to show only skills from the specified source', async () => {
      const output = await captureStdout(() => list({ skitHome, source: 'alpha-pack' }));
      const plain = stripAnsi(output);

      // Should show alpha skills
      assert.ok(plain.includes('alpha-skill'), `Should show alpha-skill, got: ${plain}`);
      assert.ok(plain.includes('another-alpha'), `Should show another-alpha, got: ${plain}`);
      assert.ok(plain.includes('alpha-pack'), `Should show source header, got: ${plain}`);

      // Should NOT show beta skills
      assert.ok(!plain.includes('beta-skill'), `Should NOT show beta-skill, got: ${plain}`);
      assert.ok(!plain.includes('beta-pack'), `Should NOT show beta-pack header, got: ${plain}`);
    });

    it('shows message for nonexistent source', async () => {
      const output = await captureStdout(() => list({ skitHome, source: 'nonexistent' }));
      const plain = stripAnsi(output);

      assert.ok(
        plain.includes('No skills found') || plain.includes('nonexistent'),
        `Expected message about no skills from source, got: ${plain}`
      );
    });
  });
});
