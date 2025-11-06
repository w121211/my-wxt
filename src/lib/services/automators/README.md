# AI Assistant Automators

Chrome extension-compatible automators for interacting with AI assistant platforms (ChatGPT, Claude, Gemini, Grok).

## Overview

This module provides a unified interface (`AssistantExtractor`) for automating interactions with AI chat platforms. Each platform has its own extractor implementation that handles platform-specific DOM selectors and behavior.

**Migrated from:** Playwright-based automators in `tmp/src/tasks/aichat/`
**Adapted for:** Chrome extension content scripts using native DOM APIs

## Architecture

### Core Components

1. **Automator** - Platform-specific automation logic
   - `chatgpt-extractor.ts` - ChatGPT/OpenAI
   - `claude-extractor.ts` - Claude.ai (Anthropic)
   - `gemini-extractor.ts` - Google Gemini
   - `grok-extractor.ts` - Grok (X/Twitter)

2. **Selector Specifications** (`specs/`) - CSS selectors for each platform
   - Organized by platform
   - Support fallback selector chains
   - Easy to update when UI changes

3. **Utilities**
   - `utils/selectors.ts` - DOM manipulation helpers (replaces Playwright)
   - `utils/stream-observer.ts` - Streaming response monitoring

4. **Types** (`types.ts`) - Spec format definitions

## Usage

### Basic Usage

```typescript
import { createExtractor } from '@/lib/automators';

// Create extractor for specific platform
const extractor = createExtractor('chatgpt');

// Wait for login
const loginState = await extractor.waitForLoggedIn();
console.log('Logged in:', loginState.authenticated);

// Get chat list
const chats = await extractor.extractChatList();
console.log('Recent chats:', chats);

// Send a prompt and watch response
await extractor.sendPrompt({
  promptId: 'unique-id-123',
  prompt: 'What is the meaning of life?',
});

const response = await extractor.watchResponse(
  { promptId: 'unique-id-123', prompt: '...' },
  (delta) => {
    console.log('Streaming:', delta.markdown);
  }
);
```

### Auto-detect Platform

```typescript
import { createExtractorForCurrentPage } from '@/lib/automators';

// Automatically detect platform from current URL
const extractor = createExtractorForCurrentPage();

if (extractor) {
  const loginState = await extractor.waitForLoggedIn();
}
```

## AssistantExtractor Interface

All extractors implement this interface from `@/lib/types/assistants.ts`:

```typescript
interface AssistantExtractor {
  // Authentication
  waitForLoggedIn(options: LoginWaitOptions): Promise<LoginState>;

  // Chat management
  extractChatList(): Promise<readonly ChatSummary[]>;
  openChat(target: ChatTarget): Promise<void>;
  extractChat(target: ChatTarget): Promise<ChatDetails>;

  // Messaging
  sendPrompt(request: PromptSubmission): Promise<void>;
  watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse>;
}
```

## Selector Specifications

Each platform has a recipe file defining CSS selectors:

```typescript
// Example: specs/chatgpt.ts
export const chatgptSpec: AssistantSpec = {
  id: 'chatgpt',
  urlPattern: [/^https?:\/\/chatgpt\.com\//],
  selectors: {
    loginIndicator: 'button[data-testid="profile-button"]',
    messageBlocks: 'div[data-message-author-role]',
    messageInput: 'textarea#prompt-textarea',
    submitButton: 'button[data-testid="send-button"]',
    // ... more selectors
  },
  config: {
    defaultTimeout: 30000,
    pollInterval: 100,
  },
};
```

### Updating Selectors

When AI platforms update their UI, update the corresponding spec file:

1. Open DevTools on the platform
2. Inspect the element
3. Copy CSS selector
4. Update `specs/{platform}.ts`
5. Use fallback arrays for robustness:

```typescript
messageInput: [
  'textarea#prompt-textarea',  // Current selector
  'textarea[data-id="root"]',  // Fallback 1
  'textarea[placeholder*="Message"]', // Fallback 2
]
```

## Platform-Specific Notes

### ChatGPT
- Uses `data-message-author-role` for message roles
- Message IDs available in `data-message-id` attribute
- Streaming indicator: "Stop generating" button

### Claude
- Uses contenteditable div for input
- Role attribute: `data-role`
- Clean markdown rendering in `.prose` containers

### Gemini
- May use `rich-textarea` custom element
- Role normalized: `model` → `assistant`
- Angular Material components (mat-spinner, etc.)

### Grok
- **Unique nested structure**: One block can contain multiple messages
- User messages can be arrays (follow-ups)
- Requires special parsing (see `grok-extractor.ts:parseGrokMessageBlock`)

## Migration from Playwright

### Key Changes

| Playwright API | Chrome Extension Equivalent |
|----------------|----------------------------|
| `page.locator(selector)` | `querySelector(selector)` |
| `locator.click()` | `click(element)` |
| `locator.fill(text)` | `fill(element, text)` |
| `locator.waitFor()` | `waitForElement(selector)` |
| `locator.textContent()` | `getText(element)` |

### What We Kept

✅ Spec-driven selector configuration
✅ Fallback selector chains
✅ Platform-specific customization (like Grok's message parsing)
✅ State checking patterns

### What We Improved

✨ Direct `AssistantExtractor` implementation (no adapter layer)
✨ Shared streaming utility (`StreamObserver`)
✨ Simpler, more readable code
✨ Native DOM APIs (faster, no dependencies)

## Debugging

### Enable Logging

```typescript
// In extractor methods, add console logs:
console.log('Waiting for element:', selector);
console.log('Found:', element);
```

### Test Selectors in DevTools

```javascript
// Open console on AI platform:
document.querySelector('div[data-message-author-role]')
document.querySelectorAll('div[data-message-author-role]').length
```

### Common Issues

1. **Selector not found**
   - UI changed → Update spec
   - Add more fallbacks in selector array

2. **Timeout waiting for element**
   - Increase timeout in options
   - Check if element actually appears in UI

3. **Streaming not working**
   - Verify `generatingIndicator` selector
   - Check if `streamingMessage` selector is correct
   - Monitor MutationObserver events

## Testing

To test an extractor in the browser console:

```javascript
// Inject from content script
import { createExtractorForCurrentPage } from '@/lib/automators';

const extractor = createExtractorForCurrentPage();

// Test login detection
extractor.waitForLoggedIn({ timeoutMs: 5000 })
  .then(state => console.log('Login state:', state));

// Test message extraction
extractor.extractChat({ id: 'current' })
  .then(chat => console.log('Messages:', chat.messages));
```

## Future Improvements

- [ ] Add retry logic for transient failures
- [ ] Implement caching for extracted data
- [ ] Add performance metrics
- [ ] Support custom selector overrides
- [ ] Add visual regression testing for selectors
