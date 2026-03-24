'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { doctor } = require('../../src/commands/doctor');
const { writeManifest } = require('../../src/core/manifest');
const { linkSkill } = require('../../src/core/linker');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-doctor-test-'));
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

describe('skit doctor', () => {
  let tmpDir;
  let skitHome;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(skitHome, { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'sources', 'external', '_standalone'), { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'sources', 'own'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('healthy setup (no issues)', () => {
    it('reports all healthy when skills and links are intact', async () => {
      // Create a source directory with a skill inside
      const sourcePath = path.join(skitHome, 'sources', 'external', 'my-pack');
      const skillSourceDir = path.join(sourcePath, 'code-review');
      fs.mkdirSync(skillSourceDir, { recursive: true });

      // Write manifest with source and skill
      writeManifest(skitHome, {
        version: 1,
        sources: {
          'my-pack': {
            type: 'external',
            localPath: sourcePath,
            url: 'https://github.com/user/my-pack',
          },
        },
        skills: {
          'code-review': {
            source: 'my-pack',
            path: 'code-review',
            sourcePath: skillSourceDir,
          },
        },
      });

      // Create the junction/symlink in agent skill dir
      linkSkill(skillSourceDir, path.join(agentSkillDir, 'code-review'));

      const result = await doctor({
        skitHome,
        agentSkillDir,
        skipUpdates: true,
      });

      assert.equal(result.issues, 0, 'Should have 0 issues');
      assert.equal(result.brokenLinks.length, 0);
      assert.equal(result.unusedSources.length, 0);
    });

    it('prints healthy message to stdout', async () => {
      const sourcePath = path.join(skitHome, 'sources', 'external', 'my-pack');
      const skillSourceDir = path.join(sourcePath, 'code-review');
      fs.mkdirSync(skillSourceDir, { recursive: true });

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'my-pack': {
            type: 'external',
            localPath: sourcePath,
            url: 'https://github.com/user/my-pack',
          },
        },
        skills: {
          'code-review': {
            source: 'my-pack',
            path: 'code-review',
            sourcePath: skillSourceDir,
          },
        },
      });

      linkSkill(skillSourceDir, path.join(agentSkillDir, 'code-review'));

      const output = await captureStdout(() =>
        doctor({ skitHome, agentSkillDir, skipUpdates: true })
      );
      const plain = stripAnsi(output);

      assert.ok(plain.includes('0 issues'), `Should say 0 issues, got: ${plain}`);
    });
  });

  describe('broken links — junction missing', () => {
    it('detects when junction does not exist in agent dir', async () => {
      const sourcePath = path.join(skitHome, 'sources', 'external', 'my-pack');
      const skillSourceDir = path.join(sourcePath, 'pr-helper');
      fs.mkdirSync(skillSourceDir, { recursive: true });

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'my-pack': {
            type: 'external',
            localPath: sourcePath,
            url: 'https://github.com/user/my-pack',
          },
        },
        skills: {
          'pr-helper': {
            source: 'my-pack',
            path: 'pr-helper',
            sourcePath: skillSourceDir,
          },
        },
      });

      // Intentionally do NOT create the link
      const result = await doctor({
        skitHome,
        agentSkillDir,
        skipUpdates: true,
      });

      assert.ok(result.issues > 0, 'Should have at least 1 issue');
      assert.equal(result.brokenLinks.length, 1);
      assert.equal(result.brokenLinks[0].skill, 'pr-helper');
      assert.equal(result.brokenLinks[0].reason, 'junction missing');
    });

    it('prints broken link details to stdout', async () => {
      const sourcePath = path.join(skitHome, 'sources', 'external', 'my-pack');
      const skillSourceDir = path.join(sourcePath, 'pr-helper');
      fs.mkdirSync(skillSourceDir, { recursive: true });

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'my-pack': {
            type: 'external',
            localPath: sourcePath,
            url: 'https://github.com/user/my-pack',
          },
        },
        skills: {
          'pr-helper': {
            source: 'my-pack',
            path: 'pr-helper',
            sourcePath: skillSourceDir,
          },
        },
      });

      const output = await captureStdout(() =>
        doctor({ skitHome, agentSkillDir, skipUpdates: true })
      );
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Broken links'), `Should show broken links header, got: ${plain}`);
      assert.ok(plain.includes('pr-helper'), `Should mention pr-helper, got: ${plain}`);
    });
  });

  describe('broken links — source directory missing', () => {
    it('detects when source directory does not exist on disk', async () => {
      const fakePath = path.join(skitHome, 'sources', 'external', 'gone-pack');
      // Do NOT create the directory

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'gone-pack': {
            type: 'external',
            localPath: fakePath,
            url: 'https://github.com/user/gone-pack',
          },
        },
        skills: {
          'vanished-skill': {
            source: 'gone-pack',
            path: 'vanished-skill',
            sourcePath: path.join(fakePath, 'vanished-skill'),
          },
        },
      });

      const result = await doctor({
        skitHome,
        agentSkillDir,
        skipUpdates: true,
      });

      assert.ok(result.issues > 0, 'Should have at least 1 issue');
      assert.ok(
        result.brokenLinks.some((b) => b.skill === 'vanished-skill' && b.reason === 'source missing'),
        `Should detect source missing, got: ${JSON.stringify(result.brokenLinks)}`
      );
    });
  });

  describe('unused sources', () => {
    it('detects sources with no skills installed from them', async () => {
      const usedSource = path.join(skitHome, 'sources', 'external', 'used-pack');
      const unusedSource = path.join(skitHome, 'sources', 'external', 'old-tools');
      const skillDir = path.join(usedSource, 'my-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.mkdirSync(unusedSource, { recursive: true });

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'used-pack': {
            type: 'external',
            localPath: usedSource,
            url: 'https://github.com/user/used-pack',
          },
          'old-tools': {
            type: 'external',
            localPath: unusedSource,
            url: 'https://github.com/user/old-tools',
          },
        },
        skills: {
          'my-skill': {
            source: 'used-pack',
            path: 'my-skill',
            sourcePath: skillDir,
          },
        },
      });

      // Create link for the used skill
      linkSkill(skillDir, path.join(agentSkillDir, 'my-skill'));

      const result = await doctor({
        skitHome,
        agentSkillDir,
        skipUpdates: true,
      });

      assert.equal(result.unusedSources.length, 1);
      assert.equal(result.unusedSources[0], 'old-tools');
    });

    it('prints unused sources info to stdout', async () => {
      const unusedSource = path.join(skitHome, 'sources', 'external', 'old-tools');
      fs.mkdirSync(unusedSource, { recursive: true });

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'old-tools': {
            type: 'external',
            localPath: unusedSource,
            url: 'https://github.com/user/old-tools',
          },
        },
        skills: {},
      });

      const output = await captureStdout(() =>
        doctor({ skitHome, agentSkillDir, skipUpdates: true })
      );
      const plain = stripAnsi(output);

      assert.ok(plain.includes('Unused sources'), `Should show unused sources header, got: ${plain}`);
      assert.ok(plain.includes('old-tools'), `Should mention old-tools, got: ${plain}`);
    });
  });

  describe('issue count', () => {
    it('reports correct total issue count with multiple problems', async () => {
      const sourcePath = path.join(skitHome, 'sources', 'external', 'my-pack');
      const skillDir = path.join(sourcePath, 'skill-a');
      fs.mkdirSync(skillDir, { recursive: true });

      const unusedSource = path.join(skitHome, 'sources', 'external', 'old-tools');
      fs.mkdirSync(unusedSource, { recursive: true });

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'my-pack': {
            type: 'external',
            localPath: sourcePath,
            url: 'https://github.com/user/my-pack',
          },
          'old-tools': {
            type: 'external',
            localPath: unusedSource,
            url: 'https://github.com/user/old-tools',
          },
        },
        skills: {
          // skill-a: source exists but junction is missing (1 issue)
          'skill-a': {
            source: 'my-pack',
            path: 'skill-a',
            sourcePath: skillDir,
          },
          // skill-b: source dir missing entirely (1 issue)
          'skill-b': {
            source: 'my-pack',
            path: 'skill-b',
            sourcePath: path.join(sourcePath, 'skill-b'),
          },
        },
        // old-tools is unused (1 issue)
      });

      const result = await doctor({
        skitHome,
        agentSkillDir,
        skipUpdates: true,
      });

      // 2 broken links + 1 unused source = 3 issues
      assert.equal(result.brokenLinks.length, 2, 'Should have 2 broken links');
      assert.equal(result.unusedSources.length, 1, 'Should have 1 unused source');
      assert.equal(result.issues, 3, 'Should have 3 total issues');
    });

    it('prints fix suggestions when issues are found', async () => {
      const fakePath = path.join(skitHome, 'sources', 'external', 'gone-pack');

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'gone-pack': {
            type: 'external',
            localPath: fakePath,
            url: 'https://github.com/user/gone-pack',
          },
        },
        skills: {
          'broken-skill': {
            source: 'gone-pack',
            path: 'broken-skill',
            sourcePath: path.join(fakePath, 'broken-skill'),
          },
        },
      });

      const output = await captureStdout(() =>
        doctor({ skitHome, agentSkillDir, skipUpdates: true })
      );
      const plain = stripAnsi(output);

      assert.ok(
        plain.includes('skit sync'),
        `Should suggest 'skit sync' to fix, got: ${plain}`
      );
    });
  });

  describe('empty manifest', () => {
    it('reports healthy with empty manifest', async () => {
      writeManifest(skitHome, { version: 1, sources: {}, skills: {} });

      const result = await doctor({
        skitHome,
        agentSkillDir,
        skipUpdates: true,
      });

      assert.equal(result.issues, 0);
      assert.equal(result.brokenLinks.length, 0);
      assert.equal(result.unusedSources.length, 0);
    });
  });
});
