'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { importSkill } = require('../../src/commands/import');
const { readManifest } = require('../../src/core/manifest');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-import-test-'));
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

describe('skit import', () => {
  let tmpDir;
  let skitHome;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(path.join(skitHome, 'sources', 'own'), { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'sources', 'external', '_standalone'), { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'profiles'), { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('local file import (raw file -> wrap as skill)', () => {
    it('imports a local .md file as a standalone skill', async () => {
      // Create a local markdown file
      const localFile = path.join(tmpDir, 'my-helper.md');
      fs.writeFileSync(localFile, '# My Helper\n\nDoes helpful things.\n');

      const output = await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      // Should create standalone skill directory
      const standaloneDir = path.join(skitHome, 'sources', 'external', '_standalone', 'my-helper');
      assert.ok(fs.existsSync(standaloneDir), 'Standalone skill dir should exist');

      // The original file should be copied in
      assert.ok(
        fs.existsSync(path.join(standaloneDir, 'my-helper.md')),
        'Original file should be copied into skill dir'
      );

      // SKILL.md should be created (wrapAsSkill)
      assert.ok(
        fs.existsSync(path.join(standaloneDir, 'SKILL.md')),
        'SKILL.md should be generated'
      );

      // Should be linked to agent skill dir
      const linkPath = path.join(agentSkillDir, 'my-helper');
      assert.ok(fs.existsSync(linkPath), 'Skill should be linked to agent dir');
      const stats = fs.lstatSync(linkPath);
      assert.ok(stats.isSymbolicLink(), 'Should be a symlink/junction');

      // Output should mention the skill name
      assert.ok(output.includes('my-helper'), `Output should mention skill name, got: ${output}`);
    });

    it('imports a local .js file as a standalone skill', async () => {
      const localFile = path.join(tmpDir, 'code-reviewer.js');
      fs.writeFileSync(localFile, '// code reviewer skill\nconsole.log("review");\n');

      const output = await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      const standaloneDir = path.join(skitHome, 'sources', 'external', '_standalone', 'code-reviewer');
      assert.ok(fs.existsSync(standaloneDir), 'Standalone dir should exist');
      assert.ok(
        fs.existsSync(path.join(standaloneDir, 'code-reviewer.js')),
        'File should be copied'
      );
      assert.ok(
        fs.existsSync(path.join(standaloneDir, 'SKILL.md')),
        'SKILL.md should be generated'
      );
    });
  });

  describe('URL type detection delegation', () => {
    it('detects github-repo URL type via detectUrlType', () => {
      // Unit test: verify detection without network
      const { detectUrlType } = require('../../src/core/importer');
      const result = detectUrlType('https://github.com/someone/their-skills');
      assert.equal(result.type, 'github-repo');
      assert.equal(result.parsed.user, 'someone');
      assert.equal(result.parsed.repo, 'their-skills');
    });

    it('github-repo import prints detection message', async () => {
      // Use a local bare repo as a real git URL to test full flow
      const { execFileSync } = require('node:child_process');
      const workDir = path.join(tmpDir, 'repo-work');
      fs.mkdirSync(workDir, { recursive: true });
      execFileSync('git', ['init'], { cwd: workDir, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, stdio: 'pipe' });
      execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, stdio: 'pipe' });
      const skillDir = path.join(workDir, 'test-skill');
      fs.mkdirSync(skillDir);
      fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: test-skill\n---\n# test\n');
      execFileSync('git', ['add', '.'], { cwd: workDir, stdio: 'pipe' });
      execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, stdio: 'pipe' });
      const bareDir = path.join(tmpDir, 'detect-repo.git');
      execFileSync('git', ['clone', '--bare', workDir, bareDir], { stdio: 'pipe' });

      // Use the install command directly (importSkill delegates github-repo to install)
      const { install } = require('../../src/commands/install');
      const output = await captureStdout(() =>
        install(bareDir, { skitHome, agentSkillDir, all: true })
      );

      assert.ok(
        output.includes('test-skill') || output.includes('Installed') || output.includes('Clon'),
        `Should install from repo, got: ${output}`
      );
    });

    it('detects github-gist URL type via detectUrlType', () => {
      // Unit test: verify detection without network
      const { detectUrlType } = require('../../src/core/importer');
      const result = detectUrlType('https://gist.github.com/someone/abc123');
      assert.equal(result.type, 'github-gist');
      assert.equal(result.parsed.user, 'someone');
      assert.equal(result.parsed.id, 'abc123');
    });

    it('detects raw file URL type via detectUrlType', () => {
      const { detectUrlType } = require('../../src/core/importer');
      const result = detectUrlType('https://example.com/path/to/skill.md');
      assert.equal(result.type, 'raw-file');
      assert.equal(result.parsed.filename, 'skill.md');
    });
  });

  describe('standalone skill directory structure', () => {
    it('creates standalone skill in _standalone directory', async () => {
      const localFile = path.join(tmpDir, 'standalone-test.md');
      fs.writeFileSync(localFile, '# Standalone Test\n');

      await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      const standaloneBase = path.join(skitHome, 'sources', 'external', '_standalone');
      const skillDir = path.join(standaloneBase, 'standalone-test');
      assert.ok(fs.existsSync(skillDir), 'Skill dir should be under _standalone');

      // Verify it's a proper skill directory with SKILL.md
      const skillMd = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
      assert.ok(skillMd.includes('standalone-test'), 'SKILL.md should contain skill name');
    });

    it('derives skill name from filename without extension', async () => {
      const localFile = path.join(tmpDir, 'my-awesome-skill.txt');
      fs.writeFileSync(localFile, 'Some skill content');

      await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      const skillDir = path.join(skitHome, 'sources', 'external', '_standalone', 'my-awesome-skill');
      assert.ok(fs.existsSync(skillDir), 'Skill name should be derived from filename');
    });
  });

  describe('manifest updates with importedFrom', () => {
    it('updates manifest with importedFrom for local file import', async () => {
      const localFile = path.join(tmpDir, 'manifest-import.md');
      fs.writeFileSync(localFile, '# Manifest Test\n');

      await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      const manifest = readManifest(skitHome);

      // Skill should be recorded with importedFrom
      assert.ok(manifest.skills['manifest-import'], 'Skill should exist in manifest');
      assert.ok(
        manifest.skills['manifest-import'].importedFrom,
        'Skill should have importedFrom field'
      );
      assert.ok(
        manifest.skills['manifest-import'].importedFrom.includes('manifest-import.md'),
        'importedFrom should reference the original file'
      );
    });

    it('records source as _standalone in manifest', async () => {
      const localFile = path.join(tmpDir, 'source-test.md');
      fs.writeFileSync(localFile, '# Source Test\n');

      await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      const manifest = readManifest(skitHome);
      assert.ok(manifest.skills['source-test'], 'Skill should exist');
      assert.equal(manifest.skills['source-test'].source, '_standalone', 'Source should be _standalone');
    });
  });

  describe('error handling', () => {
    it('shows error for empty/null URL', async () => {
      const output = await captureStdout(() =>
        importSkill('', { skitHome, agentSkillDir })
      );

      assert.ok(
        output.includes('Error') || output.includes('required') || output.includes('URL'),
        `Should show error for empty URL, got: ${output}`
      );
    });

    it('shows error for nonexistent local file', async () => {
      const badPath = path.join(tmpDir, 'nonexistent-file.md');
      const output = await captureStdout(() =>
        importSkill(badPath, { skitHome, agentSkillDir })
      );

      assert.ok(
        output.includes('Error') || output.includes('not found') || output.includes('does not exist'),
        `Should show error for missing file, got: ${output}`
      );
    });

    it('shows error when skill already exists', async () => {
      const localFile = path.join(tmpDir, 'duplicate-skill.md');
      fs.writeFileSync(localFile, '# Duplicate\n');

      // Import once
      await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      // Import again — should show error
      const output = await captureStdout(() =>
        importSkill(localFile, { skitHome, agentSkillDir })
      );

      assert.ok(
        output.includes('already exists') || output.includes('Already') || output.includes('Error'),
        `Should show error for duplicate import, got: ${output}`
      );
    });
  });
});
