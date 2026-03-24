const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { cloneRepo, pullRepo, getCurrentSha, isGitRepo, getRemoteUrl } = require('../../src/core/git');

/**
 * Helper: create a temp directory with a unique name under os.tmpdir().
 */
function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/**
 * Helper: create a bare git repo that can act as a "remote".
 * Returns the absolute path to the bare repo.
 */
function createBareRepo(parentDir) {
  const bareDir = path.join(parentDir, 'remote.git');
  fs.mkdirSync(bareDir, { recursive: true });
  execFileSync('git', ['init', '--bare', bareDir], { encoding: 'utf-8' });
  return bareDir;
}

/**
 * Helper: clone a bare repo, add a commit, and push it back.
 * Returns the path to the working clone.
 */
function seedBareRepo(bareDir, parentDir) {
  const workDir = path.join(parentDir, 'seed-clone');
  execFileSync('git', ['clone', bareDir, workDir], { encoding: 'utf-8' });
  // Configure git user for commits in this repo
  execFileSync('git', ['-C', workDir, 'config', 'user.email', 'test@test.com'], { encoding: 'utf-8' });
  execFileSync('git', ['-C', workDir, 'config', 'user.name', 'Test'], { encoding: 'utf-8' });
  // Create an initial commit
  fs.writeFileSync(path.join(workDir, 'README.md'), '# Test Skill');
  execFileSync('git', ['-C', workDir, 'add', '.'], { encoding: 'utf-8' });
  execFileSync('git', ['-C', workDir, 'commit', '-m', 'initial commit'], { encoding: 'utf-8' });
  execFileSync('git', ['-C', workDir, 'push'], { encoding: 'utf-8' });
  return workDir;
}

describe('git', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir('skit-git-test-');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('isGitRepo', () => {
    it('should return true for a directory with .git', () => {
      const repoDir = path.join(tmpDir, 'repo');
      fs.mkdirSync(repoDir);
      fs.mkdirSync(path.join(repoDir, '.git'));

      assert.equal(isGitRepo(repoDir), true);
    });

    it('should return false for a directory without .git', () => {
      const plainDir = path.join(tmpDir, 'plain');
      fs.mkdirSync(plainDir);

      assert.equal(isGitRepo(plainDir), false);
    });

    it('should return false for a path that does not exist', () => {
      assert.equal(isGitRepo(path.join(tmpDir, 'nonexistent')), false);
    });

    it('should return true for a real git repo (git init)', () => {
      const repoDir = path.join(tmpDir, 'real-repo');
      fs.mkdirSync(repoDir);
      execFileSync('git', ['init', repoDir], { encoding: 'utf-8' });

      assert.equal(isGitRepo(repoDir), true);
    });
  });

  describe('getCurrentSha', () => {
    it('should return a 40-character hex string', () => {
      const bareDir = createBareRepo(tmpDir);
      const workDir = seedBareRepo(bareDir, tmpDir);

      const sha = getCurrentSha(workDir);
      assert.match(sha, /^[0-9a-f]{40}$/);
    });

    it('should throw for a non-git directory', () => {
      const plainDir = path.join(tmpDir, 'plain');
      fs.mkdirSync(plainDir);

      assert.throws(
        () => getCurrentSha(plainDir),
        (err) => {
          assert.ok(err.message.length > 0);
          return true;
        }
      );
    });
  });

  describe('getRemoteUrl', () => {
    it('should return the remote URL of a cloned repo', () => {
      const bareDir = createBareRepo(tmpDir);
      const workDir = seedBareRepo(bareDir, tmpDir);

      const url = getRemoteUrl(workDir);
      // The remote URL should resolve to the bare repo path
      assert.equal(path.resolve(url), path.resolve(bareDir));
    });

    it('should return null for a repo with no remote', () => {
      const repoDir = path.join(tmpDir, 'no-remote');
      fs.mkdirSync(repoDir);
      execFileSync('git', ['init', repoDir], { encoding: 'utf-8' });

      const url = getRemoteUrl(repoDir);
      assert.equal(url, null);
    });

    it('should return null for a non-git directory', () => {
      const plainDir = path.join(tmpDir, 'plain');
      fs.mkdirSync(plainDir);

      const url = getRemoteUrl(plainDir);
      assert.equal(url, null);
    });
  });

  describe('cloneRepo', () => {
    it('should clone a repo and return success with SHA', () => {
      const bareDir = createBareRepo(tmpDir);
      seedBareRepo(bareDir, tmpDir);

      const targetDir = path.join(tmpDir, 'clone-target');
      const result = cloneRepo(bareDir, targetDir);

      assert.equal(result.success, true);
      assert.match(result.sha, /^[0-9a-f]{40}$/);
      // Verify the clone actually worked
      assert.equal(fs.existsSync(path.join(targetDir, 'README.md')), true);
    });

    it('should throw when target directory already exists', () => {
      const bareDir = createBareRepo(tmpDir);
      seedBareRepo(bareDir, tmpDir);

      const targetDir = path.join(tmpDir, 'clone-target');
      fs.mkdirSync(targetDir);
      // Put a file in it so git clone will fail
      fs.writeFileSync(path.join(targetDir, 'blocker.txt'), 'x');

      assert.throws(
        () => cloneRepo(bareDir, targetDir),
        (err) => {
          assert.ok(err.message.length > 0);
          return true;
        }
      );
    });

    it('should throw for an invalid URL', () => {
      const targetDir = path.join(tmpDir, 'clone-target');

      assert.throws(
        () => cloneRepo('https://invalid.example.com/no-such-repo.git', targetDir),
        (err) => {
          assert.ok(err.message.length > 0);
          return true;
        }
      );
    });
  });

  describe('pullRepo', () => {
    it('should pull and return success when already up to date', () => {
      const bareDir = createBareRepo(tmpDir);
      const seedDir = seedBareRepo(bareDir, tmpDir);

      const cloneDir = path.join(tmpDir, 'pull-clone');
      execFileSync('git', ['clone', bareDir, cloneDir], { encoding: 'utf-8' });

      const result = pullRepo(cloneDir);
      assert.equal(result.success, true);
      assert.equal(result.updated, false);
      assert.match(result.sha, /^[0-9a-f]{40}$/);
    });

    it('should detect when new commits are pulled', () => {
      const bareDir = createBareRepo(tmpDir);
      const seedDir = seedBareRepo(bareDir, tmpDir);

      // Clone the repo
      const cloneDir = path.join(tmpDir, 'pull-clone');
      execFileSync('git', ['clone', bareDir, cloneDir], { encoding: 'utf-8' });

      const shaBefore = getCurrentSha(cloneDir);

      // Push a new commit from the seed clone
      fs.writeFileSync(path.join(seedDir, 'new-file.txt'), 'new content');
      execFileSync('git', ['-C', seedDir, 'add', '.'], { encoding: 'utf-8' });
      execFileSync('git', ['-C', seedDir, 'commit', '-m', 'second commit'], { encoding: 'utf-8' });
      execFileSync('git', ['-C', seedDir, 'push'], { encoding: 'utf-8' });

      // Pull in our clone
      const result = pullRepo(cloneDir);
      assert.equal(result.success, true);
      assert.equal(result.updated, true);
      assert.match(result.sha, /^[0-9a-f]{40}$/);
      // SHA should have changed
      assert.notEqual(result.sha, shaBefore);
    });

    it('should throw for a non-git directory', () => {
      const plainDir = path.join(tmpDir, 'plain');
      fs.mkdirSync(plainDir);

      assert.throws(
        () => pullRepo(plainDir),
        (err) => {
          assert.ok(err.message.length > 0);
          return true;
        }
      );
    });
  });
});
