<script lang="ts">
  import { onMount } from "svelte";
  import JSZip from "jszip";
  import type { AiAssistantAutomatorV2 } from "../../lib/types/automators-v2";
  import { getAutomatorByUrl } from "../../lib/services/automators/registry";
  import { resolveCssSelector } from "../../lib/utils/selectors";

  let url = $state("");
  let title = $state("");
  let automator = $state<AiAssistantAutomatorV2 | null>(null);
  let notes = $state("");

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

  // Categorized function results
  let extractorResults = $state<Record<string, FunctionResult>>({});
  let actionResults = $state<Record<string, FunctionResult>>({});
  let watcherResults = $state<Record<string, FunctionResult>>({});

  // Manual function testing
  let testPrompt = $state("Hello, can you help me test this?");

  // Download state
  let isDownloading = $state(false);

  // Configuration for auto-run tests
  type FunctionTestConfig = {
    name: string;
    args?: any[];
    category: "extractor" | "action" | "watcher";
  };

  const AUTO_RUN_TESTS: FunctionTestConfig[] = [
    {
      name: "getLoginState",
      args: [{ timeoutMs: 5000 }],
      category: "extractor",
    },
    { name: "getChatEntries", args: [], category: "extractor" },
    { name: "getChatPage", args: [{ id: "current" }], category: "extractor" },
    // Note: watchConversationStatus is skipped in auto-run because callbacks cannot be serialized
    // {
    //   name: "watchConversationStatus",
    //   args: [
    //     { messageId: "test-message", chatId: "current" },
    //     (status: any) => console.log("Status changed:", status),
    //   ],
    //   category: "watcher",
    // },
  ];

  // Generic function tester - uses message passing to content script
  async function testAutomatorFunction(
    functionName: string,
    args: any[] = [],
    resultsObject: Record<string, FunctionResult>
  ) {
    console.log(
      "[AppV3 Panel] testAutomatorFunction called for:",
      functionName,
      "with args:",
      args
    );
    const tabId = browser.devtools.inspectedWindow.tabId;
    resultsObject[functionName] = { status: "pending" };

    try {
      const start = Date.now();
      console.log("[AppV3 Panel] Sending message to content script in tab:", tabId);

      // Send message to content script
      const response = await browser.tabs.sendMessage(tabId, {
        type: "TEST_AUTOMATOR_FUNCTION",
        functionName,
        args,
      });

      console.log("[AppV3 Panel] Response from content script:", response);

      if (response.success) {
        resultsObject[functionName] = {
          status: "success",
          data: response.data,
          duration: Date.now() - start,
        };
      } else {
        resultsObject[functionName] = {
          status: "error",
          error: response.error || "Unknown error",
        };
      }
    } catch (error: any) {
      console.error("[AppV3 Panel] Message sending error:", error);
      resultsObject[functionName] = {
        status: "error",
        error: error.message,
      };
    }
  }

  async function handleNavigation(newUrl: string) {
    const tabId = browser.devtools.inspectedWindow.tabId;
    const tab = await browser.tabs.get(tabId);

    url = newUrl;
    title = tab.title || "";

    // Reset states for re-detection
    selectorResults = {};
    extractorResults = {};
    actionResults = {};
    watcherResults = {};

    // Detect automator
    automator = getAutomatorByUrl(url);
    console.log("Automator detected for", url, automator);

    if (automator) {
      await testSelectors();
      await testFunctions();
    }
  }

  onMount(async () => {
    console.log("[my-wxt-panel-v3] onMount");
    // Get initial URL
    const tabId = browser.devtools.inspectedWindow.tabId;
    const tab = await browser.tabs.get(tabId);
    await handleNavigation(tab.url || "");

    // Listen for future navigations
    browser.devtools.network.onNavigated.addListener(async (newUrl) => {
      console.log("[my-wxt-panel-v3] navigated to:", newUrl);
      await handleNavigation(newUrl);
    });

    // Check for injected scripts
    const checkResult = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({
        hasAutomator: "__automator__" in window,
        hasSnapshotAria: "__snapshotAria__" in window,
        hasYamlSnapshot: "__snapshotYaml__" in window,
      }),
    });
    console.log(
      "[my-wxt-panel-v3] content script check:",
      checkResult[0]?.result
    );
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

    console.log(
      "[AppV3 Panel] Starting testFunctions, running",
      AUTO_RUN_TESTS.length,
      "tests"
    );

    // Run all auto-run tests
    for (const test of AUTO_RUN_TESTS) {
      console.log(
        "[AppV3 Panel] Running test:",
        test.name,
        "category:",
        test.category
      );
      const resultsObj =
        test.category === "extractor"
          ? extractorResults
          : test.category === "action"
            ? actionResults
            : watcherResults;

      await testAutomatorFunction(test.name, test.args || [], resultsObj);
    }

    console.log("[AppV3 Panel] All tests completed");
  }

  async function refreshExtractors() {
    if (!automator) return;

    const extractorTests = AUTO_RUN_TESTS.filter(
      (t) => t.category === "extractor"
    );
    for (const test of extractorTests) {
      await testAutomatorFunction(test.name, test.args || [], extractorResults);
    }
  }

  function copyJSON(data: any) {
    navigator.clipboard.writeText(JSON.stringify(data, null, 2));
  }

  async function testSubmitPrompt() {
    if (!automator || !testPrompt) return;

    await testAutomatorFunction(
      "submitPrompt",
      [{ messageId: `test-${Date.now()}`, prompt: testPrompt }],
      actionResults
    );
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

      // Get YAML snapshot
      let yamlSnapshot = "# Error getting YAML snapshot";
      try {
        const yamlSnapshotResult = await browser.scripting.executeScript({
          target: { tabId },
          func: () => {
            try {
              if (window.__snapshotYaml__) {
                return window.__snapshotYaml__(document.body);
              }
              return "# YAML snapshot not available";
            } catch (error) {
              return `# Error in __snapshotYaml__: \n\n${error instanceof Error ? error.stack : String(error)}`;
            }
          },
        });
        console.log("YAML snapshot result:", yamlSnapshotResult);
        yamlSnapshot =
          yamlSnapshotResult[0]?.result || "# Error getting YAML snapshot";
      } catch (error) {
        console.error("Failed to execute YAML snapshot script:", error);
        yamlSnapshot = `# Script execution failed: \n\n${error instanceof Error ? error.stack : String(error)}`;
      }

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
        notes,
      };

      // Create results JSON
      const results = {
        metadata,
        selectors: selectorResults,
        extractors: extractorResults,
        actions: actionResults,
        watchers: watcherResults,
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

<div class="container">
  <header>
    <h1>Automator Inspector V3</h1>
    <div class="header-actions">
      <button onclick={testSelectors} disabled={isRefreshing || !automator}>
        {isRefreshing ? "Refreshing..." : "Refresh Selectors"}
      </button>
      <button onclick={downloadSnapshot} disabled={isDownloading || !automator}>
        {isDownloading ? "Downloading..." : "Download Snapshot"}
      </button>
    </div>
  </header>

  <section class="card">
    <h2>Automator Detection</h2>
    {#if automator}
      <p><strong>Automator:</strong> {automator.id} (V2)</p>
      <p><strong>URL:</strong> {url}</p>
      <p><strong>Title:</strong> {title}</p>
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
      {#if isRefreshing}
        <p>Testing selectors...</p>
      {:else}
        {#each Object.entries(automator.selectors) as [name, selector]}
          {@const result = selectorResults[name]}
          {@const resolvedSelector = resolveCssSelector(selector)}
          {@const selectorStr = Array.isArray(resolvedSelector)
            ? resolvedSelector[0]
            : resolvedSelector}
          <div class="item">
            <p>
              {#if result?.status === "found"}✅{:else}❌{/if}
              <strong>{name}:</strong> <code>{selectorStr}</code>
              {#if result?.status === "found"}({result.count} found){:else}(not
                found){/if}
            </p>
            {#if result?.samples && result.samples.length > 0}
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
        <p>No extractors tested yet.</p>
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
                <button onclick={() => copyJSON(result.data)}>Copy JSON</button>
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
        <button onclick={testSubmitPrompt} disabled={!testPrompt}
          >Test Submit Prompt</button
        >
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
              <button onclick={() => copyJSON(result.data)}>Copy JSON</button>
            {/if}
          </div>
        {/if}
      </div>
    </section>

    <section class="card">
      <h2>Watchers ({Object.keys(watcherResults).length})</h2>
      {#if Object.keys(watcherResults).length === 0}
        <p>No watchers active yet.</p>
      {:else}
        {#each Object.entries(watcherResults) as [name, result]}
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
                <pre>{JSON.stringify(result.data, null, 2)}</pre>
                <button onclick={() => copyJSON(result.data)}>Copy JSON</button>
              {:else}
                <p>
                  Watcher started successfully. Result: {result.data === null
                    ? "null"
                    : "undefined"}
                </p>
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

  code,
  pre {
    background: #f5f5f5;
    border-radius: 3px;
    font-family: monospace;
  }

  code {
    padding: 0.15em 0.35em;
  }
  pre {
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

  input[type="text"],
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
</style>
