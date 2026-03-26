'use strict';

const fs = require('node:fs');
const path = require('node:path');
const chalk = require('chalk');

const { cloneRepo } = require('../core/git');
const { scanForSkills } = require('../core/scanner');
const { linkSkill } = require('../core/linker');
const { addSource, addSkill } = require('../core/manifest');
const { resolveSkitHome, ensureDirs, getAgentAdapter } = require('../index');

/**
 * Determine if a source string looks like a git URL (or bare repo path ending in .git).
 * Matches: https://, http://, git@, github.com, or paths ending in .git
 */
function isGitUrl(source) {
  if (/^https?:\/\//.test(source)) return true;
  if (/^git@/.test(source)) return true;
  if (/github\.com/.test(source)) return true;
  // Bare repo paths end in .git
  if (source.endsWith('.git')) return true;
  return false;
}

/**
 * Extract a human-readable repo name from a git URL or path.
 * e.g. "https://github.com/someone/their-skills.git" => "their-skills"
 * e.g. "/tmp/foo/remote-skills.git" => "remote-skills"
 */
function extractRepoName(source) {
  // Remove trailing slash
  let cleaned = source.replace(/\/+$/, '');
  // Get basename
  let base = path.basename(cleaned);
  // Remove .git suffix
  base = base.replace(/\.git$/, '');
  return base;
}

/**
 * Install skills from a source (local path or git URL).
 *
 * @param {string} source — local path or git URL
 * @param {object} [options]
 * @param {boolean} [options.own] — mark source as own (sources/own/ instead of sources/external/)
 * @param {boolean} [options.all] — skip picker, install all skills
 * @param {string} [options.skitHome] — override skit home (for testing)
 * @param {string} [options.agentSkillDir] — override agent skill dir (for testing)
 */
async function install(source, options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const agentSkillDir = options.agentSkillDir || getAgentAdapter().skillDir();
  fs.mkdirSync(agentSkillDir, { recursive: true });

  const sourceType = options.own ? 'own' : 'external';
  let sourceDir;
  let sourceName;

  if (isGitUrl(source)) {
    // Git URL: clone to sources/<type>/<repo-name>/
    sourceName = extractRepoName(source);
    const targetDir = path.join(skitHome, 'sources', sourceType, sourceName);

    if (fs.existsSync(targetDir)) {
      console.log(chalk.red(`Error: source "${sourceName}" already exists at ${targetDir}`));
      return;
    }

    // Security warning for external sources
    if (sourceType === 'external') {
      console.log(chalk.yellow(`\n  Warning: Installing skills from external source "${sourceName}"`));
      console.log(chalk.dim(`  Review the skills before using them with sensitive code.\n`));
    }

    let spinner;
    try {
      const ora = require('ora');
      spinner = ora(`Cloning ${sourceName}...`).start();
    } catch {
      console.log(chalk.cyan(`Cloning ${sourceName}...`));
    }

    try {
      cloneRepo(source, targetDir);
      if (spinner) spinner.succeed(`Cloned ${sourceName}`);
    } catch (err) {
      if (spinner) spinner.fail(`Failed to clone ${sourceName}`);
      console.log(chalk.red(`Error: ${err.message}`));
      return;
    }

    sourceDir = targetDir;
  } else {
    // Local path
    sourceDir = path.resolve(source);
    sourceName = path.basename(sourceDir);

    if (!fs.existsSync(sourceDir)) {
      console.log(chalk.red(`Error: path does not exist: ${sourceDir}`));
      return;
    }

    if (!fs.statSync(sourceDir).isDirectory()) {
      console.log(chalk.red(`Error: not a directory: ${sourceDir}`));
      return;
    }
  }

  // Scan for skills
  const skills = scanForSkills(sourceDir);

  if (skills.length === 0) {
    console.log(chalk.red(`No skills found in ${sourceDir}`));
    return;
  }

  // Determine which skills to install
  let selectedSkills;

  if (options.all || skills.length === 1) {
    // Auto-install: single skill or --all flag
    selectedSkills = skills;
  } else {
    // Interactive picker
    try {
      const inquirer = require('inquirer');
      const choices = skills.map((s) => ({
        name: `${s.name}  ${chalk.dim('- ' + (s.description || 'No description'))}`,
        value: s,
        checked: false,
      }));

      const answers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'skills',
          message: `Found ${skills.length} skills. Select which to install:`,
          choices,
        },
      ]);

      selectedSkills = answers.skills;

      if (selectedSkills.length === 0) {
        console.log(chalk.yellow('No skills selected — nothing to install.'));
        return;
      }
    } catch (err) {
      // If inquirer is not available or fails, fall back to all
      console.log(chalk.yellow('Interactive picker unavailable, installing all skills.'));
      selectedSkills = skills;
    }
  }

  // Record the source in manifest
  const sourceData = {
    type: sourceType,
    path: sourceDir,
    url: isGitUrl(source) ? source : null,
    installedAt: new Date().toISOString(),
  };
  addSource(skitHome, sourceName, sourceData);

  // Install each selected skill
  const installed = [];
  for (const skill of selectedSkills) {
    const skillSourcePath = path.join(sourceDir, skill.path);
    const targetPath = path.join(agentSkillDir, skill.name);

    if (fs.existsSync(targetPath)) {
      console.log(chalk.yellow(`  Skipping "${skill.name}" — already exists at ${targetPath}`));
      continue;
    }

    try {
      linkSkill(skillSourcePath, targetPath);
      addSkill(skitHome, skill.name, {
        source: sourceName,
        path: skill.path,
        description: skill.description || null,
        linkedTo: targetPath,
        installedAt: new Date().toISOString(),
      });
      installed.push(skill);
    } catch (err) {
      console.log(chalk.red(`  Failed to install "${skill.name}": ${err.message}`));
    }
  }

  // Summary
  if (installed.length === 0) {
    console.log(chalk.yellow('No new skills were installed.'));
  } else {
    console.log('');
    console.log(chalk.green(`Installed ${installed.length} skill${installed.length === 1 ? '' : 's'} from ${sourceName}`));
    for (const skill of installed) {
      const targetPath = path.join(agentSkillDir, skill.name);
      console.log(chalk.dim(`  ${skill.name}`) + chalk.dim(` -> ${targetPath}`));
    }
  }
}

module.exports = { install, isGitUrl, extractRepoName };
