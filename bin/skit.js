#!/usr/bin/env node

'use strict';

const { Command } = require('commander');

const program = new Command();

program
  .name('skit')
  .version('1.0.0')
  .description('A cross-platform package manager for AI agent skills');

program.parse(process.argv);
