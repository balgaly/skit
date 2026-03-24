'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { remove } = require('../../src/commands/remove');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-remove-test-'));
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
 * Create a junction/symlink in agentSkillDir pointing to source.
 */
function createLink(source, agentSkillDir, name) {
  const targetPath = path.join(agentSkillDir, name);
  const type = process.platform === 'win32' ? 'junction' : 'dir';
  fs.symlinkSync(path.resolve(source), targetPath, type);
  return targetPath;
}

/**
 * Write a manifest with given sources and skills.
 */
function writeManifest(skitHome, manifest) {
  fs.mkdirSync(skitHome, { recursive: true });
  const manifestPath = path.join(skitHome, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

/**
 * Read the manifest from skitHome.
 */
function readManifest(skitHome) {
  const manifestPath = path.join(skitHome, 'manifest.json');
  return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
}

describe('skit remove <skill>', () => {
  let tmpDir;
  let skitHome;
  let agentSkillDir;
  let sourceDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    sourceDir = path.join(tmpDir, 'source-repo');

    // Create directories
    fs.mkdirSync(path.join(skitHome, 'sources', 'external'), { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });

    // Create a source directory with a skill
    fs.mkdirSync(path.join(sourceDir, 'cool-skill'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'cool-skill', 'SKILL.md'), '# Cool Skill\n');

    // Create another skill in the same source
    fs.mkdirSync(path.join(sourceDir, 'other-skill'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'other-skill', 'SKILL.md'), '# Other Skill\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes a skill junction and updates manifest', async () => {
    // Set up: link the skill and write manifest
    createLink(path.join(sourceDir, 'cool-skill'), agentSkillDir, 'cool-skill');
    createLink(path.join(sourceDir, 'other-skill'), agentSkillDir, 'other-skill');

    writeManifest(skitHome, {
      version: 1,
      sources: {
        'their-skills': { type: 'external', path: sourceDir },
      },
      skills: {
        'cool-skill': { source: 'their-skills', linkedTo: path.join(agentSkillDir, 'cool-skill') },
        'other-skill': { source: 'their-skills', linkedTo: path.join(agentSkillDir, 'other-skill') },
      },
    });

    const output = await captureStdout(() =>
      remove('cool-skill', { skitHome, agentSkillDir, yes: true })
    );

    // Junction should be removed
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'cool-skill')), 'Skill junction should be removed');

    // Other skill should still exist
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'other-skill')), 'Other skill should still exist');

    // Manifest should be updated
    const manifest = readManifest(skitHome);
    assert.ok(!manifest.skills['cool-skill'], 'cool-skill should be removed from manifest');
    assert.ok(manifest.skills['other-skill'], 'other-skill should remain in manifest');
    assert.ok(manifest.sources['their-skills'], 'Source should remain (still has other skill)');

    // Output should mention removal
    assert.ok(output.includes('cool-skill'), 'Output should mention skill name');
    assert.ok(
      output.includes('Removed') || output.includes('removed'),
      `Expected removal message, got: ${output}`
    );
  });

  it('shows error for nonexistent skill', async () => {
    writeManifest(skitHome, {
      version: 1,
      sources: {},
      skills: {},
    });

    const output = await captureStdout(() =>
      remove('nonexistent-skill', { skitHome, agentSkillDir, yes: true })
    );

    assert.ok(
      output.includes('not found') || output.includes('not installed') || output.includes('Error'),
      `Expected error message, got: ${output}`
    );
  });

  it('prompts to delete source when last skill is removed (yes=true deletes)', async () => {
    // Only one skill from source
    const singleSourceDir = path.join(skitHome, 'sources', 'external', 'lonely-source');
    fs.mkdirSync(path.join(singleSourceDir, 'only-skill'), { recursive: true });
    fs.writeFileSync(path.join(singleSourceDir, 'only-skill', 'SKILL.md'), '# Only\n');

    createLink(path.join(singleSourceDir, 'only-skill'), agentSkillDir, 'only-skill');

    writeManifest(skitHome, {
      version: 1,
      sources: {
        'lonely-source': { type: 'external', path: singleSourceDir },
      },
      skills: {
        'only-skill': { source: 'lonely-source', linkedTo: path.join(agentSkillDir, 'only-skill') },
      },
    });

    const output = await captureStdout(() =>
      remove('only-skill', { skitHome, agentSkillDir, yes: true })
    );

    // Skill junction should be removed
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'only-skill')), 'Skill junction should be removed');

    // Manifest should have no skills and no source
    const manifest = readManifest(skitHome);
    assert.ok(!manifest.skills['only-skill'], 'only-skill should be removed from manifest');
    assert.ok(!manifest.sources['lonely-source'], 'Source should be removed from manifest');

    // Source directory should be deleted
    assert.ok(!fs.existsSync(singleSourceDir), 'Source directory should be deleted');

    // Output should mention it was the last skill
    assert.ok(
      output.includes('last') || output.includes('Deleted source'),
      `Expected last-skill message, got: ${output}`
    );
  });
});

describe('skit remove --source <name>', () => {
  let tmpDir;
  let skitHome;
  let agentSkillDir;
  let sourceDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    agentSkillDir = path.join(tmpDir, 'agent-skills');
    sourceDir = path.join(skitHome, 'sources', 'external', 'their-skills');

    // Create directories
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });

    // Create skill dirs in source
    fs.mkdirSync(path.join(sourceDir, 'skill-a'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'skill-a', 'SKILL.md'), '# Skill A\n');
    fs.mkdirSync(path.join(sourceDir, 'skill-b'), { recursive: true });
    fs.writeFileSync(path.join(sourceDir, 'skill-b', 'SKILL.md'), '# Skill B\n');
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('removes all skills from a source and updates manifest', async () => {
    // Set up links and manifest
    createLink(path.join(sourceDir, 'skill-a'), agentSkillDir, 'skill-a');
    createLink(path.join(sourceDir, 'skill-b'), agentSkillDir, 'skill-b');

    writeManifest(skitHome, {
      version: 1,
      sources: {
        'their-skills': { type: 'external', path: sourceDir },
      },
      skills: {
        'skill-a': { source: 'their-skills', linkedTo: path.join(agentSkillDir, 'skill-a') },
        'skill-b': { source: 'their-skills', linkedTo: path.join(agentSkillDir, 'skill-b') },
      },
    });

    const output = await captureStdout(() =>
      remove(null, { source: 'their-skills', skitHome, agentSkillDir, yes: true })
    );

    // Both junctions should be removed
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'skill-a')), 'skill-a junction should be removed');
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'skill-b')), 'skill-b junction should be removed');

    // Manifest should have no skills or source
    const manifest = readManifest(skitHome);
    assert.ok(!manifest.skills['skill-a'], 'skill-a should be removed from manifest');
    assert.ok(!manifest.skills['skill-b'], 'skill-b should be removed from manifest');
    assert.ok(!manifest.sources['their-skills'], 'Source should be removed from manifest');

    // Source directory should be deleted (yes=true)
    assert.ok(!fs.existsSync(sourceDir), 'Source directory should be deleted');

    // Output should mention removal
    assert.ok(
      output.includes('their-skills') || output.includes('Removed'),
      `Expected removal message, got: ${output}`
    );
  });

  it('shows error for nonexistent source', async () => {
    writeManifest(skitHome, {
      version: 1,
      sources: {},
      skills: {},
    });

    const output = await captureStdout(() =>
      remove(null, { source: 'nonexistent-source', skitHome, agentSkillDir, yes: true })
    );

    assert.ok(
      output.includes('not found') || output.includes('not installed') || output.includes('Error'),
      `Expected error message, got: ${output}`
    );
  });
});
