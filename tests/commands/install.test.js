const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { install } = require('../../src/commands/install');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-install-test-'));
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
 * Create a local bare git repo that acts as a "remote", with skill directories.
 * Returns the path to the bare repo.
 */
function createBareRepoWithSkills(tmpDir, repoName, skills) {
  // Create a working repo first
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

  // Create a bare clone
  const bareDir = path.join(tmpDir, `${repoName}.git`);
  execFileSync('git', ['clone', '--bare', workDir, bareDir], { stdio: 'pipe' });

  return bareDir;
}

describe('skit install', () => {
  let tmpDir;
  let skitHome;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(path.join(skitHome, 'sources', 'own'), { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'sources', 'external'), { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('local path — single skill', () => {
    it('auto-installs a single skill without picker', async () => {
      // Create a source with exactly one skill
      const sourceDir = path.join(tmpDir, 'my-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      createSkillDir(sourceDir, 'only-skill', 'The only skill');

      const output = await captureStdout(() =>
        install(sourceDir, { skitHome, agentSkillDir })
      );

      // Skill should be linked
      const linkPath = path.join(agentSkillDir, 'only-skill');
      assert.ok(fs.existsSync(linkPath), 'Skill link should exist');
      const stats = fs.lstatSync(linkPath);
      assert.ok(stats.isSymbolicLink(), 'Should be a symlink/junction');

      // Should be readable through the link
      const content = fs.readFileSync(path.join(linkPath, 'SKILL.md'), 'utf-8');
      assert.ok(content.includes('only-skill'));

      // Output should mention the skill
      assert.ok(output.includes('only-skill'), `Output should mention skill name, got: ${output}`);
    });
  });

  describe('local path — multiple skills with --all', () => {
    it('installs all skills when --all flag is set', async () => {
      const sourceDir = path.join(tmpDir, 'multi-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      createSkillDir(sourceDir, 'skill-a', 'First skill');
      createSkillDir(sourceDir, 'skill-b', 'Second skill');
      createSkillDir(sourceDir, 'skill-c', 'Third skill');

      const output = await captureStdout(() =>
        install(sourceDir, { skitHome, agentSkillDir, all: true })
      );

      // All three skills should be linked
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'skill-a')), 'skill-a should be linked');
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'skill-b')), 'skill-b should be linked');
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'skill-c')), 'skill-c should be linked');

      // Output should mention count
      assert.ok(output.includes('3') || output.includes('skill-a'), `Output should mention installed skills, got: ${output}`);
    });
  });

  describe('manifest updates', () => {
    it('updates manifest with source and skills', async () => {
      const sourceDir = path.join(tmpDir, 'manifest-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      createSkillDir(sourceDir, 'manifest-skill', 'For manifest test');

      await captureStdout(() =>
        install(sourceDir, { skitHome, agentSkillDir })
      );

      // Read manifest
      const manifestPath = path.join(skitHome, 'manifest.json');
      assert.ok(fs.existsSync(manifestPath), 'Manifest should exist');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      // Source should be recorded
      const sourceName = path.basename(sourceDir);
      assert.ok(manifest.sources[sourceName], `Source "${sourceName}" should exist in manifest`);
      assert.equal(manifest.sources[sourceName].type, 'external');

      // Skill should be recorded
      assert.ok(manifest.skills['manifest-skill'], 'Skill should exist in manifest');
      assert.equal(manifest.skills['manifest-skill'].source, sourceName);
    });
  });

  describe('junction/symlink creation', () => {
    it('creates working junctions that resolve to skill content', async () => {
      const sourceDir = path.join(tmpDir, 'junction-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      const skillDir = createSkillDir(sourceDir, 'junction-skill', 'Testing junctions');

      // Add an extra file to verify junction works fully
      fs.writeFileSync(path.join(skillDir, 'extra.txt'), 'extra content');

      await captureStdout(() =>
        install(sourceDir, { skitHome, agentSkillDir })
      );

      const linkPath = path.join(agentSkillDir, 'junction-skill');
      // Read through the junction
      const extraContent = fs.readFileSync(path.join(linkPath, 'extra.txt'), 'utf-8');
      assert.equal(extraContent, 'extra content');
    });
  });

  describe('error handling', () => {
    it('shows error for nonexistent source path', async () => {
      const badPath = path.join(tmpDir, 'does-not-exist');
      const output = await captureStdout(() =>
        install(badPath, { skitHome, agentSkillDir })
      );

      assert.ok(
        output.includes('does not exist') || output.includes('not found') || output.includes('Error'),
        `Expected error message, got: ${output}`
      );

      // No skills should be linked
      const entries = fs.readdirSync(agentSkillDir);
      assert.equal(entries.length, 0, 'No skills should be installed');
    });

    it('shows error when source has no skills', async () => {
      const emptySource = path.join(tmpDir, 'empty-source');
      fs.mkdirSync(emptySource, { recursive: true });
      // No SKILL.md subdirectories

      const output = await captureStdout(() =>
        install(emptySource, { skitHome, agentSkillDir })
      );

      assert.ok(
        output.includes('No skills found') || output.includes('no skills'),
        `Expected no-skills error, got: ${output}`
      );
    });
  });

  describe('--own flag', () => {
    it('records source as own type in manifest', async () => {
      const sourceDir = path.join(tmpDir, 'own-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      createSkillDir(sourceDir, 'own-skill', 'My own skill');

      await captureStdout(() =>
        install(sourceDir, { skitHome, agentSkillDir, own: true })
      );

      const manifestPath = path.join(skitHome, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

      const sourceName = path.basename(sourceDir);
      assert.ok(manifest.sources[sourceName], 'Source should exist in manifest');
      assert.equal(manifest.sources[sourceName].type, 'own', 'Source type should be "own"');
    });
  });

  describe('git URL clone', () => {
    it('clones a git repo and installs skills from it', async () => {
      // Create a bare repo as a local "remote"
      const bareRepo = createBareRepoWithSkills(tmpDir, 'remote-skills', [
        { name: 'git-skill-a', description: 'From git' },
        { name: 'git-skill-b', description: 'Also from git' },
      ]);

      const output = await captureStdout(() =>
        install(bareRepo, { skitHome, agentSkillDir, all: true })
      );

      // Both skills should be linked
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'git-skill-a')), 'git-skill-a should be linked');
      assert.ok(fs.existsSync(path.join(agentSkillDir, 'git-skill-b')), 'git-skill-b should be linked');

      // The repo should have been cloned into sources/external/
      const clonedDir = path.join(skitHome, 'sources', 'external', 'remote-skills');
      assert.ok(fs.existsSync(clonedDir), 'Repo should be cloned to sources/external/');

      // Manifest should be updated
      const manifest = JSON.parse(fs.readFileSync(path.join(skitHome, 'manifest.json'), 'utf-8'));
      assert.ok(manifest.sources['remote-skills'], 'Source should be in manifest');
      assert.ok(manifest.skills['git-skill-a'], 'git-skill-a should be in manifest');
      assert.ok(manifest.skills['git-skill-b'], 'git-skill-b should be in manifest');
    });

    it('clones a git URL (http/https) and installs skills', async () => {
      // Create a bare repo, then reference it with file:// to simulate URL-like behavior
      const bareRepo = createBareRepoWithSkills(tmpDir, 'url-skills', [
        { name: 'url-skill', description: 'From URL' },
      ]);

      // Use the bare path as a "git URL" — install should detect .git suffix
      const output = await captureStdout(() =>
        install(bareRepo, { skitHome, agentSkillDir })
      );

      assert.ok(fs.existsSync(path.join(agentSkillDir, 'url-skill')), 'url-skill should be linked');
    });

    it('clones with --own flag stores in sources/own/', async () => {
      const bareRepo = createBareRepoWithSkills(tmpDir, 'own-remote', [
        { name: 'own-git-skill', description: 'Own from git' },
      ]);

      await captureStdout(() =>
        install(bareRepo, { skitHome, agentSkillDir, own: true })
      );

      const clonedDir = path.join(skitHome, 'sources', 'own', 'own-remote');
      assert.ok(fs.existsSync(clonedDir), 'Repo should be cloned to sources/own/');

      const manifest = JSON.parse(fs.readFileSync(path.join(skitHome, 'manifest.json'), 'utf-8'));
      assert.equal(manifest.sources['own-remote'].type, 'own');
    });
  });
});
