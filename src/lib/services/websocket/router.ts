// lib/services/websocket/router.ts

import { browser } from "wxt/browser";
import { getAutomatorById } from "../automators/registry.js";
import type {
  AiAssistantId,
  ChatError,
  SubmitPromptInput,
} from "../../types/automators-v2.js";
import type { ServerMessage, ExtensionMessage } from "../../types/websocket.js";
import type { BackgroundToContentCommand } from "../../types/runtime.js";
import type { WebsocketClient } from "./client.js";

export class WebsocketRouter {
  private desiredAssistant: AiAssistantId = "chatgpt";

  constructor(private readonly client: WebsocketClient) {}

  handleMessage = (message: ServerMessage): void => {
    switch (message.type) {
      case "connection:hello":
        this.desiredAssistant = message.assistant;
        if (message.port) {
          this.client.updatePort(message.port);
        }
        this.send({
          type: "connection:status",
          payload: {
            status: "open",
            message: `Ready for assistant ${this.desiredAssistant}`,
          },
        });
        break;
      case "connection:close":
        this.client.disconnect();
        break;
      case "ws:watch-page":
        this.handleWatchPageStart(message);
        break;
      case "ws:watch-page-stop":
        this.handleWatchPageStop(message.assistant, message.watchId);
        break;
      case "ws:submit-prompt":
        this.handleSubmitPrompt(
          message.assistant,
          message.requestId,
          message.input
        );
        break;
      case "ws:run-tests":
        this.handleRunTests(message.assistant, message.requestId);
        break;
    }
  };

  private async handleSubmitPrompt(
    assistantId: AiAssistantId,
    requestId: string,
    input: SubmitPromptInput
  ) {
    const automator = getAutomatorById(assistantId);
    if (!automator) {
      this.sendBridgeError(
        assistantId,
        {
          code: "navigation-failed",
          message: "Automator not found for assistant",
          details: { assistantId },
        },
        { requestId }
      );
      return;
    }

    const targetUrl = automator.getUrl({
      chatId: input.chatId,
    });

    await this.dispatchToContent(
      assistantId,
      {
        type: "assistant:submit-prompt",
        assistantId,
        payload: { requestId, input },
      },
      targetUrl,
      { requestId, errorCode: "prompt-failed" }
    );
  }

  private async handleWatchPageStart(
    message: Extract<ServerMessage, { type: "ws:watch-page" }>
  ) {
    const automator = getAutomatorById(message.assistant);
    if (!automator) {
      this.sendBridgeError(
        message.assistant,
        {
          code: "navigation-failed",
          message: "Automator not found for assistant",
          details: { assistant: message.assistant },
        },
        { requestId: message.requestId, watchId: message.watchId }
      );
      return;
    }

    const targetUrl = automator.getUrl({
      chatId: message.chatId,
    });

    await this.dispatchToContent(
      message.assistant,
      {
        type: "assistant:watch-page",
        assistantId: message.assistant,
        payload: {
          requestId: message.requestId,
          watchId: message.watchId,
          chatId: message.chatId,
          intervalMs: message.intervalMs,
        },
      },
      targetUrl,
      { requestId: message.requestId, watchId: message.watchId }
    );
  }

  private async handleWatchPageStop(assistant: AiAssistantId, watchId: string) {
    const automator = getAutomatorById(assistant);
    if (!automator) {
      this.sendBridgeError(
        assistant,
        {
          code: "navigation-failed",
          message: "Automator not found for assistant",
          details: { assistant },
        },
        { watchId }
      );
      return;
    }

    // For stop, we just need to find any existing tab (use landing page URL as fallback)
    const targetUrl = automator.getUrl();

    await this.dispatchToContent(
      assistant,
      {
        type: "assistant:watch-page-stop",
        assistantId: assistant,
        payload: { watchId },
      },
      targetUrl,
      { watchId }
    );
  }

  private async handleRunTests(assistant: AiAssistantId, requestId: string) {
    const automator = getAutomatorById(assistant);
    if (!automator) {
      this.sendBridgeError(
        assistant,
        {
          code: "navigation-failed",
          message: "Automator not found for assistant",
          details: { assistant },
        },
        { requestId }
      );
      return;
    }

    const targetUrl = automator.getUrl();

    await this.dispatchToContent(
      assistant,
      {
        type: "assistant:run-tests",
        assistantId: assistant,
        payload: { requestId },
      },
      targetUrl,
      { requestId }
    );
  }

  /**
   * Normalize URL for comparison (remove trailing slash, hash, search params)
   */
  private normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      // Keep only origin + pathname, normalize trailing slash
      urlObj.pathname = urlObj.pathname.replace(/\/$/, "") || "/";
      urlObj.hash = "";
      urlObj.search = "";
      return urlObj.href;
    } catch {
      return url;
    }
  }

  /**
   * Check if two URLs point to the same page (ignoring hash/search/trailing slash)
   */
  private isSamePage(
    url1: string | undefined,
    url2: string | undefined
  ): boolean {
    if (!url1 || !url2) return false;
    return this.normalizeUrl(url1) === this.normalizeUrl(url2);
  }

  /**
   * Wait for a newly created tab to finish loading
   */
  private async waitForTabComplete(
    tabId: number,
    timeoutMs = 10000
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        const tab = await browser.tabs.get(tabId);
        if (tab.status === "complete") {
          // Give content script a moment to initialize
          await new Promise((resolve) => setTimeout(resolve, 500));
          return;
        }
      } catch {
        // Tab might have been closed
        return;
      }

      // Check again in 100ms
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  /**
   * Find or create a tab for the assistant (stateless - never navigates existing tabs)
   *
   * Behavior:
   * - If exact match exists: use it (no new tab)
   * - If no exact match: create new tab with targetUrl
   * - Always waits for new tabs to complete loading
   * - Always activates the tab before returning
   */
  private async ensureAssistantTab(
    assistant: AiAssistantId,
    targetUrl: string
  ): Promise<number | null> {
    const automator = getAutomatorById(assistant);
    if (!automator) {
      return null;
    }

    // Query for all tabs matching this assistant's URL patterns
    const matchingTabs = await browser.tabs.query({
      url: automator.urlGlobs as unknown as string[],
    });

    // Try to find exact page match
    const exactMatch = matchingTabs.find((tab) =>
      this.isSamePage(tab.url, targetUrl)
    );
    if (exactMatch?.id) {
      // Activate the existing tab
      await browser.tabs.update(exactMatch.id, { active: true });
      return exactMatch.id;
    }

    // No exact match - create new tab for the specific URL
    const created = await browser.tabs.create({
      url: targetUrl,
      active: true,
    });
    if (!created.id) {
      return null;
    }
    await this.waitForTabComplete(created.id);
    return created.id;
  }

  /**
   * Send message to tab with exponential backoff retry
   */
  private async sendMessageWithRetry(
    tabId: number,
    command: BackgroundToContentCommand,
    maxRetries = 3
  ): Promise<void> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await browser.tabs.sendMessage(tabId, command);
        return; // Success!
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;

        if (isLastAttempt) {
          // Final attempt failed, throw error
          throw error;
        }

        // Exponential backoff: 200ms, 400ms, 800ms
        const delayMs = 200 * Math.pow(2, attempt);
        console.log(
          `[WebsocketRouter] Retry ${
            attempt + 1
          }/${maxRetries} after ${delayMs}ms - content script not ready`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  /**
   * Dispatch a command to the content script running in the assistant's tab
   */
  private async dispatchToContent(
    assistant: AiAssistantId,
    command: BackgroundToContentCommand,
    targetUrl: string,
    context?: {
      readonly requestId?: string;
      readonly watchId?: string;
      readonly errorCode?: ChatError["code"];
    }
  ) {
    const tabId = await this.ensureAssistantTab(assistant, targetUrl);
    if (tabId === null) {
      this.sendBridgeError(
        assistant,
        {
          code: "navigation-failed",
          message: "Unable to resolve assistant tab",
        },
        context
      );
      return;
    }

    try {
      await this.sendMessageWithRetry(tabId, command);
    } catch (error) {
      console.error("Failed to dispatch message to content script", error);
      this.sendBridgeError(
        assistant,
        {
          code: context?.errorCode ?? "unexpected",
          message: "Content script communication failed",
          details: { error: `${error}` },
        },
        context
      );
    }
  }

  private send(message: ExtensionMessage): void {
    this.client.send(message);
  }

  private sendBridgeError(
    assistant: AiAssistantId,
    payload: ChatError,
    context?: { readonly requestId?: string; readonly watchId?: string }
  ): void {
    this.send({
      type: "ws:error",
      assistantId: assistant,
      requestId: context?.requestId,
      watchId: context?.watchId,
      payload,
    });
  }
}
