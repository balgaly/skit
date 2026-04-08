'use strict';

const format = require('../ui/format');
const { enable, disable, isEnabled, allow } = require('../core/incognito');

/**
 * skit incognito on
 * Enable incognito mode for the current project directory.
 */
function incognitoOn() {
  const projectPath = process.cwd();
  const result = enable(projectPath);

  if (!result.success) {
    console.log(format.error(`Error: ${result.error.message}`));
    if (result.error.code === 'SETTINGS_WRITE_FAILED' && result.error.partialState) {
      console.log(format.dim('  State was written. Run "skit incognito off" then retry if needed.'));
    }
    return;
  }

  if (result.alreadyEnabled) {
    console.log(format.warn('Incognito mode is already on for this project.'));
    return;
  }

  console.log('');
  console.log(format.success('Incognito mode enabled.') + format.dim(' Global skills stay home.'));
  console.log('');
  if (result.pluginsQuarantined > 0) {
    console.log(format.dim(`  ${result.pluginsQuarantined} plugin(s) quarantined`));
  }
  if (result.skillsBlocked > 0) {
    console.log(format.dim(`  ${result.skillsBlocked} user skill(s) blocked`));
  }
  console.log('');
  console.log(format.dim('  Restart Claude Code in this project to apply.'));
  console.log(format.dim('  To allow a skill here: skit incognito allow <skill>'));
}

/**
 * skit incognito off
 * Disable incognito mode for the current project directory.
 */
function incognitoOff() {
  const projectPath = process.cwd();
  const result = disable(projectPath);

  if (!result.success) {
    console.log(format.error(`Error: ${result.error.message}`));
    if (result.error.note) {
      console.log(format.dim(`  ${result.error.note}`));
    }
    return;
  }

  if (result.alreadyDisabled) {
    console.log(format.warn('Incognito mode is already off for this project.'));
    return;
  }

  console.log('');
  console.log(format.success('Incognito mode disabled.') + format.dim(' Global skills restored.'));
  console.log(format.dim('  Restart Claude Code in this project to apply.'));
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
    console.log(format.success('● Incognito mode is ON') + format.dim(' for this project.'));
    console.log(format.dim('  Global skills are blocked from running here.'));
    console.log(format.dim('  To allow a skill: skit incognito allow <skill>'));
    console.log(format.dim('  To turn off:      skit incognito off'));
  } else {
    console.log(format.dim('○ Incognito mode is OFF') + format.dim(' for this project.'));
    console.log(format.dim('  To enable: skit incognito on'));
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
    console.log(format.warn('Incognito mode is not enabled for this project.'));
    console.log(format.dim('  Run "skit incognito on" first.'));
    return;
  }

  const result = allow(projectPath, name);

  if (!result.success) {
    console.log(format.error(`Error: ${result.error.message}`));
    return;
  }

  const isPlugin = name.includes('@');
  const label    = isPlugin ? 'plugin' : 'skill';

  console.log('');
  console.log(format.success(`Allowed ${label}: ${name}`));
  console.log(format.dim('  Restart Claude Code in this project to apply.'));
  console.log('');
}

module.exports = { incognitoOn, incognitoOff, incognitoStatus, incognitoAllow };
