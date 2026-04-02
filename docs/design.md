# skit — Design Specification

> A cross-platform package manager for AI agent skills.
> "npm for AI agent skills. Install, organize, and update skills from any source."

---

## 1. Problem Statement

AI coding agents (Claude Code, Cursor, Windsurf) support user-authored skills/rules, but there is no standard way to discover, install, manage, or update them. Developers dump everything into one folder, lose track of what came from where, cannot update skills, and cannot share cleanly.

## 2. Product Overview

`skit` is a cross-platform CLI tool (npm package) that manages AI agent skills. It installs skills from GitHub repos, local folders, gists, or raw URLs. It links them into the agent's active directory using filesystem junctions/symlinks. It tracks every skill's origin, version, and source collection. It updates, removes, and syncs with single commands. It enables one-command sharing and cloning of entire skill setups.

### What skit does (v1)

- Install skills from GitHub repos, local folders, or standalone URLs
- Link them into the agent's active directory (no copies)
- Track every skill's origin, version, and source collection
- Update, remove, and sync with single commands
- Smart import from any URL (GitHub, gists, raw files)
- Export/import/diff skill profiles
- Clone anyone's skill setup with one command
- Health check for broken links and missing sources

### What skit does NOT do (v1)

- No central registry/marketplace (sources are git URLs or local paths)
- No dependency resolution between skills
- No skill authoring/scaffolding
- No auto-discovery of skills from the internet
- No interactive TUI browser (v1.1)

### Roadmap

| Feature | Version | Notes |
|---------|---------|-------|
| Core (install, remove, list, update, sync) | v1.0 | Foundation |
| `skit import <url>` | v1.0 | Smart URL parsing |
| `skit clone <user>` | v1.0 | Growth engine via GitHub gists |
| `skit profile export/import/diff/push` | v1.0 | Powers clone |
| `skit doctor` | v1.0 | Health checks |
| [`skit incognito`](INCOGNITO-MODE.md) — per-project plugin quarantine | v1.x | In progress |
| Interactive TUI browser (`npx skit`) | v1.1 | Community registry (JSON on GitHub) |
| Trending/popular skills | v2.0 | Needs adoption data |
| Cursor agent adapter | v1.x | Implemented |
| Windsurf agent adapter | v1.x | As demand emerges |

---

## 3. Architecture

### 3.1 Directory Structure

```
~/.skit/                              # SKIT_HOME (configurable via config or SKIT_HOME env)
├── config.json                       # User config (agent, profile username, SKIT_HOME)
├── manifest.json                     # Single source of truth for all installed skills
├── sources/                          # Where source code lives
│   ├── own/                          # User's repos (they author these)
│   │   └── snirs-skills/             # git repo clone
│   │       ├── view-md/
│   │       ├── split/
│   │       └── ...
│   ├── external/                     # Everything from elsewhere
│   │   ├── their-skills/             # git clone of a collection
│   │   │   ├── cool-skill/
│   │   │   └── another-skill/
│   │   └── _standalone/              # skills from import (gists, URLs, single files)
│   │       └── pr-helper/
│   └── .gitkeep
└── profiles/                         # Cached imported profiles
    └── snir.json

~/.claude/skills/                     # Agent target directory (junctions/symlinks ONLY)
├── view-md       → ~/.skit/sources/own/snirs-skills/view-md
├── split         → ~/.skit/sources/own/snirs-skills/split
├── cool-skill    → ~/.skit/sources/external/their-skills/cool-skill
└── pr-helper     → ~/.skit/sources/external/_standalone/pr-helper
```

### 3.2 Key Principles

- `sources/` holds actual files. Git repos are full clones (updatable). Standalone imports are extracted here.
- The agent target directory contains ONLY junctions/symlinks. Never real files. `skit` is the single manager.
- `manifest.json` is the brain. If the manifest says a skill is installed, it is. If not, it is not.
- `own/` vs `external/` is the only structural split. Own = you push changes. External = you pull updates.
- All paths in the manifest are relative to SKIT_HOME for portability.

---

## 4. Data Model

### 4.1 config.json

```json
{
  "agent": "claude-code",
  "user": "snir",
  "skitHome": null
}
```

- `agent` — which agent adapter to use (determines target directory and skill detection)
- `user` — GitHub username for `skit profile push` and `skit clone`
- `skitHome` — override for SKIT_HOME (null = default `~/.skit/`)

### 4.2 manifest.json

```json
{
  "version": 1,
  "sources": {
    "snirs-skills": {
      "type": "own",
      "origin": "https://github.com/balgaly/snirs-skills",
      "localPath": "sources/own/snirs-skills",
      "gitSha": "a1b2c3d4e5f6",
      "addedAt": "2026-03-20T00:00:00Z",
      "updatedAt": "2026-03-20T00:00:00Z"
    },
    "their-skills": {
      "type": "external",
      "origin": "https://github.com/someone/their-skills",
      "localPath": "sources/external/their-skills",
      "gitSha": "d4e5f6a7b8c9",
      "addedAt": "2026-03-21T00:00:00Z",
      "updatedAt": "2026-03-21T00:00:00Z"
    },
    "_standalone": {
      "type": "external",
      "origin": null,
      "localPath": "sources/external/_standalone"
    }
  },
  "skills": {
    "view-md": {
      "source": "snirs-skills",
      "path": "view-md",
      "agent": "claude-code",
      "installedAt": "2026-03-20T00:00:00Z",
      "importedFrom": null
    },
    "cool-skill": {
      "source": "their-skills",
      "path": "cool-skill",
      "agent": "claude-code",
      "installedAt": "2026-03-21T00:00:00Z",
      "importedFrom": null
    },
    "pr-helper": {
      "source": "_standalone",
      "path": "pr-helper",
      "agent": "claude-code",
      "installedAt": "2026-03-21T00:00:00Z",
      "importedFrom": "https://gist.github.com/someone/abc123"
    }
  }
}
```

### 4.3 Profile Format

Used by `skit profile export`, `skit clone`, and shared via gists.

```json
{
  "skit": "1.0",
  "user": "snir",
  "exported": "2026-03-21T00:00:00Z",
  "sources": [
    {
      "name": "snirs-skills",
      "origin": "https://github.com/balgaly/snirs-skills",
      "type": "own"
    },
    {
      "name": "their-skills",
      "origin": "https://github.com/someone/their-skills",
      "type": "external"
    }
  ],
  "skills": [
    { "name": "view-md", "source": "snirs-skills" },
    { "name": "split", "source": "snirs-skills" },
    { "name": "cool-skill", "source": "their-skills" },
    { "name": "pr-helper", "source": "_standalone", "importedFrom": "https://gist.github.com/someone/abc123" }
  ]
}
```

---

## 5. CLI Commands

### 5.1 Command Reference

| Command | Description |
|---------|-------------|
| `skit install <url>` | Clone repo, scan for skills, interactive picker, link selected |
| `skit install <local-path>` | Register local folder as source, link skills |
| `skit import <any-url>` | Smart import from gist/GitHub path/raw URL |
| `skit remove <skill>` | Remove junction, prompt if last skill from source |
| `skit remove --source <name>` | Remove all skills from a source, prompt to delete source |
| `skit list` | Show all skills grouped by source |
| `skit list --source <name>` | Filter by source |
| `skit update [source]` | Git pull + re-link (all sources or specific one) |
| `skit sync` | Recreate all junctions from manifest (new machine setup) |
| `skit clone <user>` | Fetch user's profile, install everything |
| `skit clone <url>` | Fetch profile from URL, install everything |
| `skit profile export` | Export manifest as shareable profile JSON to stdout |
| `skit profile import <file>` | Apply a profile (install missing, prompt for conflicts) |
| `skit profile diff <file-or-user>` | Show what they have that you don't |
| `skit profile push` | Publish profile to GitHub gist (requires `gh` CLI) |
| `skit doctor` | Health check: broken links, missing sources, updates available |
| `skit link <path>` | Low-level: create junction for one skill directory |
| `skit unlink <skill>` | Low-level: remove junction only, keep source |
| `skit config set <key> <value>` | Set config (agent, user, skitHome) |
| `skit config get <key>` | Get config value |

### 5.2 UX Flows

#### `skit install` (main flow)

```
$ skit install https://github.com/someone/their-skills

  Cloning someone/their-skills...
  Found 5 skills:

  [x] cool-skill      - Use when reviewing PRs for security issues
  [ ] another-skill   - Use when generating changelogs
  [x] test-runner     - Use when running test suites
  [ ] deploy-helper   - Use when deploying to production
  [ ] doc-gen         - Use when generating API docs

  Space to toggle, Enter to confirm, A to select all

  Installed 2 skills from their-skills
    cool-skill    -> ~/.claude/skills/cool-skill
    test-runner   -> ~/.claude/skills/test-runner
```

- Skill descriptions are extracted from SKILL.md `description` field
- If the repo contains only 1 skill, skip the picker and install directly
- If a skill name conflicts with an existing one, warn and ask to overwrite or skip

#### `skit clone` (viral flow)

```
$ npx skit clone snir

  Fetching snir's profile...
  Found 8 skills from 3 sources:

  snirs-skills (4 skills)
    view-md, split, code-reviewer, ship

  their-skills (2 skills)
    cool-skill, test-runner

  standalone (2 skills)
    pr-helper, quick-docs

  Install all 8 skills? (Y/n/pick)

  Cloned 3 sources, installed 8 skills
  Your setup now matches snir's profile
```

- Fetches profile from `https://gist.github.com/<user>` with filename `skit-profile.json`
- If `<user>` is a URL, fetches directly
- Clones each source that is not already present
- Installs each skill that is not already installed
- Reports conflicts (existing skills from different sources)

#### `skit import` (any URL)

```
$ skit import https://gist.github.com/someone/abc123

  Detected: GitHub Gist (2 files)
  Skill name: pr-helper (from gist description)

  Installed pr-helper from gist
    pr-helper -> ~/.claude/skills/pr-helper
```

#### `skit remove` (with source cleanup)

```
$ skit remove cool-skill

  Removed cool-skill from ~/.claude/skills/

  cool-skill was the last active skill from 'their-skills'.
  Delete source? (y/N/keep)
  > y

  Deleted source: their-skills
```

#### `skit doctor`

```
$ skit doctor

  Checking 8 skills...

  Broken links:
    pr-helper -> source missing (sources/external/_standalone/pr-helper)

  Updates available:
    their-skills: 3 commits behind (d4e5f6a -> b7c8d9e)
    snirs-skills: up to date

  Unused sources:
    old-tools: cloned but no skills installed

  1 issue found. Run 'skit sync' to fix broken links.
```

---

## 6. Cross-Platform Linking

```javascript
const fs = require('fs');
const path = require('path');

function linkSkill(sourcePath, targetPath) {
  const resolvedSource = path.resolve(sourcePath);

  if (process.platform === 'win32') {
    // NTFS junction - works without admin/Developer Mode
    fs.symlinkSync(resolvedSource, targetPath, 'junction');
  } else {
    // Unix directory symlink
    fs.symlinkSync(resolvedSource, targetPath, 'dir');
  }
}

function unlinkSkill(targetPath) {
  // On both platforms, removing a junction/symlink does NOT delete the source
  fs.rmSync(targetPath, { recursive: false });
}

function isLinked(targetPath) {
  try {
    const stats = fs.lstatSync(targetPath);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}
```

Key notes:
- `fs.symlinkSync` with `'junction'` on Windows creates NTFS junctions without elevation
- Junctions work transparently with all file operations (Claude skill discovery included)
- `path.resolve()` ensures absolute paths (junctions require absolute targets on Windows)
- Removing a junction/symlink never deletes the source directory

---

## 7. Agent Adapters

### 7.1 Adapter Interface

```javascript
// Each adapter exports:
module.exports = {
  name: 'claude-code',               // Adapter identifier
  skillDir: () => string,            // Returns the agent's skill directory path
  detectSkill: (dir) => boolean,     // Returns true if dir contains a valid skill
  getSkillMeta: (dir) => object,     // Returns { name, description } from skill files
};
```

### 7.2 Claude Code Adapter (v1)

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = {
  name: 'claude-code',

  skillDir() {
    return path.join(os.homedir(), '.claude', 'skills');
  },

  detectSkill(dir) {
    return fs.existsSync(path.join(dir, 'SKILL.md'));
  },

  getSkillMeta(dir) {
    const content = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf-8');
    const frontmatter = parseFrontmatter(content);
    return {
      name: frontmatter.name || path.basename(dir),
      description: frontmatter.description || '',
    };
  },
};
```

### 7.3 Cursor Adapter (v1.x)

Skills link into `~/.cursor/rules/`. Accepts both `SKILL.md` (cross-agent) and `.cursorrules` (Cursor-native) as skill markers.

```javascript
// agents/cursor.js
module.exports = {
  name: 'cursor',

  skillDir() {
    if (process.env.SKIT_AGENT_SKILL_DIR) return process.env.SKIT_AGENT_SKILL_DIR;
    return path.join(os.homedir(), '.cursor', 'rules');
  },

  detectSkill(dir) {
    return fs.existsSync(path.join(dir, 'SKILL.md')) ||
           fs.existsSync(path.join(dir, '.cursorrules'));
  },

  getSkillMeta(dir) {
    const skillMd = path.join(dir, 'SKILL.md');
    if (fs.existsSync(skillMd)) {
      const fm = parseFrontmatter(fs.readFileSync(skillMd, 'utf-8'));
      return { name: fm.name || path.basename(dir), description: fm.description || '' };
    }
    return { name: path.basename(dir), description: '' };
  },
};
```

Switch to Cursor:

```bash
skit config set agent cursor
```

### 7.4 Future Adapters

| Agent | Status | Skill Directory |
|-------|--------|-----------------|
| Claude Code | Implemented (v1.0) | `~/.claude/skills/` |
| Cursor | Implemented (v1.x) | `~/.cursor/rules/` |
| Windsurf | Planned | `~/.windsurf/rules/` |
| VS Code | Planned | TBD |

Adding a new agent = ~20 lines implementing the interface.

---

## 8. Smart Import (`skit import`)

URL detection via pattern matching:

| URL Pattern | Detection | Action |
|-------------|-----------|--------|
| `github.com/<user>/<repo>` | GitHub repo root | Full clone -> skill picker (delegate to `install`) |
| `github.com/<user>/<repo>/tree/<branch>/<path>` | GitHub subfolder | Clone repo, install only the skill at `<path>` |
| `gist.github.com/<user>/<id>` | GitHub Gist | Download gist files via GitHub API, create standalone skill |
| `raw.githubusercontent.com/...` | Raw GitHub file | Download file, wrap as standalone skill |
| Any other URL ending in known file extensions | Raw file | Download, wrap as standalone skill |

### Import to standalone flow:

1. Download content to a temp directory
2. If it contains a `SKILL.md`, use the directory as-is
3. If it is a single `SKILL.md` file, create a directory for it
4. If it is other files (no `SKILL.md`), prompt user whether to create a wrapper `SKILL.md`
5. Move to `sources/external/_standalone/<skill-name>/`
6. Link to agent directory
7. Update manifest with `importedFrom` URL

---

## 9. Profile & Clone System

### 9.1 Profile Push

`skit profile push` publishes the current setup to a GitHub gist.

1. Run `skit profile export` to generate profile JSON
2. Use `gh` CLI (GitHub CLI) to create or update a gist
3. Gist filename: `skit-profile.json`
4. Gist description: `skit profile for <user> - <N> skills from <M> sources`
5. Print shareable: `npx skit clone <user>`

Requires `gh` CLI installed and authenticated. If not available, export the JSON and tell the user to manually create a gist.

### 9.2 Clone Resolution

`skit clone <user>` resolves the profile:

1. Try `https://gist.github.com/<user>` — search for gist with filename `skit-profile.json`
   - Uses GitHub API: `GET /users/<user>/gists` filtered by filename
2. If not found, try `https://github.com/<user>/skit-profile` (repo convention)
3. If still not found, error with instructions to push a profile

Once the profile is fetched:
1. For each source in the profile:
   - If already cloned locally (matching origin URL), skip clone
   - Otherwise, clone to `sources/external/<name>/`
2. For each skill in the profile:
   - If already installed (same name + same source), skip
   - If name conflicts (same name, different source), warn and prompt
   - Otherwise, link to agent directory
3. Update manifest

### 9.3 Profile Diff

`skit profile diff <user-or-file>` shows differences:

```
$ skit profile diff snir

  Skills you're missing (3):
    + code-reviewer    @snirs-skills
    + test-runner      @their-skills
    + pr-helper        @standalone

  Skills only you have (1):
    - my-custom-tool   @my-stuff

  Same skills, different source (0):
    (none)
```

---

## 10. npm Package Structure

```
skit/
├── package.json
├── bin/
│   └── skit.js               # #!/usr/bin/env node entry point
├── src/
│   ├── commands/              # One file per command
│   │   ├── install.js
│   │   ├── import.js
│   │   ├── remove.js
│   │   ├── list.js
│   │   ├── update.js
│   │   ├── sync.js
│   │   ├── clone.js
│   │   ├── profile.js
│   │   ├── doctor.js
│   │   ├── link.js
│   │   ├── unlink.js
│   │   └── config.js
│   ├── agents/                # Agent adapters
│   │   ├── index.js           # Adapter loader
│   │   ├── claude-code.js
│   │   └── cursor.js
│   ├── core/
│   │   ├── manifest.js        # Read/write manifest.json
│   │   ├── config.js          # Read/write config.json
│   │   ├── linker.js          # Cross-platform junction/symlink
│   │   ├── git.js             # Git clone/pull/SHA operations
│   │   ├── scanner.js         # Scan directory tree for skills
│   │   └── importer.js        # Smart URL detection + download
│   ├── ui/
│   │   ├── picker.js          # Interactive multi-select
│   │   ├── spinner.js         # Progress indicators
│   │   └── format.js          # Table/list formatting
│   └── index.js               # Shared setup (resolve SKIT_HOME, load config)
├── tests/
│   ├── commands/
│   ├── core/
│   └── fixtures/              # Test skill directories, mock manifests
├── README.md
├── LICENSE
└── .gitignore
```

### Dependencies

| Package | Purpose | Why this one |
|---------|---------|-------------|
| `commander` | CLI argument parsing | Industry standard, zero config |
| `inquirer` | Interactive prompts + multi-select picker | Best cross-platform prompt library |
| `chalk` | Terminal colors | Universal, lightweight |
| `ora` | Spinners for async operations | Clean, simple API |

No heavy frameworks. Target: fast startup, `npx skit` should feel instant.

---

## 11. Migration Plan (Snir's Current Setup)

Current state:
- `~/.claude/skills/` IS the `snirs-skills` git repo (working copy = live install)
- Skills: view-md, split, code-reviewer, ship

Migration steps:
1. `skit` init creates `~/.skit/` with empty manifest and config
2. `skit install --own C:\Users\sbalgaly\.claude\skills` (special flag for "this is mine")
   - Moves/clones the repo to `~/.skit/sources/own/snirs-skills/`
   - Creates junctions in `~/.claude/skills/` pointing back
   - From the outside, nothing changes — skills still appear in the same place
3. Verify all skills work
4. Going forward, `skit` manages everything

---

## 12. Security Considerations

- Skills have full access to the AI agent — `skit` should warn on first install from unknown sources
- `skit doctor` should detect if a skill's source has changed unexpectedly (git SHA mismatch)
- Profile clone should show exactly what will be installed before doing it
- No auto-execution of any code from skills during install — `skit` only creates links
- `skit import` from raw URLs should warn about unverified sources

---

## 13. Testing Strategy

- Unit tests for core modules (manifest, linker, scanner, importer)
- Integration tests for commands (using temp directories and mock git repos)
- Cross-platform CI (GitHub Actions: windows-latest, ubuntu-latest, macos-latest)
- Test fixtures: mock skill directories with SKILL.md files
- Test the junction/symlink behavior specifically on Windows (most likely to have edge cases)
