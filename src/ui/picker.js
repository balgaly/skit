'use strict';

const format = require('./format');

/**
 * Multi-select checkbox for picking skills to install.
 *
 * @param {Array<{name: string, description: string, path: string}>} skills
 * @param {object} [options]
 * @param {object} [options._inquirer] — override inquirer for testing
 * @returns {Promise<Array>} selected skills
 */
async function pickSkills(skills, options = {}) {
  const inquirer = options._inquirer || require('inquirer');
  const choices = skills.map((s) => ({
    name: `${s.name}  ${format.dim('- ' + (s.description || 'No description'))}`,
    value: s,
    checked: false,
  }));

  const answers = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'skills',
      message: `Found ${skills.length} skill${skills.length === 1 ? '' : 's'}. Select which to install:`,
      choices,
    },
  ]);

  return answers.skills;
}

/**
 * Single-select list for menus.
 *
 * @param {string} message — prompt text
 * @param {Array<{name: string, value: any}>} choices
 * @param {object} [options]
 * @param {object} [options._inquirer] — override inquirer for testing
 * @returns {Promise<any>} selected value
 */
async function pickAction(message, choices, options = {}) {
  const inquirer = options._inquirer || require('inquirer');
  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message,
      choices,
    },
  ]);
  return answers.action;
}

module.exports = { pickSkills, pickAction };
