'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// ─── Paths ──────────────────────────────────────────────────────────────────

const HOME_CLAUDE       = path.join(os.homedir(), '.claude');
const GLOBAL_SETTINGS   = path.join(HOME_CLAUDE, 'settings.json');
const USER_SKILLS_DIR   = path.join(HOME_CLAUDE, 'skills');
const USER_COMMANDS_DIR = path.join(HOME_CLAUDE, 'commands');

const CLAUDE_DIR        = '.claude';
const LOCAL_SETTINGS    = path.join(CLAUDE_DIR, 'settings.local.json');
const STATE_FILE        = path.join(CLAUDE_DIR, 'incognito-state.json');
const QUARANTINE_SCRIPT = path.join(CLAUDE_DIR, 'quarantine-plugins.js');

const SESSION_HOOK_COMMAND = 'node .claude/quarantine-plugins.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function readJSON(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

function unlinkSilent(filePath) {
  try { fs.unlinkSync(filePath); } catch { /* non-fatal */ }
}

function listDirs(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch { return []; }
}

function listCommandFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isFile() && d.name.endsWith('.md'))
      .map(d => d.name.replace(/\.md$/, ''));
  } catch { return []; }
}

function projectFile(projectPath, relativePath) {
  return path.join(projectPath, relativePath);
}

function extractAllowedSkills(localAllow) {
  return new Set(
    (localAllow || [])
      .map(e => { const m = e.match(/^Skill\((.+)\)$/); return m ? m[1] : null; })
      .filter(Boolean)
  );
}

// ─── Quarantine script (installed at .claude/quarantine-plugins.js) ──────────
// Runs every SessionStart to keep deny list in sync with global settings.

function generateQuarantineScript() {
  return `#!/usr/bin/env node
'use strict';

/**
 * Incognito Mode — Session Quarantine Script
 * Managed by skit. Configure with: skit incognito on/off/allow
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const HOME_CLAUDE       = path.join(os.homedir(), '.claude');
const GLOBAL_SETTINGS   = path.join(HOME_CLAUDE, 'settings.json');
const USER_SKILLS_DIR   = path.join(HOME_CLAUDE, 'skills');
const USER_COMMANDS_DIR = path.join(HOME_CLAUDE, 'commands');
const LOCAL_SETTINGS    = path.join(process.cwd(), '.claude', 'settings.local.json');
const STATE_FILE        = path.join(process.cwd(), '.claude', 'incognito-state.json');

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); } catch { return null; }
}

function atomicWrite(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\\n', 'utf-8');
  fs.renameSync(tmp, filePath);
}

function listDirs(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch { return []; }
}

function listCommandFiles(dirPath) {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isFile() && d.name.endsWith('.md'))
      .map(d => d.name.replace(/\\.md$/, ''));
  } catch { return []; }
}

function main() {
  const state = readJSON(STATE_FILE);
  if (!state || state.enabled !== true) return;

  const globalSettings = readJSON(GLOBAL_SETTINGS);
  const localSettings  = readJSON(LOCAL_SETTINGS) || {};

  // Layer 1: disable globally-enabled plugins
  const quarantinedPlugins = {};
  if (globalSettings && globalSettings.enabledPlugins) {
    for (const [id, on] of Object.entries(globalSettings.enabledPlugins)) {
      if (on === true) quarantinedPlugins[id] = false;
    }
  }
  const existingPlugins = localSettings.enabledPlugins || {};
  const mergedPlugins   = { ...quarantinedPlugins, ...existingPlugins };

  // Layer 2: deny user skills not on the local allow list
  const userSkills    = listDirs(USER_SKILLS_DIR);
  const userCommands  = listCommandFiles(USER_COMMANDS_DIR);
  const allUserSkills = [...new Set([...userSkills, ...userCommands])];

  localSettings.permissions = localSettings.permissions || {};
  const localAllow    = localSettings.permissions.allow || [];
  const allowedSkills = new Set(
    localAllow.map(e => { const m = e.match(/^Skill\\((.+)\\)$/); return m ? m[1] : null; })
              .filter(Boolean)
  );

  const existingDeny = localSettings.permissions.deny || [];
  const prevManaged  = new Set((state.managedDenySkills || []).map(n => \`Skill(\${n})\`));
  const manualDeny   = existingDeny.filter(e => !prevManaged.has(e));
  const skillsToDeny = allUserSkills.filter(n => !allowedSkills.has(n));
  const mergedDeny   = [...manualDeny, ...skillsToDeny.map(n => \`Skill(\${n})\`)];

  const pluginsChanged = JSON.stringify(existingPlugins) !== JSON.stringify(mergedPlugins);
  const denyChanged    = JSON.stringify(existingDeny)    !== JSON.stringify(mergedDeny);
  if (!pluginsChanged && !denyChanged) return;

  localSettings.enabledPlugins   = mergedPlugins;
  localSettings.permissions.deny = mergedDeny;

  atomicWrite(LOCAL_SETTINGS, localSettings);
  atomicWrite(STATE_FILE, { ...state, managedDenySkills: skillsToDeny });

  const newPlugins = Object.keys(quarantinedPlugins).filter(k => existingPlugins[k] === undefined);
  if (newPlugins.length) console.error(\`[incognito] Quarantined \${newPlugins.length} plugin(s)\`);
  if (denyChanged)       console.error(\`[incognito] Blocked \${skillsToDeny.length} user skill(s)\`);
}

main();
`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Returns true if incognito mode is enabled for the project.
 * Never throws — safe to call without guards.
 *
 * @param {string} projectPath
 * @returns {boolean}
 */
function isEnabled(projectPath) {
  try {
    const state = readJSON(projectFile(projectPath, STATE_FILE));
    return state !== null && state.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Enable incognito mode for the given project.
 * Idempotent — safe to call when already enabled.
 *
 * @param {string} projectPath
 * @returns {{ success: boolean, alreadyEnabled?: boolean, pluginsQuarantined?: number, skillsBlocked?: number, error?: object }}
 */
function enable(projectPath) {
  if (!fs.existsSync(projectPath)) {
    return { success: false, error: { code: 'INVALID_PATH', message: `Project path does not exist: ${projectPath}` } };
  }

  if (isEnabled(projectPath)) {
    return { success: true, alreadyEnabled: true };
  }

  const localSettingsPath = projectFile(projectPath, LOCAL_SETTINGS);
  const stateFilePath     = projectFile(projectPath, STATE_FILE);
  const scriptPath        = projectFile(projectPath, QUARANTINE_SCRIPT);

  // Step 1: Read inputs
  const globalSettings = readJSON(GLOBAL_SETTINGS);
  const localSettings  = readJSON(localSettingsPath) || {};

  // Step 2: Build plugin quarantine map
  const quarantinedPlugins = {};
  if (globalSettings && globalSettings.enabledPlugins) {
    for (const [id, on] of Object.entries(globalSettings.enabledPlugins)) {
      if (on === true) quarantinedPlugins[id] = false;
    }
  }
  const existingPlugins = localSettings.enabledPlugins || {};
  const mergedPlugins   = { ...quarantinedPlugins, ...existingPlugins };

  // Step 3: Build user skill deny list
  const userSkills    = listDirs(USER_SKILLS_DIR);
  const userCommands  = listCommandFiles(USER_COMMANDS_DIR);
  const allUserSkills = [...new Set([...userSkills, ...userCommands])];

  localSettings.permissions = localSettings.permissions || {};
  const allowedSkills = extractAllowedSkills(localSettings.permissions.allow);
  const existingDeny  = localSettings.permissions.deny || [];
  const skillsToDeny  = allUserSkills.filter(n => !allowedSkills.has(n));
  const incognitoDeny = skillsToDeny.map(n => `Skill(${n})`);
  const mergedDeny    = [...existingDeny.filter(e => !incognitoDeny.includes(e)), ...incognitoDeny];

  // Step 4: Add SessionStart hook (deduplicated)
  localSettings.hooks = localSettings.hooks || {};
  localSettings.hooks.SessionStart = localSettings.hooks.SessionStart || [];
  const hookPresent = localSettings.hooks.SessionStart.some(g =>
    Array.isArray(g.hooks) && g.hooks.some(h => h.command === SESSION_HOOK_COMMAND)
  );
  if (!hookPresent) {
    localSettings.hooks.SessionStart.push({
      hooks: [{ type: 'command', command: SESSION_HOOK_COMMAND, timeout: 10, statusMessage: 'Applying incognito mode...' }],
    });
  }

  localSettings.enabledPlugins   = mergedPlugins;
  localSettings.permissions.deny = mergedDeny;

  // Step 5: Write quarantine script
  try {
    fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
    fs.writeFileSync(scriptPath, generateQuarantineScript(), 'utf-8');
  } catch (err) {
    return { success: false, error: { code: 'SCRIPT_WRITE_FAILED', message: err.message } };
  }

  // Step 6: Write state FIRST (intent before mutation)
  const state = {
    enabled: true,
    managedPlugins: Object.keys(quarantinedPlugins),
    managedDenySkills: skillsToDeny,
  };
  try {
    atomicWrite(stateFilePath, state);
  } catch (err) {
    unlinkSilent(scriptPath);
    return { success: false, error: { code: 'STATE_WRITE_FAILED', message: err.message } };
  }

  // Step 7: Write settings.local.json
  try {
    atomicWrite(localSettingsPath, localSettings);
  } catch (err) {
    return { success: false, error: { code: 'SETTINGS_WRITE_FAILED', message: err.message, partialState: 'state_written' } };
  }

  return { success: true, pluginsQuarantined: Object.keys(quarantinedPlugins).length, skillsBlocked: skillsToDeny.length };
}

/**
 * Disable incognito mode for the given project.
 * Idempotent — safe to call when already disabled.
 *
 * @param {string} projectPath
 * @returns {{ success: boolean, alreadyDisabled?: boolean, error?: object }}
 */
function disable(projectPath) {
  if (!fs.existsSync(projectPath)) {
    return { success: false, error: { code: 'INVALID_PATH', message: `Project path does not exist: ${projectPath}` } };
  }

  if (!isEnabled(projectPath)) {
    return { success: true, alreadyDisabled: true };
  }

  const stateFilePath     = projectFile(projectPath, STATE_FILE);
  const localSettingsPath = projectFile(projectPath, LOCAL_SETTINGS);
  const scriptPath        = projectFile(projectPath, QUARANTINE_SCRIPT);

  // Step 1: Read state
  const state = readJSON(stateFilePath);
  if (!state) {
    return { success: false, error: { code: 'STATE_UNREADABLE', message: 'incognito-state.json is missing or corrupt' } };
  }

  const localSettings = readJSON(localSettingsPath) || {};

  // Step 2: Mark disabled FIRST
  try {
    atomicWrite(stateFilePath, { enabled: false, managedPlugins: [], managedDenySkills: [] });
  } catch (err) {
    return { success: false, error: { code: 'STATE_WRITE_FAILED', message: err.message } };
  }

  // Step 3: Clean settings — remove only what we added
  const managedPlugins = new Set(state.managedPlugins || []);
  if (localSettings.enabledPlugins) {
    for (const key of managedPlugins) {
      if (localSettings.enabledPlugins[key] === false) {
        delete localSettings.enabledPlugins[key];
      }
    }
    if (Object.keys(localSettings.enabledPlugins).length === 0) {
      delete localSettings.enabledPlugins;
    }
  }

  const managedDeny = new Set((state.managedDenySkills || []).map(n => `Skill(${n})`));
  if (localSettings.permissions && localSettings.permissions.deny) {
    localSettings.permissions.deny = localSettings.permissions.deny.filter(e => !managedDeny.has(e));
    if (localSettings.permissions.deny.length === 0) delete localSettings.permissions.deny;
  }

  if (localSettings.hooks && localSettings.hooks.SessionStart) {
    localSettings.hooks.SessionStart = localSettings.hooks.SessionStart
      .map(g => ({ ...g, hooks: (g.hooks || []).filter(h => h.command !== SESSION_HOOK_COMMAND) }))
      .filter(g => g.hooks.length > 0);
    if (localSettings.hooks.SessionStart.length === 0) delete localSettings.hooks.SessionStart;
    if (Object.keys(localSettings.hooks).length === 0) delete localSettings.hooks;
  }

  // Step 4: Write cleaned settings
  try {
    atomicWrite(localSettingsPath, localSettings);
  } catch (err) {
    return { success: false, error: { code: 'SETTINGS_WRITE_FAILED', message: err.message, note: 'state marked disabled; retry safe' } };
  }

  // Step 5: Delete managed files
  unlinkSilent(scriptPath);
  unlinkSilent(stateFilePath);

  return { success: true };
}

/**
 * Allow a specific skill or plugin in this project while incognito is on.
 * Skill: add Skill(name) to allow list and remove from deny list.
 * Plugin: set plugin@market to true in enabledPlugins (overrides quarantine false).
 *
 * @param {string} projectPath
 * @param {string} name — skill name (e.g. "ship") or plugin id (e.g. "superpowers@claude-plugins-official")
 * @returns {{ success: boolean, error?: object }}
 */
function allow(projectPath, name) {
  if (!fs.existsSync(projectPath)) {
    return { success: false, error: { code: 'INVALID_PATH', message: `Project path does not exist: ${projectPath}` } };
  }

  const localSettingsPath = projectFile(projectPath, LOCAL_SETTINGS);
  const localSettings = readJSON(localSettingsPath) || {};
  const isPlugin = name.includes('@');

  if (isPlugin) {
    localSettings.enabledPlugins = localSettings.enabledPlugins || {};
    localSettings.enabledPlugins[name] = true;
  } else {
    localSettings.permissions = localSettings.permissions || {};
    localSettings.permissions.allow = localSettings.permissions.allow || [];
    const entry = `Skill(${name})`;
    if (!localSettings.permissions.allow.includes(entry)) {
      localSettings.permissions.allow.push(entry);
    }
    if (localSettings.permissions.deny) {
      localSettings.permissions.deny = localSettings.permissions.deny.filter(e => e !== entry);
      if (localSettings.permissions.deny.length === 0) delete localSettings.permissions.deny;
    }
  }

  try {
    atomicWrite(localSettingsPath, localSettings);
    return { success: true };
  } catch (err) {
    return { success: false, error: { code: 'SETTINGS_WRITE_FAILED', message: err.message } };
  }
}

module.exports = { enable, disable, isEnabled, allow };
