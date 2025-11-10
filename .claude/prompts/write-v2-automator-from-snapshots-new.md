# Write V2 Automator from Page Snapshots

Use this prompt to guide an agent that builds or debugs an AI-assistant automator using captured page snapshots (YAML tree, metadata, screenshots, and extracted results).

---

## Stage Setting

User request would specify the desired stage so the agent stays scoped:

- `develop from scratch`: no automator exists yet; create the full skeleton and land the first working methods.
- `continue dev`: build on an existing automator, implementing the next missing pieces.
- `verify/debug`: diagnose failing behavior, compare against snapshots, and patch selectors or logic.

If a request does not include one of these directives, ask the user to clarify before writing code.

---

## User Request

Stage: develop from scratch, continue dev, verify/debug

Goal: ... eg, Implement getChatEntries() using sidebar history in the snapshot results

Assistant: Grok v2 automator

Snapshots:

<!-- ls tmp/snapshots-t3/*/*.{yml,json,png} | grep -v 'aria-snapshot.yml'-->

tmp/snapshots-t3/snapshot-grok-1762744245143/page-screenshot.png
tmp/snapshots-t3/snapshot-grok-1762744245143/results.json
tmp/snapshots-t3/snapshot-grok-1762744245143/yaml-snapshot.yml

---

## Snapshot Usage

Each page snapshot folder contains:

1. `screenshot.png`
2. `yaml-snapshot.yml`
3. `results.json`

Default to the YAML and results files. Only open `screenshot.png` when the YAML leaves something unclear—this keeps context size low.

Do not read every snapshot up front. Ask the user which snapshot captures the needed UI state (login page, active chat, etc.) and inspect snapshots one at a time.

---

## Core Workflow

1. **Assess the current stage**

   - Locate or create the relevant automator under `src/lib/services/automators-v2/`.
   - Review `src/lib/types/automators-v2.ts`, `src/lib/utils/selectors.ts`, and similar automators for patterns.

2. **Plan the next increment**

   - Identify which interface methods are in scope (`getLoginState`, `getChatEntries`, `submitPrompt`, etc.).
   - Use TodoWrite (or an equivalent checklist) to track progress when multiple methods remain.

3. **Leverage snapshots surgically**

   - Extract robust selectors (`data-*`, `aria-*`, ids) with fallback arrays.
   - Note URL/chat-id patterns when visible.
   - Record any assumptions or ambiguities for follow-up.

4. **Implement per method**

   - Handle logged-out, empty, and loading states explicitly.
   - Throw descriptive errors for unimplemented paths; avoid silent failures.
   - Keep comments short and purposeful, explaining only non-obvious logic.

5. **Validate**
   - Conceptually test logic against the inspected snapshot.
   - For `verify/debug`, reproduce the failure scenario and document the observed vs expected behavior.

---

## Deliverable Expectations

An updated automator class that:

- Implements the requested methods of `AiAssistantAutomatorV2`.
- Uses clear selectors with ordered fallbacks.
- Includes precise error messages for unsupported operations.
- Documents any remaining TODOs or open questions tied to specific snapshots.

Always close with suggested manual verification steps (e.g., run `npm run check`, load the extension against the relevant site, retest the failing flow).

---

## Future Agent Notes

<!-- Reserve this space for short bullet points capturing lessons learned, flaky selectors, environment quirks, or open follow-ups. Keep entries timestamped and signed so others can reach out if needed. Rotate older notes into documentation once they stabilize. -->

**DO**

- Ask clarifying questions when anything is ambiguous.
- Request the exact snapshot needed for each method instead of opening all files.
- Confirm understanding with the user before large changes.
- Track multi-method progress with TodoWrite (or equivalent).
- Reuse existing automators as reference implementations.
- Capture chat IDs from URLs (`/c/{id}`, `/chat/{id}`) whenever visible.
- Handle logged-out, empty-history, and loading states.
- Add short comments for non-obvious selector choices.
- Work incrementally—implement and conceptually test one method at a time.

**DON'T**

- Read every snapshot at once; only inspect what you need.
- Guess selectors or logic—verify in the snapshot.
- Implement every method in one pass; ship thin slices.
- Rely on brittle class selectors; prefer `data-*`, `aria-*`, ids.
- Work silently when blocked; surface questions quickly.

**Quick workflow reminder**

1. Ask which assistant/state is in scope.
2. Review the existing automator to spot gaps.
3. Plan remaining methods as a short todo list.
4. For each method: identify the right snapshot, inspect it only, extract selectors, implement, and confirm with the user.

**Patterns worth reusing**

- Login detection: profile avatars/user menus, lack of sign-in buttons.
- Chat history: sidebar items with `a[href^="/c/"]`, dated groupings, inline history modules.
- Message input: `textarea`/`contenteditable` paired with a send control (`type="submit"` or `aria-label="Send"`).
- Message extraction: containers with `role="article"`, `data-message-*`, markdown blocks.
- Generation state: stop buttons, streaming indicators, temporarily disabled inputs.

**Questions to keep handy**

- Which snapshot shows the needed UI state?
- Is this the correct chat ID format?
- Which method or bug is the current priority?
- Are these selectors stable on the live site?
- Any UI quirks (themes/experiments) that might affect the snapshot?
