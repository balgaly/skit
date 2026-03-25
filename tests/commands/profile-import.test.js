'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

const { profileImport } = require('../../src/commands/profile');
const { writeManifest, readManifest } = require('../../src/core/manifest');
const { writeConfig } = require('../../src/core/config');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-profile-import-test-'));
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
  const workDir = path.join(tmpDir, `${repoName}-work`);
  fs.mkdirSync(workDir, { recursive: true });

  execFileSync('git', ['init'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: workDir, stdio: 'pipe' });

  for (const skill of skills) {
    createSkillDir(workDir, skill.name, skill.description);
  }

  execFileSync('git', ['add', '.'], { cwd: workDir, stdio: 'pipe' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: workDir, stdio: 'pipe' });

  const bareDir = path.join(tmpDir, `${repoName}.git`);
  execFileSync('git', ['clone', '--bare', workDir, bareDir], { stdio: 'pipe' });

  return bareDir;
}

/**
 * Write a profile JSON file and return its path.
 */
function writeProfileFile(dir, profile) {
  const filePath = path.join(dir, 'profile.json');
  fs.writeFileSync(filePath, JSON.stringify(profile, null, 2), 'utf-8');
  return filePath;
}

describe('skit profile import', () => {
  let tmpDir;
  let skitHome;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    fs.mkdirSync(path.join(skitHome, 'sources', 'own'), { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'sources', 'external'), { recursive: true });
    fs.mkdirSync(path.join(skitHome, 'sources', 'external', '_standalone'), { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });
    writeConfig(skitHome, { agent: 'claude-code', user: 'testuser' });
    writeManifest(skitHome, { version: 1, sources: {}, skills: {} });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('imports all sources and skills from a profile file', async () => {
    // Create two bare repos as "remotes"
    const bareRepoA = createBareRepoWithSkills(tmpDir, 'skills-a', [
      { name: 'alpha', description: 'Alpha skill' },
    ]);
    const bareRepoB = createBareRepoWithSkills(tmpDir, 'skills-b', [
      { name: 'beta', description: 'Beta skill' },
    ]);

    const profilePath = writeProfileFile(tmpDir, {
      skit: '1.0',
      user: 'someone',
      exported: new Date().toISOString(),
      sources: [
        { name: 'skills-a', type: 'external', origin: bareRepoA },
        { name: 'skills-b', type: 'external', origin: bareRepoB },
      ],
      skills: [
        { name: 'alpha', source: 'skills-a' },
        { name: 'beta', source: 'skills-b' },
      ],
    });

    const output = await captureStdout(() =>
      profileImport(profilePath, { skitHome, agentSkillDir, yes: true })
    );

    // Both sources should be cloned
    const clonedA = path.join(skitHome, 'sources', 'external', 'skills-a');
    const clonedB = path.join(skitHome, 'sources', 'external', 'skills-b');
    assert.ok(fs.existsSync(clonedA), 'skills-a should be cloned');
    assert.ok(fs.existsSync(clonedB), 'skills-b should be cloned');

    // Both skills should be linked
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'alpha')), 'alpha should be linked');
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'beta')), 'beta should be linked');

    // Manifest should be updated
    const manifest = readManifest(skitHome);
    assert.ok(manifest.sources['skills-a'], 'skills-a source in manifest');
    assert.ok(manifest.sources['skills-b'], 'skills-b source in manifest');
    assert.ok(manifest.skills['alpha'], 'alpha skill in manifest');
    assert.ok(manifest.skills['beta'], 'beta skill in manifest');

    // Output should contain summary info
    assert.ok(output.includes('2') || output.includes('alpha'), `Output should mention results, got: ${output}`);
  });

  it('skips already-cloned sources (matching origin URL)', async () => {
    const bareRepo = createBareRepoWithSkills(tmpDir, 'existing-source', [
      { name: 'existing-skill', description: 'Already here' },
    ]);

    // Pre-clone the source manually
    const existingClone = path.join(skitHome, 'sources', 'external', 'existing-source');
    execFileSync('git', ['clone', bareRepo, existingClone], { stdio: 'pipe' });

    // Register in manifest with origin
    writeManifest(skitHome, {
      version: 1,
      sources: {
        'existing-source': { type: 'external', path: existingClone, origin: bareRepo },
      },
      skills: {},
    });

    const profilePath = writeProfileFile(tmpDir, {
      skit: '1.0',
      user: 'someone',
      exported: new Date().toISOString(),
      sources: [
        { name: 'existing-source', type: 'external', origin: bareRepo },
      ],
      skills: [
        { name: 'existing-skill', source: 'existing-source' },
      ],
    });

    const output = await captureStdout(() =>
      profileImport(profilePath, { skitHome, agentSkillDir, yes: true })
    );

    // Should mention skipping
    assert.ok(
      output.includes('skip') || output.includes('already'),
      `Should mention skipping existing source, got: ${output}`
    );

    // Skill should still be linked
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'existing-skill')), 'Skill should be linked');
  });

  it('skips already-installed skills', async () => {
    const bareRepo = createBareRepoWithSkills(tmpDir, 'skip-skills-source', [
      { name: 'already-linked', description: 'Already installed' },
      { name: 'new-skill', description: 'Not yet installed' },
    ]);

    // Pre-clone and pre-install one skill
    const cloneDir = path.join(skitHome, 'sources', 'external', 'skip-skills-source');
    execFileSync('git', ['clone', bareRepo, cloneDir], { stdio: 'pipe' });

    // Create the existing symlink
    const skillSource = path.join(cloneDir, 'already-linked');
    const skillTarget = path.join(agentSkillDir, 'already-linked');
    const type = process.platform === 'win32' ? 'junction' : 'dir';
    fs.symlinkSync(path.resolve(skillSource), skillTarget, type);

    writeManifest(skitHome, {
      version: 1,
      sources: {
        'skip-skills-source': { type: 'external', path: cloneDir, origin: bareRepo },
      },
      skills: {
        'already-linked': { source: 'skip-skills-source', path: 'already-linked' },
      },
    });

    const profilePath = writeProfileFile(tmpDir, {
      skit: '1.0',
      user: 'someone',
      exported: new Date().toISOString(),
      sources: [
        { name: 'skip-skills-source', type: 'external', origin: bareRepo },
      ],
      skills: [
        { name: 'already-linked', source: 'skip-skills-source' },
        { name: 'new-skill', source: 'skip-skills-source' },
      ],
    });

    const output = await captureStdout(() =>
      profileImport(profilePath, { skitHome, agentSkillDir, yes: true })
    );

    // already-linked should be skipped
    assert.ok(
      output.includes('already-linked') && (output.includes('skip') || output.includes('already')),
      `Should mention skipping already-linked, got: ${output}`
    );

    // new-skill should be linked
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'new-skill')), 'new-skill should be linked');

    // Manifest should have both skills
    const manifest = readManifest(skitHome);
    assert.ok(manifest.skills['already-linked'], 'already-linked should remain in manifest');
    assert.ok(manifest.skills['new-skill'], 'new-skill should be in manifest');
  });

  it('skips standalone/importedFrom skills with no source origin', async () => {
    const profilePath = writeProfileFile(tmpDir, {
      skit: '1.0',
      user: 'someone',
      exported: new Date().toISOString(),
      sources: [
        { name: '_standalone', type: 'external' },
      ],
      skills: [
        { name: 'gist-skill', source: '_standalone', importedFrom: 'https://gist.github.com/someone/abc123' },
      ],
    });

    const output = await captureStdout(() =>
      profileImport(profilePath, { skitHome, agentSkillDir, yes: true })
    );

    // Should mention skipping standalone skill
    assert.ok(
      output.includes('skip') || output.includes('standalone') || output.includes('importedFrom'),
      `Should mention skipping standalone skill, got: ${output}`
    );

    // Skill should NOT be linked (no origin to clone from)
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'gist-skill')), 'gist-skill should not be linked');
  });

  it('shows error for invalid file path', async () => {
    const badPath = path.join(tmpDir, 'nonexistent.json');

    const output = await captureStdout(() =>
      profileImport(badPath, { skitHome, agentSkillDir, yes: true })
    );

    assert.ok(
      output.includes('Error') || output.includes('error') || output.includes('not found'),
      `Should show error for invalid file, got: ${output}`
    );
  });

  it('shows error for malformed JSON', async () => {
    const badFile = path.join(tmpDir, 'bad.json');
    fs.writeFileSync(badFile, '{ not valid json!!!', 'utf-8');

    const output = await captureStdout(() =>
      profileImport(badFile, { skitHome, agentSkillDir, yes: true })
    );

    assert.ok(
      output.includes('Error') || output.includes('parse') || output.includes('invalid'),
      `Should show parse error, got: ${output}`
    );
  });

  it('reports a summary of what was imported', async () => {
    const bareRepo = createBareRepoWithSkills(tmpDir, 'summary-source', [
      { name: 'sum-skill-a', description: 'A' },
      { name: 'sum-skill-b', description: 'B' },
    ]);

    const profilePath = writeProfileFile(tmpDir, {
      skit: '1.0',
      user: 'someone',
      exported: new Date().toISOString(),
      sources: [
        { name: 'summary-source', type: 'external', origin: bareRepo },
      ],
      skills: [
        { name: 'sum-skill-a', source: 'summary-source' },
        { name: 'sum-skill-b', source: 'summary-source' },
      ],
    });

    const output = await captureStdout(() =>
      profileImport(profilePath, { skitHome, agentSkillDir, yes: true })
    );

    // Summary should mention counts
    assert.ok(output.includes('1') || output.includes('source'), `Should mention source count, got: ${output}`);
    assert.ok(output.includes('2') || output.includes('skill'), `Should mention skill count, got: ${output}`);
  });
});
