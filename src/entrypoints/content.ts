import { browser } from "wxt/browser";
import { getAutomatorByUrl } from "../lib/services/automators/registry";
import { snapshotAria } from "../lib/utils/aria-snapshot";
import { snapshotYaml } from "../lib/utils/yaml-snapshot";
import { resolveCssSelector } from "../lib/utils/selectors";
import type {
  AiAssistantAutomatorV2,
  AiAssistantId,
  ChatError,
  SubmitPromptInput,
} from "../lib/types/automators-v2";
import type {
  DevToolsTestMessage,
  DevToolsCommand,
  FunctionResult,
  SelectorTestResult,
  TestSummary,
} from "../lib/types/devtools-messages";
import type {
  BackgroundToContentCommand,
  ContentToBackgroundNotification,
} from "../lib/types/runtime";
import type { SnapshotBundle } from "../lib/types/websocket";

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

              browser.runtime
                .sendMessage({
                  type: "snapshots:results",
                  automatorId: "none",
                  ariaSnapshot,
                  yamlSnapshot,
                  timestamp: new Date().toISOString(),
                })
                .catch((error) => {
                  console.error(
                    "[content-v4] Failed to send snapshot message:",
                    error
                  );
                });

              sendResponse({ success: true });
            } catch (error: any) {
              console.error(
                "[content-v4] Failed to generate snapshots:",
                error
              );

              browser.runtime
                .sendMessage({
                  type: "snapshots:results",
                  automatorId: "none",
                  ariaSnapshot: `# Error generating ARIA snapshot: ${error.message}`,
                  yamlSnapshot: `# Error generating YAML snapshot: ${error.message}`,
                  timestamp: new Date().toISOString(),
                })
                .catch(console.error);

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
    const connectedAutomator: AiAssistantAutomatorV2 = automator;

    const forwardToBridge: BridgeNotifier = (message) => {
      const payload: ContentToBackgroundNotification = {
        ...message,
        assistantId,
      };
      browser.runtime.sendMessage(payload).catch((error) => {
        console.error("[content-v4] Failed to send bridge notification:", error);
      });
    };

    // Initialize test runner
    const testRunner = new AutomatorTestRunner(
      connectedAutomator,
      assistantId,
      forwardToBridge
    );

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

          case "devtools:submit-prompt":
            testRunner
              .testFunction("submitPrompt", [
                { prompt: command.prompt, chatId: command.chatId },
              ])
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

    // Listen for commands from the background script
    browser.runtime.onMessage.addListener((message: any) => {
      if (!isBackgroundCommand(message)) {
        return;
      }
      const command = message as BackgroundToContentCommand;
      if (command.assistantId !== assistantId) {
        return;
      }
      handleBackgroundCommand(command);
    });

    // Auto-run tests on initialization
    console.log("[content-v4] Starting automatic test suite...");
    try {
      await testRunner.runFullTestSuite();
    } catch (error) {
      console.error("[content-v4] Automatic test suite failed:", error);
    } finally {
      testRunner.startPageWatcher();
    }

    async function submitPromptForBridge(
      requestId: string,
      input: SubmitPromptInput
    ) {
      try {
        const result = await connectedAutomator.submitPrompt(input);
        forwardToBridge({
          type: "ws:submit-prompt-result",
          requestId,
          payload: result,
        });
      } catch (error) {
        forwardToBridge({
          type: "ws:error",
          requestId,
          payload: toChatError("prompt-failed", error),
        });
      }
    }

    async function runTestsForBridge(requestId: string) {
      const events: DevToolsTestMessage[] = [];
      const stopRecording = testRunner.onEvent((event) => {
        events.push(event);
      });

      try {
        const summary = await testRunner.runFullTestSuite();
        const snapshots = await testRunner.getSnapshots();
        forwardToBridge({
          type: "ws:run-tests-result",
          requestId,
          payload: {
            summary,
            events,
            snapshots,
          },
        });
      } catch (error) {
        forwardToBridge({
          type: "ws:error",
          requestId,
          payload: toChatError("unexpected", error),
        });
      } finally {
        stopRecording();
      }
    }

    function handleBackgroundCommand(command: BackgroundToContentCommand): void {
      switch (command.type) {
        case "assistant:watch-page":
          testRunner.startServerWatch(
            command.payload.watchId,
            command.payload.chatId,
            command.payload.requestId
          );
          break;
        case "assistant:watch-page-stop":
          testRunner.stopServerWatch(command.payload.watchId);
          break;
        case "assistant:submit-prompt":
          void submitPromptForBridge(
            command.payload.requestId,
            command.payload.input
          );
          break;
        case "assistant:run-tests":
          void runTestsForBridge(command.payload.requestId);
          break;
      }
    }
  },
});

/**
 * AutomatorTestRunner - Runs tests and streams results to DevTools
 * Rewritten to match V2 interface: getLandingPage, getChatPage, submitPrompt, watchPage
 */
type WithoutAssistantId<T> = T extends any ? Omit<T, "assistantId"> : never;

type BridgeNotifier = (
  message: WithoutAssistantId<ContentToBackgroundNotification>
) => void;

type WatchSource = "auto" | "server";

class AutomatorTestRunner {
  private pageWatcherUnsubscribe?: () => void;
  private activeWatchSource: WatchSource | null = null;
  private activeWatchId?: string;
  private autoWatchEnabled = false;
  private autoWatchChatId?: string;
  private readonly eventListeners = new Set<(message: DevToolsTestMessage) => void>();

  constructor(
    private automator: AiAssistantAutomatorV2,
    private assistantId: AiAssistantId,
    private notifyBridge: BridgeNotifier
  ) {}

  /**
   * Send a test message to DevTools panel
   */
  private sendMessage(message: DevToolsTestMessage): void {
    this.emitEvent(message);
    browser.runtime.sendMessage(message).catch((error) => {
      console.error("[content-v4] Failed to send message:", error);
    });
  }

  onEvent(listener: (message: DevToolsTestMessage) => void): () => void {
    this.eventListeners.add(listener);
    return () => {
      this.eventListeners.delete(listener);
    };
  }

  private emitEvent(message: DevToolsTestMessage): void {
    for (const listener of this.eventListeners) {
      try {
        listener(message);
      } catch (error) {
        console.error("[content-v4] Test event listener failed:", error);
      }
    }
  }

  /**
   * Run the complete test suite for V2 interface
   */
  async runFullTestSuite(): Promise<TestSummary> {
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
      // Test selectors first
      await this.testSelectors();

      // Test V2 extractor functions
      const extractorTests = [
        { name: "getLandingPage", args: [] },
        // Skip getChatPage - requires a valid chatId parameter
        // { name: "getChatPage", args: ["some-chat-id"] },
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

      const summary: TestSummary = {
        total,
        passed,
        failed,
        duration: Date.now() - startTime,
      };

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
        summary,
      });

      return summary;
    } catch (error: any) {
      this.sendMessage({
        type: "automator:status",
        automatorId: this.assistantId,
        status: "error",
        message: `Test suite failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
      throw error;
    } finally {
      this.resumeAutoWatchIfNeeded();
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
   * Get ARIA and YAML snapshots of the page
   */
  async getSnapshots(): Promise<SnapshotBundle> {
    console.log("[content-v4] Generating snapshots...");

    const generatedAt = new Date().toISOString();

    try {
      const ariaSnapshot = snapshotAria(document.body);
      const yamlSnapshot = snapshotYaml(document.body);
      const payload: SnapshotBundle = {
        aria: ariaSnapshot,
        yaml: yamlSnapshot,
        generatedAt,
      };

      this.sendMessage({
        type: "snapshots:results",
        automatorId: this.assistantId,
        ariaSnapshot,
        yamlSnapshot,
        timestamp: generatedAt,
      });

      console.log("[content-v4] Snapshots sent successfully");
      return payload;
    } catch (error: any) {
      console.error("[content-v4] Failed to generate snapshots:", error);

      this.sendMessage({
        type: "snapshots:results",
        automatorId: this.assistantId,
        ariaSnapshot: `# Error generating ARIA snapshot: ${error.message}`,
        yamlSnapshot: `# Error generating YAML snapshot: ${error.message}`,
        timestamp: generatedAt,
      });
      throw error;
    }
  }

  /**
   * Start the page watcher to continuously monitor page changes
   */
  startPageWatcher(chatId?: string): void {
    this.autoWatchEnabled = true;
    if (chatId !== undefined) {
      this.autoWatchChatId = chatId;
    }
    if (this.activeWatchSource === "server") {
      return;
    }
    this.startWatchInternal({ source: "auto", chatId: this.autoWatchChatId });
  }

  startServerWatch(
    watchId: string,
    chatId?: string,
    requestId?: string
  ): void {
    this.autoWatchEnabled = true;
    this.startWatchInternal({ source: "server", watchId, chatId, requestId });
  }

  stopServerWatch(watchId: string): void {
    if (this.activeWatchSource === "server" && this.activeWatchId === watchId) {
      this.stopCurrentWatcher();
      this.resumeAutoWatchIfNeeded();
    }
  }

  /**
   * Stop the page watcher
   */
  stopPageWatcher(): void {
    this.autoWatchEnabled = false;
    this.stopCurrentWatcher();
  }

  private resumeAutoWatchIfNeeded(): void {
    if (!this.autoWatchEnabled) {
      return;
    }
    if (this.activeWatchSource === "server") {
      return;
    }
    this.startWatchInternal({ source: "auto", chatId: this.autoWatchChatId });
  }

  private stopCurrentWatcher(): void {
    if (this.pageWatcherUnsubscribe) {
      this.pageWatcherUnsubscribe();
      this.pageWatcherUnsubscribe = undefined;
      console.log("[content-v4] Page watcher stopped");
    }
    this.activeWatchSource = null;
    this.activeWatchId = undefined;
  }

  private startWatchInternal(options: {
    readonly source: WatchSource;
    readonly watchId?: string;
    readonly chatId?: string;
    readonly requestId?: string;
  }): void {
    this.stopCurrentWatcher();

    console.log(`[content-v4] Starting ${options.source} page watcher...`);

    this.sendMessage({
      type: "automator:status",
      automatorId: this.assistantId,
      status: "idle",
      message: "Page watcher started",
      timestamp: new Date().toISOString(),
    });

    try {
      this.pageWatcherUnsubscribe = this.automator.watchPage(
        { chatId: options.chatId },
        (event) => {
          console.log("[content-v4] Page event:", event);

          this.sendMessage({
            type: "watcher:update",
            automatorId: this.assistantId,
            watcherName: "watchPage",
            data: event,
            timestamp: new Date().toISOString(),
          });

          this.notifyBridge({
            type: "ws:watch-page-update",
            watchId: options.watchId,
            payload: event,
          });
        }
      );
      this.activeWatchSource = options.source;
      this.activeWatchId = options.watchId;
    } catch (error: any) {
      console.error("[content-v4] Failed to start watcher:", error);
      this.notifyBridge({
        type: "ws:error",
        watchId: options.watchId,
        requestId: options.requestId,
        payload: toChatError("unexpected", error),
      });
      this.activeWatchSource = null;
      this.activeWatchId = undefined;
      if (options.source === "server") {
        this.resumeAutoWatchIfNeeded();
      }
    }
  }

  /**
   * Categorize function by name for V2 interface
   */
  private categorizeFunction(
    functionName: string
  ): "extractor" | "action" | "watcher" {
    // V2 extractors: getLandingPage, getChatPage
    if (functionName === "getLandingPage" || functionName === "getChatPage") {
      return "extractor";
    }
    // V2 watchers: watchPage
    if (functionName === "watchPage") {
      return "watcher";
    }
    // V2 actions: submitPrompt, getUrl
    return "action";
  }
}

const backgroundCommandTypes = new Set<BackgroundToContentCommand["type"]>([
  "assistant:watch-page",
  "assistant:watch-page-stop",
  "assistant:submit-prompt",
  "assistant:run-tests",
]);

const isBackgroundCommand = (
  message: unknown
): message is BackgroundToContentCommand => {
  if (
    !message ||
    typeof message !== "object" ||
    !("type" in message) ||
    typeof (message as any).type !== "string"
  ) {
    return false;
  }
  return backgroundCommandTypes.has(
    (message as BackgroundToContentCommand).type
  );
};

const toChatError = (
  code: ChatError["code"],
  error: unknown
): ChatError => {
  if (error instanceof Error) {
    return {
      code,
      message: error.message,
      details: error.stack ? { stack: error.stack } : undefined,
    };
  }
  return {
    code,
    message: String(error),
  };
};
