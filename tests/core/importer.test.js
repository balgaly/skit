'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  detectUrlType,
  extractRepoName,
  extractGistId,
  downloadFile,
  wrapAsSkill,
} = require('../../src/core/importer');

/**
 * Helper: create a temp directory with a unique name under os.tmpdir().
 */
function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe('importer', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir('skit-importer-test-');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('detectUrlType', () => {
    it('should detect a GitHub repo root URL', () => {
      const result = detectUrlType('https://github.com/someone/their-skills');
      assert.equal(result.type, 'github-repo');
      assert.equal(result.parsed.user, 'someone');
      assert.equal(result.parsed.repo, 'their-skills');
    });

    it('should detect a GitHub repo root URL with trailing slash', () => {
      const result = detectUrlType('https://github.com/someone/their-skills/');
      assert.equal(result.type, 'github-repo');
      assert.equal(result.parsed.user, 'someone');
      assert.equal(result.parsed.repo, 'their-skills');
    });

    it('should detect a GitHub repo root URL with .git suffix', () => {
      const result = detectUrlType('https://github.com/someone/their-skills.git');
      assert.equal(result.type, 'github-repo');
      assert.equal(result.parsed.user, 'someone');
      assert.equal(result.parsed.repo, 'their-skills');
    });

    it('should detect a GitHub subfolder URL', () => {
      const result = detectUrlType('https://github.com/someone/repo/tree/main/skills/my-skill');
      assert.equal(result.type, 'github-subfolder');
      assert.equal(result.parsed.user, 'someone');
      assert.equal(result.parsed.repo, 'repo');
      assert.equal(result.parsed.branch, 'main');
      assert.equal(result.parsed.path, 'skills/my-skill');
    });

    it('should detect a GitHub subfolder URL with nested path', () => {
      const result = detectUrlType('https://github.com/user/repo/tree/develop/a/b/c');
      assert.equal(result.type, 'github-subfolder');
      assert.equal(result.parsed.branch, 'develop');
      assert.equal(result.parsed.path, 'a/b/c');
    });

    it('should detect a GitHub gist URL', () => {
      const result = detectUrlType('https://gist.github.com/someuser/abc123def456');
      assert.equal(result.type, 'github-gist');
      assert.equal(result.parsed.user, 'someuser');
      assert.equal(result.parsed.id, 'abc123def456');
    });

    it('should detect a raw GitHub URL', () => {
      const result = detectUrlType('https://raw.githubusercontent.com/user/repo/main/SKILL.md');
      assert.equal(result.type, 'raw-github');
      assert.equal(result.parsed.user, 'user');
      assert.equal(result.parsed.repo, 'repo');
      assert.equal(result.parsed.branch, 'main');
      assert.equal(result.parsed.path, 'SKILL.md');
    });

    it('should detect a raw GitHub URL with nested path', () => {
      const result = detectUrlType('https://raw.githubusercontent.com/user/repo/main/skills/foo/SKILL.md');
      assert.equal(result.type, 'raw-github');
      assert.equal(result.parsed.path, 'skills/foo/SKILL.md');
    });

    it('should detect a raw file URL with known extension', () => {
      const result = detectUrlType('https://example.com/path/to/skill.md');
      assert.equal(result.type, 'raw-file');
      assert.equal(result.parsed.url, 'https://example.com/path/to/skill.md');
      assert.equal(result.parsed.filename, 'skill.md');
    });

    it('should detect .txt files as raw-file', () => {
      const result = detectUrlType('https://example.com/my-skill.txt');
      assert.equal(result.type, 'raw-file');
    });

    it('should detect .json files as raw-file', () => {
      const result = detectUrlType('https://example.com/config.json');
      assert.equal(result.type, 'raw-file');
    });

    it('should detect .yaml and .yml files as raw-file', () => {
      assert.equal(detectUrlType('https://example.com/skill.yaml').type, 'raw-file');
      assert.equal(detectUrlType('https://example.com/skill.yml').type, 'raw-file');
    });

    it('should detect a local path', () => {
      const result = detectUrlType('/home/user/skills/my-skill');
      assert.equal(result.type, 'local-path');
      assert.equal(result.parsed.path, '/home/user/skills/my-skill');
    });

    it('should detect a Windows local path', () => {
      const result = detectUrlType('C:\\Users\\someone\\skills');
      assert.equal(result.type, 'local-path');
    });

    it('should detect a relative local path', () => {
      const result = detectUrlType('./my-skills/foo');
      assert.equal(result.type, 'local-path');
    });

    it('should throw for an empty string', () => {
      assert.throws(() => detectUrlType(''), /URL or path is required/);
    });

    it('should throw for null', () => {
      assert.throws(() => detectUrlType(null), /URL or path is required/);
    });

    it('should treat unknown URL without known extension as raw-file with unknown filename', () => {
      const result = detectUrlType('https://example.com/something');
      assert.equal(result.type, 'raw-file');
    });
  });

  describe('extractRepoName', () => {
    it('should extract repo name from a GitHub URL', () => {
      assert.equal(extractRepoName('https://github.com/someone/their-skills'), 'their-skills');
    });

    it('should extract repo name from a URL with .git suffix', () => {
      assert.equal(extractRepoName('https://github.com/someone/their-skills.git'), 'their-skills');
    });

    it('should extract repo name from a URL with trailing slash', () => {
      assert.equal(extractRepoName('https://github.com/someone/their-skills/'), 'their-skills');
    });

    it('should extract repo name from a subfolder URL', () => {
      assert.equal(extractRepoName('https://github.com/someone/repo/tree/main/skills'), 'repo');
    });

    it('should return null for a non-GitHub URL', () => {
      assert.equal(extractRepoName('https://example.com/foo'), null);
    });

    it('should return null for an invalid URL', () => {
      assert.equal(extractRepoName('not-a-url'), null);
    });
  });

  describe('extractGistId', () => {
    it('should extract gist ID from a gist URL', () => {
      assert.equal(extractGistId('https://gist.github.com/user/abc123'), 'abc123');
    });

    it('should extract gist ID from a gist URL with trailing slash', () => {
      assert.equal(extractGistId('https://gist.github.com/user/abc123/'), 'abc123');
    });

    it('should return null for a non-gist URL', () => {
      assert.equal(extractGistId('https://github.com/user/repo'), null);
    });

    it('should return null for an invalid URL', () => {
      assert.equal(extractGistId('not-a-url'), null);
    });
  });

  describe('downloadFile', () => {
    it('should throw for an invalid URL scheme', async () => {
      const dest = path.join(tmpDir, 'out.txt');
      await assert.rejects(
        () => downloadFile('ftp://example.com/file.txt', dest),
        /Only https: URLs are supported/
      );
    });

    it('should throw for a non-https URL', async () => {
      const dest = path.join(tmpDir, 'out.txt');
      await assert.rejects(
        () => downloadFile('http://example.com/file.txt', dest),
        /Only https: URLs are supported/
      );
    });

    it('should throw when URL is empty', async () => {
      const dest = path.join(tmpDir, 'out.txt');
      await assert.rejects(
        () => downloadFile('', dest),
        /URL is required/
      );
    });

    it('should throw when destPath is empty', async () => {
      await assert.rejects(
        () => downloadFile('https://example.com/file.txt', ''),
        /Destination path is required/
      );
    });

    // Network-dependent test — skipped by default
    it('should download a real file from GitHub', { skip: 'Network-dependent test' }, async () => {
      const dest = path.join(tmpDir, 'license.txt');
      await downloadFile('https://raw.githubusercontent.com/nodejs/node/main/LICENSE', dest);
      assert.ok(fs.existsSync(dest));
      const content = fs.readFileSync(dest, 'utf-8');
      assert.ok(content.length > 0);
    });
  });

  describe('wrapAsSkill', () => {
    it('should create SKILL.md when missing', () => {
      const skillDir = path.join(tmpDir, 'my-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'helper.js'), '// some code');

      wrapAsSkill(skillDir, 'my-skill', 'https://example.com/helper.js');

      const skillMdPath = path.join(skillDir, 'SKILL.md');
      assert.ok(fs.existsSync(skillMdPath));

      const content = fs.readFileSync(skillMdPath, 'utf-8');
      assert.ok(content.includes('my-skill'));
      assert.ok(content.includes('https://example.com/helper.js'));
    });

    it('should not overwrite existing SKILL.md', () => {
      const skillDir = path.join(tmpDir, 'existing-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '# Original Content');

      wrapAsSkill(skillDir, 'existing-skill', 'https://example.com/skill');

      const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
      assert.equal(content, '# Original Content');
    });

    it('should include frontmatter with imported_from', () => {
      const skillDir = path.join(tmpDir, 'imported-skill');
      fs.mkdirSync(skillDir, { recursive: true });

      wrapAsSkill(skillDir, 'imported-skill', 'https://example.com/source');

      const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
      assert.ok(content.startsWith('---'));
      assert.ok(content.includes('imported_from: https://example.com/source'));
    });

    it('should list existing files in the SKILL.md content', () => {
      const skillDir = path.join(tmpDir, 'files-skill');
      fs.mkdirSync(skillDir, { recursive: true });
      fs.writeFileSync(path.join(skillDir, 'main.js'), '// main');
      fs.writeFileSync(path.join(skillDir, 'utils.js'), '// utils');

      wrapAsSkill(skillDir, 'files-skill', 'https://example.com/files');

      const content = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
      assert.ok(content.includes('main.js'));
      assert.ok(content.includes('utils.js'));
    });

    it('should throw when dirPath does not exist', () => {
      assert.throws(
        () => wrapAsSkill(path.join(tmpDir, 'nonexistent'), 'test', 'https://example.com'),
        /Directory does not exist/
      );
    });

    it('should throw when skillName is empty', () => {
      const skillDir = path.join(tmpDir, 'no-name');
      fs.mkdirSync(skillDir, { recursive: true });

      assert.throws(
        () => wrapAsSkill(skillDir, '', 'https://example.com'),
        /Skill name is required/
      );
    });
  });
});
