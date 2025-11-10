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
        hasSnapshotAria: "__snapshotAria__" in window,
        hasYamlSnapshot: "__snapshotYaml__" in window,
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
          const automator = window.__automator__;
          if (automator && automator.sendPrompt) {
            await automator.sendPrompt({
              messageId: `test-${Date.now()}`,
              prompt,
            });
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
    <h1>Automator Inspector</h1>
    <div class="header-actions">
      <button onclick={testSelectors} disabled={isRefreshing || !automator}>
        {isRefreshing ? "Refreshing..." : "Refresh"}
      </button>
      <button onclick={downloadSnapshot} disabled={isDownloading || !automator}>
        {isDownloading ? "Downloading..." : "Download Snapshot"}
      </button>
    </div>
  </header>

  <section class="card">
    <h2>Automator Detection</h2>
    {#if automator}
      <p><strong>Automator:</strong> {automator.id}</p>
      <p><strong>URL:</strong> {url}</p>
      <p><strong>Title:</strong> {title}</p>
    {:else}
      <p>No AI assistant detected on this page.</p>
      <p>Navigate to ChatGPT, Claude, Gemini, or Grok.</p>
    {/if}
  </section>

  {#if automator}
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
      <h2>Function Results (Auto-run)</h2>
      {#each Object.entries(functionResults) as [name, result]}
        <div class="item">
          <p>
            {#if result.status === "success"}✅
            {:else if result.status === "error"}❌
            {:else}⏳{/if}
            <strong>{name}():</strong>
            {#if result.duration}{result.duration}ms{/if}
          </p>
          {#if result.status === "success" && result.data}
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
          {:else if result.status === "error"}
            <p class="error">Error: {result.error}</p>
          {:else}
            <p>Running...</p>
          {/if}
        </div>
      {/each}
    </section>

    <section class="card">
      <h2>Manual Function Testing</h2>
      <div class="item">
        <h3>sendPrompt()</h3>
        <label for="test-prompt">Test Prompt:</label>
        <textarea
          id="test-prompt"
          bind:value={testPrompt}
          placeholder="Enter a test prompt..."
          rows="3"
        ></textarea>
        <button onclick={testSendPrompt} disabled={!testPrompt}
          >Test Send Prompt</button
        >
        {#if manualResults.sendPrompt}
          <p class="result">
            {#if manualResults.sendPrompt.status === "success"}✅ Prompt sent
              successfully ({manualResults.sendPrompt.duration}ms)
            {:else if manualResults.sendPrompt.status === "error"}❌ Error: {manualResults
                .sendPrompt.error}
            {:else}⏳ Sending prompt...{/if}
          </p>
        {/if}
      </div>

      <div class="item">
        <h3>openChat()</h3>
        <label for="test-chat-id">Chat ID:</label>
        <input
          id="test-chat-id"
          type="text"
          bind:value={testChatId}
          placeholder="Enter chat ID..."
        />
        <button onclick={testOpenChat} disabled={!testChatId}
          >Test Open Chat</button
        >
        {#if manualResults.openChat}
          <p class="result">
            {#if manualResults.openChat.status === "success"}✅ Chat opened
              successfully ({manualResults.openChat.duration}ms)
            {:else if manualResults.openChat.status === "error"}❌ Error: {manualResults
                .openChat.error}
            {:else}⏳ Opening chat...{/if}
          </p>
        {/if}
      </div>
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

  .result {
    margin-top: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    border: 1px solid #28a745;
    color: #28a745;
    background: #f9fffb;
  }

  .result.error {
    border-color: #dc3545;
    color: #dc3545;
    background: #fff5f5;
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
</style>
