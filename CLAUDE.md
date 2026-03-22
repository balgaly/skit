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
- `src/agents/` — pluggable agent adapters (v1: claude-code only)
- `src/ui/` — terminal UI helpers (picker, spinner, formatting)
- `bin/skit.js` — entry point, wires commands to commander

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
- Work on feature branches, merge to main
- Include `Co-Authored-By: Claude <noreply@anthropic.com>` in commits

## Testing

- Test framework: Node.js built-in test runner (`node --test`)
- Use temp directories for integration tests
- Mock git operations where possible
- Test cross-platform linking behavior
- Every command gets at least basic happy-path + error-path tests
