'use strict';

const fs = require('node:fs');
const path = require('node:path');
const format = require('../ui/format');
const { spinner } = require('../ui/spinner');
const { resolveSkitHome, loadConfig, loadManifest, saveManifest, getAgentAdapter } = require('../index');

const SAFE_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Scan the agent skill directory for tracked/untracked/mislocated skills.
 * READ-ONLY — never modifies manifest.
 *
 * @param {object} [options]
 * @param {string} [options.skitHome]
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 * @returns {object} scan result
 */
async function scanSkillDir(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  const config = loadConfig(skitHome);
  const adapter = getAgentAdapter(config.agent || 'claude-code');
  const agentSkillDir = options.agentSkillDir || adapter.skillDir();
  const manifest = loadManifest(skitHome);
  const skills = manifest.skills || {};

  const result = {
    agentSkillDir,
    tracked: [],
    untracked_clean: [],
    untracked_no_skillmd: [],
    mislocated: [],
  };

  // Agent skill dir might not exist yet (fresh install)
  if (!fs.existsSync(agentSkillDir)) {
    return result;
  }

  const entries = fs.readdirSync(agentSkillDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;

    const name = entry.name;
    const dir = path.join(agentSkillDir, name);

    // Skip unsafe directory names
    if (!SAFE_NAME_RE.test(name)) {
      result.untracked_no_skillmd.push({ name, dir });
      continue;
    }

    // Check if already tracked
    if (skills[name]) {
      result.tracked.push({ name, path: skills[name].path });
      continue;
    }

    // Check if mislocated (realpath outside ~/.skit/sources/)
    let realPath = dir;
    try {
      realPath = fs.realpathSync(dir);
    } catch {
      // can't resolve — treat as untracked
    }
    const sourcesDir = path.join(skitHome, 'sources');
    const normalizedSourcesDir = (sourcesDir.endsWith(path.sep) ? sourcesDir : sourcesDir + path.sep).toLowerCase();
    const isInsideSkit = realPath.toLowerCase().startsWith(normalizedSourcesDir);

    if (!isInsideSkit && realPath !== dir) {
      result.mislocated.push({ name, dir, realPath });
      continue;
    }

    // Check for SKILL.md
    const hasSkillMd = adapter.detectSkill(dir);
    if (hasSkillMd) {
      let meta = { name, description: '' };
      try {
        meta = adapter.getSkillMeta(dir);
      } catch {
        // malformed SKILL.md — use folder name
      }
      result.untracked_clean.push({ name, dir, meta });
    } else {
      result.untracked_no_skillmd.push({ name, dir });
    }
  }

  return result;
}

/**
 * Interactive discovery: scan, prompt, backup, register.
 *
 * @param {object} [options]
 * @param {string} [options.skitHome]
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 * @param {object} [options._inquirer] — override inquirer (for testing)
 */
async function discover(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  const inquirer = options._inquirer || require('inquirer');

  const s = spinner('Scanning skill directory...').start();
  const scan = await scanSkillDir(options);
  s.stop();

  const total = scan.untracked_clean.length + scan.untracked_no_skillmd.length + scan.mislocated.length;

  if (total === 0) {
    console.log('');
    console.log(format.success('  Already up to date — no untracked skills found.'));
    console.log(format.dim(`  ${scan.tracked.length} skill${scan.tracked.length === 1 ? '' : 's'} tracked in: ${scan.agentSkillDir}`));
    console.log('');
    return { registered: [] };
  }

  console.log('');
  console.log(format.header(`  Scan results — global (${scan.agentSkillDir})`));
  console.log('');

  if (scan.tracked.length > 0) {
    console.log(format.dim(`  Already tracked (${scan.tracked.length}):`));
    for (const item of scan.tracked) {
      console.log(format.dim(`    · ${item.name}`));
    }
    console.log('');
  }
  if (scan.untracked_clean.length > 0) {
    console.log(format.info(`  Ready to register (${scan.untracked_clean.length}):`));
    for (const item of scan.untracked_clean) {
      const desc = item.meta && item.meta.description ? item.meta.description : 'no description';
      console.log(format.info(`    · ${item.name}  ${format.dim('— ' + desc)}`));
    }
    console.log('');
  }
  if (scan.untracked_no_skillmd.length > 0) {
    console.log(format.warn(`  Missing SKILL.md (${scan.untracked_no_skillmd.length}):`));
    for (const item of scan.untracked_no_skillmd) {
      console.log(format.warn(`    · ${item.name} — no SKILL.md found`));
    }
    console.log('');
  }
  if (scan.mislocated.length > 0) {
    console.log(format.warn(`  Mislocated — unexpected path (${scan.mislocated.length}):`));
    for (const item of scan.mislocated) {
      console.log(format.warn(`    · ${item.name} → ${item.realPath}`));
    }
    console.log('');
  }

  // Nothing actionable
  if (scan.untracked_clean.length === 0) {
    console.log(format.dim('  No skills ready to register. Fix the issues above manually, then re-run `skit discover`.'));
    console.log('');
    return { registered: [] };
  }

  // Prompt: which untracked_clean to register
  const choices = scan.untracked_clean.map((item) => ({
    name: `${item.name}  ${format.dim('— ' + (item.meta.description || 'no description'))}`,
    value: item,
    checked: true,
  }));

  let selected;
  try {
    const answers = await inquirer.prompt([{
      type: 'checkbox',
      name: 'skills',
      message: 'Which skills would you like skit to track?',
      choices,
    }]);
    selected = answers.skills;
  } catch {
    console.log(format.warn('  Cancelled.'));
    return { registered: [] };
  }

  if (selected.length === 0) {
    console.log(format.dim('  Nothing selected.'));
    return { registered: [] };
  }

  // Backup manifest before writing
  const manifest = loadManifest(skitHome);
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}-${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
  const backupPath = path.join(skitHome, `manifest.backup-${stamp}.json`);
  try {
    fs.writeFileSync(backupPath, JSON.stringify(manifest, null, 2), 'utf-8');
    console.log(format.dim(`  Backup saved: ${backupPath}`));
  } catch {
    console.log(format.warn('  Could not write backup — proceeding anyway.'));
  }

  // Prune old backups — keep only the 5 most recent
  try {
    const backups = fs.readdirSync(skitHome)
      .filter(f => f.startsWith('manifest.backup-') && f.endsWith('.json'))
      .sort();
    const toDelete = backups.slice(0, -5);
    for (const f of toDelete) {
      fs.unlinkSync(path.join(skitHome, f));
    }
  } catch {
    // non-critical — ignore cleanup errors
  }

  // Register selected skills (compatible with install schema)
  const skills = manifest.skills || {};
  for (const entry of selected) {
    skills[entry.name] = {
      source: 'discovered',
      path: entry.dir,
      linkedTo: entry.dir,
      installedAt: new Date().toISOString(),
    };
  }
  manifest.skills = skills;
  saveManifest(skitHome, manifest);

  console.log('');
  console.log(format.success(`  Registered ${selected.length} skill${selected.length === 1 ? '' : 's'}:`));
  for (const entry of selected) {
    console.log(format.success(`    ✓ ${entry.name}`));
  }
  console.log('');

  return { registered: selected.map((item) => item.name) };
}

module.exports = { discover, scanSkillDir };
