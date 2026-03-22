# Kick-off Prompt

Copy everything below the line and paste it into a new Claude Code session opened in this folder (`C:\dev\local\skit`).

---

I'm building `skit` — a cross-platform npm CLI package manager for AI agent skills. The full design spec is in `docs/design.md` and project conventions are in `CLAUDE.md`. Read both files first.

Then:

1. Initialize the project: `git init`, `npm init`, install dependencies (commander, inquirer, chalk, ora), create `.gitignore`, set up the package.json with `bin` field pointing to `bin/skit.js`.

2. Build the project following the design spec in order of priority:
   - Phase 1 (Core): `src/core/` modules (config, manifest, linker, scanner, git), the claude-code agent adapter, and basic commands (list, link, unlink, sync, doctor, config)
   - Phase 2 (Install/Remove): `skit install`, `skit remove`, `skit update` commands with the interactive skill picker
   - Phase 3 (Import): `skit import` with smart URL detection (GitHub repos, gists, raw URLs)
   - Phase 4 (Clone/Profile): `skit profile export/import/diff/push` and `skit clone`
   - Phase 5 (Polish): Error handling edge cases, help text, README for npm

3. After each phase: run tests, commit, then continue to next phase.

4. Use the writing-plans skill or create your own implementation plan from the design spec before coding. Ship incrementally — each phase should result in a working, testable CLI.

The end goal: `npm install -g skit` works, `skit install https://github.com/balgaly/snirs-skills` works, `skit clone snir` works. Cross-platform (Windows junctions, Unix symlinks).
