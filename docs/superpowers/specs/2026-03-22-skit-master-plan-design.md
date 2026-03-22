# skit Master Plan — Design Specification (v2)

> The package manager AND discovery platform for AI agent skills.
> "Install, share, and discover AI agent skills."

**Note**: This spec supersedes the original `docs/design.md` (CLI-only design) and `docs/superpowers/plans/2026-03-21-skit-cli.md` (original implementation plan). Those documents remain as historical reference. This spec is the source of truth.

---

## 1. Executive Summary

skit is a cross-platform CLI tool + web registry that manages AI agent skills. It installs skills from GitHub repos, local folders, or the skit registry. It links them into agent directories using filesystem junctions/symlinks. It tracks every skill's origin, version, and source. It updates, removes, and syncs with single commands. It enables one-command cloning of entire skill setups. It provides a web platform for publishing, discovering, and curating skills.

skit targets the [Agent Skills open standard](https://agentskills.io), which is supported by 30+ AI coding tools including Claude Code, Cursor, VS Code Copilot, GitHub Copilot, OpenAI Codex, Gemini CLI, JetBrains Junie, and more.

### Why skit exists

AI coding agents support user-authored skills, but there is no standard way to discover, install, manage, or update them. Developers manually create directories, lose track of origins, cannot update skills, cannot share cleanly, and have no way to discover what's available. The curated skill list (antigravity-awesome-skills) has 26,500+ stars — proving demand — but the existing package managers have weak marketing, no web presence, and no social layer. The gap between demand and tooling is the opportunity.

### npm Package Name

The npm name `skit` is **taken** (an old, unrelated package). Options:
- `skit-cli` — **available**, clean enough (`npx skit-cli init`)
- `skitpm` — **available** (`npx skitpm init`)
- `@skit/cli` — **available** as scoped package (but `npx @skit/cli` is ugly)
- Attempt npm name dispute for `skit` (old package, 0.4.0, possibly abandoned)

**Decision needed before Wave 1 ships.** The brand remains "skit" regardless — the npm package name is a technical detail. This spec uses `skit` as the brand name throughout; CLI invocation examples may change based on the final package name.

### Competitive Landscape

Three existing tools compete in this space:

| Dimension | AGR | SkillKit | skit (target) |
|-----------|-----|----------|---------------|
| Language | Python (pip) | Node.js (npm) | Node.js (npm) |
| Stars | 412 | 624 | - |
| Agents supported | 6 | 44 | 6+ (extensible) |
| Install skills | Yes | Yes | Yes |
| Skill translation | No | Yes | Yes (borrowed) |
| AI skill generation | No | Yes | Wave 1.5 |
| Skill recommendations | No | Yes | Wave 1.5 |
| Web registry | **No** | **No** | **Yes** |
| Social features | **No** | **No** | **Yes** |
| Discovery/browse | **No** | **No** | **Yes** |
| Profile cloning | **No** | **No** | **Yes** |
| Install badges | **No** | **No** | **Yes** |
| Collections | **No** | **No** | **Yes** |
| Brand/marketing | Weak | Moderate | Strong (planned) |

**Neither AGR nor SkillKit has a web platform.** The registry is the moat. The CLI alone is table stakes — the platform is the differentiator.

---

## 2. Product Architecture

skit ships as three interconnected products across three waves, plus a borrowed-features wave:

```
Wave 1: CLI ("The Tool")
  npm package, Node.js, CommonJS
  Commands: init, install, list, remove, update, sync, clone, doctor, login
  Multi-agent: Claude Code, Cursor, VS Code, Codex, Gemini CLI
  Migration: import from AGR and SkillKit

Wave 1.5: Borrowed Features ("The Leverage")
  translate: convert skills between agent formats
  recommend: suggest skills based on project context
  generate: AI-powered skill creation wizard

Wave 2: Registry ("The Platform")
  Next.js + Vercel + Neon Postgres
  Skill pages, user profiles, search, categories, badges
  API: publish, search, install, stats
  CLI integration: skit search, skit publish

Wave 3: Social ("The Network")
  Follow users, trending, collections
  Activity feeds, weekly digest
  Skill homepage for every user
```

Each wave is independently valuable. Wave 1 matches competitors. Wave 1.5 borrows their best ideas. Wave 2 creates the discovery moat. Wave 3 creates the network effect.

---

## 3. Wave 1: The CLI

### 3.1 Wave 1 Commands

| Command | Description | Priority |
|---------|-------------|----------|
| `skit init` | Interactive setup: choose agents, set username | Critical |
| `skit install <url\|name>` | Install from GitHub URL, registry name, or local path | Critical |
| `skit list` | Show installed skills grouped by source | Critical |
| `skit remove <skill>` | Remove skill, prompt to clean source if last | Critical |
| `skit update [source]` | Git pull + re-link, show what changed | Critical |
| `skit sync` | Recreate all links from manifest (new machine) | Critical |
| `skit doctor` | Health check: broken links, updates, unused sources | Critical |
| `skit clone <user>` | Clone someone's entire skill setup | Critical |
| `skit login` | Authenticate with GitHub (for registry, profiles) | Important |
| `skit profile push` | Push profile to GitHub gist | Important |
| `skit profile export` | Export profile JSON to stdout | Important |
| `skit import <any-url>` | Smart import from gist/raw URL/subfolder | Nice-to-have |
| `skit migrate` | Import from AGR (`agr.toml`) or SkillKit config | Important |
| `skit config set <key> <val>` | Set config values | Utility |
| `skit config get <key>` | Get config values | Utility |

### 3.2 Wave 2 Commands (shipped with registry)

| Command | Description |
|---------|-------------|
| `skit search <query>` | Search registry from CLI |
| `skit publish` | Publish skill to registry |

### 3.3 Wave 1.5 Commands (borrowed features)

| Command | Description | Borrowed From |
|---------|-------------|---------------|
| `skit translate <skill> --to <agent>` | Convert skill to another agent's format | SkillKit |
| `skit recommend` | Suggest skills based on project files | SkillKit |
| `skit generate` | AI-powered skill creation wizard | SkillKit |

### 3.4 Multi-Agent Support

skit works with ALL Agent Skills-compatible tools from day 1. Users choose their agents during `skit init`, and skills are linked to all selected agents simultaneously.

| Agent | Skill Directory | Detection File | Priority |
|-------|----------------|----------------|----------|
| Claude Code | `~/.claude/skills/` | `SKILL.md` | Wave 1 |
| Cursor | `~/.cursor/skills/` | `SKILL.md` | Wave 1 |
| VS Code Copilot | `~/.vscode/skills/` | `SKILL.md` | Wave 1 |
| OpenAI Codex | `~/.codex/skills/` | `SKILL.md` | Wave 1 |
| Gemini CLI | `~/.gemini/skills/` | `SKILL.md` | Wave 1 |
| Custom | User-configured path via `skit config` | `SKILL.md` | Wave 1 |

**Note**: Exact paths for Cursor, Codex, Gemini, and VS Code need verification against current agent docs before implementation. The adapter pattern makes changes trivial.

#### Adapter Interface

```javascript
module.exports = {
  name: 'claude-code',
  // Returns skill directory. Accepts optional config override.
  skillDir: (configOverride) => string,
  detectSkill: (dir) => boolean,
  getSkillMeta: (dir) => { name, description },
};
```

The `configOverride` parameter allows users to set custom paths via `skit config set agents.claude-code.skillDir /custom/path`. Adding a new agent = ~20 lines implementing the interface.

#### Custom Agent Support

For agents not in the built-in list, users configure custom adapters:

```
$ skit config set agents.my-agent.skillDir ~/.my-agent/skills
```

The custom adapter uses the generic Agent Skills standard detection (SKILL.md) with the user-specified directory.

### 3.5 Directory Structure

```
~/.skit/
  config.json           # User config (agents, username, auth)
  manifest.json         # Single source of truth for all installed skills
  auth.json             # GitHub OAuth token (gitignored if shared)
  sources/
    own/                # User's repos (they author these)
      snirs-skills/
    external/           # Everything from elsewhere
      their-skills/
      _standalone/      # Skills from import (gists, URLs)
  profiles/             # Cached imported profiles

~/.claude/skills/       # Agent target (junctions/symlinks ONLY)
  code-reviewer  -> ~/.skit/sources/own/snirs-skills/code-reviewer
  cool-skill     -> ~/.skit/sources/external/their-skills/cool-skill

~/.cursor/skills/       # Same skill, also linked to Cursor
  code-reviewer  -> ~/.skit/sources/own/snirs-skills/code-reviewer
  cool-skill     -> ~/.skit/sources/external/their-skills/cool-skill
```

### 3.6 Data Model: config.json

```json
{
  "agents": ["claude-code", "cursor", "codex"],
  "user": "snir",
  "skitHome": null,
  "registry": "https://skit.dev",
  "agentOverrides": {
    "my-custom-agent": { "skillDir": "~/.my-agent/skills" }
  }
}
```

- `agents`: array of active agent names (multi-agent from day 1)
- `user`: GitHub username for profiles and registry
- `skitHome`: override for SKIT_HOME (null = default `~/.skit/`)
- `registry`: registry URL (default: skit.dev, overridable for self-hosted)
- `agentOverrides`: custom skill directories for any agent

### 3.7 Data Model: manifest.json

```json
{
  "version": 2,
  "sources": {
    "snirs-skills": {
      "type": "own",
      "origin": "https://github.com/balgaly/snirs-skills",
      "localPath": "sources/own/snirs-skills",
      "gitSha": "a1b2c3d4e5f6",
      "addedAt": "2026-03-20T00:00:00Z",
      "updatedAt": "2026-03-20T00:00:00Z"
    },
    "_standalone": {
      "type": "external",
      "origin": null,
      "localPath": "sources/external/_standalone"
    }
  },
  "skills": {
    "code-reviewer": {
      "source": "snirs-skills",
      "path": "code-reviewer",
      "agents": ["claude-code", "cursor"],
      "installedAt": "2026-03-20T00:00:00Z",
      "registryId": null,
      "version": null,
      "importedFrom": null
    }
  }
}
```

This is **version 2** of the manifest format. Key fields:
- `version`: always `2`. No v1 manifests will ship; the original design spec's v1 format is superseded.
- `skills[].agents`: array of agent names this skill is linked to (defaults to all configured agents)
- `skills[].registryId`: set when a skill is installed from the registry (e.g., `"snir/code-reviewer"`)
- `skills[].version`: set for registry-published skills (semver string)
- `skills[].importedFrom`: original URL for standalone imports
- All paths in manifest are relative to SKIT_HOME for portability.

### 3.8 Data Model: Profile Format

```json
{
  "skit": "2.0",
  "user": "snir",
  "agents": ["claude-code", "cursor"],
  "exported": "2026-03-22T00:00:00Z",
  "sources": [
    { "name": "snirs-skills", "origin": "https://github.com/balgaly/snirs-skills", "type": "own" }
  ],
  "skills": [
    { "name": "code-reviewer", "source": "snirs-skills" },
    { "name": "pr-helper", "source": "_standalone", "importedFrom": "https://gist.github.com/someone/abc123" }
  ]
}
```

Profile version is `"2.0"` from the start. If an older profile is loaded, skit handles gracefully (ignore unknown fields, use defaults for missing fields).

### 3.9 SKILL.md Format (Agent Skills Standard)

Skills follow the [Agent Skills standard](https://agentskills.io/specification). The required file is `SKILL.md` with optional YAML frontmatter:

```yaml
---
name: code-reviewer          # Required. Lowercase, hyphens, max 64 chars.
description: Reviews code...  # Required. One-line description.
version: 1.0.0               # Optional. Semver, used by registry.
category: coding              # Optional. For registry categorization.
agents:                       # Optional. If omitted, works with all.
  - claude-code
  - cursor
---

# Code Reviewer

Instructions for the agent...
```

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill identifier. Lowercase letters, numbers, hyphens. Max 64 chars. |
| `description` | Yes | What the skill does. Used in search, list, and picker UI. |
| `version` | No | Semver version. Used by registry for version tracking. |
| `category` | No | One of: coding, testing, deploy, security, docs, ai, devops, other |
| `agents` | No | Array of compatible agent names. Omit = all agents. |

skit's scanner reads frontmatter to populate the manifest and registry metadata.

### 3.10 Cross-Platform Linking

```javascript
function linkSkill(sourcePath, targetPath) {
  const resolved = path.resolve(sourcePath);
  if (process.platform === 'win32') {
    fs.symlinkSync(resolved, targetPath, 'junction');
  } else {
    fs.symlinkSync(resolved, targetPath, 'dir');
  }
}
```

- Windows: NTFS junctions (no admin required)
- macOS/Linux: directory symlinks
- `path.resolve()` for absolute paths (junctions require it on Windows)
- Removing a junction/symlink never deletes the source

### 3.11 UX Flows

#### `skit init`

```
$ npx skit-cli init

  Welcome to skit - the package manager for AI agent skills

  Which AI tools do you use? (Space to toggle)
  [x] Claude Code
  [x] Cursor
  [ ] VS Code Copilot
  [ ] OpenAI Codex
  [ ] Gemini CLI
  [ ] Other (configure manually)

  GitHub username (for profiles): snir

  Created ~/.skit/ with config for claude-code, cursor
  Run 'skit install <url>' to install your first skill
```

**Implementation details:**
1. Creates `~/.skit/` directory structure (sources/own, sources/external, profiles)
2. Prompts for agent selection (inquirer checkbox)
3. Prompts for GitHub username
4. Writes `config.json` with selected agents and username
5. Writes empty `manifest.json` (version 2)
6. Creates skill directories for each selected agent if they don't exist
7. Prints getting-started guidance

#### `skit install` (main flow)

```
$ skit install https://github.com/someone/their-skills

  Cloning someone/their-skills...
  Found 5 skills:

  [x] cool-skill      - Use when reviewing PRs for security issues
  [x] test-runner     - Use when running test suites
  [ ] deploy-helper   - Use when deploying to production
  [ ] doc-gen         - Use when generating API docs
  [ ] another-skill   - Use when generating changelogs

  Space to toggle, Enter to confirm, A to select all

  Installed 2 skills from their-skills
    cool-skill    -> claude-code, cursor
    test-runner   -> claude-code, cursor
```

#### `skit clone` (viral flow)

```
$ npx skit-cli clone snir

  Fetching snir's profile...
  Found 8 skills from 3 sources:

  snirs-skills (4 skills)
    code-reviewer, ship, view-md, split

  their-skills (2 skills)
    cool-skill, test-runner

  standalone (2 skills)
    pr-helper, quick-docs

  Install all 8 skills? (Y/n/pick)

  Cloned 3 sources, installed 8 skills
  Your setup now matches snir's profile
```

**Partial failure behavior**: If one source fails (network error, private repo), skit continues with remaining sources. At the end, it reports: "Installed 6/8 skills. 2 failed (their-skills: clone failed — private repo?)". The user can re-run `skit clone` — it's idempotent (skips already-installed sources/skills).

#### `skit doctor`

```
$ skit doctor

  Checking 8 skills across 2 agents...

  Broken links:
    pr-helper -> source missing (sources/external/_standalone/pr-helper)

  Updates available:
    their-skills: 3 commits behind (d4e5f6a -> b7c8d9e)
    snirs-skills: up to date

  Agent sync:
    cursor: missing cool-skill (run 'skit sync' to fix)

  1 issue found. Run 'skit sync' to fix broken links.
```

#### `skit login`

```
$ skit login

  Opening GitHub in your browser for authentication...
  Waiting for authorization...

  Authenticated as snir (Snir Balgaly)
  Token saved to ~/.skit/auth.json
```

**Implementation**: Uses GitHub Device Flow (OAuth). The CLI displays a user code and opens the browser to `github.com/login/device`. The user enters the code. The CLI polls GitHub's token endpoint until authorization completes. Token is stored in `~/.skit/auth.json`. This avoids needing a localhost redirect server.

#### `skit migrate`

```
$ skit migrate

  Detected agr.toml (AGR) with 8 skills
  Detected .skillkit/ (SkillKit) with 5 skills

  Import from AGR? (Y/n) y
  Migrated 8 skills from AGR

  Import from SkillKit? (Y/n) y
  Migrated 3 new skills from SkillKit (2 already installed)

  Total: 11 skills from 5 sources
  You can safely remove AGR/SkillKit if you want.
```

### 3.12 Smart Import (URL Detection)

| URL Pattern | Detection | Action |
|-------------|-----------|--------|
| `github.com/<user>/<repo>` | GitHub repo | Full clone, skill picker |
| `github.com/<user>/<repo>/tree/<branch>/<path>` | Subfolder | Clone repo, install skill at path |
| `gist.github.com/<user>/<id>` | Gist | Download gist files, create standalone |
| `raw.githubusercontent.com/...` | Raw file | Download, wrap as standalone |
| `<user>/<skill>` (no dots/slashes) | Registry name | Fetch from registry (Wave 2) |

### 3.13 Profile & Clone System

`skit profile push` uses `gh` CLI to create/update a gist with filename `skit-profile.json`. `skit clone <user>` resolves the profile:

1. If authenticated, check skit registry for user's profile (`GET /api/profiles/<user>`)
2. Fall back to GitHub API: search user's gists for `skit-profile.json`
3. If not found, error with instructions

### 3.14 npm Package Structure

```
skit-cli/
  package.json
  bin/skit.js
  src/
    index.js               # ensureDirs(), getAgentAdapters()
    commands/
      init.js, install.js, list.js, remove.js,
      update.js, sync.js, clone.js, doctor.js,
      profile.js, import.js, config.js, login.js,
      migrate.js,
      search.js, publish.js,           (Wave 2)
      translate.js, recommend.js,       (Wave 1.5)
      generate.js                       (Wave 1.5)
    agents/
      index.js, claude-code.js, cursor.js,
      vscode.js, codex.js, gemini.js, custom.js
    core/
      config.js, manifest.js, linker.js,
      scanner.js, git.js, importer.js,
      registry.js, auth.js, migrator.js
    ui/
      picker.js, spinner.js, format.js
  tests/
  README.md
```

Dependencies (keep minimal): commander, inquirer, chalk, ora.

---

## 4. Wave 1.5: Borrowed Features

Features borrowed from SkillKit (MIT-licensed), reimplemented with better UX.

### 4.1 Translate

Convert skills between different agent formats. While the Agent Skills standard unifies on SKILL.md, some agents still use legacy formats (.cursorrules, copilot-instructions.md, etc.).

```
$ skit translate my-skill --to cursorrules

  Translated my-skill -> .cursorrules format
  Output: ~/.cursor/rules/my-skill.cursorrules
```

### 4.2 Recommend

Analyze the current project and suggest skills from the registry:

```
$ skit recommend

  Analyzing project...
  Found: Next.js, TypeScript, Tailwind CSS, Prisma

  Recommended skills:
    nextjs-patterns   (242 installs) - Next.js App Router best practices
    prisma-expert     (189 installs) - Prisma schema and query patterns
    tailwind-helper   (156 installs) - Tailwind CSS utility guidance

  Install all? (Y/n/pick)
```

### 4.3 Generate

AI-powered skill creation (requires API key or skit registry auth):

```
$ skit generate

  What should this skill do? > Review TypeScript code for common anti-patterns

  Generating skill...
  Created: ~/.skit/sources/own/generated/ts-antipatterns/SKILL.md

  Edit and refine, then: skit publish
```

---

## 5. Wave 2: The Registry

### 5.1 Overview

A web platform where skill authors publish, and users discover. The registry is a metadata index — skills stay in their git repos. The registry stores metadata, stats, and user profiles.

### 5.2 Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | Next.js (App Router) | SSR for SEO, React for interactivity |
| Hosting | Vercel | Zero-config deploy, edge network |
| Database | Neon Postgres | Serverless, branching, Vercel integration |
| Auth | GitHub OAuth | Every target user has a GitHub account |
| Search | Postgres full-text (v1), Algolia (later) | Simple first, scale later |
| Cache | Vercel Edge Config + Runtime Cache | Fast reads for popular skills |

### 5.3 Key Pages

#### Homepage (`skit.dev`)
- Hero with value prop and `npx skit-cli init` CTA
- Search bar (most prominent element)
- Trending skills this week (top 10 by installs)
- Featured collections (curated by team)
- Agent compatibility filter
- Category browsing

#### Skill Page (`skit.dev/@<user>/<skill>`)
- Rendered SKILL.md content (README-style)
- Install command: `skit install <user>/<skill>`
- Compatibility badges (which agents support it)
- Stats: weekly installs, total installs, stars, last updated
- Author info with link to profile
- Source GitHub repo link
- Version history
- "Part of collection" links

#### User Profile (`skit.dev/@<user>`)
- GitHub avatar + bio
- Published skills with install counts
- Active skill setup (exported profile)
- Clone command: `npx skit-cli clone <user>`
- Curated collections
- Follower/following counts (Wave 3)

#### Search (`skit.dev/search?q=...`)
- Full-text search across skill names, descriptions, content
- Category filter (coding, testing, deploy, security, docs, AI, devops)
- Agent compatibility filter
- Sort: trending, popular, newest, recently updated
- Results show: name, description, author, installs, agent badges

#### Category Page (`skit.dev/topics/<category>`)
- Listing of skills in a category
- SEO landing page for "AI skills for <category>"

**URL scheme**: User and skill pages use the `@` prefix (`skit.dev/@snir`, `skit.dev/@snir/code-reviewer`) to disambiguate from system routes. Reserved paths without `@`: `search`, `topics`, `api`, `login`, `docs`, `blog`, `about`, `pricing`, `badge`.

### 5.4 CLI Authentication for Registry

The CLI authenticates with the registry using GitHub Device Flow:

1. **`skit login`** initiates the flow:
   - CLI requests a device code from `POST /api/auth/device`
   - Registry returns `device_code`, `user_code`, and `verification_uri`
   - CLI opens the browser and displays the user code
   - CLI polls `POST /api/auth/token` until the user completes authorization
   - On success, registry returns a JWT token
   - Token stored in `~/.skit/auth.json`

2. **Token usage**: CLI sends `Authorization: Bearer <token>` header for authenticated endpoints (`publish`, `star`).

3. **Token refresh**: Tokens expire after 30 days. CLI auto-refreshes using a refresh token. If refresh fails, prompt re-login.

### 5.5 Registry API

| Endpoint | Auth | Description |
|----------|------|-------------|
| `POST /api/auth/device` | Public | Start device auth flow |
| `POST /api/auth/token` | Public | Poll for auth token |
| `POST /api/publish` | Required | Publish or update a skill |
| `GET /api/search?q=<query>` | Public | Search skills |
| `GET /api/skills/<user>/<name>` | Public | Get skill metadata |
| `GET /api/profiles/<user>` | Public | Get user profile + clone data |
| `POST /api/installs` | Signed | Track install event (see abuse prevention) |
| `POST /api/stars/<user>/<skill>` | Required | Star/unstar a skill |
| `GET /api/trending` | Public | Get trending skills |
| `GET /api/badge/<user>/<skill>` | Public | SVG install badge |

**Install tracking abuse prevention**: `POST /api/installs` requires a signed payload: the CLI includes a hash of `skill_id + skit_version + timestamp + HMAC(secret)`. The secret is embedded in the CLI binary and rotated per version. This prevents casual inflation. It's not bulletproof, but raises the bar.

### 5.6 Publish Flow

```
$ skit publish

  Publishing code-reviewer v1.2.0...

  Skill:   code-reviewer
  Author:  snir
  Agents:  claude-code, cursor, codex
  Source:  https://github.com/balgaly/snirs-skills/tree/main/code-reviewer

  Published! https://skit.dev/@snir/code-reviewer
  Install:  skit install snir/code-reviewer
```

How it works:
1. CLI reads SKILL.md frontmatter (`name`, `description`, `version`, `category`, `agents`)
2. Authenticates via stored token (`~/.skit/auth.json`)
3. POSTs metadata to registry API (no file upload — just metadata + repo URL)
4. Registry stores/updates the skill record
5. CLI outputs the skill page URL and install command

The registry never hosts skill files. Skills are always cloned from their git source.

### 5.7 Install Badges

```markdown
[![Install with skit](https://skit.dev/api/badge/snir/code-reviewer)](https://skit.dev/@snir/code-reviewer)
```

Dynamic SVG badges showing install count. Placed on GitHub READMEs, blog posts, tweets. Each badge is a backlink to the registry (SEO value).

### 5.8 Registry Database Schema

```sql
-- Users (GitHub-linked)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  username VARCHAR(64) UNIQUE NOT NULL,
  display_name VARCHAR(128),
  avatar_url TEXT,
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_username ON users(username);

-- Skills (published to registry)
CREATE TABLE skills (
  id SERIAL PRIMARY KEY,
  author_id INTEGER REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  description TEXT,
  readme_content TEXT,
  repo_url TEXT NOT NULL,
  repo_path VARCHAR(256),
  category VARCHAR(64),
  agents TEXT[] DEFAULT '{}',
  latest_version VARCHAR(32),
  weekly_installs INTEGER DEFAULT 0,
  total_installs INTEGER DEFAULT 0,
  stars_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(author_id, name)
);
CREATE INDEX idx_skills_category ON skills(category);
CREATE INDEX idx_skills_weekly ON skills(weekly_installs DESC);
CREATE INDEX idx_skills_total ON skills(total_installs DESC);
CREATE INDEX idx_skills_search ON skills USING GIN(to_tsvector('english', name || ' ' || COALESCE(description, '')));

-- Install tracking
CREATE TABLE installs (
  id SERIAL PRIMARY KEY,
  skill_id INTEGER REFERENCES skills(id),
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  agent VARCHAR(64),
  skit_version VARCHAR(32)
);
CREATE INDEX idx_installs_skill_date ON installs(skill_id, installed_at);

-- Stars
CREATE TABLE stars (
  user_id INTEGER REFERENCES users(id),
  skill_id INTEGER REFERENCES skills(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, skill_id)
);

-- Collections
CREATE TABLE collections (
  id SERIAL PRIMARY KEY,
  author_id INTEGER REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  slug VARCHAR(128) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(author_id, slug)
);

CREATE TABLE collection_skills (
  collection_id INTEGER REFERENCES collections(id),
  skill_id INTEGER REFERENCES skills(id),
  position INTEGER,
  note TEXT,
  PRIMARY KEY (collection_id, skill_id)
);

-- Profiles (exported skit configs)
CREATE TABLE profiles (
  user_id INTEGER REFERENCES users(id) PRIMARY KEY,
  profile_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Weekly install count reset: a scheduled job (Vercel Cron) runs weekly
-- to snapshot weekly_installs into a history table and reset the counter.
```

Wave 3 additions: `follows(follower_id, followed_id)`, `activity(user_id, action, payload, created_at)`.

---

## 6. Wave 3: The Social Network

### 6.1 Features

| Feature | Description | Purpose |
|---------|-------------|---------|
| Follow users | See when they publish/update skills | Retention |
| Star skills | Bookmark + signal quality | Powers trending |
| Trending | Top skills by installs/stars this week | FOMO + discovery |
| Activity feed | "snir published code-reviewer v1.3" | Engagement |
| Collections | Curated skill lists with descriptions | Curation + sharing |
| Skill comments | Discussion threads on skill pages | Community |
| Weekly digest | Email: "5 trending skills this week" | Re-engagement |

### 6.2 User Skill Homepage

Every user gets a profile page serving as their skill homepage:

```
skit.dev/@snir

  Snir Balgaly
  @snir - Full-stack developer
  "Building tools for AI-powered dev"

  12 skills published - 847 total stars
  234 followers - 89 clones

  Clone my setup: npx skit-cli clone snir

  Popular Skills:
    code-reviewer    342 stars  1.2k installs
    ship             289 stars  980 installs
    view-md          156 stars  670 installs
    split            60 stars   340 installs

  Collections:
    My Daily Driver (8 skills)
    Security Toolkit (5 skills)
```

### 6.3 Collections

Like Spotify playlists for skills. Users curate themed skill sets:

```
skit.dev/@snir/collections/daily-driver

  My Daily Driver
  by snir - 8 skills
  "The skills I use every single day"

  Install all: skit install --collection snir/daily-driver

  1. code-reviewer  - "Essential for catching bugs before commit"
  2. ship           - "Automates my entire shipping workflow"
  3. view-md        - "Quick markdown preview in browser"
  ...
```

Collections are installed with the `--collection` flag to disambiguate from individual skills.

---

## 7. Marketing Strategy

### 7.1 The Viral Loop

```
Developer discovers skit (blog/tweet/HN)
  -> installs a skill or clones a profile
  -> uses skit, likes it
  -> pushes their own profile
  -> shares "npx skit-cli clone <me>" on social
  -> their followers discover skit
  -> loop repeats
```

### 7.2 Launch Strategy

| Phase | Action | Target Channel |
|-------|--------|----------------|
| Pre-launch | Build in public on Twitter/X, share progress and AI skills hot takes | Twitter/X |
| Soft launch (Wave 1) | Ship CLI, get 5-10 prominent devs to publish profiles | Twitter, Discord |
| HN launch (Wave 2) | "Show HN: skit — npm for AI agent skills" | Hacker News |
| Product Hunt | Launch with polished registry + demo video | Product Hunt |
| Content blitz | Blog posts, YouTube tutorials, integration guides | SEO, YouTube |

### 7.3 Content Strategy

| Content Type | Cadence | Purpose |
|-------------|---------|---------|
| "My setup" posts | Weekly | Get devs to share profiles |
| "Skill of the week" | Weekly | Highlight registry skills |
| Tutorials | Bi-weekly | "Create a skill", "skit for teams" |
| Comparison posts | At launch | "skit vs AGR vs SkillKit" |
| Integration guides | Per-agent | "Using skit with Cursor" |
| "How I use AI skills" interviews | Monthly | Social proof |

### 7.4 SEO Strategy

The registry is an SEO machine. Every skill page and category page is a keyword target:

- `skit.dev/topics/nextjs` targets "AI agent skills for Next.js"
- `skit.dev/topics/security` targets "AI coding security skills"
- `skit.dev/topics/testing` targets "AI agent testing skills"

### 7.5 Distribution

- **npm/npx**: `npx skit-cli` for zero-install
- **Install badges**: On GitHub READMEs, blogs, tweets. Every badge is a backlink
- **Clone URLs**: `npx skit-cli clone <user>` shared on social media
- **Awesome lists**: Get listed in antigravity-awesome-skills (26.5k stars)
- **Agent Skills standard**: Get referenced on agentskills.io

### 7.6 Community

- Discord server for skill authors and users
- GitHub Discussions on the skit repo
- Twitter/X for updates and engagement

---

## 8. Competitive Strategy

### 8.1 vs AGR

| AGR Feature | skit Equivalent | skit Advantage |
|-------------|----------------|----------------|
| `agr add` | `skit install` | URLs, local paths, registry names |
| `agr remove` | `skit remove` | Source cleanup prompts |
| `agr sync` | `skit sync` | Multi-agent sync |
| `agr list` | `skit list` | Grouped by source, agent status |
| `agr init` | `skit init` | Multi-agent selection |
| No equivalent | `skit clone` | Viral growth engine |
| No equivalent | `skit doctor` | Health checks |
| No equivalent | `skit publish` | Registry integration |
| No equivalent | Web registry | Entire discovery platform |
| No equivalent | `skit migrate` | Import AGR configs |

### 8.2 vs SkillKit

| SkillKit Feature | skit Equivalent | Notes |
|------------------|----------------|-------|
| `skillkit install` | `skit install` | Feature parity |
| `skillkit translate` | `skit translate` | Borrowed (Wave 1.5) |
| `skillkit recommend` | `skit recommend` | Borrowed (Wave 1.5) |
| `skillkit generate` | `skit generate` | Borrowed (Wave 1.5) |
| `skillkit serve` (REST API) | Registry API | Web-based, not local |
| No equivalent | `skit clone` | Viral growth |
| No equivalent | Web registry | Discovery platform |
| No equivalent | Social features | Network effect |
| No equivalent | `skit migrate` | Import SkillKit configs |

### 8.3 Positioning

- "npm for AI agent skills" (familiar, aspirational)
- "The place to find, share, and install AI skills"
- Better UX than competitors (interactive picker, clean output, multi-agent)
- Web presence creates discoverability moat

---

## 9. Security Considerations

- Skills have full access to AI agents. Warn on first install from unknown sources.
- `skit doctor` detects unexpected source changes (git SHA mismatch).
- `skit clone` shows exactly what will be installed before doing it.
- No auto-execution of any code during install. skit only creates links.
- `skit import` from raw URLs warns about unverified sources.
- Registry: GitHub OAuth for identity. Published skills link to verifiable repos.
- Registry: no file hosting = no malware hosting vector. Skills are always from git.
- Auth tokens stored in `~/.skit/auth.json` with restricted file permissions (0600).
- Install tracking uses signed payloads to prevent casual count inflation.

---

## 10. Phased Rollout

### Wave 1: The CLI

| Phase | Deliverables |
|-------|-------------|
| 1A: Foundation | Project init, core modules (config, manifest, linker, scanner, git), 6 agent adapters, custom adapter |
| 1B: Core commands | init, list, sync, doctor, config, login |
| 1C: Install/Remove | install with picker, remove with cleanup, update |
| 1D: Clone/Profile | clone, profile push/export |
| 1E: Migration + Polish | migrate (AGR + SkillKit), import, error handling, README, npm publish |

### Wave 1.5: Borrowed Features

| Phase | Deliverables |
|-------|-------------|
| 1.5A: Translate | Convert skills between agent formats |
| 1.5B: Recommend | Project analysis + registry suggestions |
| 1.5C: Generate | AI-powered skill wizard |

### Wave 2: The Registry

| Phase | Deliverables |
|-------|-------------|
| 2A: API + Auth | Next.js project, Neon DB, GitHub OAuth device flow, publish/search API |
| 2B: Web UI | Homepage, skill pages, user profiles, search, category pages |
| 2C: CLI integration | `skit search`, `skit publish`, install-by-registry-name |
| 2D: Polish | Badges, SEO, deploy to Vercel |

### Wave 3: The Social Network

| Phase | Deliverables |
|-------|-------------|
| 3A: Social core | Follow, star, trending algorithm |
| 3B: Collections | Create, browse, install collections |
| 3C: Engagement | Activity feed, weekly digest emails |

Team workspaces are deferred to Wave 4 (requires RBAC, org management — significant scope).

---

## 11. Success Metrics

| Metric | Wave 1 | Wave 2 | Wave 3 |
|--------|--------|--------|--------|
| npm weekly downloads | 100 | 1,000 | 10,000 |
| GitHub stars | 200 | 2,000 | 10,000 |
| Skills on registry | N/A | 200 | 2,000 |
| Registered users | N/A | 500 | 5,000 |
| Clone executions | 50 | 500 | 5,000 |

---

## 12. Out of Scope

- Paid tier / monetization (premature — build ecosystem first)
- Skill dependency resolution (too complex, not needed)
- Auto-discovery from internet (curated > automated for trust)
- Mobile app (audience lives in terminals and browsers)
- `skit profile diff` (nice-to-have later)
- `skit link/unlink` as public commands (internal plumbing only)
- Full offline mode (Wave 1 works offline for local sources; registry features require internet)
- Team workspaces (deferred to Wave 4)

---

## 13. Open Questions

- **Domain**: skit.dev, skit.sh, skillregistry.dev, or other?
- **npm package name**: `skit-cli` (available) vs `skitpm` (available) vs dispute `skit`?
- **Monorepo vs multi-repo**: CLI and registry in one repo or separate?
- **Agent directory paths**: Verify exact skill directories for Cursor, Codex, Gemini CLI, VS Code Copilot on all platforms
- **Registry hosting costs**: Neon free tier sufficient for launch?
