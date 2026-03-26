'use strict';

const chalk = require('chalk');

const { pullRepo, getCurrentSha, isGitRepo } = require('../core/git');
const { readManifest, writeManifest, listSources, getSource } = require('../core/manifest');
const { resolveSkitHome } = require('../index');

/**
 * Update sources by pulling latest from git.
 *
 * @param {string} [sourceName] — specific source to update, or undefined for all
 * @param {object} [options]
 * @param {string} [options.skitHome] — override skit home (for testing)
 */
async function update(sourceName, options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  const manifest = readManifest(skitHome);
  const sources = manifest.sources || {};

  // If a specific source is requested, validate it exists
  if (sourceName) {
    if (!sources[sourceName]) {
      console.log(chalk.red(`Error: source "${sourceName}" not found.`));
      return;
    }
  }

  // Determine which sources to update
  const sourceNames = sourceName ? [sourceName] : Object.keys(sources);

  if (sourceNames.length === 0) {
    console.log(chalk.yellow('No sources to update.'));
    return;
  }

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let upToDateCount = 0;

  for (const name of sourceNames) {
    const source = sources[name];
    const sourceDir = source.path;

    // Skip _standalone (no git remote)
    if (name === '_standalone') {
      console.log(chalk.dim(`  Skipping _standalone (no git remote)`));
      skippedCount++;
      continue;
    }

    // Skip if not a git repo
    if (!isGitRepo(sourceDir)) {
      console.log(chalk.dim(`  Skipping "${name}" (not a git repo)`));
      skippedCount++;
      continue;
    }

    // Get SHA before pull
    let shaBefore;
    try {
      shaBefore = getCurrentSha(sourceDir);
    } catch (err) {
      console.log(chalk.red(`  Error reading "${name}": ${err.message}`));
      errorCount++;
      continue;
    }

    // Pull
    let spinner;
    let spinnerAvailable = false;
    try {
      const ora = require('ora');
      spinner = ora(`Updating "${name}"...`).start();
      spinnerAvailable = true;
    } catch {
      // ora not available (testing environment), use plain output
      console.log(chalk.cyan(`  Updating "${name}"...`));
    }

    try {
      const result = pullRepo(sourceDir);

      if (result.updated) {
        if (spinnerAvailable && spinner) {
          spinner.succeed(`Updated "${name}" ${chalk.dim(`${shaBefore.slice(0, 7)} -> ${result.sha.slice(0, 7)}`)}`);
        }
        // Always log to stdout for test capture
        console.log(
          chalk.green(`  Updated "${name}"`) +
          chalk.dim(` ${shaBefore.slice(0, 7)} -> ${result.sha.slice(0, 7)}`)
        );
        updatedCount++;

        // Update manifest with new SHA
        manifest.sources[name].sha = result.sha;
        manifest.sources[name].updatedAt = new Date().toISOString();
      } else {
        if (spinnerAvailable && spinner) {
          spinner.info(`"${name}" already up to date`);
        }
        console.log(chalk.dim(`  "${name}" already up to date`));
        upToDateCount++;
      }
    } catch (err) {
      if (spinnerAvailable && spinner) {
        spinner.fail(`Error updating "${name}": ${err.message}`);
      }
      console.log(chalk.red(`  Error updating "${name}": ${err.message}`));
      errorCount++;
    }
  }

  // Save manifest if anything changed
  if (updatedCount > 0) {
    writeManifest(skitHome, manifest);
  }

  // Summary
  console.log('');
  if (updatedCount > 0) {
    console.log(chalk.green(`${updatedCount} source${updatedCount === 1 ? '' : 's'} updated.`));
  }
  if (upToDateCount > 0) {
    console.log(chalk.dim(`${upToDateCount} source${upToDateCount === 1 ? '' : 's'} already up to date.`));
  }
  if (skippedCount > 0) {
    console.log(chalk.dim(`${skippedCount} source${skippedCount === 1 ? '' : 's'} skipped.`));
  }
  if (errorCount > 0) {
    console.log(chalk.red(`${errorCount} source${errorCount === 1 ? '' : 's'} had errors.`));
  }
}

module.exports = { update };
