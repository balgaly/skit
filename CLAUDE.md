# skit

> A cross-platform package manager for AI agent skills.

## Project Info

- **Name**: skit
- **Type**: npm CLI package (Node.js)
- **Entry point**: `bin/skit.js`
- **Source**: `src/`
- **Tests**: `tests/`
- **Design spec**: `docs/design.md`

## Code Standards

- Node.js (no TypeScript in v1 — ship fast, add types later)
- Use `const`/`let`, never `var`
- CommonJS (`require`/`module.exports`) for maximum Node.js compatibility
- Validate all user inputs (URLs, paths, skill names)
- Handle errors gracefully with clear user-facing messages
- No exposed secrets or API keys
- Follow DRY principle
- Meaningful variable and function names

## Architecture

- `src/commands/` — one file per CLI command, each exports a function
- `src/core/` — shared business logic (manifest, linker, git, scanner, importer)
- `src/agents/` — pluggable agent adapters (claude-code, cursor; add new ones with ~20 lines)
- `bin/skit.js` — entry point, wires commands to commander

> `src/ui/` is planned (picker, spinner, formatting helpers) but not yet extracted.
> UI logic (chalk, inquirer, ora) is currently inline in each command file.

## Dependencies (keep minimal)

- `commander` — CLI arg parsing
- `inquirer` — interactive prompts
- `chalk` — terminal colors
- `ora` — spinners

## Cross-Platform

- MUST work on Windows, macOS, and Linux
- Windows: use NTFS junctions (`fs.symlinkSync` with `'junction'`)
- macOS/Linux: use directory symlinks (`fs.symlinkSync` with `'dir'`)
- Always use `path.resolve()` for absolute paths (junctions require it on Windows)
- Always use `path.join()` for path construction, never string concatenation
- Test with forward slashes in tests, but never assume slash direction in code

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Work on feature branches, merge to master
- Include `Co-Authored-By: Claude <noreply@anthropic.com>` in commits

## Testing

- Test framework: Node.js built-in test runner (`node --test`)
- Use temp directories for integration tests
- Mock git operations where possible
- Test cross-platform linking behavior
- Every command gets at least basic happy-path + error-path tests

## Babysitter

### Recommended Commands
- `/babysitter:call` — orchestrate complex multi-step tasks
- `/babysitter:plan` — plan a workflow before executing
- `/code-reviewer` — automated code review

### Methodology & Processes
- **Methodology**: GSD (Get Stuff Done)
- **Processes**: gsd, cli-mcp-development, backend-development
- **Skills**: TDD, systematic-debugging, verification-before-completion

### CI/CD
- GitHub Actions not yet configured (run `node --test tests/**/*.test.js` locally)

### Notes
- Project profile stored in `.a5c/project-profile.json`
