<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

# Repository Guidelines

## MVP Mindset
- Treat the extension as a minimal viable product—ship the essentials first and iterate when we have real feedback.
- Favor straightforward solutions and resist adding layers or abstractions that we do not immediately need.
- Only write comments when they clarify tricky logic or intent; make them short, direct, and easy to scan.

## Project Structure & Module Organization
The codebase follows WXT's extension layout. `src/entrypoints/popup/` contains the popup Svelte app (App.svelte, main.ts, app.css, index.html). Shared utilities and types live under `src/lib/`, while static icons and images are in `src/assets/`. Files inside `public/` are copied verbatim into the final bundle; reserve it for manifest-adjacent assets. Generated artifacts (e.g., build output) go to `.output/` and should not be edited by hand. Add new files only when they unlock a concrete user-facing need.

## Build, Test, and Development Commands
Run `npm run dev` to launch the WXT dev server in Chromium, or `npm run dev:firefox` for Firefox. Use `npm run build` to produce a production bundle under `.output/`, and `npm run build:firefox` to target Firefox. Package a distributable zip via `npm run zip` (or `npm run zip:firefox`). Execute `npm run check` before committing to catch Svelte and TypeScript issues. Stick to these built-in scripts; avoid introducing new tooling until the existing flow limits delivery.

## Development Guidelines
- Target modern Chromium; no backward compatibility constraints.
- Keep scope lean: reuse installed libraries, prefer native APIs over custom wrappers, and only add abstractions once they earn their keep.
- Work in thin vertical slices so each change lands visible value and can be validated quickly.
- Favor explicit code: clear function signatures, no hidden side effects, and minimal indirection.
- TypeScript: full type coverage, no `as` assertions, explicit parameter/return types, import library types directly, and avoid barrel `index.ts` files. Define types close to the code that owns them.
- Errors bubble up; throw early rather than surrounding logic with blanket `try/catch`.
- File headers should start with a comment containing the repo-relative path (e.g. `// src/popup/App.svelte`); keep further comments sparse and focused.


## Coding Style & Naming Conventions
Match the existing two-space indentation and single-quote imports in TypeScript. Svelte components use PascalCase filenames, while helper modules in `src/lib` stay camelCase. Co-locate styles with components (`app.css`, `<style>` blocks), and keep public assets lowercase with hyphenated names. Let the WXT bundler and Svelte compiler handle formatting; avoid manual tweaks that fight their output. Resist adding style utilities or naming systems until repeated pain justifies them.

## Testing Guidelines
This starter relies on type safety and manual extension validation. Always run `npm run check` and resolve diagnostics. Verify UI behavior in both Chromium and Firefox via the dev server, and exercise popup flows with realistic data. When adding new features, describe manual test steps in the PR so reviewers can reproduce them. Focus testing energy on the core value paths before exploring edge cases.

## Commit & Pull Request Guidelines
Repository history is not bundled with this workspace; adopt Conventional Commits (e.g., `feat: popup badge counter`) to keep future logs searchable. Reference related issues in the commit body and PR description. Each PR should note the browser(s) verified, include screenshots or screen recordings for UI changes, and outline any follow-up work. Keep pull requests small, focused, and directly tied to the MVP scope.

## Extension Packaging Notes
Before tagging a release, run `npm run build` followed by `npm run zip` and upload the generated archive from `.output/`. Keep credentials and API keys out of the repo; store them in browser-specific secure storage when testing. Do not spend time on packaging automation until we have a stable MVP ready for distribution.
