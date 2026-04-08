'use strict';

const { resolveSkitHome, ensureDirs, loadConfig } = require('../index');
const { listSkills } = require('../core/manifest');
const format = require('../ui/format');

async function tui(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  ensureDirs(skitHome);

  const config = loadConfig(skitHome);
  const skills = listSkills(skitHome);
  const skillCount = Object.keys(skills).length;
  const agentName = config.agent || 'claude-code';

  const pickAction = options._pickAction || _defaultPickAction;
  const browseScreen = options._browse || require('./tui/browse').browseRegistry;
  const mySkillsScreen = options._mySkills || require('./tui/my-skills').mySkills;
  const doctor = options._doctor || require('./doctor').doctor;
  const update = options._update || require('./update').update;
  const sync = options._sync || require('./sync').sync;

  console.log('');
  console.log(format.bold('skit') + format.dim(` v${require('../../package.json').version}`));
  console.log(format.dim(`${skillCount} skill${skillCount === 1 ? '' : 's'} installed · ${agentName}`));
  console.log('');

  const choice = await pickAction('What would you like to do?', [
    { name: 'Browse registry', value: 'browse' },
    { name: 'My skills',       value: 'my-skills' },
    { name: 'Update / sync',   value: 'update-sync' },
    { name: 'Health check',    value: 'health-check' },
    { name: 'Exit',            value: 'exit' },
  ]);

  switch (choice) {
    case 'browse':
      await browseScreen({ skitHome });
      break;
    case 'my-skills':
      await mySkillsScreen({ skitHome });
      break;
    case 'update-sync':
      await update(undefined, { skitHome });
      await sync({ skitHome });
      break;
    case 'health-check':
      await doctor({ skitHome });
      break;
    case 'exit':
    default:
      break;
  }
}

async function _defaultPickAction(message, choices) {
  const { pickAction } = require('../ui/picker');
  return pickAction(message, choices);
}

module.exports = { tui };
