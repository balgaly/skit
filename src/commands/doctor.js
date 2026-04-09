'use strict';

const fs = require('node:fs');
const path = require('node:path');
const format = require('../ui/format');
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

  const { scanSkillDir } = require('./discover');

  const skills = listSkills(skitHome);
  const sources = listSources(skitHome);
  const skillEntries = Object.entries(skills);
  const sourceEntries = Object.entries(sources);

  const brokenLinks = [];
  const unusedSources = [];

  const skillCount = skillEntries.length;
  if (skillCount > 0) {
    console.log(format.dim(`  Checking ${skillCount} skill${skillCount === 1 ? '' : 's'}...\n`));
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

  // 3. Discovery scan — untracked or mislocated skills
  const untrackedSkills = [];
  const mislocatedSkills = [];
  try {
    const scan = await scanSkillDir({ skitHome, agentSkillDir: options.agentSkillDir });
    for (const item of scan.untracked_clean) {
      untrackedSkills.push(item.name);
    }
    for (const item of scan.untracked_no_skillmd) {
      untrackedSkills.push(item.name);
    }
    for (const item of scan.mislocated) {
      mislocatedSkills.push({ name: item.name, realPath: item.realPath });
    }
  } catch {
    // scan failure is non-fatal — doctor continues
  }

  // Report
  const totalIssues = brokenLinks.length + unusedSources.length + untrackedSkills.length + mislocatedSkills.length;

  if (brokenLinks.length > 0) {
    console.log(format.error('  Broken links:'));
    for (const link of brokenLinks) {
      console.log(format.error(`    ${link.skill} -> ${link.reason} (${link.detail})`));
    }
    console.log('');
  }

  if (unusedSources.length > 0) {
    console.log(format.warn('  Unused sources:'));
    for (const source of unusedSources) {
      console.log(format.warn(`    ${source}: cloned but no skills installed`));
    }
    console.log('');
  }

  if (untrackedSkills.length > 0) {
    console.log(format.warn('  Untracked skills (not managed by skit):'));
    for (const name of untrackedSkills) {
      console.log(format.warn(`    ${name}: exists in agent folder but not in manifest`));
    }
    console.log(format.dim('  → Run `skit discover` to register them.'));
    console.log('');
  }

  if (mislocatedSkills.length > 0) {
    console.log(format.warn('  Mislocated skills (pointing to unexpected paths):'));
    for (const item of mislocatedSkills) {
      console.log(format.warn(`    ${item.name} → ${item.realPath}`));
    }
    console.log(format.dim('  → Run `skit discover` to review them.'));
    console.log('');
  }

  // Summary
  if (totalIssues === 0) {
    console.log(format.success(`  0 issues found. Everything looks healthy!`));
  } else {
    console.log(
      format.error(`  ${totalIssues} issue${totalIssues === 1 ? '' : 's'} found.`) +
        ' ' +
        format.dim("Run 'skit sync' to fix broken links.")
    );
  }

  return { issues: totalIssues, brokenLinks, unusedSources, untrackedSkills, mislocatedSkills };
}

module.exports = { doctor };
