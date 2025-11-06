# Architecture Overview

This document describes the architecture of the browser extension automator system.

## Core Concepts

### Automator
A site-specific module that owns:
- **URL patterns** (`matches`) to determine when it activates
- **Selectors** for DOM element references
- **Actions** - async functions that perform operations on the page
- **Watchers** - observers that emit events when page state changes
- **Type-safe API** - self-defined contract via TypeScript

### WebSocket Protocol
A minimal typed envelope protocol for communication:
- **Message kinds**: `hello`, `request`, `response`, `event`, `error`, `bye`
- **Namespaced methods**: Each automator defines its own API surface
- **Page sessions**: Living binding between tab/frame and automator (`tabId:frameId:slug`)

### Architecture Flow

```
External App (WebSocket Client)
         ↕ (WebSocket)
Background Script (Router)
         ↕ (chrome.runtime Port)
Content Script (Automator Manager)
         ↕ (DOM)
   Web Page (ChatGPT, Grok, etc.)
```

## Directory Structure

```
src/
├── lib/
│   ├── ws/
│   │   ├── types.ts          # Protocol message types
│   │   ├── derive.ts         # Request/Event type derivation helpers
│   │   └── client.ts         # WebSocket client with reconnection
│   ├── automators/
│   │   ├── types.ts          # Core automator types
│   │   ├── registry.ts       # Central registry of all automators
│   │   ├── chatgpt.types.ts  # ChatGPT API contract
│   │   ├── chatgpt.ts        # ChatGPT automator implementation
│   │   ├── grok.types.ts     # Grok API contract
│   │   ├── gemini.types.ts   # Gemini API contract
│   │   └── claude.types.ts   # Claude API contract
│   ├── matcher/
│   │   ├── types.ts          # Matching types
│   │   └── index.ts          # URL pattern matcher with specificity scoring
│   ├── runtime/
│   │   └── types.ts          # Background ↔ Content message types
│   ├── api/
│   │   └── unions.ts         # Top-level API unions (all automators)
│   └── utils/
│       └── logger.ts         # Logger utility
└── entrypoints/
    ├── background/
    │   └── index.ts          # Background service (WebSocket + routing)
    └── content/
        └── index.ts          # Content script (automator lifecycle)
```

## Message Flow

### Startup
1. **Background** connects to WebSocket server, sends `hello`
2. **Content** loads on each page, matches automators by URL
3. **Content** connects to **Background** via `chrome.runtime.connect()`
4. **Content** starts watchers, sends `automator.started` + `page.online` events

### Request/Response
1. **External App** → **Background**: WebSocket `request` message
2. **Background** finds target session by automator slug + page ref
3. **Background** → **Content**: `BgRunAction` message via Port
4. **Content** executes action, returns result
5. **Content** → **Background**: `CtActionResult` or `CtActionError`
6. **Background** → **External App**: WebSocket `response` or `error`

### Events (Watchers)
1. **Content** watchers emit events (e.g., `watcher.chatUpdates`)
2. **Content** → **Background**: `CtWatcherEvent` via Port
3. **Background** → **External App**: WebSocket `event` message

### Teardown
1. **Content** unloads (navigation/close)
2. **Content** stops watchers, sends `automator.stopped` + `page.offline`
3. **Background** removes session from registry

## URL Matching & Specificity

The matcher scores URL patterns with higher scores for:
- Exact scheme (`https://` > `*://`)
- Exact host (`site.com` > `*.site.com`)
- Longer paths and literal segments (`/grok/c/*` > `/grok/*`)

If multiple automators tie with the same score, throws `MULTIPLE_MATCH` error.

## Type Safety

### Shared Types
Both the extension and external apps import the same type definitions:
- Protocol types from `src/lib/ws/types.ts`
- Automator API types from `src/lib/automators/*.types.ts`
- Type derivation helpers from `src/lib/ws/derive.ts`

### Example: External App Usage

```typescript
import type { ChatGptApi, ChatGptSlug } from '@mywxt/protocol/automators/chatgpt.types';
import type { ActionParams, ActionResult } from '@mywxt/protocol/automators/types';

// Type-safe request builder
async function callChatGpt<T extends keyof ChatGptApi['actions']>(
  name: T,
  params: ActionParams<ChatGptApi['actions'][T]>
): Promise<ActionResult<ChatGptApi['actions'][T]>> {
  // Implementation...
}

// Usage with full IntelliSense
const result = await callChatGpt('sendPrompt', { prompt: 'Hello!' });
// result: { reply: string; conversationId: string }
```

## Error Codes

- `NO_AUTOMATOR` - Unknown automator slug
- `MULTIPLE_MATCH` - Multiple automators matched with equal specificity
- `AMBIGUOUS_PAGE` - Multiple sessions match, page targeting required
- `NO_SESSION` - No active session for requested automator/page
- `TIMEOUT` - Action exceeded timeout
- `BAD_PARAMS` - Invalid action parameters
- `VERSION_MISMATCH` - Protocol version incompatibility
- `ACTION_FAILED` - Action threw an error

## Adding a New Automator

1. Create type definition: `src/lib/automators/<slug>.types.ts`
2. Implement automator: `src/lib/automators/<slug>.ts`
3. Register in `src/lib/automators/registry.ts`
4. Add to unions in `src/lib/api/unions.ts`
5. Update external app to import new types

## Configuration

### WebSocket Server URL
Configured in `src/entrypoints/background/index.ts`:

```typescript
this.wsClient = new WsClient({
  url: 'ws://localhost:8080',
  reconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
});
```

## Development

### Building
```bash
npm run dev        # Development mode with HMR
npm run build      # Production build
```

### Testing
Content scripts can be tested by loading the extension and navigating to supported sites (ChatGPT, Grok, etc.)

### Logging
All components use structured logging via `createLogger()`:
- `[bg]` - Background service
- `[ws:client]` - WebSocket client
- `[content]` - Content script
- `[action:<slug>:<name>]` - Action execution
- `[watcher:<slug>]` - Watcher lifecycle

## Design Decisions

### Single Content Entrypoint
- One content script matches `<all_urls>` and loads appropriate automators
- Simpler than multiple entrypoints with per-automator `matches`
- Automators idle when not needed

### Types-Only Validation
- No runtime schema validation in MVP
- Both sides enforce contract via TypeScript
- Strict discipline required on external app

### No Capability Handshake
- External app imports shared types as source of truth
- Version lock both sides to same types package
- Discovery happens at compile-time, not runtime

### Hybrid API Model
- Minimal common envelope + automator-specific methods
- Each automator defines its own domain operations
- External app responsible for mapping automators
