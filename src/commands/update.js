'use strict';

const format = require('../ui/format');
const { spinner } = require('../ui/spinner');

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

  try {
    const { invalidateCache } = require('../core/registry');
    invalidateCache(skitHome);
  } catch {
    // registry module not yet available — skip cache invalidation
  }

  const manifest = readManifest(skitHome);
  const sources = manifest.sources || {};

  // If a specific source is requested, validate it exists
  if (sourceName) {
    if (!sources[sourceName]) {
      console.log(format.error(`Error: source "${sourceName}" not found.`));
      return;
    }
  }

  // Determine which sources to update
  const sourceNames = sourceName ? [sourceName] : Object.keys(sources);

  if (sourceNames.length === 0) {
    console.log(format.warn('No sources to update.'));
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
      console.log(format.dim(`  Skipping _standalone (no git remote)`));
      skippedCount++;
      continue;
    }

    // Skip if not a git repo
    if (!isGitRepo(sourceDir)) {
      console.log(format.dim(`  Skipping "${name}" (not a git repo)`));
      skippedCount++;
      continue;
    }

    // Get SHA before pull
    let shaBefore;
    try {
      shaBefore = getCurrentSha(sourceDir);
    } catch (err) {
      console.log(format.error(`  Error reading "${name}": ${err.message}`));
      errorCount++;
      continue;
    }

    // Pull
    const s = spinner(`Updating "${name}"...`).start();

    try {
      const result = pullRepo(sourceDir);

      if (result.updated) {
        s.succeed(`Updated "${name}" ${shaBefore.slice(0, 7)} -> ${result.sha.slice(0, 7)}`);
        // Always log to stdout for test capture
        console.log(
          format.success(`  Updated "${name}"`) +
          format.dim(` ${shaBefore.slice(0, 7)} -> ${result.sha.slice(0, 7)}`)
        );
        updatedCount++;

        // Update manifest with new SHA
        manifest.sources[name].sha = result.sha;
        manifest.sources[name].updatedAt = new Date().toISOString();
      } else {
        s.stop();
        console.log(format.dim(`  "${name}" already up to date`));
        upToDateCount++;
      }
    } catch (err) {
      s.fail(`Error updating "${name}": ${err.message}`);
      console.log(format.error(`  Error updating "${name}": ${err.message}`));
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
    console.log(format.success(`${updatedCount} source${updatedCount === 1 ? '' : 's'} updated.`));
  }
  if (upToDateCount > 0) {
    console.log(format.dim(`${upToDateCount} source${upToDateCount === 1 ? '' : 's'} already up to date.`));
  }
  if (skippedCount > 0) {
    console.log(format.dim(`${skippedCount} source${skippedCount === 1 ? '' : 's'} skipped.`));
  }
  if (errorCount > 0) {
    console.log(format.error(`${errorCount} source${errorCount === 1 ? '' : 's'} had errors.`));
  }
}

module.exports = { update };
