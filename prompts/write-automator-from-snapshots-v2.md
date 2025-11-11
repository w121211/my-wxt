# Automator From Snapshots (V2)

Build or debug an AI‑assistant automator using captured page snapshots.

---

## Inputs

- Request: what to build or fix (one clear sentence).
- Automator: target file under `src/lib/services/automators-v2/*.ts`.
- Snapshots: paths to `yaml-snapshot.yml`, `results.json`, and optional `page-screenshot.png`.
  - Prefer YAML and results; open the screenshot only when needed.
- Optional (later iterations): `Initial prompt: prompts/write-automator-from-snapshots-v2.md`.

---

## Development Flow

1. Initial: use this prompt with Request, Automator, and Snapshots.
2. Iterate: run the automator, collect new snapshots from failures or gaps.
3. Subsequent: reuse this prompt unmodified; send a new message with just a fresh Request and the new Snapshots (optionally include the initial prompt path).

---

## Workflow

1. Review automator and shared types/utils
   - `src/lib/services/automators-v2/<automator>.ts`
   - `src/lib/types/automators-v2.ts`
   - `src/lib/utils/selectors.ts`
2. Plan a thin increment
   - Identify in‑scope methods or the specific bug (e.g., `getLandingPage`, `getChatPage`, `submitPrompt`).
3. Implement
   - Use robust selectors (`data-*`, `aria-*`, ids) with ordered fallbacks.
   - Handle logged‑out, empty, and loading states explicitly.
   - Throw precise errors for unsupported paths; avoid silent failures.
   - Keep comments short and only for non‑obvious logic.
4. Validate
   - Conceptually test against the inspected snapshot.
   - When debugging, document observed vs expected behavior.
5. Note follow‑ups
   - Add TODOs tied to specific snapshots for any remaining ambiguities.

---

## Output

- Updated automator that implements/fixes the requested behavior of `AiAssistantAutomatorV2`.
- Clear, stable selectors with fallbacks.
- Descriptive error messages for unsupported or unhandled states.
- Brief manual verification steps (e.g., `npm run check`, load the extension, retest the flow).

---

## Constraints

- Do not read all snapshots up front; inspect only what you need.
- Ask for the snapshot that captures the needed UI state if ambiguous.
- Avoid brittle class selectors; prefer `data-*`, `aria-*`, and ids.
- Work incrementally—one method or fix at a time.
- Capture chat IDs from URLs when visible (e.g., `/c/{id}`, `/chat/{id}`).
