const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { linkSkill, unlinkSkill, isLinked, getLinkTarget } = require('../../src/core/linker');

/**
 * Helper: create a temp directory with a unique name under os.tmpdir().
 * Returns the absolute path.
 */
function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('linker', () => {
  let tmpDir;
  let sourceDir;
  let targetDir;

  beforeEach(() => {
    tmpDir = makeTempDir('skit-linker-test-');
    sourceDir = path.join(tmpDir, 'source-skill');
    targetDir = path.join(tmpDir, 'links');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(targetDir, { recursive: true });
    // Put a marker file in the source so we can verify the link works
    fs.writeFileSync(path.join(sourceDir, 'skill.md'), '# Test Skill');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('linkSkill', () => {
    it('should create a working link that can read files through it', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      linkSkill(sourceDir, linkPath);

      // The link target should be readable
      const content = fs.readFileSync(path.join(linkPath, 'skill.md'), 'utf8');
      assert.equal(content, '# Test Skill');
    });

    it('should create a symlink/junction at the target path', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      linkSkill(sourceDir, linkPath);

      const stats = fs.lstatSync(linkPath);
      assert.equal(stats.isSymbolicLink(), true);
    });

    it('should resolve relative source paths to absolute', () => {
      // Use a relative path for source — linkSkill should resolve it
      const linkPath = path.join(targetDir, 'my-skill');
      const relativeSrc = path.relative(process.cwd(), sourceDir);
      linkSkill(relativeSrc, linkPath);

      const content = fs.readFileSync(path.join(linkPath, 'skill.md'), 'utf8');
      assert.equal(content, '# Test Skill');
    });

    it('should throw when source does not exist', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      const badSource = path.join(tmpDir, 'nonexistent');

      assert.throws(
        () => linkSkill(badSource, linkPath),
        (err) => {
          assert.ok(err.message.includes('does not exist'), `Expected "does not exist" in: ${err.message}`);
          return true;
        }
      );
    });

    it('should throw when target already exists', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      linkSkill(sourceDir, linkPath);

      assert.throws(
        () => linkSkill(sourceDir, linkPath),
        (err) => {
          assert.ok(err.message.includes('already exists'), `Expected "already exists" in: ${err.message}`);
          return true;
        }
      );
    });

    it('should throw when target parent directory does not exist', () => {
      const linkPath = path.join(tmpDir, 'no-such-parent', 'my-skill');

      assert.throws(
        () => linkSkill(sourceDir, linkPath),
        (err) => {
          assert.ok(err.message.includes('does not exist'), `Expected "does not exist" in: ${err.message}`);
          return true;
        }
      );
    });
  });

  describe('unlinkSkill', () => {
    it('should remove the link', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      linkSkill(sourceDir, linkPath);
      unlinkSkill(linkPath);

      assert.equal(fs.existsSync(linkPath), false);
    });

    it('should not delete the source directory', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      linkSkill(sourceDir, linkPath);
      unlinkSkill(linkPath);

      assert.equal(fs.existsSync(sourceDir), true);
      const content = fs.readFileSync(path.join(sourceDir, 'skill.md'), 'utf8');
      assert.equal(content, '# Test Skill');
    });

    it('should be a no-op if target does not exist', () => {
      const linkPath = path.join(targetDir, 'nonexistent');
      // Should not throw
      unlinkSkill(linkPath);
    });
  });

  describe('isLinked', () => {
    it('should return true for a symlink/junction', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      linkSkill(sourceDir, linkPath);

      assert.equal(isLinked(linkPath), true);
    });

    it('should return false for a regular directory', () => {
      assert.equal(isLinked(sourceDir), false);
    });

    it('should return false for a path that does not exist', () => {
      assert.equal(isLinked(path.join(tmpDir, 'nope')), false);
    });

    it('should return false for a regular file', () => {
      const filePath = path.join(tmpDir, 'regular-file.txt');
      fs.writeFileSync(filePath, 'hello');
      assert.equal(isLinked(filePath), false);
    });
  });

  describe('getLinkTarget', () => {
    it('should return the resolved source path for a link', () => {
      const linkPath = path.join(targetDir, 'my-skill');
      linkSkill(sourceDir, linkPath);

      const target = getLinkTarget(linkPath);
      // Normalize both to handle case/slash differences
      assert.equal(path.resolve(target), path.resolve(sourceDir));
    });

    it('should return null if the path is not a link', () => {
      assert.equal(getLinkTarget(sourceDir), null);
    });

    it('should return null if the path does not exist', () => {
      assert.equal(getLinkTarget(path.join(tmpDir, 'nope')), null);
    });
  });
});
