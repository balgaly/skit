#!/usr/bin/env node

'use strict';

const { Command } = require('commander');
const { configGet, configSet, VALID_KEYS } = require('../src/commands/config');
const { link } = require('../src/commands/link');
const { install } = require('../src/commands/install');
const { remove } = require('../src/commands/remove');
const { list } = require('../src/commands/list');
const { unlink } = require('../src/commands/unlink');
const { importSkill } = require('../src/commands/import');
const { update } = require('../src/commands/update');
const { sync } = require('../src/commands/sync');
const { doctor } = require('../src/commands/doctor');
const { profileExport, profileImport, profileDiff, profilePush } = require('../src/commands/profile');
const { clone } = require('../src/commands/clone');
const { incognitoOn, incognitoOff, incognitoStatus, incognitoAllow } = require('../src/commands/incognito');
const { version } = require('../package.json');
const { tui } = require('../src/commands/tui');

const program = new Command();

program
  .name('skit')
  .version(version)
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

program
  .command('link <path>')
  .description('Create a junction/symlink for a skill directory into the agent skill directory')
  .action((skillPath, options) => {
    link(skillPath, options);
  });

program
  .command('install <source>')
  .description('Clone repo or register local folder, scan for skills, link selected')
  .option('--own', 'Mark source as own (sources/own/ instead of sources/external/)')
  .option('--all', 'Skip interactive picker, install all skills')
  .action((source, options) => {
    install(source, options);
  });

program
  .command('remove [skill]')
  .description('Remove a skill junction, or all skills from a source with --source')
  .option('--source <name>', 'Remove all skills from this source')
  .option('--yes', 'Skip confirmation prompts')
  .action((skill, options) => {
    remove(skill, options);
  });

program
  .command('list')
  .description('Show all installed skills grouped by source')
  .option('--source <name>', 'Filter by source')
  .action((options) => {
    list(options);
  });

program
  .command('unlink <skill>')
  .description('Remove junction/symlink only, keep source files')
  .action((skill, options) => {
    unlink(skill, options);
  });

program
  .command('import <url>')
  .description('Smart import from gist/GitHub path/raw URL')
  .action((url, options) => {
    importSkill(url, options);
  });

program
  .command('update [source]')
  .description('Git pull + re-link (all sources or specific one)')
  .action((source, options) => {
    update(source, options);
  });

program
  .command('sync')
  .description('Recreate all junctions from manifest (new machine setup)')
  .action((options) => {
    sync(options);
  });

program
  .command('doctor')
  .description('Health check: broken links, missing sources, updates available')
  .action((options) => {
    doctor(options);
  });

const profileCmd = program
  .command('profile')
  .description('Manage and share your skill profile');

profileCmd
  .command('export')
  .description('Export current skills as a shareable JSON profile')
  .action((options) => {
    profileExport(options);
  });

profileCmd
  .command('import <file>')
  .description('Import skills from a profile JSON file')
  .action((file, options) => {
    profileImport(file, options);
  });

profileCmd
  .command('diff <file>')
  .description('Compare a profile against your installed skills')
  .action((file, options) => {
    profileDiff(file, options);
  });

profileCmd
  .command('push')
  .description('Publish your profile to a GitHub Gist')
  .action((options) => {
    profilePush(options);
  });

program
  .command('clone <user-or-url>')
  .description('Clone another user\'s skill setup from their profile')
  .action((userOrUrl, options) => {
    clone(userOrUrl, options);
  });

const incognitoCmd = program
  .command('incognito')
  .description('Open this project with a clean slate — global skills stay home');

incognitoCmd
  .command('on')
  .description('Enable incognito mode for this project')
  .action(() => { incognitoOn(); });

incognitoCmd
  .command('off')
  .description('Disable incognito mode for this project')
  .action(() => { incognitoOff(); });

incognitoCmd
  .command('status')
  .description('Show whether incognito mode is on for this project')
  .action(() => { incognitoStatus(); });

incognitoCmd
  .command('allow <name>')
  .description('Allow a skill (e.g. ship) or plugin (e.g. superpowers@claude-plugins-official) in this project')
  .action((name) => { incognitoAllow(name); });

// If no subcommand is given, launch the interactive TUI
if (process.argv.length <= 2) {
  tui().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
}
