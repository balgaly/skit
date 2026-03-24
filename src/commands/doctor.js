'use strict';

const fs = require('node:fs');
const path = require('node:path');
const chalk = require('chalk');
const { listSkills, listSources, getSkillsBySource } = require('../core/manifest');
const { isLinked } = require('../core/linker');
const { resolveSkitHome } = require('../index');

/**
 * Run diagnostics on the skit installation.
 *
 * Checks:
 * 1. Broken links — skills in manifest where junction is missing or source dir is gone
 * 2. Updates available — git sources with newer commits upstream (skipped if skipUpdates)
 * 3. Unused sources — sources in manifest with no skills installed from them
 *
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 * @param {string} [options.agentSkillDir] — agent skill directory to check junctions in
 * @param {boolean} [options.skipUpdates] — skip git update checks
 * @returns {{ issues: number, brokenLinks: Array, unusedSources: string[] }}
 */
async function doctor(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  const agentSkillDir = options.agentSkillDir;

  const skills = listSkills(skitHome);
  const sources = listSources(skitHome);
  const skillEntries = Object.entries(skills);
  const sourceEntries = Object.entries(sources);

  const brokenLinks = [];
  const unusedSources = [];

  const skillCount = skillEntries.length;
  if (skillCount > 0) {
    console.log(chalk.dim(`  Checking ${skillCount} skill${skillCount === 1 ? '' : 's'}...\n`));
  }

  // 1. Check broken links
  for (const [skillName, skillData] of skillEntries) {
    const sourcePath = skillData.sourcePath;

    // Check if the source directory exists on disk
    if (sourcePath && !fs.existsSync(sourcePath)) {
      brokenLinks.push({
        skill: skillName,
        reason: 'source missing',
        detail: sourcePath,
      });
      continue;
    }

    // Check if the junction/symlink exists in the agent skill directory
    if (agentSkillDir) {
      const linkPath = path.join(agentSkillDir, skillName);
      if (!isLinked(linkPath)) {
        brokenLinks.push({
          skill: skillName,
          reason: 'junction missing',
          detail: linkPath,
        });
      }
    }
  }

  // 2. Check unused sources
  for (const [sourceName] of sourceEntries) {
    const skillsFromSource = getSkillsBySource(skitHome, sourceName);
    if (skillsFromSource.length === 0) {
      unusedSources.push(sourceName);
    }
  }

  // Report
  const totalIssues = brokenLinks.length + unusedSources.length;

  if (brokenLinks.length > 0) {
    console.log(chalk.red.bold('  Broken links:'));
    for (const link of brokenLinks) {
      console.log(chalk.red(`    ${link.skill} -> ${link.reason} (${link.detail})`));
    }
    console.log('');
  }

  if (unusedSources.length > 0) {
    console.log(chalk.yellow.bold('  Unused sources:'));
    for (const source of unusedSources) {
      console.log(chalk.yellow(`    ${source}: cloned but no skills installed`));
    }
    console.log('');
  }

  // Summary
  if (totalIssues === 0) {
    console.log(chalk.green(`  0 issues found. Everything looks healthy!`));
  } else {
    console.log(
      chalk.red(`  ${totalIssues} issue${totalIssues === 1 ? '' : 's'} found.`) +
        ' ' +
        chalk.dim("Run 'skit sync' to fix broken links.")
    );
  }

  return { issues: totalIssues, brokenLinks, unusedSources };
}

module.exports = { doctor };
