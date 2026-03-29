'use strict';

const chalk = require('chalk');
const { enable, disable, isEnabled, allow } = require('../core/incognito');

/**
 * skit incognito on
 * Enable incognito mode for the current project directory.
 */
function incognitoOn() {
  const projectPath = process.cwd();
  const result = enable(projectPath);

  if (!result.success) {
    console.log(chalk.red(`Error: ${result.error.message}`));
    if (result.error.code === 'SETTINGS_WRITE_FAILED' && result.error.partialState) {
      console.log(chalk.dim('  State was written. Run "skit incognito off" then retry if needed.'));
    }
    return;
  }

  if (result.alreadyEnabled) {
    console.log(chalk.yellow('Incognito mode is already on for this project.'));
    return;
  }

  console.log('');
  console.log(chalk.green('Incognito mode enabled.') + chalk.dim(' Global skills stay home.'));
  console.log('');
  if (result.pluginsQuarantined > 0) {
    console.log(chalk.dim(`  ${result.pluginsQuarantined} plugin(s) quarantined`));
  }
  if (result.skillsBlocked > 0) {
    console.log(chalk.dim(`  ${result.skillsBlocked} user skill(s) blocked`));
  }
  console.log('');
  console.log(chalk.dim('  Restart Claude Code in this project to apply.'));
  console.log(chalk.dim('  To allow a skill here: skit incognito allow <skill>'));
}

/**
 * skit incognito off
 * Disable incognito mode for the current project directory.
 */
function incognitoOff() {
  const projectPath = process.cwd();
  const result = disable(projectPath);

  if (!result.success) {
    console.log(chalk.red(`Error: ${result.error.message}`));
    if (result.error.note) {
      console.log(chalk.dim(`  ${result.error.note}`));
    }
    return;
  }

  if (result.alreadyDisabled) {
    console.log(chalk.yellow('Incognito mode is already off for this project.'));
    return;
  }

  console.log('');
  console.log(chalk.green('Incognito mode disabled.') + chalk.dim(' Global skills restored.'));
  console.log(chalk.dim('  Restart Claude Code in this project to apply.'));
}

/**
 * skit incognito status
 * Show incognito mode status for the current project directory.
 */
function incognitoStatus() {
  const projectPath = process.cwd();
  const on = isEnabled(projectPath);

  console.log('');
  if (on) {
    console.log(chalk.green('● Incognito mode is ON') + chalk.dim(' for this project.'));
    console.log(chalk.dim('  Global skills are blocked from running here.'));
    console.log(chalk.dim('  To allow a skill: skit incognito allow <skill>'));
    console.log(chalk.dim('  To turn off:      skit incognito off'));
  } else {
    console.log(chalk.dim('○ Incognito mode is OFF') + chalk.dim(' for this project.'));
    console.log(chalk.dim('  To enable: skit incognito on'));
  }
  console.log('');
}

/**
 * skit incognito allow <name>
 * Allow a specific skill or plugin in this project while incognito is on.
 *
 * @param {string} name — skill name (e.g. "ship") or plugin id (e.g. "superpowers@claude-plugins-official")
 */
function incognitoAllow(name) {
  const projectPath = process.cwd();

  if (!isEnabled(projectPath)) {
    console.log(chalk.yellow('Incognito mode is not enabled for this project.'));
    console.log(chalk.dim('  Run "skit incognito on" first.'));
    return;
  }

  const result = allow(projectPath, name);

  if (!result.success) {
    console.log(chalk.red(`Error: ${result.error.message}`));
    return;
  }

  const isPlugin = name.includes('@');
  const label    = isPlugin ? 'plugin' : 'skill';

  console.log('');
  console.log(chalk.green(`Allowed ${label}: ${name}`));
  console.log(chalk.dim('  Restart Claude Code in this project to apply.'));
  console.log('');
}

module.exports = { incognitoOn, incognitoOff, incognitoStatus, incognitoAllow };
