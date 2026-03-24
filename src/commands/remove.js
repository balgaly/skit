'use strict';

const fs = require('node:fs');
const path = require('node:path');
const chalk = require('chalk');

const { unlinkSkill } = require('../core/linker');
const { getSkill, getSkillsBySource, getSource, removeSkill, removeSource } = require('../core/manifest');
const { resolveSkitHome, ensureDirs } = require('../index');

/**
 * Remove a skill or all skills from a source.
 *
 * @param {string|null} skillName — skill to remove (null if using --source)
 * @param {object} [options]
 * @param {string} [options.source] — remove all skills from this source
 * @param {boolean} [options.yes] — skip confirmation prompts
 * @param {string} [options.skitHome] — override skit home (for testing)
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 */
async function remove(skillName, options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const agentSkillDir = options.agentSkillDir || require('../index').getAgentAdapter().skillDir();

  if (options.source) {
    await removeBySource(options.source, skitHome, agentSkillDir, options);
  } else if (skillName) {
    await removeSingleSkill(skillName, skitHome, agentSkillDir, options);
  } else {
    console.log(chalk.red('Error: specify a skill name or use --source <name>'));
  }
}

/**
 * Remove a single skill by name.
 */
async function removeSingleSkill(skillName, skitHome, agentSkillDir, options) {
  const skillData = getSkill(skitHome, skillName);

  if (!skillData) {
    console.log(chalk.red(`Error: skill "${skillName}" not found in manifest.`));
    return;
  }

  // Remove the junction
  const linkPath = path.join(agentSkillDir, skillName);
  unlinkSkill(linkPath);

  // Remove from manifest
  const sourceName = skillData.source;
  removeSkill(skitHome, skillName);

  console.log(chalk.green(`  Removed ${skillName} from ${agentSkillDir}/`));

  // Check if this was the last skill from the source
  if (sourceName) {
    const remainingSkills = getSkillsBySource(skitHome, sourceName);
    if (remainingSkills.length === 0) {
      console.log('');
      console.log(chalk.yellow(`  ${skillName} was the last active skill from '${sourceName}'.`));
      await promptDeleteSource(sourceName, skitHome, options);
    }
  }
}

/**
 * Remove all skills from a source.
 */
async function removeBySource(sourceName, skitHome, agentSkillDir, options) {
  const sourceData = getSource(skitHome, sourceName);

  if (!sourceData) {
    console.log(chalk.red(`Error: source "${sourceName}" not found in manifest.`));
    return;
  }

  const skillNames = getSkillsBySource(skitHome, sourceName);

  // Remove each skill's junction
  for (const name of skillNames) {
    const linkPath = path.join(agentSkillDir, name);
    unlinkSkill(linkPath);
    console.log(chalk.green(`  Removed ${name}`));
  }

  // Remove source and all its skills from manifest
  removeSource(skitHome, sourceName);

  console.log('');
  console.log(chalk.green(`  Removed source '${sourceName}' (${skillNames.length} skill${skillNames.length === 1 ? '' : 's'})`));

  // Prompt to delete source directory
  await promptDeleteSource(sourceName, skitHome, options, sourceData);
}

/**
 * Prompt the user to delete the source directory.
 */
async function promptDeleteSource(sourceName, skitHome, options, sourceData) {
  // Get source data if not passed
  if (!sourceData) {
    sourceData = getSource(skitHome, sourceName);
  }

  const sourcePath = sourceData ? sourceData.path : null;

  if (!sourcePath || !fs.existsSync(sourcePath)) {
    // Source directory doesn't exist or no path recorded, just clean manifest
    removeSource(skitHome, sourceName);
    return;
  }

  let shouldDelete = false;

  if (options.yes) {
    shouldDelete = true;
  } else {
    try {
      const inquirer = require('inquirer');
      const answers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'deleteSource',
          message: `Delete source directory for '${sourceName}'?`,
          default: false,
        },
      ]);
      shouldDelete = answers.deleteSource;
    } catch {
      // If inquirer fails, default to not deleting
      shouldDelete = false;
    }
  }

  if (shouldDelete) {
    try {
      fs.rmSync(sourcePath, { recursive: true, force: true });
      console.log(chalk.green(`  Deleted source: ${sourceName}`));
    } catch (err) {
      console.log(chalk.red(`  Failed to delete source directory: ${err.message}`));
    }
  }

  // Ensure source is removed from manifest
  removeSource(skitHome, sourceName);
}

module.exports = { remove };
