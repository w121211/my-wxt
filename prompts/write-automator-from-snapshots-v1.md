# Write V2 Automator from YAML Snapshots

You are tasked with implementing or continuing work on a V2 automator for an AI assistant platform using YAML snapshots as reference material.

---

## Current Task (User Request)

<!-- Example user requests:
- Continue implementing the Grok v2 automator. Implement the getChatEntries() method using snapshots in tmp/snapshots/
- Start a new v2 automator for Gemini. Snapshots are available in tmp/snapshots/snapshot-gemini-*/
- Fix the submitPrompt() method in the Claude automator - it's not finding the submit button correctly -->

### Available Snapshots

<!-- ls tmp/snapshots-t3/*/*.{yml,json} | grep -v 'aria-snapshot.yml'-->

YAML snapshots and results:

tmp/snapshots-t3/snapshot-grok-1762744245143/results.json
tmp/snapshots-t3/snapshot-grok-1762744245143/yaml-snapshot.yml

---

## Context

This project uses YAML snapshots to capture the DOM structure of AI assistant websites (ChatGPT, Claude, Gemini, Grok, etc.). These snapshots are used to write automators that can interact with these websites programmatically.

### Key Files to Understand

1. **Type definitions**: `src/lib/types/automators-v2.ts` - Contains the `AiAssistantAutomatorV2` interface you must implement
2. **Selector utilities**: `src/lib/utils/selectors.ts` - Helper functions for DOM manipulation
3. **Existing automators**: Check `src/lib/services/automators-v2/` for reference implementations
4. **YAML snapshots**: Located in `tmp/snapshots/` directory

### YAML Snapshot Structure

Each snapshot includes:

- Metadata: URL, title, viewport, timestamp, user agent
- DOM hierarchy: Indented tree structure with elements, attributes, and text content
- Format example:

  ```yaml
  # Snapshot Metadata
  # URL: https://example.com/

  - body
    - div [data-testid="container"]
      - button [type="submit", aria-label="Send"]: "Submit"
  ```

## Your Task

Implement the V2 automator incrementally by:

1. **Reading existing code** (if continuing work):

   - Check if automator file already exists
   - Review what's already implemented vs stubbed
   - Identify which methods need implementation

2. **Analyzing snapshots ONE AT A TIME**:

   - **DO NOT read all snapshots at once** - this wastes tokens
   - Ask the user which snapshot to use for which method
   - Each snapshot captures a specific UI state (logged out, logged in, chat history, active conversation, etc.)

3. **Extracting selectors from snapshots**:

   - Look for stable selectors: `data-testid`, `data-*`, `id`, `aria-label`, `role`
   - Prefer attribute selectors over classes (classes change frequently)
   - Always provide fallback selectors in arrays (primary, secondary, tertiary)
   - Example:
     ```typescript
     loginIndicator: [
       'button[data-testid="user-menu"]', // Most stable
       'div[aria-label="User menu"]', // Fallback 1
       'button:has(img[alt="profile"])', // Fallback 2
     ];
     ```

4. **Implementing methods incrementally**:
   - Start with `getLoginState()` (usually easiest)
   - Then `getChatEntries()`, `submitPrompt()`, etc.
   - Stub remaining methods with descriptive errors
   - Test each method conceptually before moving to next

## Interface Methods to Implement

```typescript
interface AiAssistantAutomatorV2 {
  // Extractors
  getLoginState(options?: LoginWaitOptions): Promise<LoginState>;
  getChatEntries(params?: ListChatEntriesParams): Promise<readonly ChatEntry[]>;
  getChatPage(target: ChatTarget | { chatId: string }): Promise<ChatPage>;
  getConversationStatus(ref: ConversationRef): Promise<ConversationStatus>;

  // Actions
  submitPrompt(
    input: SubmitPromptInput,
    signal?: AbortSignal
  ): Promise<SubmitPromptResult>;

  // Watchers
  watchConversationStatus(
    ref: ConversationRef,
    onChange: (status: ConversationStatus) => void
  ): Unsubscribe;
}
```

## Important Guidelines

### DO:

- ✅ **Ask questions** when you encounter ambiguity or uncertainty
- ✅ **Request specific snapshots** for specific methods ("Which snapshot shows chat history?")
- ✅ **Verify your understanding** with the user before implementing complex logic
- ✅ **Use TodoWrite tool** to track progress across multiple methods
- ✅ **Study existing automators** as reference (ChatGPT, Claude, etc.)
- ✅ **Extract chat IDs from URLs** - look for patterns like `/c/{id}`, `/chat/{id}`
- ✅ **Handle edge cases** - logged out state, empty chat history, loading states
- ✅ **Add comments** explaining selector choices and implementation decisions
- ✅ **Work incrementally** - implement one method at a time, test conceptually, then move on

### DON'T:

- ❌ **Don't read all snapshots at once** - this wastes context and tokens
- ❌ **Don't guess implementation** - ask the user for clarification
- ❌ **Don't implement everything at once** - incremental progress is better
- ❌ **Don't assume selectors** - verify them in snapshots first
- ❌ **Don't work silently** - communicate your thought process and ask questions
- ❌ **Don't use brittle selectors** - avoid classes without data attributes as primary selectors

## Workflow Example

1. **Start**: Ask user which assistant and what state the work is in
2. **Assess**: Check existing file, identify what's done vs stubbed
3. **Plan**: Use TodoWrite to create task list for remaining methods
4. **Implement iteratively**:
   - Ask: "Which snapshot shows [specific UI state]?"
   - Read: Only that specific snapshot
   - Extract: Selectors for that method
   - Implement: That specific method
   - Verify: Ask user if approach seems correct
   - Move on: Mark complete, move to next method

## Common Patterns to Look For

### Login Detection

- Profile buttons, avatars, user menus in header/sidebar
- Absence of "Sign in" / "Sign up" buttons
- Presence of user-specific UI elements

### Chat History

- **IMPORTANT**: Prefer sidebar/inline chat history over dedicated history pages
  - Many platforms (like Grok) show recent chats in an expanded sidebar
  - Look for `a[href^="/c/"]` or similar patterns in sidebar content
  - History pages may have timestamps, but sidebar is faster to access
- Sidebar navigation items with expandable sections
- Links with chat IDs in href (e.g., `/c/{uuid}`, `/chat/{id}`)
- List items with titles (timestamps may not always be visible in sidebar)
- Time groupings like "Today", "Yesterday", "This Week" in divs

### Message Input

- `textarea`, `contenteditable` elements
- `aria-label` like "Ask {Assistant}", "Message", "Type here"
- Submit buttons with `type="submit"` or `aria-label="Send"`

### Message Extraction

- Container elements with role="article", data-message-\*, etc.
- Role indicators: `data-message-author-role`, `data-role`, class names
- Content areas with markdown or HTML

### Generation State

- Stop buttons (`aria-label*="Stop"`)
- Loading indicators, streaming cursors
- Disabled input fields during generation

## Questions to Ask User

When stuck or unsure, ask questions like:

- "Which snapshot shows [specific state]?"
- "Is this the correct chat ID format?"
- "Should I implement [Method A] before [Method B]?"
- "I see multiple possible selectors - which is more stable?"
- "Does this platform use [specific UI pattern]?"

## Deliverable

A fully or partially implemented automator class that:

1. Implements `AiAssistantAutomatorV2` interface
2. Has clearly defined selectors with fallbacks
3. Has working implementations for completed methods
4. Has descriptive error stubs for unimplemented methods
5. Includes helpful comments explaining implementation choices

Remember: **Quality over speed**. It's better to implement 2 methods correctly than to rush through all 6 methods incorrectly. Work with the user collaboratively!
