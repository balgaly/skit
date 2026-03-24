'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { sync } = require('../../src/commands/sync');
const { writeManifest } = require('../../src/core/manifest');
const { linkSkill } = require('../../src/core/linker');

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skit-cmd-sync-test-'));
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
 * Build a test manifest with sources and skills.
 */
function buildManifest(skitHome, sourceDir, skills) {
  const sourceName = 'test-source';
  const manifest = {
    version: 1,
    sources: {
      [sourceName]: {
        type: 'external',
        path: sourceDir,
        url: null,
        installedAt: new Date().toISOString(),
      },
    },
    skills: {},
  };

  for (const skillName of skills) {
    manifest.skills[skillName] = {
      source: sourceName,
      path: skillName,
      linkedTo: path.join('agent-skills', skillName),
      installedAt: new Date().toISOString(),
    };
  }

  writeManifest(skitHome, manifest);
  return manifest;
}

/**
 * Create a skill directory with SKILL.md.
 */
function createSkillDir(baseDir, skillName) {
  const skillDir = path.join(baseDir, skillName);
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(
    path.join(skillDir, 'SKILL.md'),
    `---\nname: ${skillName}\ndescription: Test skill\n---\n# ${skillName}\n`
  );
  return skillDir;
}

describe('skit sync', () => {
  let tmpDir;
  let skitHome;
  let sourceDir;
  let agentSkillDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    skitHome = path.join(tmpDir, '.skit');
    sourceDir = path.join(tmpDir, 'sources', 'test-source');
    agentSkillDir = path.join(tmpDir, 'agent-skills');

    fs.mkdirSync(skitHome, { recursive: true });
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(agentSkillDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates junctions for all skills in manifest', async () => {
    // Create skill source directories
    createSkillDir(sourceDir, 'skill-a');
    createSkillDir(sourceDir, 'skill-b');

    // Write manifest with two skills
    buildManifest(skitHome, sourceDir, ['skill-a', 'skill-b']);

    const output = await captureStdout(() =>
      sync({ skitHome, agentSkillDir })
    );

    // Both junctions should exist
    const linkA = path.join(agentSkillDir, 'skill-a');
    const linkB = path.join(agentSkillDir, 'skill-b');

    assert.ok(fs.existsSync(linkA), 'skill-a junction should exist');
    assert.ok(fs.existsSync(linkB), 'skill-b junction should exist');
    assert.ok(fs.lstatSync(linkA).isSymbolicLink(), 'skill-a should be a symlink');
    assert.ok(fs.lstatSync(linkB).isSymbolicLink(), 'skill-b should be a symlink');

    // Output should report created count
    assert.ok(output.includes('2'), 'Output should mention 2 created');
    assert.ok(output.includes('created') || output.includes('Created'), 'Output should mention created');
  });

  it('removes stale junctions not in manifest', async () => {
    // Create a stale junction in agent dir that is NOT in manifest
    const staleSource = path.join(tmpDir, 'stale-skill-source');
    fs.mkdirSync(staleSource, { recursive: true });
    fs.writeFileSync(path.join(staleSource, 'SKILL.md'), '# Stale\n');
    linkSkill(staleSource, path.join(agentSkillDir, 'stale-skill'));

    // Create one valid skill
    createSkillDir(sourceDir, 'valid-skill');
    buildManifest(skitHome, sourceDir, ['valid-skill']);

    const output = await captureStdout(() =>
      sync({ skitHome, agentSkillDir })
    );

    // Stale junction should be removed
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'stale-skill')), 'Stale junction should be removed');

    // Valid skill should be linked
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'valid-skill')), 'Valid skill should be linked');

    // Output should mention removal
    assert.ok(output.includes('removed') || output.includes('Removed'), 'Output should mention removed');
  });

  it('skips already-linked skills', async () => {
    // Create skill source and link it manually
    const skillDir = createSkillDir(sourceDir, 'already-linked');
    linkSkill(skillDir, path.join(agentSkillDir, 'already-linked'));

    // Write manifest with the same skill
    buildManifest(skitHome, sourceDir, ['already-linked']);

    const output = await captureStdout(() =>
      sync({ skitHome, agentSkillDir })
    );

    // Junction should still exist and be valid
    const linkPath = path.join(agentSkillDir, 'already-linked');
    assert.ok(fs.existsSync(linkPath), 'Existing junction should remain');
    assert.ok(fs.lstatSync(linkPath).isSymbolicLink(), 'Should still be a symlink');

    // Output should indicate it was already linked
    assert.ok(
      output.includes('already') || output.includes('up to date') || output.includes('0 created'),
      `Output should indicate skill was already linked, got: ${output}`
    );
  });

  it('handles missing source gracefully (warns but continues)', async () => {
    // Create one valid skill and one that has no source directory
    createSkillDir(sourceDir, 'good-skill');

    // Write manifest with both skills (bad-skill source doesn't exist)
    const manifest = {
      version: 1,
      sources: {
        'test-source': {
          type: 'external',
          path: sourceDir,
          url: null,
          installedAt: new Date().toISOString(),
        },
      },
      skills: {
        'good-skill': {
          source: 'test-source',
          path: 'good-skill',
          linkedTo: path.join(agentSkillDir, 'good-skill'),
          installedAt: new Date().toISOString(),
        },
        'missing-skill': {
          source: 'test-source',
          path: 'missing-skill',
          linkedTo: path.join(agentSkillDir, 'missing-skill'),
          installedAt: new Date().toISOString(),
        },
      },
    };
    writeManifest(skitHome, manifest);

    const output = await captureStdout(() =>
      sync({ skitHome, agentSkillDir })
    );

    // Good skill should be linked
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'good-skill')), 'Good skill should be linked');

    // Missing skill should NOT be linked (source doesn't exist)
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'missing-skill')), 'Missing skill should not be linked');

    // Output should warn about missing source
    assert.ok(
      output.includes('missing-skill') && (output.includes('Warning') || output.includes('warning') || output.includes('not found') || output.includes('does not exist')),
      `Output should warn about missing source, got: ${output}`
    );
  });

  it('reports summary with created, removed, and already-linked counts', async () => {
    // Set up: one already linked, one to create, one stale to remove
    const skillAlready = createSkillDir(sourceDir, 'already-here');
    linkSkill(skillAlready, path.join(agentSkillDir, 'already-here'));

    createSkillDir(sourceDir, 'new-skill');

    // Stale junction
    const staleSource = path.join(tmpDir, 'stale-source');
    fs.mkdirSync(staleSource, { recursive: true });
    linkSkill(staleSource, path.join(agentSkillDir, 'old-skill'));

    buildManifest(skitHome, sourceDir, ['already-here', 'new-skill']);

    const output = await captureStdout(() =>
      sync({ skitHome, agentSkillDir })
    );

    // Verify state
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'already-here')), 'Already-linked should remain');
    assert.ok(fs.existsSync(path.join(agentSkillDir, 'new-skill')), 'New skill should be linked');
    assert.ok(!fs.existsSync(path.join(agentSkillDir, 'old-skill')), 'Stale skill should be removed');

    // Summary should include counts
    assert.ok(output.includes('1 created'), `Should report 1 created, got: ${output}`);
    assert.ok(output.includes('1 removed'), `Should report 1 removed, got: ${output}`);
    assert.ok(output.includes('1 already linked'), `Should report 1 already linked, got: ${output}`);
  });
});
