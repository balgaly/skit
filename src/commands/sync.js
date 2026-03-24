'use strict';

const fs = require('node:fs');
const path = require('node:path');
const chalk = require('chalk');

const { linkSkill, unlinkSkill, isLinked, getLinkTarget } = require('../core/linker');
const { readManifest, listSources } = require('../core/manifest');
const { resolveSkitHome, ensureDirs } = require('../index');

/**
 * Sync all junctions/symlinks from manifest.
 * Recreates missing links, removes stale ones.
 * Designed for new machine setup or repair.
 *
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 */
function sync(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const { getAgentAdapter } = require('../index');
  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();
  fs.mkdirSync(agentSkillDir, { recursive: true });

  const manifest = readManifest(skitHome);
  const skills = manifest.skills || {};
  const sources = manifest.sources || {};

  // Track skill names that should be linked
  const expectedSkillNames = new Set(Object.keys(skills));

  let created = 0;
  let removed = 0;
  let alreadyLinked = 0;

  // Step 1: Create missing junctions for skills in manifest
  for (const [skillName, skillData] of Object.entries(skills)) {
    const targetPath = path.join(agentSkillDir, skillName);

    // Resolve the source path: source.path + skill.path
    const source = sources[skillData.source];
    if (!source) {
      console.log(chalk.yellow(`Warning: source "${skillData.source}" not found for skill "${skillName}" — skipping`));
      continue;
    }

    const sourcePath = path.resolve(path.join(source.path, skillData.path));

    // Check if source directory exists
    if (!fs.existsSync(sourcePath)) {
      console.log(chalk.yellow(`Warning: source path does not exist for "${skillName}": ${sourcePath} — skipping`));
      continue;
    }

    // Check if junction already exists and points to the correct target
    if (isLinked(targetPath)) {
      const currentTarget = getLinkTarget(targetPath);
      const resolvedCurrent = currentTarget ? path.resolve(currentTarget) : null;
      const resolvedExpected = path.resolve(sourcePath);

      if (resolvedCurrent === resolvedExpected) {
        alreadyLinked++;
        continue;
      }

      // Points to wrong target — remove and recreate
      unlinkSkill(targetPath);
    }

    // Create the junction
    try {
      linkSkill(sourcePath, targetPath);
      created++;
    } catch (err) {
      console.log(chalk.red(`Error linking "${skillName}": ${err.message}`));
    }
  }

  // Step 2: Remove stale junctions (exist in agent dir but not in manifest)
  try {
    const entries = fs.readdirSync(agentSkillDir);
    for (const entry of entries) {
      const entryPath = path.join(agentSkillDir, entry);
      if (isLinked(entryPath) && !expectedSkillNames.has(entry)) {
        unlinkSkill(entryPath);
        removed++;
      }
    }
  } catch {
    // Agent skill dir may not exist or be unreadable — that's fine
  }

  // Step 3: Report summary
  console.log(
    chalk.green(`Sync complete: `) +
    chalk.bold(`${created} created`) +
    chalk.dim(', ') +
    chalk.bold(`${removed} removed`) +
    chalk.dim(', ') +
    chalk.bold(`${alreadyLinked} already linked`)
  );
}

module.exports = { sync };
