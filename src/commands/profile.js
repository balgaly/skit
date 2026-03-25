'use strict';

const fs = require('node:fs');
const path = require('node:path');
const chalk = require('chalk');

const { listSkills, listSources, addSource, addSkill, getSkill, getSource } = require('../core/manifest');
const { readConfig } = require('../core/config');
const { cloneRepo } = require('../core/git');
const { linkSkill } = require('../core/linker');
const { scanForSkills } = require('../core/scanner');
const { resolveSkitHome, ensureDirs, getAgentAdapter } = require('../index');

/**
 * Export the current skit profile as JSON to stdout.
 *
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 */
function profileExport(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const config = readConfig(skitHome);
  const sources = listSources(skitHome);
  const skills = listSkills(skitHome);

  const profile = {
    skit: '1.0',
    user: config.user || null,
    exported: new Date().toISOString(),
    sources: Object.entries(sources).map(([name, data]) => {
      const entry = { name, type: data.type || 'external' };
      if (data.origin) {
        entry.origin = data.origin;
      }
      return entry;
    }),
    skills: Object.entries(skills).map(([name, data]) => {
      const entry = { name, source: data.source };
      if (data.importedFrom) {
        entry.importedFrom = data.importedFrom;
      }
      return entry;
    }),
  };

  process.stdout.write(JSON.stringify(profile, null, 2) + '\n');
}

/**
 * Import a profile JSON file — clone missing sources and link missing skills.
 *
 * @param {string} filePath — path to the profile JSON file
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 * @param {boolean} [options.yes] — skip confirmation prompts
 */
async function profileImport(filePath, options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();
  fs.mkdirSync(agentSkillDir, { recursive: true });

  // Read and parse the profile file
  let profile;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    profile = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(chalk.red(`Error: profile file not found: ${filePath}`));
    } else {
      console.log(chalk.red(`Error: failed to parse profile file: ${err.message}`));
    }
    return;
  }

  const profileSources = profile.sources || [];
  const profileSkills = profile.skills || [];

  // Build a map of source name -> origin from the profile
  const sourceOrigins = {};
  for (const src of profileSources) {
    if (src.origin) {
      sourceOrigins[src.name] = src.origin;
    }
  }

  // Get current manifest state
  const existingSources = listSources(skitHome);

  // Phase 1: Clone missing sources
  let sourcesCloned = 0;
  let sourcesSkipped = 0;

  for (const src of profileSources) {
    const { name, type, origin } = src;

    // Skip sources with no origin (e.g., _standalone)
    if (!origin) {
      console.log(chalk.yellow(`  Skipping source "${name}" — no origin URL`));
      sourcesSkipped++;
      continue;
    }

    // Check if already present by matching origin URL
    const existing = existingSources[name];
    if (existing && existing.origin === origin) {
      console.log(chalk.dim(`  Skipping source "${name}" — already cloned`));
      sourcesSkipped++;
      continue;
    }

    // Clone it
    const sourceType = type || 'external';
    const targetDir = path.join(skitHome, 'sources', sourceType, name);

    if (fs.existsSync(targetDir)) {
      console.log(chalk.dim(`  Skipping source "${name}" — directory already exists`));
      sourcesSkipped++;
      continue;
    }

    let spinner;
    try {
      const ora = require('ora');
      spinner = ora(`Cloning ${name}...`).start();
    } catch {
      console.log(chalk.cyan(`  Cloning ${name}...`));
    }

    try {
      cloneRepo(origin, targetDir);
      if (spinner) spinner.succeed(`Cloned ${name}`);

      addSource(skitHome, name, {
        type: sourceType,
        path: targetDir,
        origin,
        installedAt: new Date().toISOString(),
      });
      sourcesCloned++;
    } catch (err) {
      if (spinner) spinner.fail(`Failed to clone ${name}`);
      console.log(chalk.red(`  Error cloning "${name}": ${err.message}`));
    }
  }

  // Phase 2: Link missing skills
  let skillsLinked = 0;
  let skillsSkipped = 0;

  // Refresh sources after cloning
  const updatedSources = listSources(skitHome);

  for (const skill of profileSkills) {
    const { name, source: sourceName, importedFrom } = skill;

    // Skip standalone/importedFrom skills with no cloneable origin
    if (importedFrom || sourceName === '_standalone') {
      const origin = sourceOrigins[sourceName];
      if (!origin) {
        console.log(chalk.yellow(`  Skipping skill "${name}" — standalone/importedFrom (no source origin)`));
        skillsSkipped++;
        continue;
      }
    }

    // Check if skill already installed
    const existingSkill = getSkill(skitHome, name);
    if (existingSkill) {
      console.log(chalk.dim(`  Skipping skill "${name}" — already installed`));
      skillsSkipped++;
      continue;
    }

    // Find the source directory
    const sourceData = updatedSources[sourceName];
    if (!sourceData || !sourceData.path) {
      console.log(chalk.yellow(`  Skipping skill "${name}" — source "${sourceName}" not available`));
      skillsSkipped++;
      continue;
    }

    const sourceDir = sourceData.path;

    // Scan for the skill in the source
    const availableSkills = scanForSkills(sourceDir);
    const skillInfo = availableSkills.find((s) => s.name === name);

    if (!skillInfo) {
      console.log(chalk.yellow(`  Skipping skill "${name}" — not found in source "${sourceName}"`));
      skillsSkipped++;
      continue;
    }

    const skillSourcePath = path.join(sourceDir, skillInfo.path);
    const targetPath = path.join(agentSkillDir, name);

    if (fs.existsSync(targetPath)) {
      console.log(chalk.dim(`  Skipping skill "${name}" — already exists at target`));
      skillsSkipped++;
      continue;
    }

    try {
      linkSkill(skillSourcePath, targetPath);
      addSkill(skitHome, name, {
        source: sourceName,
        path: skillInfo.path,
        linkedTo: targetPath,
        installedAt: new Date().toISOString(),
      });
      skillsLinked++;
    } catch (err) {
      console.log(chalk.red(`  Failed to link skill "${name}": ${err.message}`));
    }
  }

  // Summary
  console.log('');
  console.log(chalk.green(`Profile import complete:`));
  console.log(chalk.dim(`  Sources: ${sourcesCloned} cloned, ${sourcesSkipped} skipped`));
  console.log(chalk.dim(`  Skills:  ${skillsLinked} linked, ${skillsSkipped} skipped`));
}

/**
 * Compare a profile file against the current manifest and show differences.
 *
 * @param {string} filePath — path to the profile JSON file
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 */
function profileDiff(filePath, options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  // Read and parse the profile file
  let profile;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    profile = JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log(chalk.red(`Error: profile file not found: ${filePath}`));
    } else {
      console.log(chalk.red(`Error: failed to parse profile file: ${err.message}`));
    }
    return;
  }

  const profileSkills = profile.skills || [];
  const localSkills = listSkills(skitHome);

  // Build maps: name -> source
  const theirMap = new Map();
  for (const skill of profileSkills) {
    theirMap.set(skill.name, skill.source);
  }

  const ourMap = new Map();
  for (const [name, data] of Object.entries(localSkills)) {
    ourMap.set(name, data.source);
  }

  // Find differences
  const missing = [];    // in profile but not installed
  const extra = [];      // installed but not in profile
  const diverged = [];   // same name, different source

  for (const [name, theirSource] of theirMap) {
    if (!ourMap.has(name)) {
      missing.push({ name, source: theirSource });
    } else if (ourMap.get(name) !== theirSource) {
      diverged.push({ name, ourSource: ourMap.get(name), theirSource });
    }
  }

  for (const [name, ourSource] of ourMap) {
    if (!theirMap.has(name)) {
      extra.push({ name, source: ourSource });
    }
  }

  // Display results
  const user = profile.user || 'them';

  console.log(chalk.bold(`\n  Skills you're missing (${missing.length}):`));
  if (missing.length === 0) {
    console.log(chalk.dim('    (none)'));
  } else {
    for (const { name, source } of missing) {
      console.log(chalk.green(`    + ${name}`) + chalk.dim(`    @${source}`));
    }
  }

  console.log(chalk.bold(`\n  Skills only you have (${extra.length}):`));
  if (extra.length === 0) {
    console.log(chalk.dim('    (none)'));
  } else {
    for (const { name, source } of extra) {
      console.log(chalk.red(`    - ${name}`) + chalk.dim(`    @${source}`));
    }
  }

  console.log(chalk.bold(`\n  Same skills, different source (${diverged.length}):`));
  if (diverged.length === 0) {
    console.log(chalk.dim('    (none)'));
  } else {
    for (const { name, ourSource, theirSource } of diverged) {
      console.log(chalk.yellow(`    ~ ${name}`) + chalk.dim(`    yours: @${ourSource}  theirs: @${theirSource}`));
    }
  }

  console.log('');
}

module.exports = { profileExport, profileImport, profileDiff };
