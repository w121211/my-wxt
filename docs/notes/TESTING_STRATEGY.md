# AI Automator Testing Strategy & Inspector Tool

## Initial Question
**User asked**: How to test automators? Propose strategies.

## Initial Response: Traditional Testing Strategies
I proposed a comprehensive testing pyramid:
1. **Unit Testing (60%)** - Test selector utilities, specs, StreamObserver in isolation
2. **Integration Testing (30%)** - Test extractors with mocked DOM using Vitest/jsdom
3. **E2E Testing (10%)** - Test against real platforms with Playwright
4. Additional strategies: Visual regression, manual checklists, property-based testing, continuous monitoring

**Recommended stack**: Vitest, jsdom, Playwright, @testing-library/dom

---

## User's Counter-Proposal: Live Inspector Tool

**User proposed**: Instead of traditional tests, build an in-extension inspector that shows:
1. Matched spec via URL detection
2. Selector test results (auto-computed)
3. Automator function results (auto for read-only, manual for interactions)
4. Display in sidebar panel

### Q&A: Why This Approach?

**Q**: Why prefer live inspection over unit tests?

**A**:
- ✅ Tests against **real, live DOM** (not mocked)
- ✅ **Instant feedback** when platforms update UI
- ✅ **Visual debugging** - can highlight matched elements
- ✅ **No separate test setup** needed
- ✅ Exposes **real user scenarios** that mocks miss
- ✅ Works for both developers and QA testers

**My analysis**: Brilliant approach - essentially building a debugging/testing UI right into the extension.

---

## Q&A #1: DevTools Panel vs Sidebar Panel?

**Q**: Where should results be displayed? Sidebar panel suggested, or better alternatives?

**A**:
**Recommended**: **DevTools Panel** (better than sidebar)

### Why DevTools Panel > Sidebar?
- ✅ Doesn't obstruct page content
- ✅ Familiar developer workflow (F12 → inspect)
- ✅ More space for detailed results
- ✅ Can be hidden when not needed
- ✅ Chrome DevTools Protocol access

### Sidebar Advantage:
- ✅ Can stay visible while interacting with page (live monitoring)

**Best Solution**: **Both!**
- DevTools Panel for detailed inspection
- Optional sidebar toggle for live monitoring

---

## Q&A #2: Auto-compute vs On-Demand?

**Q**: Should results be computed automatically or on demand?

**A**: **Hybrid approach** (user's proposal was perfect):

| Function Type | Strategy | Reason |
|--------------|----------|--------|
| **Selectors** | Auto (on page load + DOM mutation) | Fast, no side effects |
| **waitForLoggedIn()** | Auto | Read-only, safe |
| **extractChatList()** | Auto | Read-only, safe |
| **extractChat()** | Auto | Read-only, safe |
| **sendPrompt()** | Manual trigger | Writes data, user should control |
| **watchResponse()** | Manual trigger | Needs prompt first |
| **openChat()** | Manual trigger | Navigation, disruptive |

**Optimization**: Debounce auto-tests, cache results for 2-3s, allow manual "Refresh All"

---

## Q&A #3: URL Matching - Regex vs Glob?

**Q**: User prefers `urlGlob` over `urlPattern` (regex). Is this better?

**A**: **Yes, excellent choice!**

### Before (regex - complex):
```typescript
urlPattern: [/^https?:\/\/chatgpt\.com\//]
```

### After (glob - readable):
```typescript
urlGlob: [
  'https://chatgpt.com/**',
  'https://*.chatgpt.com/**'
]
```

**Implementation**: Use `minimatch` or `picomatch` library

**Benefits**:
- More intuitive for non-regex users
- Easier to maintain
- Common pattern in build tools (webpack, vite)
- Still powerful enough for URL matching

---

## Q&A #4: Download Page Snapshot

**Q**: Want to download current page snapshot including:
1. HTML (rendered, not source)
2. Page metadata (URL, title, etc.)
3. Spec selector results
4. Automator function results

**Follow-up Q**: Does Chrome support downloading content other than HTML?

**A**: **Yes!** Chrome supports multiple formats via `chrome.downloads.download()`:
- ✅ Text files (.txt)
- ✅ JSON files (.json)
- ✅ HTML files (.html)
- ✅ **ZIP files (.zip)** - Perfect for bundling!
- ✅ Any Blob/ArrayBuffer data
- ✅ Base64-encoded data URLs

### Recommended Format: **ZIP file**

```
snapshot-chatgpt-2025-11-05-19-30-45.zip
├── page.html              # Rendered HTML (document.documentElement.outerHTML)
├── metadata.json          # URL, title, timestamp, userAgent
├── selectors-result.json  # All selector test results
├── functions-result.json  # Automator function results
└── screenshot.png         # (Optional) Visual snapshot
```

**Implementation**: Use `jszip` library (already in dependencies!)

**Alternative**: Single JSON file (simpler, but larger)

---

## Q&A #5: Multiple Specs Matching

**Q**: What if multiple specs match the same URL? (Rare but possible)

**A**: **Must handle this!** Examples:
- Test vs prod environments
- Subdomain variations (claude.ai vs console.anthropic.com)
- Future A/B testing of extractors

### UI Solution: **Tabbed Interface**

```
┌─ AI Automator Inspector ─────────────────┐
│ ⚡ Multiple specs matched (2)            │
│                                           │
│ [ChatGPT ⭐] [ChatGPT-Test]              │ ← Tabs
│                                           │
│ (Show results for active tab)            │
│                                           │
│ [Compare All Specs] button               │
└───────────────────────────────────────────┘
```

### Priority System:
```typescript
export interface AssistantSpec {
  id: string;
  urlGlob: string | string[];
  priority?: number; // Higher = preferred (default: 0)
  config?: {
    isPrimary?: boolean; // Mark primary spec
  };
}
```

### Features for Multi-Spec:
1. **Single spec**: Show full-width results
2. **Multiple specs**: Tabbed interface, show active spec
3. **Comparison view**: Side-by-side table comparing all specs
4. **Download options**:
   - Download single spec snapshot
   - Download all snapshots (separate files)
   - Download comparison report

---

## Final Architecture Summary

### File Structure
```
src/
├── entrypoints/
│   ├── devtools.html              # DevTools entry point
│   ├── devtools.ts                # Register panel
│   └── devtools-panel/
│       ├── panel.html             # Main panel UI
│       ├── panel.ts               # Panel logic
│       └── components/
│           ├── SpecInspector.svelte
│           ├── SelectorResults.svelte
│           ├── FunctionRunner.svelte
│           ├── CompareSpecs.svelte
│           └── DownloadButton.svelte
│
├── lib/
│   ├── automators/                # (existing)
│   └── inspector/
│       ├── spec-matcher.ts        # URL glob matching
│       ├── selector-tester.ts     # Test all selectors
│       ├── function-runner.ts     # Run extractor functions
│       ├── snapshot.ts            # Capture page snapshot
│       ├── downloader.ts          # Download ZIP/JSON
│       └── highlighter.ts         # Highlight elements on page
```

### Key Features
1. ✅ **Auto-detect platform** via URL glob matching
2. ✅ **Test all selectors** automatically on page load
3. ✅ **Highlight matched elements** on page (overlay)
4. ✅ **Run safe extractors** automatically
5. ✅ **Manual trigger** for interactive functions
6. ✅ **Download snapshot** as ZIP (HTML + JSON + screenshot)
7. ✅ **Multi-spec support** with tabbed UI
8. ✅ **Comparison view** for multiple specs
9. ✅ **Export test reports** for documentation/CI

### Type Changes
```typescript
// Old
export interface AssistantSpec {
  urlPattern: string | RegExp | Array<string | RegExp>; // ❌
}

// New
export interface AssistantSpec {
  id: string;
  urlGlob: string | string[]; // ✅ More intuitive
  priority?: number; // ✅ Handle multi-match
  selectors: AssistantSelectors;
  config?: {
    isPrimary?: boolean;
    // ...
  };
}
```

---

## Why This Approach is Superior

| Traditional Testing | Live Inspector Tool |
|---------------------|---------------------|
| Mocked DOM | Real, live DOM |
| Runs in CI only | Always available during development |
| Separate test files | Integrated in extension |
| Delayed feedback | Instant visual feedback |
| Requires test maintenance | Self-updating (tests what you see) |
| Developers only | Developers + QA + power users |

---

## Implementation Priority

1. **Phase 1** (MVP): DevTools panel with single spec support
2. **Phase 2**: Auto-test selectors + safe functions
3. **Phase 3**: Manual function triggers
4. **Phase 4**: Download snapshot (ZIP)
5. **Phase 5**: Multi-spec support + comparison view
6. **Phase 6** (Optional): Sidebar panel for live monitoring

---

## UI Mockups

### DevTools Panel: Spec Detection Display

```
┌─ DevTools: AI Automator Inspector ─────────────────┐
│                                                     │
│ 🎯 Detected Platform: ChatGPT                      │
│ 📍 URL: https://chatgpt.com/c/abc-123              │
│ ✅ Spec Matched: chatgptSpec                       │
│                                                     │
│ Pattern matched: https://chatgpt.com/**            │
└─────────────────────────────────────────────────────┘
```

### Selector Results (Auto-computed)

```
┌─ Selectors ─────────────────────────────────────────┐
│                                                     │
│ ✅ loginIndicator                                   │
│    button[data-testid="profile-button"]            │
│    → Found 1 element                                │
│    [Highlight] [Inspect] [Copy Selector]          │
│                                                     │
│ ✅ messageBlocks                                    │
│    div[data-message-author-role]                   │
│    → Found 12 elements                              │
│    [Highlight All] [Inspect First]                 │
│                                                     │
│ ⚠️  chatItems                                       │
│    nav a[href*="/c/"]                              │
│    → Found 0 elements (may need to open sidebar)   │
│    [Show Expected Location]                        │
│                                                     │
│ ❌ modelSelector                                    │
│    button[data-testid="model-switcher"]            │
│    → Not found - possible UI change!               │
│    [Report Issue] [Update Selector]                │
└─────────────────────────────────────────────────────┘
```

### Function Results

#### Non-interactive (Auto-run):
```
┌─ Extractor Functions (Auto) ────────────────────────┐
│                                                     │
│ ✅ extractChatList()                                │
│    → Found 15 chats                                 │
│    [View Data] [Copy JSON]                         │
│                                                     │
│ ✅ extractChat({ id: 'current' })                   │
│    → 8 messages (4 user, 4 assistant)              │
│    [View Messages] [Copy JSON]                     │
│                                                     │
│ ✅ waitForLoggedIn()                                │
│    → authenticated: true                            │
│    → defaultModelId: "GPT-4"                       │
│    [View Full State]                                │
└─────────────────────────────────────────────────────┘
```

#### Interactive (On-demand):
```
┌─ Interactive Functions (Manual) ────────────────────┐
│                                                     │
│ 🔵 sendPrompt()                                     │
│    ┌─────────────────────────────────────────────┐ │
│    │ Test prompt: [Hello, can you help?____]    │ │
│    └─────────────────────────────────────────────┘ │
│    [▶️ Test Send]                                   │
│                                                     │
│ 🔵 watchResponse()                                  │
│    [▶️ Start Watching] (monitors next response)     │
│                                                     │
│ 🔵 openChat()                                       │
│    Chat ID: [_________________]                     │
│    [▶️ Test Navigation]                             │
└─────────────────────────────────────────────────────┘
```

### Download Button Placement

```
┌─ Inspector Header ──────────────────────────────────┐
│ 🎯 chatgpt | https://chatgpt.com/c/abc-123         │
│                                                     │
│ [🔄 Refresh]  [📥 Download Snapshot]  [📦 All (2)] │
└─────────────────────────────────────────────────────┘
```

---

## Implementation Details

### Core Logic: `spec-matcher.ts`

```typescript
import { minimatch } from 'minimatch';
import type { AssistantSpec } from './types';

export function matchSpec(url: string, specs: AssistantSpec[]): AssistantSpec[] {
  const matched: AssistantSpec[] = [];

  for (const spec of specs) {
    const patterns = Array.isArray(spec.urlGlob) ? spec.urlGlob : [spec.urlGlob];

    for (const pattern of patterns) {
      if (minimatch(url, pattern)) {
        matched.push(spec);
        break;
      }
    }
  }

  // Sort by priority (higher first)
  return matched.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
}
```

### Core Logic: `selector-tester.ts`

```typescript
export interface SelectorTestResult {
  name: string;
  selector: string | string[];
  status: 'found' | 'empty' | 'not-found';
  count: number;
  elements?: HTMLElement[];
  usedFallback?: boolean;
}

export function testAllSelectors(spec: AssistantSpec): SelectorTestResult[] {
  const results: SelectorTestResult[] = [];

  for (const [name, selector] of Object.entries(spec.selectors)) {
    const elements = querySelectorAll(selector);

    results.push({
      name,
      selector,
      status: elements.length > 0 ? 'found' : 'not-found',
      count: elements.length,
      elements: Array.from(elements),
    });
  }

  return results;
}
```

### Core Logic: `function-runner.ts`

```typescript
export interface FunctionTestResult {
  name: string;
  type: 'auto' | 'manual';
  status: 'success' | 'error' | 'pending';
  data?: any;
  error?: string;
  duration?: number;
}

export async function runAutoFunctions(
  extractor: AssistantExtractor
): Promise<FunctionTestResult[]> {
  const results: FunctionTestResult[] = [];

  // Test waitForLoggedIn
  try {
    const start = Date.now();
    const loginState = await extractor.waitForLoggedIn({ timeoutMs: 5000 });
    results.push({
      name: 'waitForLoggedIn',
      type: 'auto',
      status: 'success',
      data: loginState,
      duration: Date.now() - start,
    });
  } catch (error) {
    results.push({
      name: 'waitForLoggedIn',
      type: 'auto',
      status: 'error',
      error: error.message,
    });
  }

  // Test extractChatList
  try {
    const start = Date.now();
    const chats = await extractor.extractChatList();
    results.push({
      name: 'extractChatList',
      type: 'auto',
      status: 'success',
      data: chats,
      duration: Date.now() - start,
    });
  } catch (error) {
    results.push({
      name: 'extractChatList',
      type: 'auto',
      status: 'error',
      error: error.message,
    });
  }

  // Test extractChat
  try {
    const start = Date.now();
    const chat = await extractor.extractChat({ id: 'current' });
    results.push({
      name: 'extractChat',
      type: 'auto',
      status: 'success',
      data: chat,
      duration: Date.now() - start,
    });
  } catch (error) {
    results.push({
      name: 'extractChat',
      type: 'auto',
      status: 'error',
      error: error.message,
    });
  }

  return results;
}
```

### Core Logic: `snapshot.ts`

```typescript
export interface PageSnapshot {
  metadata: {
    url: string;
    title: string;
    timestamp: string;
    platform: string;
    specId: string;
    userAgent: string;
  };
  html: string; // Rendered HTML (document.documentElement.outerHTML)
  selectorsResult: SelectorTestResult[];
  functionsResult: FunctionTestResult[];
  screenshot?: string; // Base64 PNG (optional)
}

export async function capturePageSnapshot(
  specId: string,
  selectorsResult: SelectorTestResult[],
  functionsResult: FunctionTestResult[]
): Promise<PageSnapshot> {
  return {
    metadata: {
      url: window.location.href,
      title: document.title,
      timestamp: new Date().toISOString(),
      platform: navigator.platform,
      specId,
      userAgent: navigator.userAgent,
    },
    html: document.documentElement.outerHTML,
    selectorsResult,
    functionsResult,
    screenshot: await captureScreenshot(), // Optional
  };
}

async function captureScreenshot(): Promise<string | undefined> {
  try {
    // Use chrome.tabs.captureVisibleTab from background script
    return await chrome.runtime.sendMessage({ type: 'CAPTURE_SCREENSHOT' });
  } catch {
    return undefined;
  }
}
```

### Core Logic: `downloader.ts`

```typescript
import JSZip from 'jszip';

export async function downloadSnapshot(snapshot: PageSnapshot): Promise<void> {
  const zip = new JSZip();

  // Add files to ZIP
  zip.file('page.html', snapshot.html);
  zip.file('metadata.json', JSON.stringify(snapshot.metadata, null, 2));
  zip.file('selectors-result.json', JSON.stringify(snapshot.selectorsResult, null, 2));
  zip.file('functions-result.json', JSON.stringify(snapshot.functionsResult, null, 2));

  if (snapshot.screenshot) {
    // Convert base64 to binary
    const base64Data = snapshot.screenshot.split(',')[1];
    zip.file('screenshot.png', base64Data, { base64: true });
  }

  // Generate ZIP blob
  const blob = await zip.generateAsync({ type: 'blob' });

  // Trigger download
  const filename = `snapshot-${snapshot.metadata.specId}-${Date.now()}.zip`;
  const url = URL.createObjectURL(blob);

  await chrome.downloads.download({
    url,
    filename,
    saveAs: true, // Let user choose location
  });

  // Clean up
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
```

### Communication Pattern

```typescript
// Content Script → DevTools Panel
chrome.runtime.sendMessage({
  type: 'SELECTOR_TEST_RESULT',
  results: selectorResults,
  timestamp: Date.now(),
});

// DevTools Panel → Content Script
chrome.tabs.sendMessage(tabId, {
  type: 'RUN_FUNCTION_TEST',
  function: 'sendPrompt',
  params: { prompt: 'Hello' },
});

// Content Script → DevTools Panel
chrome.runtime.sendMessage({
  type: 'FUNCTION_TEST_RESULT',
  function: 'sendPrompt',
  status: 'success',
});
```

---

## Recommended Features

### Must-Have Features:
1. ✅ **Auto-detect platform** from URL
2. ✅ **Test all selectors** on page load
3. ✅ **Highlight matched elements** (overlay on page)
4. ✅ **Run safe extractors** automatically
5. ✅ **Manual trigger** for interactive functions
6. ✅ **Copy results** as JSON
7. ✅ **Export test report** (for CI/documentation)

### Nice-to-Have Features:
1. 🎨 **Visual diff** - Compare current DOM structure vs expected
2. 📊 **History** - Track selector health over time
3. 🔔 **Alerts** - Notify when selectors break
4. 🎬 **Record interactions** - Generate test scripts automatically
5. 🔧 **Selector editor** - Update specs directly from panel
6. 📸 **Screenshot failing elements** - Visual bug reports
7. ⚡ **Live mode** - Re-run tests on DOM mutations

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Performance impact | Debounce, run only when DevTools open |
| False positives | Add "expected conditions" (e.g., chat sidebar might be closed) |
| Security | Don't send sensitive data to panel, just metadata |
| Platform detection | Test multiple URL patterns, allow manual override |

---

## Conclusion

The user's proposal to build a **live inspector tool** is **innovative and practical**:
- Solves real pain points (platform UI changes)
- Better developer experience than traditional testing
- Works for testing, debugging, and documentation
- Can supplement (not replace) unit tests for utilities

**Key Benefits**:
1. Tests against real, live DOM (not mocked)
2. Instant visual feedback when platforms update UI
3. No separate test infrastructure needed
4. Works for developers, QA testers, and power users
5. Can export snapshots for documentation/bug reports

**Next step**: Implement the DevTools panel with URL glob matching, selector testing, and snapshot download functionality.
