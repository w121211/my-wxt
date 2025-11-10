# Packet-Based Messaging Design

## Overview

This document describes the redesigned messaging system for DevTools ↔ Content Script communication, replacing the previous discriminated union approach with a minimal, flexible Packet-based architecture.

## Design Principles

1. **Minimal**: Reduce event types from 13 to 2
2. **Flexible**: Test cases can be anything - selector tests, function calls, watchers, etc.
3. **Generic**: Base packet structure can be reused across entire system (not just DevTools)
4. **Simple**: No complex type hierarchies or generics

## Core Packet Structure

```typescript
type Packet = {
  readonly event: string;
  readonly messageId: string;
  readonly timestamp: string;
  readonly source: string;
  readonly data: any;
  readonly meta?: any;
}
```

## Event Types

### 1. `req_test_case` (DevTools → Content)
Request to run any test case.

**Data structure:**
```typescript
{
  caseName: string,     // e.g., "test_suite", "getLoginState", "selectors"
  args?: any[]          // Optional arguments for the test case
}
```

**Examples:**
```typescript
// Run full test suite
{
  event: "req_test_case",
  messageId: "abc123",
  timestamp: "2025-11-10T12:00:00.000Z",
  source: "devtools",
  data: { caseName: "test_suite" },
  meta: { automatorId: "grok" }
}

// Test specific function
{
  event: "req_test_case",
  messageId: "def456",
  timestamp: "2025-11-10T12:00:01.000Z",
  source: "devtools",
  data: { caseName: "getLoginState", args: [{ timeoutMs: 5000 }] },
  meta: { automatorId: "grok" }
}

// Submit chat prompt
{
  event: "req_test_case",
  messageId: "ghi789",
  timestamp: "2025-11-10T12:00:02.000Z",
  source: "devtools",
  data: { caseName: "submitPrompt", args: ["Hello Grok!"] },
  meta: { automatorId: "grok" }
}
```

### 2. `test_case_result` (Content → DevTools)
Result from any test case execution.

**Data structure:**
```typescript
{
  caseName: string,                           // Matches the request caseName
  status: "success" | "error" | "streaming",  // Execution status
  result?: any,                               // Result data (if success/streaming)
  error?: string,                             // Error message (if error)
  duration?: number                           // Execution time in ms
}
```

**Examples:**
```typescript
// Successful test
{
  event: "test_case_result",
  messageId: "jkl012",
  timestamp: "2025-11-10T12:00:03.000Z",
  source: "content",
  data: {
    caseName: "getLoginState",
    status: "success",
    result: { isLoggedIn: true, user: {...} },
    duration: 120
  },
  meta: { automatorId: "grok" }
}

// Failed test
{
  event: "test_case_result",
  messageId: "mno345",
  timestamp: "2025-11-10T12:00:04.000Z",
  source: "content",
  data: {
    caseName: "submitPrompt",
    status: "error",
    error: "Message input not found",
    duration: 50
  },
  meta: { automatorId: "grok" }
}

// Streaming update (watcher)
{
  event: "test_case_result",
  messageId: "pqr678",
  timestamp: "2025-11-10T12:00:05.000Z",
  source: "content",
  data: {
    caseName: "watchConversation",
    status: "streaming",
    result: { status: "responding", message: "..." }
  },
  meta: { automatorId: "grok" }
}
```

## Test Case Model

Everything is a test case. The tester defines what each case name means.

### Example Test Cases

```typescript
const testCases = {
  // Suite runner - runs multiple tests and emits individual results
  test_suite: async () => {
    // Emit: test_case_result for "selectors"
    // Emit: test_case_result for "getLoginState"
    // Emit: test_case_result for "getChatEntries"
    // Finally emit: test_case_result for "test_suite" with summary
  },

  // Selector testing
  selectors: async () => {
    // Test all selectors, return SelectorResults
    return { loginIndicator: {...}, chatItems: {...} }
  },

  // Function testing
  getLoginState: async (args) => {
    return await automator.getLoginState(...args)
  },

  getChatEntries: async () => {
    return await automator.getChatEntries()
  },

  // Actions
  submitPrompt: async (args) => {
    const [prompt, options] = args
    return await automator.submitPrompt({ prompt, ...options })
  },

  navigateToChat: async (args) => {
    const [chatId] = args
    return await automator.navigateToChat({ chatId })
  },

  // Watchers - emit streaming results
  watchConversation: async (args) => {
    const [conversationRef] = args
    // Emit multiple test_case_result with status: "streaming"
    // Final result with status: "success"
  }
}
```

## Test Suite Flow Example

```
DevTools → Content: req_test_case { caseName: "test_suite" }

Content → DevTools: test_case_result { caseName: "selectors", status: "success", result: {...} }
Content → DevTools: test_case_result { caseName: "getLoginState", status: "success", result: {...} }
Content → DevTools: test_case_result { caseName: "getChatEntries", status: "success", result: {...} }
Content → DevTools: test_case_result {
  caseName: "test_suite",
  status: "success",
  result: { summary: { total: 3, passed: 3, failed: 0, duration: 500 } }
}
```

## Watcher Streaming Flow Example

```
DevTools → Content: req_test_case { caseName: "watchConversation", args: [...] }

Content → DevTools: test_case_result { caseName: "watchConversation", status: "streaming", result: { status: "responding" } }
Content → DevTools: test_case_result { caseName: "watchConversation", status: "streaming", result: { status: "typing" } }
Content → DevTools: test_case_result { caseName: "watchConversation", status: "streaming", result: { status: "complete" } }
Content → DevTools: test_case_result { caseName: "watchConversation", status: "success" }
```

## Migration Mapping

### Old → New Event Names

**Content → DevTools (Notifications):**
- `test:suite:start` → `test_case_result` with `caseName: "test_suite", status: "streaming"`
- `test:suite:complete` → `test_case_result` with `caseName: "test_suite", status: "success"`
- `test:started` → `test_case_result` with `status: "streaming"` (optional)
- `test:result` → `test_case_result` with `status: "success"`
- `test:error` → `test_case_result` with `status: "error"`
- `selector:results` → `test_case_result` with `caseName: "selectors"`
- `automator:status` → `test_case_result` with `caseName: "automator_status"` (or omit entirely)
- `watcher:update` → `test_case_result` with `status: "streaming"`

**DevTools → Content (Commands):**
- `devtools:run-tests` → `req_test_case` with `caseName: "test_suite"`
- `devtools:test-function` → `req_test_case` with `caseName: <functionName>`
- `devtools:refresh-selectors` → `req_test_case` with `caseName: "selectors"`
- `devtools:submit-prompt` → `req_test_case` with `caseName: "submitPrompt"`
- `devtools:navigate-to-chat` → `req_test_case` with `caseName: "navigateToChat"`

### Old → New Data Structures

**Old:**
```typescript
type DevToolsTestMessage =
  | { type: "test:suite:start", automatorId, timestamp }
  | { type: "test:suite:complete", automatorId, timestamp, summary }
  | { type: "test:started", automatorId, testName, category, timestamp }
  | { type: "test:result", automatorId, testName, category, result, timestamp }
  | { type: "test:error", automatorId, testName, category, error, timestamp }
  | { type: "selector:results", automatorId, results, timestamp }
  | { type: "automator:status", automatorId, status, message?, timestamp }
  | { type: "watcher:update", automatorId, watcherName, data, timestamp }

type DevToolsCommand =
  | { type: "devtools:run-tests", automatorId }
  | { type: "devtools:test-function", automatorId, functionName, args }
  | { type: "devtools:refresh-selectors", automatorId }
  | { type: "devtools:submit-prompt", automatorId, prompt, chatId?, messageId? }
  | { type: "devtools:navigate-to-chat", automatorId, chatId? }
```

**New:**
```typescript
type Packet = {
  event: string,
  messageId: string,
  timestamp: string,
  source: string,
  data: any,
  meta?: any
}

// All messages use just 2 event types:
// - "req_test_case"
// - "test_case_result"
```

## Design Q&A

### Q: Why "Packet" instead of "Message" or "Event"?

**A:**
- "Message" is too general and overloaded in web development
- "Event" might confuse with DOM events
- "Packet" is standard in networking/IPC for structured messages with metadata
- Packet implies a self-contained unit with envelope + payload

### Q: Why not use TypeScript generics like `Packet<TName, TData>`?

**A:** Fully flexible approach is easier for migration. No complex type hierarchies. Everything is `any` for maximum flexibility.

### Q: Why include `source` instead of `sender`?

**A:** "Source" better represents origin in unidirectional message flow. More neutral than "sender" (which implies a recipient).

### Q: Why no `target` field for routing?

**A:** Not needed currently. Messages are broadcast via `browser.runtime.sendMessage()` or targeted via `browser.tabs.sendMessage()`. Filtering happens via `automatorId` in meta.

### Q: Why no helper functions like `createPacket()`?

**A:** Keep it minimal. Let each component create packets directly. Avoid extra dependencies.

### Q: Why no JSDoc comments?

**A:** Code should be self-documenting. This design doc serves as comprehensive documentation.

### Q: Why keep `meta` flexible instead of using generics?

**A:** Easier to extend without breaking types. Different domains (DevTools, Background, Server) can add any metadata they need without changing base Packet type.

### Q: Do we need separate "initializing", "testing", "idle", "error" automator status?

**A:** No. Status is implicit from test case activity:
- Test suite running → "testing"
- Test suite complete → "idle"
- Test case error → "error"
- No activity → "idle"

DevTools UI can infer status from `test_case_result` messages. No separate status tracking needed.

### Q: How do errors work in the new system?

**A:** All errors are `test_case_result` messages with `status: "error"` and `error` field. No separate error event types.

Examples:
```typescript
// Individual test failed
{ event: "test_case_result", data: { caseName: "getLoginState", status: "error", error: "Timeout" } }

// Suite failed
{ event: "test_case_result", data: { caseName: "test_suite", status: "error", error: "Initialization failed" } }
```

### Q: How do streaming watchers work?

**A:** Use `status: "streaming"` for in-progress updates:

```typescript
// Streaming updates
{ event: "test_case_result", data: { caseName: "watchConversation", status: "streaming", result: {...} } }
{ event: "test_case_result", data: { caseName: "watchConversation", status: "streaming", result: {...} } }

// Final result
{ event: "test_case_result", data: { caseName: "watchConversation", status: "success" } }
```

DevTools accumulates streaming results by `caseName`.

### Q: Why reduce from 13 event types to 2?

**A:**
- Simpler mental model: everything is a test case
- More flexible: add new test types without changing message types
- Less boilerplate: no new type definitions for each feature
- Easier to extend: tester defines what test cases mean

### Q: How does test suite know which tests to run?

**A:** The test case registry defines available tests. The `test_suite` case orchestrates running multiple tests and emitting their results.

### Q: Can we run only specific categories (e.g., just selectors)?

**A:** Yes, via test case names:
- `req_test_case { caseName: "selectors" }` → test only selectors
- `req_test_case { caseName: "test_extractors" }` → test only extractors
- `req_test_case { caseName: "test_suite" }` → test everything

### Q: How is this different from the old system?

**Old system:**
- 13 distinct message types with specific structures
- Discriminated unions for type safety
- Each feature requires new message type
- Categories hardcoded in message structure

**New system:**
- 2 generic event types
- Flexible data payloads
- Features defined by test case names
- Categories optional in meta or inferred from caseName

### Q: Won't we lose type safety?

**A:** Intentional trade-off. Flexibility over strict typing. Each component can validate data as needed. Test case implementations provide runtime type safety.

### Q: How do we prevent event name collisions?

**A:** Context via `source` field and `meta.automatorId`. Different subsystems can use same event names - disambiguation via source.

For explicit namespacing, can use dot notation:
- `devtools.req_test_case`
- `background.req_capture`

But currently not needed - just `req_test_case` with different `source` values.

### Q: Can this packet structure be used beyond DevTools?

**A:** Yes! That's the point. Generic enough for:
- DevTools ↔ Content
- Background ↔ Content
- Content ↔ WebSocket Server
- Any inter-component communication

Each domain uses `meta` for domain-specific fields:
- DevTools: `{ automatorId }`
- Background: `{ tabId }`
- Server: `{ sessionId }`

### Q: How does message correlation work (request/response pairing)?

**A:** Each packet has unique `messageId`. For correlation:
- Request: `messageId: "abc123"`
- Response: Can include in `meta: { correlationId: "abc123" }`

Currently not needed - browser API handles this via `sendResponse()` callback.

### Q: What about backwards compatibility during migration?

**A:** Direct replacement approach - no gradual migration. Both content script and DevTools panel updated together. Extension updates atomically.

If gradual migration needed, could:
1. Support both formats temporarily
2. Add adapter layer to convert between old/new
3. Update sender first, receiver second
4. Remove compatibility layer

But for this codebase, direct replacement is simpler.

## File Changes

### New File
- `/src/lib/types/packet.ts` - Base Packet type definition

### Modified Files
- `/src/lib/types/devtools-messages.ts` - Add Packet-based types, keep old types for reference
- `/src/entrypoints/content.ts` - Update message sending/receiving
- `/src/entrypoints/devtools-panel/AppV4.svelte` - Update message handling

### Unchanged Files
All other files remain untouched. Packet system is opt-in for other subsystems.

## Benefits

1. **Minimal API**: Just 2 events instead of 13
2. **Flexible**: Any feature can be a test case
3. **Extensible**: Add tests without changing types
4. **Reusable**: Packet structure works across entire system
5. **Simple**: No complex type hierarchies
6. **Future-proof**: Easy to add new capabilities

## Trade-offs

1. **Less type safety**: Flexible `any` types vs. strict discriminated unions
2. **Runtime validation needed**: Components must validate data shapes
3. **Implicit contracts**: Test case names and data structures documented separately
4. **Less IDE support**: No autocomplete for test case names (vs. union types)

The flexibility gains outweigh the type safety losses for this use case.

## Next Steps

1. Create `/src/lib/types/packet.ts`
2. Update `/src/lib/types/devtools-messages.ts` with Packet-based types
3. Refactor content script to use Packet format
4. Refactor DevTools panel to use Packet format
5. Test thoroughly in multi-tab scenarios
6. Update other subsystems to adopt Packet if desired

## References

Current implementation:
- `/src/lib/types/devtools-messages.ts` - Old message types
- `/src/entrypoints/content.ts` - Message sending (lines 138-394)
- `/src/entrypoints/devtools-panel/AppV4.svelte` - Message handling (lines 54-272)
