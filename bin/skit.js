#!/usr/bin/env node

'use strict';

const { Command } = require('commander');
const { configGet, configSet, VALID_KEYS } = require('../src/commands/config');

const program = new Command();

program
  .name('skit')
  .version('1.0.0')
  .description('A cross-platform package manager for AI agent skills');

const configCmd = program
  .command('config')
  .description('Get or set skit configuration values');

configCmd
  .command('get <key>')
  .description(`Get a config value. Valid keys: ${VALID_KEYS.join(', ')}`)
  .action((key, options) => {
    configGet(key, options);
  });

configCmd
  .command('set <key> <value>')
  .description(`Set a config value. Valid keys: ${VALID_KEYS.join(', ')}`)
  .action((key, value, options) => {
    configSet(key, value, options);
  });

program.parse(process.argv);
