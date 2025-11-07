<script lang="ts">
  import { onMount } from "svelte";
  import JSZip from "jszip";
  import type { AiAssistantAutomator } from "../../lib/types/automators";
  import { getAutomatorByUrl } from "../../lib/services/automators/registry";
  import { resolveCssSelector } from "../../lib/utils/selectors";

  let url = $state("");
  let title = $state("");
  let automator = $state<AiAssistantAutomator | null>(null);

  // Types for selector testing results
  type SelectorTestResult = {
    status: "found" | "not-found";
    count: number;
    samples: (string | null)[];
  };
  type SelectorResults = Record<string, SelectorTestResult>;

  let selectorResults = $state<SelectorResults>({});
  let isRefreshing = $state(false);

  type FunctionResult = {
    status: "success" | "error" | "pending";
    data?: any;
    error?: string;
    duration?: number;
  };

  let functionResults = $state<Record<string, FunctionResult>>({
    waitForLoggedIn: { status: "pending" },
    extractChatEntries: { status: "pending" },
    extractChatPage: { status: "pending" },
  });

  // Manual function testing
  let testPrompt = $state("Hello, can you help me test this?");
  let testChatId = $state("");
  let manualResults = $state<Record<string, FunctionResult>>({});

  // Download state
  let isDownloading = $state(false);

  async function handleNavigation(newUrl: string) {
    const tabId = browser.devtools.inspectedWindow.tabId;
    const tab = await browser.tabs.get(tabId);

    url = newUrl;
    title = tab.title || "";

    // Reset states for re-detection
    selectorResults = {};
    functionResults = {
      waitForLoggedIn: { status: "pending" },
      extractChatEntries: { status: "pending" },
      extractChatPage: { status: "pending" },
    };
    manualResults = {};

    // Detect automator
    automator = getAutomatorByUrl(url);
    console.log("Automator detected for", url, automator);

    if (automator) {
      await testSelectors();
      await testFunctions();
    }
  }

  onMount(async () => {
    console.log("[my-wxt-panel] onMount");
    // Get initial URL
    const tabId = browser.devtools.inspectedWindow.tabId;
    const tab = await browser.tabs.get(tabId);
    await handleNavigation(tab.url || "");

    // Listen for future navigations
    browser.devtools.network.onNavigated.addListener(async (newUrl) => {
      console.log("[my-wxt-panel] navigated to:", newUrl);
      await handleNavigation(newUrl);
    });

    // Check for injected scripts
    const checkResult = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({
        hasAutomator: "__automator__" in window,
        hasAriaSnapshotter: "__snapshotAria__" in window,
        hasHtmlSnapshotter: "__snapshotHtml__" in window,
      }),
    });
    console.log("[my-wxt-panel] content script check:", checkResult[0]?.result);
  });

  async function testSelectors() {
    if (!automator) return;

    isRefreshing = true;
    const tabId = browser.devtools.inspectedWindow.tabId;
    const results: SelectorResults = {};

    for (const [name, selector] of Object.entries(automator.selectors)) {
      try {
        const resolvedSelector = resolveCssSelector(selector);
        const selectorString = Array.isArray(resolvedSelector)
          ? resolvedSelector[0]
          : resolvedSelector;

        // Execute in the context of the inspected page
        const result = await browser.scripting.executeScript({
          target: { tabId },
          func: (sel: string) => {
            const elements = document.querySelectorAll(sel);
            const samples = Array.from(elements)
              .slice(0, 3)
              .map((el) => el.textContent?.trim() ?? null);
            return { count: elements.length, samples };
          },
          args: [selectorString],
        });

        const data = result[0]?.result || { count: 0, samples: [] };
        results[name] = {
          status: data.count > 0 ? "found" : "not-found",
          count: data.count,
          samples: data.samples,
        };
      } catch (error) {
        results[name] = { status: "not-found", count: 0, samples: [] };
      }
    }

    selectorResults = results;
    isRefreshing = false;
  }

  async function testFunctions() {
    if (!automator) return;

    const tabId = browser.devtools.inspectedWindow.tabId;

    // Test waitForLoggedIn
    try {
      const start = Date.now();
      const result = await browser.scripting.executeScript({
        target: { tabId },
        func: async () => {
          // @ts-ignore - will be available in content script context
          const automator = window.__automator__;
          if (automator && automator.waitForLoggedIn) {
            return await automator.waitForLoggedIn({ timeoutMs: 5000 });
          }
          return null;
        },
      });

      functionResults.waitForLoggedIn = {
        status: "success",
        data: result[0]?.result,
        duration: Date.now() - start,
      };
    } catch (error: any) {
      functionResults.waitForLoggedIn = {
        status: "error",
        error: error.message,
      };
    }

    // Test extractChatEntries
    try {
      const start = Date.now();
      const result = await browser.scripting.executeScript({
        target: { tabId },
        func: async () => {
          // @ts-ignore
          const automator = window.__automator__;
          if (automator && automator.extractChatEntries) {
            return await automator.extractChatEntries();
          }
          return null;
        },
      });

      functionResults.extractChatEntries = {
        status: "success",
        data: result[0]?.result,
        duration: Date.now() - start,
      };
    } catch (error: any) {
      functionResults.extractChatEntries = {
        status: "error",
        error: error.message,
      };
    }

    // Test extractChatPage
    try {
      const start = Date.now();
      const result = await browser.scripting.executeScript({
        target: { tabId },
        func: async () => {
          // @ts-ignore
          const automator = window.__automator__;
          if (automator && automator.extractChatPage) {
            return await automator.extractChatPage({ id: "current" });
          }
          return null;
        },
      });

      functionResults.extractChatPage = {
        status: "success",
        data: result[0]?.result,
        duration: Date.now() - start,
      };
    } catch (error: any) {
      functionResults.extractChatPage = {
        status: "error",
        error: error.message,
      };
    }
  }

  function copyJSON(data: any) {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }

  async function testSendPrompt() {
    if (!automator || !testPrompt) return;

    const tabId = browser.devtools.inspectedWindow.tabId;
    manualResults.sendPrompt = { status: "pending" };

    try {
      const start = Date.now();
      const result = await browser.scripting.executeScript({
        target: { tabId },
        func: async (prompt: string) => {
          // @ts-ignore
          const automator = window.__automator__;
          if (automator && automator.sendPrompt) {
            await automator.sendPrompt({ prompt });
            return { success: true };
          }
          return { success: false };
        },
        args: [testPrompt],
      });

      manualResults.sendPrompt = {
        status: "success",
        data: result[0]?.result,
        duration: Date.now() - start,
      };
    } catch (error: any) {
      manualResults.sendPrompt = {
        status: "error",
        error: error.message,
      };
    }
  }

  async function testOpenChat() {
    if (!automator || !testChatId) return;

    const tabId = browser.devtools.inspectedWindow.tabId;
    manualResults.openChat = { status: "pending" };

    try {
      const start = Date.now();
      const result = await browser.scripting.executeScript({
        target: { tabId },
        func: async (chatId: string) => {
          // @ts-ignore
          const automator = window.__automator__;
          if (automator && automator.openChat) {
            await automator.openChat({ id: chatId });
            return { success: true };
          }
          return { success: false };
        },
        args: [testChatId],
      });

      manualResults.openChat = {
        status: "success",
        data: result[0]?.result,
        duration: Date.now() - start,
      };
    } catch (error: any) {
      manualResults.openChat = {
        status: "error",
        error: error.message,
      };
    }
  }

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
          // @ts-ignore - will be available in content script context
          if (window.__snapshotAria__) {
            // @ts-ignore
            return window.__snapshotAria__(document.body);
          }
          return "# ARIA snapshot not available";
        },
      });
      const ariaSnapshot =
        ariaResult[0]?.result || "# Error getting ARIA snapshot";

      // Get HTML snapshot
      const htmlSnapshotResult = await browser.scripting.executeScript({
        target: { tabId },
        func: () => {
          // @ts-ignore
          if (window.__snapshotHtml__) {
            // @ts-ignore
            return window.__snapshotHtml__(document.body);
          }
          return "<!-- HTML snapshot not available -->";
        },
      });
      const htmlSnapshot =
        htmlSnapshotResult[0]?.result || "<!-- Error getting HTML snapshot -->";

      // Get page screenshot (as PNG)
      let screenshotBlob: Blob | null = null;
      try {
        const inspectedTab = await browser.tabs.get(tabId);
        const dataUrl = await browser.tabs.captureVisibleTab(
          inspectedTab.windowId,
          {
            format: "png",
          }
        );
        // Convert data URL to Blob for zipping
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
      };

      // Create results JSON
      const results = {
        metadata,
        selectors: selectorResults,
        functions: functionResults,
        manualTests: manualResults,
      };

      // Create ZIP
      const zip = new JSZip();
      zip.file("page.html", pageHtml);
      zip.file("aria-snapshot.yml", ariaSnapshot);
      zip.file("html-snapshot.html", htmlSnapshot);
      if (screenshotBlob) {
        zip.file("page-screenshot.png", screenshotBlob);
      }
      zip.file("results.json", JSON.stringify(results, null, 2));

      // Generate ZIP blob
      const blob = await zip.generateAsync({ type: "blob" });

      // Download
      const filename = `snapshot-${automator.id}-${Date.now()}.zip`;
      const downloadUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      a.click();

      // Cleanup
      setTimeout(() => URL.revokeObjectURL(downloadUrl), 1000);
    } catch (error: any) {
      console.error("Failed to download snapshot:", error);
      alert("Failed to download snapshot: " + error.message);
    } finally {
      isDownloading = false;
    }
  }
</script>

<div class="panel">
  <header>
    <h1>AI Automator Inspector</h1>
    <div class="header-actions">
      <button onclick={testSelectors} disabled={isRefreshing || !automator}>
        {isRefreshing ? "🔄 Refreshing..." : "🔄 Refresh"}
      </button>
      <button
        onclick={downloadSnapshot}
        disabled={isDownloading || !automator}
        class="btn-download"
      >
        {isDownloading ? "⏳ Downloading..." : "📥 Download Snapshot"}
      </button>
    </div>
  </header>

  <section class="detection">
    <h2>Platform Detection</h2>
    {#if automator}
      <div class="detected">
        <div class="info-row">
          <span class="label">Platform:</span>
          <span class="value success">{automator.id}</span>
        </div>
        <div class="info-row">
          <span class="label">URL:</span>
          <span class="value">{url}</span>
        </div>
        <div class="info-row">
          <span class="label">Title:</span>
          <span class="value">{title}</span>
        </div>
      </div>
    {:else}
      <div class="not-detected">
        <p>❌ No AI assistant detected on this page</p>
        <p class="hint">Navigate to ChatGPT, Claude, Gemini, or Grok</p>
      </div>
    {/if}
  </section>

  {#if automator}
    <section class="selectors">
      <h2>
        Selectors ({Object.keys(selectorResults).length}/{Object.keys(
          automator.selectors
        ).length})
      </h2>

      {#if isRefreshing}
        <p class="loading">Testing selectors...</p>
      {:else}
        <div class="selector-list">
          {#each Object.entries(automator.selectors) as [name, selector]}
            {@const result = selectorResults[name]}
            {@const resolvedSelector = resolveCssSelector(selector)}
            {@const selectorStr = Array.isArray(resolvedSelector)
              ? resolvedSelector[0]
              : resolvedSelector}

            <div class="selector-item">
              <div class="selector-header">
                {#if result?.status === "found"}
                  <span class="status success">✅</span>
                  <span class="selector-name">{name}</span>
                  <span class="count">({result.count} found)</span>
                {:else}
                  <span class="status error">❌</span>
                  <span class="selector-name">{name}</span>
                  <span class="count">(not found)</span>
                {/if}
              </div>
              <code class="selector-code">{selectorStr}</code>
              {#if result?.samples && result.samples.length > 0}
                <div class="selector-samples">
                  <h4 class="samples-title">Samples:</h4>
                  <ul class="samples-list">
                    {#each result.samples as sample}
                      <li class="sample-item">
                        {sample
                          ? `${sample.substring(0, 100)}${
                              sample.length > 100 ? "..." : ""
                            }`
                          : "null"}
                      </li>
                    {/each}
                  </ul>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="functions">
      <h2>Function Results (Auto-run)</h2>

      <div class="function-list">
        {#each Object.entries(functionResults) as [name, result]}
          <div class="function-item">
            <div class="function-header">
              {#if result.status === "success"}
                <span class="status success">✅</span>
              {:else if result.status === "error"}
                <span class="status error">❌</span>
              {:else}
                <span class="status pending">⏳</span>
              {/if}
              <span class="function-name">{name}()</span>
              {#if result.duration}
                <span class="duration">{result.duration}ms</span>
              {/if}
            </div>

            {#if result.status === "success" && result.data}
              <div class="function-result">
                {#if Array.isArray(result.data)}
                  <p class="array-info">
                    Array with {result.data.length} items
                  </p>
                {/if}
                <pre class="json-preview">{JSON.stringify(
                    result.data,
                    null,
                    2
                  ).substring(0, 200)}{JSON.stringify(result.data, null, 2)
                    .length > 200
                    ? "..."
                    : ""}</pre>
                <button class="btn-small" onclick={() => copyJSON(result.data)}>
                  📋 Copy JSON
                </button>
              </div>
            {:else if result.status === "error"}
              <div class="function-error">
                <p class="error-message">{result.error}</p>
              </div>
            {:else}
              <p class="pending-message">Running...</p>
            {/if}
          </div>
        {/each}
      </div>
    </section>

    <section class="manual-functions">
      <h2>Manual Function Testing</h2>

      <div class="manual-test-item">
        <h3>sendPrompt()</h3>
        <div class="input-group">
          <label for="test-prompt">Test Prompt:</label>
          <textarea
            id="test-prompt"
            bind:value={testPrompt}
            placeholder="Enter a test prompt..."
            rows="3"
          ></textarea>
        </div>
        <button onclick={testSendPrompt} disabled={!testPrompt}>
          ▶️ Test Send Prompt
        </button>

        {#if manualResults.sendPrompt}
          {#if manualResults.sendPrompt.status === "success"}
            <div class="test-result success-result">
              ✅ Prompt sent successfully ({manualResults.sendPrompt
                .duration}ms)
            </div>
          {:else if manualResults.sendPrompt.status === "error"}
            <div class="test-result error-result">
              ❌ Error: {manualResults.sendPrompt.error}
            </div>
          {:else}
            <div class="test-result pending-result">⏳ Sending prompt...</div>
          {/if}
        {/if}
      </div>

      <div class="manual-test-item">
        <h3>openChat()</h3>
        <div class="input-group">
          <label for="test-chat-id">Chat ID:</label>
          <input
            id="test-chat-id"
            type="text"
            bind:value={testChatId}
            placeholder="Enter chat ID..."
          />
        </div>
        <button onclick={testOpenChat} disabled={!testChatId}>
          ▶️ Test Open Chat
        </button>

        {#if manualResults.openChat}
          {#if manualResults.openChat.status === "success"}
            <div class="test-result success-result">
              ✅ Chat opened successfully ({manualResults.openChat.duration}ms)
            </div>
          {:else if manualResults.openChat.status === "error"}
            <div class="test-result error-result">
              ❌ Error: {manualResults.openChat.error}
            </div>
          {:else}
            <div class="test-result pending-result">⏳ Opening chat...</div>
          {/if}
        {/if}
      </div>
    </section>
  {/if}
</div>

<style>
  .panel {
    padding: 16px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      sans-serif;
    max-width: 100%;
    background: #1e1e1e;
    color: #d4d4d4;
    min-height: 100vh;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid #333;
  }

  .header-actions {
    display: flex;
    gap: 8px;
  }

  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }

  h2 {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
    color: #569cd6;
  }

  button {
    padding: 8px 16px;
    background: #0e639c;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
  }

  button:hover:not(:disabled) {
    background: #1177bb;
  }

  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-download {
    background: #0a7d3e;
  }

  .btn-download:hover:not(:disabled) {
    background: #0c9c4d;
  }

  section {
    margin-bottom: 24px;
    background: #252526;
    padding: 16px;
    border-radius: 4px;
  }

  .info-row {
    display: flex;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .label {
    font-weight: 600;
    min-width: 80px;
    color: #9cdcfe;
  }

  .value {
    color: #ce9178;
    word-break: break-all;
  }

  .value.success {
    color: #4ec9b0;
    font-weight: 600;
    text-transform: uppercase;
  }

  .not-detected {
    padding: 16px;
    background: #3c1f1e;
    border-radius: 4px;
    border-left: 4px solid #f48771;
  }

  .not-detected p {
    margin: 8px 0;
  }

  .hint {
    color: #858585;
    font-size: 13px;
  }

  .selector-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .selector-item {
    background: #1e1e1e;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid #333;
  }

  .selector-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .status {
    font-size: 16px;
  }

  .selector-name {
    font-weight: 600;
    color: #dcdcaa;
  }

  .count {
    color: #858585;
    font-size: 13px;
  }

  .selector-code {
    display: block;
    background: #0d1117;
    padding: 8px;
    border-radius: 3px;
    font-family: "Courier New", monospace;
    font-size: 12px;
    color: #79b8ff;
    word-break: break-all;
  }

  .selector-samples {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #333;
  }

  .samples-title {
    margin: 0 0 8px 0;
    font-size: 12px;
    font-weight: 600;
    color: #9cdcfe;
  }

  .samples-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sample-item {
    font-family: "Courier New", monospace;
    font-size: 11px;
    color: #ce9178;
    background: #0d1117;
    padding: 4px 6px;
    border-radius: 3px;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .loading {
    color: #858585;
    font-style: italic;
  }

  .function-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .function-item {
    background: #1e1e1e;
    padding: 12px;
    border-radius: 4px;
    border: 1px solid #333;
  }

  .function-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }

  .function-name {
    font-weight: 600;
    color: #dcdcaa;
    font-family: "Courier New", monospace;
  }

  .duration {
    color: #858585;
    font-size: 12px;
    margin-left: auto;
  }

  .function-result {
    margin-top: 8px;
  }

  .array-info {
    font-size: 12px;
    color: #858585;
    margin: 0 0 8px 0;
    font-style: italic;
  }

  .json-preview {
    background: #0d1117;
    padding: 8px;
    border-radius: 3px;
    font-family: "Courier New", monospace;
    font-size: 11px;
    color: #79b8ff;
    overflow: auto;
    max-height: 150px;
    margin: 8px 0;
  }

  .btn-small {
    padding: 4px 8px;
    background: #0e639c;
    color: white;
    border: none;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
  }

  .btn-small:hover {
    background: #1177bb;
  }

  .function-error {
    margin-top: 8px;
    padding: 8px;
    background: #3c1f1e;
    border-radius: 3px;
    border-left: 3px solid #f48771;
  }

  .error-message {
    margin: 0;
    color: #f48771;
    font-size: 13px;
    font-family: "Courier New", monospace;
  }

  .pending-message {
    margin: 8px 0 0 0;
    color: #858585;
    font-size: 13px;
    font-style: italic;
  }

  .manual-functions h3 {
    margin: 0 0 12px 0;
    font-size: 14px;
    font-weight: 600;
    color: #dcdcaa;
    font-family: "Courier New", monospace;
  }

  .manual-test-item {
    background: #1e1e1e;
    padding: 16px;
    border-radius: 4px;
    border: 1px solid #333;
    margin-bottom: 16px;
  }

  .input-group {
    margin-bottom: 12px;
  }

  .input-group label {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
    color: #9cdcfe;
    font-weight: 600;
  }

  .input-group input,
  .input-group textarea {
    width: 100%;
    padding: 8px;
    background: #0d1117;
    border: 1px solid #333;
    border-radius: 3px;
    color: #d4d4d4;
    font-family: "Courier New", monospace;
    font-size: 13px;
    resize: vertical;
  }

  .input-group input:focus,
  .input-group textarea:focus {
    outline: none;
    border-color: #0e639c;
  }

  .test-result {
    margin-top: 12px;
    padding: 8px 12px;
    border-radius: 3px;
    font-size: 13px;
  }

  .success-result {
    background: #1e3a1e;
    border-left: 3px solid #4ec9b0;
    color: #4ec9b0;
  }

  .error-result {
    background: #3c1f1e;
    border-left: 3px solid #f48771;
    color: #f48771;
  }

  .pending-result {
    background: #2a2a2a;
    border-left: 3px solid #858585;
    color: #858585;
  }
</style>
