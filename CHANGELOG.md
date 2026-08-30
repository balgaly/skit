# Changelog

All notable changes to this project will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.2.1] — 2026-04-27

### Fixed
- **Install re-entry** — reuse an already-cloned source to add more skills instead of hard-erroring. Reuse is refused if the existing dir is a symlink or has a different git remote. `installedAt` and origin are preserved on re-entry.
- **Profile export** — reads origin with a `url` fallback for legacy manifests.
- **Manifest** — source URL key renamed to `origin` for consistency with the export format.

---

## [1.2.0] — 2026-04-15

### Added
- **Interactive TUI** — running `skit` with no arguments opens a main menu. Browse registry, my skills, first-run onboarding, ASCII art header and rotating tips.
- **`skit discover`** — detect existing skills on disk and onboard them. Also available as a TUI menu item. Discover output lists individual skill names with a global (path) scope label.
- **Registry browse** — `src/core/registry.js` fetch, cache, and URL validation; TUI screens for browsing the registry and listing installed skills.
- **Doctor discovery scan** — `skit doctor` includes a discovery scan.

### Fixed
- Security review: sanitize gist filenames with `path.basename`, cap redirect following at 5, reject `__proto__`/`constructor`/`prototype` as manifest keys, validate GitHub usernames before API calls, limit registry responses to 5MB, reject unsafe directory names during skill discovery.
- Path separator and case-insensitive mislocated-skill detection.
- TUI: back navigation, Ctrl-C during submitRepo, persist onboard flag only on explicit user choice.
- URL validation and writeCache error handling in the registry.

### Internal
- UI helpers: `src/ui/spinner.js`, `src/ui/format.js`, `src/ui/picker.js`; command files migrated to those helpers.
- Dependencies: `@inquirer/search`, `open@8`.
- `SECURITY.md` vulnerability disclosure policy.
- `.mcp.json` added to gitignore.

---

## [1.1.0] — 2026-04-03

### Added
- **Cursor agent adapter** — `skit config set agent cursor` links skills into `~/.cursor/rules/`. Accepts both `SKILL.md` (cross-agent) and `.cursorrules` (Cursor-native) as skill markers.
- **Windsurf agent adapter** — `skit config set agent windsurf` links skills into `~/.windsurf/rules/`. Accepts both `SKILL.md` and `.windsurfrules`.
- **`skit incognito`** — per-project plugin quarantine for Claude Code. `skit incognito on` blocks all global plugins and user skills from running in the current project via `settings.local.json`. Supports `allow`, `off`, and `status` subcommands.
- **Agent validation in `skit config set`** — setting an unknown agent name now prints a clear error instead of silently writing an invalid value.

### Fixed
- `skit config set agent <unknown>` no longer silently writes invalid values to `config.json`.

### Internal
- Repo hygiene: `.gitignore` updated to exclude `.claude/`, `PROMPT.md`, and `docs/superpowers/`.
- `docs/roadmap.md` added as a living backlog document.

---

## [1.0.0] — 2026-03-22

### Added
- `skit install <url|path>` — clone repo or register local folder, scan for skills, interactive picker
- `skit import <url>` — smart import from gist, GitHub subfolder, or raw URL
- `skit remove <skill>` — remove skill junction, prompt if last skill from source
- `skit list` — show all skills grouped by source
- `skit update [source]` — git pull + re-link
- `skit sync` — recreate all junctions from manifest (new machine setup)
- `skit clone <user|url>` — clone another user's full skill setup
- `skit profile export/import/diff/push` — profile management and sharing
- `skit doctor` — health check: broken links, missing sources, updates available
- `skit link <path>` / `skit unlink <skill>` — low-level junction management
- `skit config get/set` — configuration management
- Claude Code agent adapter (`~/.claude/skills/`)
- Cross-platform support: NTFS junctions (Windows) and symlinks (macOS/Linux)
- Single source of truth via `~/.skit/manifest.json`
