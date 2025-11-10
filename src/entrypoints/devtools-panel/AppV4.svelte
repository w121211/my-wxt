<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import JSZip from "jszip";
  import type { AiAssistantAutomatorV2 } from "../../lib/types/automators-v2";
  import { getAutomatorByUrl } from "../../lib/services/automators/registry";
  import type {
    DevToolsTestMessage,
    SelectorResults,
    FunctionResult,
    TestSummary,
  } from "../../lib/types/devtools-messages";

  let url = $state("");
  let title = $state("");
  let automator = $state<AiAssistantAutomatorV2 | null>(null);
  let notes = $state("");

  // Test results state
  let selectorResults = $state<SelectorResults>({});
  let extractorResults = $state<Record<string, FunctionResult>>({});
  let actionResults = $state<Record<string, FunctionResult>>({});
  let watcherResults = $state<Record<string, FunctionResult>>({});
  let watcherUpdates = $state<Record<string, any[]>>({});

  // Test suite state
  let testSuiteStatus = $state<"idle" | "running" | "completed" | "error">(
    "idle"
  );
  let testSummary = $state<TestSummary | null>(null);
  let automatorStatus = $state<string>("Not initialized");

  // Manual controls
  let testPrompt = $state("Hello, can you help me test this?");
  let isRefreshing = $state(false);
  let isDownloading = $state(false);

  // Message listener
  let messageListener: ((message: any) => void) | null = null;

  onMount(async () => {
    console.log("[AppV4] Mounted");

    // Get initial URL
    const tabId = browser.devtools.inspectedWindow.tabId;
    const tab = await browser.tabs.get(tabId);
    await handleNavigation(tab.url || "");

    // Listen for navigation
    browser.devtools.network.onNavigated.addListener(async (newUrl) => {
      console.log("[AppV4] Navigated to:", newUrl);
      await handleNavigation(newUrl);
    });

    // Set up message listener from content script
    messageListener = (message: any) => {
      handleTestMessage(message as DevToolsTestMessage);
    };
    browser.runtime.onMessage.addListener(messageListener);

    console.log("[AppV4] Message listener registered");
  });

  onDestroy(() => {
    if (messageListener) {
      browser.runtime.onMessage.removeListener(messageListener);
    }
  });

  function resetTestResults() {
    selectorResults = {};
    extractorResults = {};
    actionResults = {};
    watcherResults = {};
    watcherUpdates = {};
    testSuiteStatus = "idle";
    testSummary = null;
  }

  async function handleNavigation(newUrl: string) {
    url = newUrl;
    const tabId = browser.devtools.inspectedWindow.tabId;
    const tab = await browser.tabs.get(tabId);
    title = tab.title || "";

    // Reset state
    resetTestResults();
    automatorStatus = "Not initialized";

    // Detect automator
    automator = getAutomatorByUrl(url);
    console.log("[AppV4] Automator detected:", automator?.id);

    if (automator) {
      automatorStatus = "Waiting for test results...";
    }
  }

  function handleTestMessage(message: DevToolsTestMessage) {
    console.log("[AppV4] Received message:", message);

    // Only handle messages for current automator
    if (automator && message.automatorId !== automator.id) {
      return;
    }

    switch (message.type) {
      case "test:suite:start":
        testSuiteStatus = "running";
        automatorStatus = "Running test suite...";
        break;

      case "test:suite:complete":
        testSuiteStatus = "completed";
        testSummary = message.summary;
        automatorStatus = `Test suite completed (${message.summary.passed}/${message.summary.total} passed)`;
        break;

      case "test:started":
        if (message.category === "extractor") {
          extractorResults[message.testName] = { status: "pending" };
        } else if (message.category === "action") {
          actionResults[message.testName] = { status: "pending" };
        } else if (message.category === "watcher") {
          watcherResults[message.testName] = { status: "pending" };
        }
        break;

      case "test:result":
        if (message.category === "extractor") {
          extractorResults[message.testName] = message.result as FunctionResult;
        } else if (message.category === "action") {
          actionResults[message.testName] = message.result as FunctionResult;
        } else if (message.category === "watcher") {
          watcherResults[message.testName] = message.result as FunctionResult;
        }
        break;

      case "test:error":
        const errorResult: FunctionResult = {
          status: "error",
          error: message.error,
        };
        if (message.category === "extractor") {
          extractorResults[message.testName] = errorResult;
        } else if (message.category === "action") {
          actionResults[message.testName] = errorResult;
        } else if (message.category === "watcher") {
          watcherResults[message.testName] = errorResult;
        }
        break;

      case "selector:results":
        selectorResults = message.results;
        break;

      case "automator:status":
        automatorStatus = message.message || message.status;
        if (message.status === "error") {
          testSuiteStatus = "error";
        }
        break;

      case "watcher:update":
        if (!watcherUpdates[message.watcherName]) {
          watcherUpdates[message.watcherName] = [];
        }
        watcherUpdates[message.watcherName] = [
          ...watcherUpdates[message.watcherName],
          { ...message.data, timestamp: message.timestamp },
        ];
        break;
    }
  }

  async function refreshSelectors() {
    if (!automator) return;
    isRefreshing = true;

    try {
      const tabId = browser.devtools.inspectedWindow.tabId;
      await browser.tabs.sendMessage(tabId, {
        type: "devtools:refresh-selectors",
        automatorId: automator.id,
      });
    } catch (error) {
      console.error("[AppV4] Failed to refresh selectors:", error);
    } finally {
      isRefreshing = false;
    }
  }

  async function refreshAll() {
    if (!automator) return;
    isRefreshing = true;

    try {
      // Reset all test results
      resetTestResults();
      automatorStatus = "Refreshing...";

      const tabId = browser.devtools.inspectedWindow.tabId;

      // Refresh selectors
      await browser.tabs.sendMessage(tabId, {
        type: "devtools:refresh-selectors",
        automatorId: automator.id,
      });

      // Run all tests (extractors, actions, watchers)
      await browser.tabs.sendMessage(tabId, {
        type: "devtools:run-tests",
        automatorId: automator.id,
      });
    } catch (error) {
      console.error("[AppV4] Failed to refresh all:", error);
      automatorStatus = "Error refreshing";
    } finally {
      isRefreshing = false;
    }
  }

  async function refreshExtractors() {
    if (!automator) return;

    try {
      const tabId = browser.devtools.inspectedWindow.tabId;
      await browser.tabs.sendMessage(tabId, {
        type: "devtools:run-tests",
        automatorId: automator.id,
      });
    } catch (error) {
      console.error("[AppV4] Failed to refresh extractors:", error);
    }
  }

  async function testSubmitPrompt() {
    if (!automator || !testPrompt) return;

    try {
      const tabId = browser.devtools.inspectedWindow.tabId;

      // Submit prompt on the current page (no navigation)
      const response = await browser.tabs.sendMessage(tabId, {
        type: "devtools:submit-prompt",
        automatorId: automator.id,
        prompt: testPrompt,
        messageId: `test-${Date.now()}`,
      });

      console.log("[AppV4] Submit prompt response:", response);
    } catch (error) {
      console.error("[AppV4] Failed to submit prompt:", error);
    }
  }

  async function goToNewChat() {
    if (!automator) return;

    try {
      const tabId = browser.devtools.inspectedWindow.tabId;

      // Navigate to home page for new chat
      const response = await browser.tabs.sendMessage(tabId, {
        type: "devtools:navigate-to-chat",
        automatorId: automator.id,
      });

      console.log("[AppV4] Go to chat response:", response);
    } catch (error) {
      console.error("[AppV4] Failed to navigate:", error);
    }
  }

  // function copyJSON(data: any) {
  //   navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  // }

  async function downloadSnapshot() {
    if (!automator || isDownloading) return;

    isDownloading = true;

    try {
      const tabId = browser.devtools.inspectedWindow.tabId;

      // Get page HTML
      const htmlResult = await browser.scripting.executeScript({
        target: { tabId },
        func: () => document.documentElement.outerHTML,
      });
      const pageHtml = htmlResult[0]?.result || "";

      // Get ARIA snapshot
      const ariaResult = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          // @ts-ignore
          if (window.__snapshotAria__) {
            // @ts-ignore
            return window.__snapshotAria__(document.body);
          }
          return "# ARIA snapshot not available";
        },
      });
      const ariaSnapshot =
        ariaResult[0]?.result || "# Error getting ARIA snapshot";

      // Get YAML snapshot
      let yamlSnapshot = "# Error getting YAML snapshot";
      try {
        const yamlSnapshotResult = await browser.scripting.executeScript({
          target: { tabId },
          func: () => {
            try {
              // @ts-ignore
              if (window.__snapshotYaml__) {
                // @ts-ignore
                return window.__snapshotYaml__(document.body);
              }
              return "# YAML snapshot not available";
            } catch (error) {
              return `# Error in __snapshotYaml__: \n\n${error instanceof Error ? error.stack : String(error)}`;
            }
          },
        });
        yamlSnapshot =
          yamlSnapshotResult[0]?.result || "# Error getting YAML snapshot";
      } catch (error) {
        console.error("Failed to execute YAML snapshot script:", error);
        yamlSnapshot = `# Script execution failed: \n\n${error instanceof Error ? error.stack : String(error)}`;
      }

      // Get page screenshot
      let screenshotBlob: Blob | null = null;
      try {
        const inspectedTab = await browser.tabs.get(tabId);
        const dataUrl = await browser.tabs.captureVisibleTab(
          inspectedTab.windowId,
          { format: "png" }
        );
        const resp = await fetch(dataUrl);
        screenshotBlob = await resp.blob();
      } catch (e) {
        console.error("Failed to capture screenshot", e);
      }

      // Create metadata
      const metadata = {
        url,
        title,
        timestamp: new Date().toISOString(),
        platform: automator.id,
        specId: automator.id,
        userAgent: navigator.userAgent,
        notes,
        testSummary,
      };

      // Create results JSON
      const results = {
        metadata,
        selectors: selectorResults,
        extractors: extractorResults,
        actions: actionResults,
        watchers: watcherResults,
        watcherUpdates,
      };

      // Create ZIP
      const zip = new JSZip();
      zip.file("page.html", pageHtml);
      zip.file("aria-snapshot.yml", ariaSnapshot);
      zip.file("yaml-snapshot.yml", yamlSnapshot);
      if (screenshotBlob) {
        zip.file("page-screenshot.png", screenshotBlob);
      }
      zip.file("results.json", JSON.stringify(results, null, 2));

      // Generate and download
      const blob = await zip.generateAsync({ type: "blob" });
      const filename = `snapshot-v4-${automator.id}-${Date.now()}.zip`;
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      a.click();

      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error: any) {
      console.error("Failed to download snapshot:", error);
      alert("Failed to download snapshot: " + error.message);
    } finally {
      isDownloading = false;
    }
  }
</script>

<div class="container">
  <header>
    <h1>Automator Inspector V4</h1>
    <div class="header-actions">
      <button onclick={refreshAll} disabled={isRefreshing || !automator}>
        {isRefreshing ? "Refreshing..." : "Refresh All"}
      </button>
      <button onclick={downloadSnapshot} disabled={isDownloading || !automator}>
        {isDownloading ? "Downloading..." : "Download Snapshot"}
      </button>
    </div>
  </header>

  <section class="card">
    <h2>Automator Detection</h2>
    {#if automator}
      <p><strong>Automator:</strong> {automator.id} (V4 - Auto-Testing)</p>
      <p><strong>URL:</strong> {url}</p>
      <p><strong>Title:</strong> {title}</p>
      <p><strong>Status:</strong> {automatorStatus}</p>
      {#if testSummary}
        <p>
          <strong>Test Summary:</strong>
          {testSummary.passed}/{testSummary.total} passed ({testSummary.duration}ms)
        </p>
      {/if}
    {:else}
      <p>No AI assistant detected on this page.</p>
      <p>Navigate to ChatGPT, Claude, Gemini, or Grok.</p>
    {/if}
  </section>

  {#if automator}
    <section class="card notes-section">
      <h2>Notes</h2>
      <textarea
        bind:value={notes}
        placeholder="Add notes about this test session (included in snapshot)..."
        rows="3"
      ></textarea>
    </section>

    <section class="card">
      <h2>
        Selectors ({Object.keys(selectorResults).length}/{Object.keys(
          automator.selectors
        ).length})
      </h2>
      {#if Object.keys(selectorResults).length === 0}
        <p>Waiting for selector test results...</p>
      {:else}
        {#each Object.entries(selectorResults) as [name, result]}
          <div class="item">
            <p>
              {#if result.status === "found"}✅{:else}❌{/if}
              <strong>{name}:</strong> ({result.count} found)
            </p>
            {#if result.samples && result.samples.length > 0}
              <ul>
                {#each result.samples as sample}
                  <li>
                    {sample
                      ? `${sample.substring(0, 100)}${sample.length > 100 ? "..." : ""}`
                      : "null"}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      {/if}
    </section>

    <section class="card">
      <div class="section-header">
        <h2>Extractors ({Object.keys(extractorResults).length})</h2>
        <button onclick={refreshExtractors} disabled={!automator}
          >Refresh Extractors</button
        >
      </div>
      {#if Object.keys(extractorResults).length === 0}
        <p>Waiting for extractor test results...</p>
      {:else}
        {#each Object.entries(extractorResults) as [name, result]}
          <div class="item">
            <p>
              {#if result.status === "success"}✅
              {:else if result.status === "error"}❌
              {:else}⏳{/if}
              <strong>{name}():</strong>
              {#if result.duration}{result.duration}ms{/if}
            </p>
            {#if result.status === "success"}
              {#if result.data !== undefined && result.data !== null}
                {#if Array.isArray(result.data)}
                  <p>Array with {result.data.length} items</p>
                {/if}
                <pre>{JSON.stringify(result.data, null, 2).substring(
                    0,
                    200
                  )}{JSON.stringify(result.data, null, 2).length > 200
                    ? "..."
                    : ""}</pre>
                <!-- <button onclick={() => copyJSON(result.data)}>Copy JSON</button> -->
              {:else}
                <p>Result: {result.data === null ? "null" : "undefined"}</p>
              {/if}
            {:else if result.status === "error"}
              <p class="error">Error: {result.error}</p>
            {:else}
              <p>Running...</p>
            {/if}
          </div>
        {/each}
      {/if}
    </section>

    <section class="card">
      <h2>Actions</h2>
      <div class="item">
        <h3>submitPrompt()</h3>
        <label for="test-prompt">Test Prompt:</label>
        <textarea
          id="test-prompt"
          bind:value={testPrompt}
          placeholder="Enter a test prompt..."
          rows="3"
        ></textarea>
        <div style="display: flex; gap: 8px;">
          <button onclick={goToNewChat}>Go to New Chat</button>
          <button onclick={testSubmitPrompt} disabled={!testPrompt}
            >Submit Prompt</button
          >
        </div>
        {#if actionResults.submitPrompt}
          {@const result = actionResults.submitPrompt}
          <div class="result-block">
            <p>
              {#if result.status === "success"}✅ Prompt submitted successfully
                ({result.duration}ms)
              {:else if result.status === "error"}❌ Error: {result.error}
              {:else}⏳ Submitting prompt...{/if}
            </p>
            {#if result.status === "success" && result.data}
              <pre>{JSON.stringify(result.data, null, 2)}</pre>
              <!-- <button onclick={() => copyJSON(result.data)}>Copy JSON</button> -->
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <section class="card">
      <h2>Watchers ({Object.keys(watcherUpdates).length})</h2>
      {#if Object.keys(watcherUpdates).length === 0}
        <p>No watcher updates yet. Submit a prompt to start watching.</p>
      {:else}
        {#each Object.entries(watcherUpdates) as [name, updates]}
          <div class="item">
            <p>
              <strong>{name}:</strong>
              {updates.length} updates
            </p>
            <div class="watcher-updates">
              {#each updates as update}
                <div class="update-item">
                  <small
                    >{new Date(update.timestamp).toLocaleTimeString()}</small
                  >
                  <pre>{JSON.stringify(update, null, 2).substring(
                      0,
                      300
                    )}{JSON.stringify(update, null, 2).length > 300
                      ? "..."
                      : ""}</pre>
                </div>
              {/each}
            </div>
            <!-- <button onclick={() => copyJSON(updates)}>Copy All Updates</button> -->
          </div>
        {/each}
      {/if}
    </section>
  {/if}
</div>

<style>
  .container {
    padding: 1rem;
    max-width: 800px;
    margin: 0 auto;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #ddd;
  }

  button {
    background: #007bff;
    color: #fff;
    border: none;
    padding: 0.4rem 0.8rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }

  button:hover:not(:disabled) {
    background: #005fcc;
  }

  button:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .card {
    background: #fff;
    padding: 1rem;
    border: 1px solid #eee;
    border-radius: 6px;
    margin-bottom: 1rem;
  }

  .notes-section textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
    font-family: inherit;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
  }

  .section-header h2 {
    margin: 0;
  }

  .item {
    padding: 0.75rem;
    border: 1px solid #eee;
    border-radius: 4px;
    margin-bottom: 0.75rem;
  }

  pre {
    background: #f5f5f5;
    border-radius: 3px;
    font-family: monospace;
    padding: 0.75rem;
    overflow-x: auto;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
  }

  li {
    background: #f7f7f7;
    margin-bottom: 0.25rem;
    padding: 0.25rem 0.5rem;
    border-radius: 3px;
    font-family: monospace;
    font-size: 0.85rem;
  }

  .result-block {
    margin-top: 0.75rem;
    padding: 0.75rem;
    border-radius: 4px;
    border: 1px solid #28a745;
    background: #f9fffb;
  }

  .error {
    color: #dc3545;
  }

  label {
    font-weight: 600;
    margin-bottom: 0.25rem;
    display: block;
  }

  textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    font-size: 1rem;
  }

  h3 {
    margin-top: 0;
  }

  .watcher-updates {
    margin-top: 0.5rem;
    max-height: 400px;
    overflow-y: auto;
  }

  .update-item {
    background: #f9f9f9;
    padding: 0.5rem;
    margin-bottom: 0.5rem;
    border-radius: 4px;
    border-left: 3px solid #007bff;
  }

  .update-item small {
    color: #666;
    font-size: 0.8rem;
  }

  .update-item pre {
    margin-top: 0.5rem;
    font-size: 0.85rem;
  }
</style>
