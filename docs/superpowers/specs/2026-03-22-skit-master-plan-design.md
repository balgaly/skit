# skit Master Plan — Design Specification

> The package manager AND discovery platform for AI agent skills.
> "Install, share, and discover AI agent skills."

---

## 1. Executive Summary

skit is a cross-platform CLI tool + web registry that manages AI agent skills. It installs skills from GitHub repos, local folders, or the skit registry. It links them into agent directories using filesystem junctions/symlinks. It tracks every skill's origin, version, and source. It updates, removes, and syncs with single commands. It enables one-command cloning of entire skill setups. It provides a web platform for publishing, discovering, and curating skills.

skit targets the Agent Skills open standard (agentskills.io), which is supported by 30+ AI coding tools including Claude Code, Cursor, VS Code Copilot, GitHub Copilot, OpenAI Codex, Gemini CLI, JetBrains Junie, and more.

### Why skit exists

AI coding agents support user-authored skills, but there is no standard way to discover, install, manage, or update them. Developers manually create directories, lose track of origins, cannot update skills, cannot share cleanly, and have no way to discover what's available. The curated skill list (antigravity-awesome-skills) has 26,500+ stars — proving demand — but the best package manager (AGR) has only 412 stars and no web presence. The gap between demand and tooling is the opportunity.

### Competitive positioning

| Dimension | AGR (incumbent) | skit (target) |
|-----------|-----------------|---------------|
| Language | Python (pip) | JavaScript (npm/npx) |
| Install friction | `pip install agr` | `npx skit` (zero install) |
| Web presence | None | Full registry platform |
| Social features | None | Profiles, clone, collections |
| Discovery | None | Search, browse, trending |
| Agent support | 6 agents | 6+ agents (Agent Skills standard) |
| Brand | "AGR" (unmemorable) | "skit" (catchy, short) |

---

## 2. Product Architecture

skit ships as three interconnected products across three waves:

```
Wave 1: CLI ("The Tool")
  npm package, Node.js, CommonJS
  Commands: init, install, list, remove, update, sync, clone, doctor
  Multi-agent: Claude Code, Cursor, VS Code, Codex, Gemini CLI

Wave 2: Registry ("The Platform")
  Next.js + Vercel + Neon Postgres
  Skill pages, user profiles, search, categories, badges
  API: publish, search, install, stats

Wave 3: Social ("The Network")
  Follow users, trending, collections, teams
  Activity feeds, weekly digest
  Skill homepage for every user
```

Each wave is independently valuable. Wave 1 alone beats AGR on DX. Wave 2 creates the discovery moat. Wave 3 creates the network effect.

---

## 3. Wave 1: The CLI

### 3.1 Commands

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
| `skit profile push` | Push profile to GitHub gist | Important |
| `skit profile export` | Export profile JSON to stdout | Important |
| `skit import <any-url>` | Smart import from gist/raw URL/subfolder | Nice-to-have |
| `skit search <query>` | Search registry from CLI (Wave 2 integration) | Wave 2 |
| `skit publish` | Publish skill to registry (Wave 2 integration) | Wave 2 |

### 3.2 Multi-Agent Support

skit works with ALL Agent Skills-compatible tools from day 1. Users choose their agents during `skit init`, and skills are linked to all selected agents simultaneously.

| Agent | Skill Directory | Detection File | Priority |
|-------|----------------|----------------|----------|
| Claude Code | `~/.claude/skills/` | `SKILL.md` | Wave 1 |
| Cursor | `~/.cursor/skills/` | `SKILL.md` | Wave 1 |
| VS Code Copilot | User-configurable | `SKILL.md` | Wave 1 |
| OpenAI Codex | `~/.codex/skills/` | `SKILL.md` | Wave 1 |
| Gemini CLI | `~/.gemini/skills/` | `SKILL.md` | Wave 1 |
| Custom | Configurable via `skit config` | `SKILL.md` | Wave 1 |

#### Adapter Interface

```javascript
module.exports = {
  name: 'claude-code',
  skillDir: () => string,
  detectSkill: (dir) => boolean,
  getSkillMeta: (dir) => { name, description },
};
```

Adding a new agent = ~20 lines implementing the interface.

### 3.3 Directory Structure

```
~/.skit/
  config.json           # User config (agents, username, skitHome)
  manifest.json         # Single source of truth for all installed skills
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

### 3.4 Data Model: config.json

```json
{
  "agents": ["claude-code", "cursor", "codex"],
  "user": "snir",
  "skitHome": null,
  "registry": "https://skit.dev"
}
```

### 3.5 Data Model: manifest.json

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
    }
  },
  "skills": {
    "code-reviewer": {
      "source": "snirs-skills",
      "path": "code-reviewer",
      "agents": ["claude-code", "cursor"],
      "installedAt": "2026-03-20T00:00:00Z",
      "registryId": "snir/code-reviewer",
      "version": "1.2.0",
      "importedFrom": null
    }
  }
}
```

Key additions vs original design:
- `agents` array at config level (which agents to link to)
- `agents` array per skill (which agents get this specific skill)
- `registryId` (links to the web registry when published)
- `version` (for registry-published skills)
- `registry` URL in config (for future federation)

### 3.6 Cross-Platform Linking

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

### 3.7 UX Flows

#### `skit init`

```
$ npx skit init

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
$ npx skit clone snir

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

### 3.8 Smart Import (URL Detection)

| URL Pattern | Detection | Action |
|-------------|-----------|--------|
| `github.com/<user>/<repo>` | GitHub repo | Full clone, skill picker |
| `github.com/<user>/<repo>/tree/<branch>/<path>` | Subfolder | Clone repo, install skill at path |
| `gist.github.com/<user>/<id>` | Gist | Download gist files, create standalone |
| `raw.githubusercontent.com/...` | Raw file | Download, wrap as standalone |
| `skit.dev/<user>/<skill>` or `<user>/<skill>` | Registry | Fetch from registry (Wave 2) |

### 3.9 Profile & Clone System

Profile format (shared via GitHub gists):

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

`skit profile push` uses `gh` CLI to create/update a gist with filename `skit-profile.json`. `skit clone <user>` searches the user's gists for this file via GitHub API.

### 3.10 npm Package Structure

```
skit/
  package.json
  bin/skit.js
  src/
    index.js               # ensureDirs(), getAgentAdapters()
    commands/
      init.js, install.js, list.js, remove.js,
      update.js, sync.js, clone.js, doctor.js,
      profile.js, import.js, config.js,
      search.js, publish.js
    agents/
      index.js, claude-code.js, cursor.js,
      vscode.js, codex.js, gemini.js
    core/
      config.js, manifest.js, linker.js,
      scanner.js, git.js, importer.js, registry.js
    ui/
      picker.js, spinner.js, format.js
  tests/
  README.md
```

Dependencies (keep minimal): commander, inquirer, chalk, ora.

---

## 4. Wave 2: The Registry

### 4.1 Overview

A web platform where skill authors publish, and users discover. The registry is a metadata index — skills stay in their git repos. The registry stores metadata, stats, and user profiles.

### 4.2 Tech Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| Framework | Next.js (App Router) | SSR for SEO, React for interactivity |
| Hosting | Vercel | Zero-config deploy, edge network |
| Database | Neon Postgres | Serverless, branching, Vercel integration |
| Auth | GitHub OAuth | Every target user has a GitHub account |
| Search | Postgres full-text (v1), Algolia (later) | Simple first, scale later |
| Cache | Vercel Edge Config + Runtime Cache | Fast reads for popular skills |

### 4.3 Key Pages

#### Homepage (`skit.dev`)
- Hero with value prop and `npx skit init` CTA
- Search bar (most prominent element)
- Trending skills this week (top 10 by installs)
- Featured collections (curated by team)
- Agent compatibility filter
- Category browsing

#### Skill Page (`skit.dev/<user>/<skill>`)
- Rendered SKILL.md content (README-style)
- Install command: `skit install <user>/<skill>`
- Compatibility badges (which agents support it)
- Stats: weekly installs, total installs, stars, last updated
- Author info with link to profile
- Source GitHub repo link
- Version history
- "Part of collection" links

#### User Profile (`skit.dev/<user>`)
- GitHub avatar + bio
- Published skills with install counts
- Active skill setup (exported profile)
- Clone command: `npx skit clone <user>`
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

### 4.4 Registry API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /api/publish` | Auth | Publish or update a skill |
| `GET /api/search?q=<query>` | Public | Search skills |
| `GET /api/skills/<user>/<name>` | Public | Get skill metadata |
| `GET /api/profiles/<user>` | Public | Get user profile |
| `POST /api/installs` | Public | Track install event |
| `POST /api/stars/<user>/<skill>` | Auth | Star/unstar a skill |
| `GET /api/trending` | Public | Get trending skills |

### 4.5 Publish Flow

```
$ skit publish

  Publishing code-reviewer v1.2.0...

  Skill:   code-reviewer
  Author:  snir
  Agents:  claude-code, cursor, codex
  Source:  https://github.com/balgaly/snirs-skills/tree/main/code-reviewer

  Published! https://skit.dev/snir/code-reviewer
  Install:  skit install snir/code-reviewer
```

How it works:
1. CLI reads SKILL.md frontmatter + metadata
2. Authenticates via stored GitHub OAuth token
3. POSTs metadata to registry API (no file upload — just metadata + repo URL)
4. Registry stores/updates the skill record
5. CLI outputs the skill page URL and install command

The registry never hosts skill files. Skills are always cloned from their git source. The registry is a discovery layer, not a hosting layer.

### 4.6 Install Badges

```markdown
[![Install with skit](https://skit.dev/badge/<user>/<skill>)](https://skit.dev/<user>/<skill>)
```

Dynamic SVG badges showing install count. Placed on GitHub READMEs, blog posts, tweets. Each badge is a backlink to the registry (SEO value).

### 4.7 Registry Database Schema

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

-- Skills (published to registry)
CREATE TABLE skills (
  id SERIAL PRIMARY KEY,
  author_id INTEGER REFERENCES users(id),
  name VARCHAR(128) NOT NULL,
  description TEXT,
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

-- Install tracking
CREATE TABLE installs (
  id SERIAL PRIMARY KEY,
  skill_id INTEGER REFERENCES skills(id),
  installed_at TIMESTAMPTZ DEFAULT NOW(),
  agent VARCHAR(64),
  skit_version VARCHAR(32)
);

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
```

Wave 3 additions: `follows` table, `activity` table.

---

## 5. Wave 3: The Social Network

### 5.1 Features

| Feature | Description | Purpose |
|---------|-------------|---------|
| Follow users | See when they publish/update skills | Retention |
| Star skills | Bookmark + signal quality | Powers trending |
| Trending | Top skills by installs/stars this week | FOMO + discovery |
| Activity feed | "snir published code-reviewer v1.3" | Engagement |
| Collections | Curated skill lists with descriptions | Curation + sharing |
| Skill comments | Discussion threads on skill pages | Community |
| Weekly digest | Email: "5 trending skills this week" | Re-engagement |
| Team workspaces | Shared skill configs for organizations | Enterprise value |

### 5.2 User Skill Homepage

Every user gets a profile page serving as their skill homepage:

```
skit.dev/snir

  Snir Balgaly
  @snir - Full-stack developer
  "Building tools for AI-powered dev"

  12 skills published - 847 total stars
  234 followers - 89 clones

  Clone my setup: npx skit clone snir

  Popular Skills:
    code-reviewer    342 stars  1.2k installs
    ship             289 stars  980 installs
    view-md          156 stars  670 installs
    split            60 stars   340 installs

  Collections:
    My Daily Driver (8 skills)
    Security Toolkit (5 skills)
```

### 5.3 Collections

Like Spotify playlists for skills. Users curate themed skill sets:

```
skit.dev/snir/collections/daily-driver

  My Daily Driver
  by snir - 8 skills
  "The skills I use every single day"

  Install all: skit install @snir/daily-driver

  1. code-reviewer  - "Essential for catching bugs before commit"
  2. ship           - "Automates my entire shipping workflow"
  3. view-md        - "Quick markdown preview in browser"
  ...
```

---

## 6. Marketing Strategy

### 6.1 The Viral Loop

```
Developer discovers skit (blog/tweet/HN)
  -> installs a skill or clones a profile
  -> uses skit, likes it
  -> pushes their own profile
  -> shares "npx skit clone <me>" on social
  -> their followers discover skit
  -> loop repeats
```

The `clone` command IS the marketing. Every shared clone URL is a user acquisition channel.

### 6.2 Launch Strategy

| Phase | Action | Target Channel |
|-------|--------|----------------|
| Pre-launch | Build in public on Twitter/X, share progress and AI skills hot takes | Twitter/X |
| Soft launch (Wave 1 ships) | Ship CLI, get 5-10 prominent devs to publish profiles | Twitter, Discord |
| HN launch (Wave 2 ships) | "Show HN: skit - npm for AI agent skills" | Hacker News |
| Product Hunt | Launch with polished registry + demo video | Product Hunt |
| Content blitz | Blog posts, YouTube tutorials, integration guides | SEO, YouTube |

### 6.3 Content Strategy

| Content Type | Cadence | Purpose |
|-------------|---------|---------|
| "My setup" posts | Weekly | Get devs to share profiles |
| "Skill of the week" | Weekly | Highlight registry skills |
| Tutorials | Bi-weekly | "Create a skill", "skit for teams" |
| Comparison posts | At launch | "skit vs AGR" |
| Integration guides | Per-agent | "Using skit with Cursor" |
| "How I use AI skills" interviews | Monthly | Social proof |

### 6.4 SEO Strategy

The registry is an SEO machine. Every skill page and category page is a keyword target:

- `skit.dev/topics/nextjs` targets "AI agent skills for Next.js"
- `skit.dev/topics/security` targets "AI coding security skills"
- `skit.dev/search?q=testing` targets "AI agent testing skills"

With 1,000+ skills, skit owns the long-tail for "AI skill for X" queries.

### 6.5 Distribution

- **npm/npx**: `npx skit` for zero-install. `npm install -g skit` for persistent.
- **Install badges**: On GitHub READMEs, blogs, tweets. Every badge is a backlink.
- **Clone URLs**: `npx skit clone <user>` shared on social media.
- **Integration with awesome-lists**: Get listed in antigravity-awesome-skills (26.5k stars).
- **Agent Skills standard**: Get referenced on agentskills.io as a recommended tool.

### 6.6 Community

- Discord server for skill authors and users
- GitHub Discussions on the skit repo for technical topics
- Twitter/X for updates and engagement
- "Built with skit" showcase for interesting setups

---

## 7. Competitive Strategy vs AGR

### 7.1 Feature Parity

Ensure skit does everything AGR does, plus more:

| AGR Feature | skit Equivalent | skit Advantage |
|-------------|----------------|----------------|
| `agr add <handle>` | `skit install <url\|name>` | Also accepts URLs, local paths, registry names |
| `agr remove <handle>` | `skit remove <skill>` | Prompts for source cleanup |
| `agr sync` | `skit sync` | Multi-agent sync |
| `agr list` | `skit list` | Grouped by source, shows agent status |
| `agr init` | `skit init` | Multi-agent selection |
| `agrx <handle>` | `npx skit install <name>` | npx is already zero-install |
| No equivalent | `skit clone <user>` | Viral growth engine |
| No equivalent | `skit doctor` | Health checks |
| No equivalent | `skit publish` | Registry integration |
| No equivalent | `skit search` | Discovery |
| No equivalent | Web registry | Entire discovery platform |

### 7.2 Migration Path

Ship a `skit import-from-agr` command that reads `agr.toml` and migrates to skit:

```
$ skit import-from-agr

  Found agr.toml with 12 skills
  Migrating to skit manifest...

  Migrated 12 skills from 4 sources
  Run 'skit list' to see your skills
  You can safely remove agr: pip uninstall agr
```

### 7.3 Positioning

- skit is "npm for AI agent skills" (familiar mental model)
- AGR is a Python tool for JavaScript developers (friction)
- skit has a web home (discoverability)
- skit has social features (virality)

---

## 8. Security Considerations

- Skills have full access to AI agents. Warn on first install from unknown sources.
- `skit doctor` detects unexpected source changes (git SHA mismatch).
- `skit clone` shows exactly what will be installed before doing it.
- No auto-execution of any code during install. skit only creates links.
- `skit import` from raw URLs warns about unverified sources.
- Registry: GitHub OAuth for identity. Published skills link to verifiable repos.
- Registry: no file hosting = no malware hosting vector. Skills are always from git.

---

## 9. Phased Rollout

### Wave 1: The CLI (Target: ~2 weeks)

| Phase | Deliverables |
|-------|-------------|
| 1A: Foundation | Project init, core modules (config, manifest, linker, scanner, git), agent adapters (5-6 agents) |
| 1B: Core commands | init, list, link, unlink, sync, doctor, config |
| 1C: Install/Remove | install with picker, remove with cleanup, update |
| 1D: Clone/Profile | clone, profile push/export |
| 1E: Polish | Error handling, security warnings, README, npm publish |

### Wave 2: The Registry (Target: ~3 weeks after Wave 1)

| Phase | Deliverables |
|-------|-------------|
| 2A: API + Auth | Next.js project, Neon DB, GitHub OAuth, publish/search API |
| 2B: Web UI | Homepage, skill pages, user profiles, search |
| 2C: CLI integration | `skit search`, `skit publish`, install-by-name |
| 2D: Polish | Badges, SEO, category pages, deploy to Vercel |

### Wave 3: The Social Network (Target: ~4 weeks after Wave 2)

| Phase | Deliverables |
|-------|-------------|
| 3A: Social core | Follow, star, trending algorithm |
| 3B: Collections | Create, browse, install collections |
| 3C: Engagement | Activity feed, weekly digest emails |
| 3D: Teams | Team workspaces, shared configs |

---

## 10. Success Metrics

| Metric | Wave 1 | Wave 2 | Wave 3 |
|--------|--------|--------|--------|
| npm weekly downloads | 100 | 1,000 | 10,000 |
| GitHub stars | 200 | 2,000 | 10,000 |
| Skills on registry | N/A | 200 | 2,000 |
| Registered users | N/A | 500 | 5,000 |
| Clone executions | 50 | 500 | 5,000 |

---

## 11. Out of Scope

- Paid tier / monetization (premature — build ecosystem first)
- Skill dependency resolution (too complex, not needed)
- Skill authoring/scaffolding (authors write SKILL.md manually)
- Auto-discovery from internet (curated > automated for trust)
- Mobile app (audience lives in terminals and browsers)
- `skit profile diff` (cut from Wave 1 — nice-to-have later)
- `skit link/unlink` as public commands (internal plumbing only)

---

## 12. Open Questions

- **Domain**: skit.dev, skit.sh, skillregistry.dev, or other?
- **Monorepo vs multi-repo**: CLI and registry in one repo or separate?
- **Agent directory paths**: Need to verify exact skill directories for Cursor, Codex, Gemini CLI, VS Code Copilot on all platforms
- **Registry hosting costs**: Neon free tier sufficient for launch? When do we need to scale?
- **Trademark**: Is "skit" available as an npm package name? (Need to check)
