# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Commands

### Development
- `npm run dev` — Start WXT dev server in Chromium with hot reload
- `npm run dev:firefox` — Start WXT dev server in Firefox
- `npm run check` — Run Svelte and TypeScript validation (run before committing)
- `npm run build` — Production build to `.output/`
- `npm run build:firefox` — Production build for Firefox
- `npm run zip` — Package extension as distributable zip
- `npm run zip:firefox` — Package Firefox-specific zip

### Development Server Scripts
- `node scripts/dev-ws-server.mjs` — Run websocket bridge server for external integration testing
- `node scripts/dev-ws-server-v1.mjs` — Legacy version of websocket server

## Architecture

This is a browser extension built with WXT that captures and extracts chat data from AI assistant websites (ChatGPT, Claude, Gemini, Grok). It follows a three-layer architecture: background service worker, content scripts, and popup UI.

### Entrypoint Flow

**background.ts** — Service worker that coordinates all extension activities:
- Instantiates `RecorderService` for fixture capture
- Manages `WebsocketClient` + `WebsocketRouter` for external bridge communication
- Routes messages between content scripts, popup, and websocket server
- Listens for tab updates to trigger recorder captures

**content.ts** — Injected into assistant pages:
- Detects assistant from hostname using `detectAssistantFromHost`
- Resolves assistant-specific extractors via `resolveExtractor`
- Sends notifications (login state, chat list, chat details, deltas, responses) to background
- Handles commands from background (extract chat list, extract chat, process prompt, capture fixture)

**popup/App.svelte** — UI for recorder control:
- Displays recorder state (recording on/off, fixtures count)
- Sends requests to background via `browser.runtime.sendMessage`
- Downloads fixture archive as zip via `RecorderService`

### Core Services

**RecorderService** (`src/lib/services/recorder/service.ts`):
- Manages recording state and fixture storage (browser.storage.local)
- Handles popup requests (get state, set recording, clear fixtures, download archive)
- Broadcasts state updates to popup
- Caps fixtures at 50 items, stores newest first

**WebsocketClient** (`src/lib/services/websocket/client.ts`):
- Connects to local websocket server (default port 3456)
- Auto-reconnects with exponential backoff
- Sends extension messages (notifications, status) to server
- Receives server commands and passes to router

**WebsocketRouter** (`src/lib/services/websocket/router.ts`):
- Handles server messages (hello, close, request-list, request-details, submit-prompt)
- Manages assistant tab discovery and creation
- Dispatches commands to content scripts
- Tracks pending prompts by promptId

### Assistant System

**AssistantExtractor interface** (`src/lib/types/assistants.ts`):
Defines contract for all assistant integrations:
- `waitForLoggedIn` — Poll for authentication state
- `extractChatList` — Scrape chat history
- `extractChat` — Scrape single conversation
- `sendPrompt` — Submit user prompt
- `watchResponse` — Stream assistant response with deltas
- `openChat` — Navigate to specific chat URL

**Extractor registry** (`src/lib/assistants/registry.ts`):
Maps assistant IDs to extractor factory functions. ChatGPT and Gemini have implementations; Claude and Grok throw "not implemented" errors.

**Host detection** (`src/lib/assistants/hosts.ts`):
Pattern-matches URLs to assistant IDs:
- `chatgpt.com`, `chat.openai.com` → chatgpt
- `claude.ai` → claude
- `gemini.google.com` → gemini
- `grok.com` → grok

### Message Protocol

All communication uses discriminated unions typed in `src/lib/types/runtime.ts`:

**BackgroundToContentCommand**: recorder:capture, assistant:extract-chat-list, assistant:extract-chat, assistant:process-prompt

**ContentToBackgroundNotification**: assistant:login-state, chat:list, chat:details, chat:delta, chat:response, chat:error, recorder:fixture

**PopupToBackgroundRequest**: recorder:get-state, recorder:set-recording, recorder:clear-fixtures, recorder:download-all, recorder:get-fixture

**BackgroundToPopupBroadcast**: recorder:state-updated

Messages include `assistantId` for routing and `payload` for data. Popup requests expect synchronous `sendResponse` callbacks.

### Type System

Domain types in `src/lib/types/` are organized by concern:
- `assistants.ts` — Assistant identity, login state, chat models, prompt submission, extractor interface
- `runtime.ts` — Internal message protocol
- `websocket.ts` — External bridge protocol
- `recorder.ts` — Fixture capture models

All types use readonly properties. Avoid `as` assertions.

### File Organization

- `src/entrypoints/` — WXT entry points (background, content, popup)
- `src/lib/assistants/` — Assistant detection, registry, extractors
- `src/lib/services/` — RecorderService, WebsocketClient, WebsocketRouter
- `src/lib/types/` — Domain and protocol types
- `src/lib/components/` — Reusable Svelte components
- `src/lib/store/` — Svelte stores (if any)
- `src/assets/` — Static images/icons
- `public/` — Files copied verbatim to bundle

### Development Notes

- WXT auto-generates `wxt-env.d.ts` and `.output/` — do not edit manually
- Content scripts run on `chatgpt.com`, `claude.ai`, `gemini.google.com`, `grok.com` (see `content.ts` matches)
- Extractor implementations may be missing; content script logs "extractor not implemented" warning
- Websocket bridge is optional for development; extension works standalone
- Use `browser` from `wxt/browser` (Polyfill for cross-browser compatibility)
