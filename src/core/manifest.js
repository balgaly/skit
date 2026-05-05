const fs = require('node:fs');
const path = require('node:path');

const EMPTY_MANIFEST = { version: 1, sources: {}, skills: {} };
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const INVALID_NAME_PATTERN = /(\.\.|\/|\\|%2F|%5C)/i;

function readManifest(skitHome) {
  const manifestPath = path.join(skitHome, 'manifest.json');
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') {
      console.warn(`Warning: could not parse ${manifestPath}, using empty manifest`);
    }
    return { ...EMPTY_MANIFEST, sources: {}, skills: {} };
  }
}

function writeManifest(skitHome, manifest) {
  fs.mkdirSync(skitHome, { recursive: true });
  const manifestPath = path.join(skitHome, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

function addSource(skitHome, name, sourceData) {
  if (DANGEROUS_KEYS.has(name)) throw new Error(`Invalid source name: ${name}`);
  if (INVALID_NAME_PATTERN.test(name)) throw new Error(`Invalid source name: "${name}"`);
  const manifest = readManifest(skitHome);
  manifest.sources[name] = sourceData;
  writeManifest(skitHome, manifest);
}

function removeSource(skitHome, name) {
  const manifest = readManifest(skitHome);
  delete manifest.sources[name];
  // Remove all skills that reference this source
  for (const [skillName, skillData] of Object.entries(manifest.skills)) {
    if (skillData.source === name) {
      delete manifest.skills[skillName];
    }
  }
  writeManifest(skitHome, manifest);
}

function addSkill(skitHome, skillName, skillData) {
  if (DANGEROUS_KEYS.has(skillName)) throw new Error(`Invalid skill name: ${skillName}`);
  if (INVALID_NAME_PATTERN.test(skillName)) throw new Error(`Invalid skill name: "${skillName}"`);
  const manifest = readManifest(skitHome);
  manifest.skills[skillName] = skillData;
  writeManifest(skitHome, manifest);
}

function removeSkill(skitHome, skillName) {
  const manifest = readManifest(skitHome);
  const skillData = manifest.skills[skillName] || null;
  if (skillData) {
    delete manifest.skills[skillName];
    writeManifest(skitHome, manifest);
  }
  return skillData;
}

function getSkill(skitHome, skillName) {
  const manifest = readManifest(skitHome);
  return manifest.skills[skillName] || null;
}

function getSource(skitHome, sourceName) {
  const manifest = readManifest(skitHome);
  return manifest.sources[sourceName] || null;
}

function listSkills(skitHome) {
  const manifest = readManifest(skitHome);
  return manifest.skills;
}

function listSources(skitHome) {
  const manifest = readManifest(skitHome);
  return manifest.sources;
}

function getSkillsBySource(skitHome, sourceName) {
  const manifest = readManifest(skitHome);
  return Object.entries(manifest.skills)
    .filter(([, data]) => data.source === sourceName)
    .map(([name]) => name);
}

module.exports = {
  readManifest,
  writeManifest,
  addSource,
  removeSource,
  addSkill,
  removeSkill,
  getSkill,
  getSource,
  listSkills,
  listSources,
  getSkillsBySource,
};
