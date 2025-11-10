import { browser } from "wxt/browser";
import { getAutomatorByUrl } from "../lib/services/automators/registry";
import { snapshotAria } from "../lib/utils/aria-snapshot";
import { snapshotYaml } from "../lib/utils/yaml-snapshot";
import { resolveCssSelector } from "../lib/utils/selectors";
import type {
  AiAssistantAutomatorV2,
  AiAssistantId,
  ConversationRef,
} from "../lib/types/automators-v2";
import type {
  DevToolsTestMessage,
  DevToolsCommand,
  FunctionResult,
  SelectorResults,
  SelectorTestResult,
} from "../lib/types/devtools-messages";

export default defineContentScript({
  matches: [
    "<all_urls>",
    // "*://chat.openai.com/*",
    // "*://chatgpt.com/*",
    // "*://claude.ai/*",
    // "*://gemini.google.com/*",
    // "*://aistudio.google.com/*",
    // "*://grok.com/*",
  ],
  async main() {
    console.log("[content] Content script V4 started");

    const automator = getAutomatorByUrl(window.location.href);

    if (!automator) {
      console.log("[content] No automator found for this URL");

      // Still listen for snapshot requests even without an automator
      browser.runtime.onMessage.addListener(
        (message: any, _sender, sendResponse) => {
          const command = message as DevToolsCommand;

          if (command.type === "devtools:get-snapshots") {
            // Generate snapshots without automator
            try {
              const ariaSnapshot = snapshotAria(document.body);
              const yamlSnapshot = snapshotYaml(document.body);

              browser.runtime.sendMessage({
                type: "snapshots:results",
                automatorId: "none",
                ariaSnapshot,
                yamlSnapshot,
                timestamp: new Date().toISOString(),
              }).catch((error) => {
                console.error("[content-v4] Failed to send snapshot message:", error);
              });

              sendResponse({ success: true });
            } catch (error: any) {
              console.error("[content-v4] Failed to generate snapshots:", error);

              browser.runtime.sendMessage({
                type: "snapshots:results",
                automatorId: "none",
                ariaSnapshot: `# Error generating ARIA snapshot: ${error.message}`,
                yamlSnapshot: `# Error generating YAML snapshot: ${error.message}`,
                timestamp: new Date().toISOString(),
              }).catch(console.error);

              sendResponse({ success: false, error: error.message });
            }
            return true; // Async response
          }
        }
      );
      return;
    }

    console.log("[content] Automator found:", automator.id);
    const assistantId = automator.id;

    // Initialize test runner
    const testRunner = new AutomatorTestRunner(automator, assistantId);

    // Listen for commands from DevTools panel
    browser.runtime.onMessage.addListener(
      (message: any, _sender, sendResponse) => {
        const command = message as DevToolsCommand;

        // Only handle DevTools commands for this automator
        if ("automatorId" in command && command.automatorId !== assistantId) {
          return;
        }

        switch (command.type) {
          case "devtools:run-tests":
            testRunner
              .runFullTestSuite()
              .then(() => sendResponse({ success: true }))
              .catch((error) =>
                sendResponse({ success: false, error: error.message })
              );
            return true; // Async response

          case "devtools:test-function":
            testRunner
              .testFunction(command.functionName, command.args as any[])
              .then((result) => sendResponse({ success: true, result }))
              .catch((error) =>
                sendResponse({ success: false, error: error.message })
              );
            return true; // Async response

          case "devtools:refresh-selectors":
            testRunner
              .testSelectors()
              .then(() => sendResponse({ success: true }))
              .catch((error) =>
                sendResponse({ success: false, error: error.message })
              );
            return true; // Async response

          case "devtools:navigate-to-chat":
            testRunner
              .testFunction("goToChatPage", [{ chatId: command.chatId }])
              .then((result) => sendResponse({ success: true, result }))
              .catch((error) =>
                sendResponse({ success: false, error: error.message })
              );
            return true; // Async response

          case "devtools:submit-prompt":
            testRunner
              .submitPromptAndWatch(
                command.prompt,
                command.chatId,
                command.messageId
              )
              .then((result) => sendResponse({ success: true, result }))
              .catch((error) =>
                sendResponse({ success: false, error: error.message })
              );
            return true; // Async response

          case "devtools:get-snapshots":
            testRunner
              .getSnapshots()
              .then((result) => sendResponse({ success: true, result }))
              .catch((error) =>
                sendResponse({ success: false, error: error.message })
              );
            return true; // Async response
        }
      }
    );

    // Auto-run tests on initialization
    console.log("[content-v4] Starting automatic test suite...");
    await testRunner.runFullTestSuite();
  },
});

/**
 * AutomatorTestRunner - Runs tests and streams results to DevTools
 */
class AutomatorTestRunner {
  constructor(
    private automator: AiAssistantAutomatorV2,
    private assistantId: AiAssistantId
  ) {}

  /**
   * Send a test message to DevTools panel
   */
  private sendMessage(message: DevToolsTestMessage): void {
    browser.runtime.sendMessage(message).catch((error) => {
      console.error("[content-v4] Failed to send message:", error);
    });
  }

  /**
   * Run the complete test suite
   */
  async runFullTestSuite(): Promise<void> {
    const startTime = Date.now();

    this.sendMessage({
      type: "test:suite:start",
      automatorId: this.assistantId,
      timestamp: new Date().toISOString(),
    });

    this.sendMessage({
      type: "automator:status",
      automatorId: this.assistantId,
      status: "testing",
      message: "Running test suite...",
      timestamp: new Date().toISOString(),
    });

    let passed = 0;
    let failed = 0;
    let total = 0;

    try {
      // Test selectors
      await this.testSelectors();

      // Test extractor functions
      const extractorTests = [
        { name: "getLoginState", args: [{ timeoutMs: 5000 }] },
        { name: "getChatEntries", args: [] },
        // Skip getChatPage test - requires a valid chatId parameter
        // { name: "getChatPage", args: [] },
      ];

      for (const test of extractorTests) {
        total++;
        const result = await this.testFunction(test.name, test.args);
        if (result.status === "success") {
          passed++;
        } else {
          failed++;
        }
      }

      this.sendMessage({
        type: "automator:status",
        automatorId: this.assistantId,
        status: "idle",
        message: "Test suite completed",
        timestamp: new Date().toISOString(),
      });

      this.sendMessage({
        type: "test:suite:complete",
        automatorId: this.assistantId,
        timestamp: new Date().toISOString(),
        summary: {
          total,
          passed,
          failed,
          duration: Date.now() - startTime,
        },
      });
    } catch (error: any) {
      this.sendMessage({
        type: "automator:status",
        automatorId: this.assistantId,
        status: "error",
        message: `Test suite failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Test all selectors and stream results
   */
  async testSelectors(): Promise<void> {
    console.log("[content-v4] Testing selectors...");

    this.sendMessage({
      type: "test:started",
      automatorId: this.assistantId,
      testName: "selectors",
      category: "selector",
      timestamp: new Date().toISOString(),
    });

    const results: Record<string, SelectorTestResult> = {};

    for (const [name, selector] of Object.entries(this.automator.selectors)) {
      try {
        const resolvedSelector = resolveCssSelector(selector);
        const selectorString = Array.isArray(resolvedSelector)
          ? resolvedSelector[0]
          : resolvedSelector;

        const elements = document.querySelectorAll(selectorString);
        const samples = Array.from(elements)
          .slice(0, 3)
          .map((el) => el.textContent?.trim() ?? null);

        results[name] = {
          status: elements.length > 0 ? "found" : "not-found",
          count: elements.length,
          samples,
        };
      } catch (error) {
        results[name] = {
          status: "not-found",
          count: 0,
          samples: [],
        };
      }
    }

    this.sendMessage({
      type: "selector:results",
      automatorId: this.assistantId,
      results,
      timestamp: new Date().toISOString(),
    });

    console.log("[content-v4] Selector testing complete:", results);
  }

  /**
   * Test a single automator function
   */
  async testFunction(
    functionName: string,
    args: any[] = []
  ): Promise<FunctionResult> {
    console.log(
      `[content-v4] Testing function: ${functionName} with args:`,
      args
    );

    const category = this.categorizeFunction(functionName);

    this.sendMessage({
      type: "test:started",
      automatorId: this.assistantId,
      testName: functionName,
      category,
      timestamp: new Date().toISOString(),
    });

    try {
      // Check if function exists
      if (typeof (this.automator as any)[functionName] !== "function") {
        const error = `Function "${functionName}" not found on automator`;
        this.sendMessage({
          type: "test:error",
          automatorId: this.assistantId,
          testName: functionName,
          category,
          error,
          timestamp: new Date().toISOString(),
        });
        return { status: "error", error };
      }

      // Execute function
      const start = Date.now();
      const data = await (this.automator as any)[functionName](...args);
      const duration = Date.now() - start;

      const result: FunctionResult = {
        status: "success",
        data,
        duration,
      };

      this.sendMessage({
        type: "test:result",
        automatorId: this.assistantId,
        testName: functionName,
        category,
        result,
        timestamp: new Date().toISOString(),
      });

      console.log(`[content-v4] Function ${functionName} succeeded:`, data);
      return result;
    } catch (error: any) {
      const result: FunctionResult = {
        status: "error",
        error: error.message || String(error),
      };

      this.sendMessage({
        type: "test:error",
        automatorId: this.assistantId,
        testName: functionName,
        category,
        error: error.message || String(error),
        timestamp: new Date().toISOString(),
      });

      console.error(`[content-v4] Function ${functionName} failed:`, error);
      return result;
    }
  }

  /**
   * Submit a prompt and watch conversation status
   * Note: Assumes we're already on the correct page (use goToChatPage first if needed)
   */
  async submitPromptAndWatch(
    prompt: string,
    chatId?: string,
    messageId?: string
  ): Promise<FunctionResult> {
    const generatedMessageId = messageId || `test-${Date.now()}`;

    // Submit prompt (without navigation)
    const result = await this.testFunction("submitPrompt", [
      { prompt, chatId },
    ]);

    if (result.status === "success" && result.data) {
      // Start watching conversation status
      const conversationRef: ConversationRef = {
        messageId: result.data.messageId || generatedMessageId,
        chatId: result.data.chatId || chatId || "current",
      };

      console.log(
        "[content-v4] Starting conversation watcher for:",
        conversationRef
      );

      // Watch and stream updates
      this.automator.watchConversationStatus(conversationRef, (status) => {
        console.log("[content-v4] Conversation status update:", status);

        this.sendMessage({
          type: "watcher:update",
          automatorId: this.assistantId,
          watcherName: "watchConversationStatus",
          data: status,
          timestamp: new Date().toISOString(),
        });
      });
    }

    return result;
  }

  /**
   * Get ARIA and YAML snapshots of the page
   */
  async getSnapshots(): Promise<void> {
    console.log("[content-v4] Generating snapshots...");

    try {
      const ariaSnapshot = snapshotAria(document.body);
      const yamlSnapshot = snapshotYaml(document.body);

      this.sendMessage({
        type: "snapshots:results",
        automatorId: this.assistantId,
        ariaSnapshot,
        yamlSnapshot,
        timestamp: new Date().toISOString(),
      });

      console.log("[content-v4] Snapshots sent successfully");
    } catch (error: any) {
      console.error("[content-v4] Failed to generate snapshots:", error);

      this.sendMessage({
        type: "snapshots:results",
        automatorId: this.assistantId,
        ariaSnapshot: `# Error generating ARIA snapshot: ${error.message}`,
        yamlSnapshot: `# Error generating YAML snapshot: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Categorize function by name
   */
  private categorizeFunction(
    functionName: string
  ): "extractor" | "action" | "watcher" {
    if (functionName.startsWith("get")) return "extractor";
    if (functionName.startsWith("watch")) return "watcher";
    return "action";
  }
}
