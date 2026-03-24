'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { update } = require('../../src/commands/update');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-update-test-'));
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
 * Create a skill subdirectory with SKILL.md inside parentDir.
 */
function createSkillDir(parentDir, skillName, description) {
  const skillDir = path.join(parentDir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: ${description || 'A test skill'}\n---\n# ${skillName}\n`
  );
  return skillDir;
}

/**
 * Create a local bare git repo (acts as remote), a cloned working copy as a "source",
 * and return both paths. Also sets up a work dir for pushing new commits.
 */
function createSourceWithRemote(tmpDir, repoName, skills) {
  // Create a working repo
  const workDir = path.join(tmpDir, `${repoName}-work`);
  fs.mkdirSync(workDir, { recursive: true });

  execFileSync('git', ['init'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, stdio: 'pipe' });

  // Create skill directories
  for (const skill of skills) {
    createSkillDir(workDir, skill.name, skill.description);
  }

  execFileSync('git', ['add', '.'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, stdio: 'pipe' });

  // Create a bare clone to act as the remote
  const bareDir = path.join(tmpDir, `${repoName}.git`);
  execFileSync('git', ['clone', '--bare', workDir, bareDir], { stdio: 'pipe' });

  // Clone from bare into the "source" directory (simulates what skit install does)
  const sourceDir = path.join(tmpDir, `${repoName}-source`);
  execFileSync('git', ['clone', bareDir, sourceDir], { stdio: 'pipe' });

  return { bareDir, sourceDir, workDir };
}

/**
 * Push a new commit to the bare repo via the work dir.
 */
function pushNewCommit(workDir, bareDir, message) {
  // Ensure workDir remote points to bareDir
  try {
    execFileSync('git', ['remote', 'set-url', 'origin', bareDir], { cwd: workDir, stdio: 'pipe' });
  } catch {
    // remote may not exist yet
    execFileSync('git', ['remote', 'add', 'origin', bareDir], { cwd: workDir, stdio: 'pipe' });
  }

  // Create a change
  fs.writeFileSync(
    path.join(workDir, 'update-marker.txt'),
    `Updated at ${Date.now()}\n`
  );
  execFileSync('git', ['add', '.'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', message || 'update'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['push', 'origin', 'master'], { cwd: workDir, stdio: 'pipe' });
}

/**
 * Write a manifest file directly.
 */
function writeManifest(skitHome, manifest) {
  fs.mkdirSync(skitHome, { recursive: true });
  fs.writeFileSync(
    path.join(skitHome, 'manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8'
  );
}

describe('skit update', () => {
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

  describe('update all sources', () => {
    it('pulls all sources and reports updates', async () => {
      const { bareDir, sourceDir, workDir } = createSourceWithRemote(
        tmpDir, 'repo-a', [{ name: 'skill-a', description: 'Skill A' }]
      );

      const sha1 = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: sourceDir, encoding: 'utf-8', stdio: 'pipe',
      }).trim();

      // Register source in manifest
      writeManifest(skitHome, {
        version: 1,
        sources: {
          'repo-a': {
            type: 'external',
            path: sourceDir,
            url: bareDir,
            sha: sha1,
            installedAt: new Date().toISOString(),
          },
        },
        skills: {},
      });

      // Push a new commit to the remote
      pushNewCommit(workDir, bareDir, 'add feature');

      const output = await captureStdout(() =>
        update(undefined, { skitHome })
      );

      // Should report that repo-a was updated
      assert.ok(output.includes('repo-a'), `Output should mention source name, got: ${output}`);
      assert.ok(
        output.includes('updated') || output.includes('Updated') || output.includes('->'),
        `Output should indicate update, got: ${output}`
      );

      // Manifest SHA should be updated
      const manifest = JSON.parse(fs.readFileSync(path.join(skitHome, 'manifest.json'), 'utf-8'));
      assert.notEqual(manifest.sources['repo-a'].sha, sha1, 'SHA should have changed');
    });
  });

  describe('update specific source', () => {
    it('updates only the specified source', async () => {
      const repoA = createSourceWithRemote(
        tmpDir, 'specific-a', [{ name: 'skill-sa', description: 'SA' }]
      );
      const repoB = createSourceWithRemote(
        tmpDir, 'specific-b', [{ name: 'skill-sb', description: 'SB' }]
      );

      const shaA = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoA.sourceDir, encoding: 'utf-8', stdio: 'pipe',
      }).trim();
      const shaB = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoB.sourceDir, encoding: 'utf-8', stdio: 'pipe',
      }).trim();

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'specific-a': {
            type: 'external',
            path: repoA.sourceDir,
            url: repoA.bareDir,
            sha: shaA,
            installedAt: new Date().toISOString(),
          },
          'specific-b': {
            type: 'external',
            path: repoB.sourceDir,
            url: repoB.bareDir,
            sha: shaB,
            installedAt: new Date().toISOString(),
          },
        },
        skills: {},
      });

      // Push updates to both
      pushNewCommit(repoA.workDir, repoA.bareDir, 'update A');
      pushNewCommit(repoB.workDir, repoB.bareDir, 'update B');

      const output = await captureStdout(() =>
        update('specific-a', { skitHome })
      );

      // Should mention specific-a
      assert.ok(output.includes('specific-a'), `Output should mention specific-a, got: ${output}`);

      // Manifest: specific-a SHA should change, specific-b should not
      const manifest = JSON.parse(fs.readFileSync(path.join(skitHome, 'manifest.json'), 'utf-8'));
      assert.notEqual(manifest.sources['specific-a'].sha, shaA, 'specific-a SHA should change');
      assert.equal(manifest.sources['specific-b'].sha, shaB, 'specific-b SHA should NOT change');
    });
  });

  describe('skip _standalone source', () => {
    it('skips _standalone and reports it', async () => {
      const standaloneDir = path.join(skitHome, 'sources', 'external', '_standalone');
      fs.mkdirSync(standaloneDir, { recursive: true });

      writeManifest(skitHome, {
        version: 1,
        sources: {
          '_standalone': {
            type: 'external',
            path: standaloneDir,
            url: null,
            installedAt: new Date().toISOString(),
          },
        },
        skills: {},
      });

      const output = await captureStdout(() =>
        update(undefined, { skitHome })
      );

      // Should skip _standalone (mention skipping or just not error)
      assert.ok(
        output.includes('skip') || output.includes('Skip') || output.includes('_standalone') || output.includes('No sources'),
        `Output should handle _standalone gracefully, got: ${output}`
      );
    });
  });

  describe('nonexistent source', () => {
    it('shows error for nonexistent source name', async () => {
      writeManifest(skitHome, {
        version: 1,
        sources: {},
        skills: {},
      });

      const output = await captureStdout(() =>
        update('no-such-source', { skitHome })
      );

      assert.ok(
        output.includes('not found') || output.includes('Not found') || output.includes('Error') || output.includes('does not exist'),
        `Output should show error for missing source, got: ${output}`
      );
    });
  });

  describe('already up to date', () => {
    it('reports when source is already up to date', async () => {
      const { sourceDir, bareDir } = createSourceWithRemote(
        tmpDir, 'uptodate', [{ name: 'skill-utd', description: 'UTD' }]
      );

      const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: sourceDir, encoding: 'utf-8', stdio: 'pipe',
      }).trim();

      writeManifest(skitHome, {
        version: 1,
        sources: {
          'uptodate': {
            type: 'external',
            path: sourceDir,
            url: bareDir,
            sha,
            installedAt: new Date().toISOString(),
          },
        },
        skills: {},
      });

      // Don't push any new commits — source is already current
      const output = await captureStdout(() =>
        update(undefined, { skitHome })
      );

      assert.ok(
        output.includes('up to date') || output.includes('Up to date') || output.includes('already') || output.includes('no changes'),
        `Output should indicate already up to date, got: ${output}`
      );
    });
  });
});
