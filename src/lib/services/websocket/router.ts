// lib/services/websocket/router.ts

import { browser } from "wxt/browser";
import { getAutomatorById } from "../automators/registry.js";
import type {
  AiAssistantId,
  ChatError,
  SubmitPromptInput,
} from "../../types/automators-v2.js";
import type {
  ServerMessage,
  ExtensionMessage,
} from "../../types/websocket.js";
import type { BackgroundToContentCommand } from "../../types/runtime.js";
import type { WebsocketClient } from "./client.js";

type AssistantTab = {
  readonly assistant: AiAssistantId;
  readonly tabId: number;
};

export class WebsocketRouter {
  private desiredAssistant: AiAssistantId = "chatgpt";
  private lastKnownAssistantTab: AssistantTab | null = null;

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
    assistant: AiAssistantId,
    requestId: string,
    input: SubmitPromptInput
  ) {
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

    const targetUrl = automator.getUrlForAction("submitPrompt", {
      chatId: input.chatId,
    });

    await this.dispatchToContent(
      assistant,
      {
        type: "assistant:submit-prompt",
        assistantId: assistant,
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

    const action = message.chatId ? "getChatPage" : "getLandingPage";
    const targetUrl = automator.getUrlForAction(action, {
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

  private async handleWatchPageStop(
    assistant: AiAssistantId,
    watchId: string
  ) {
    await this.dispatchToContent(
      assistant,
      {
        type: "assistant:watch-page-stop",
        assistantId: assistant,
        payload: { watchId },
      },
      undefined,
      { watchId }
    );
  }

  private async handleRunTests(
    assistant: AiAssistantId,
    requestId: string
  ) {
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

    const targetUrl = automator.getUrlForAction("getLandingPage");

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

  private async ensureAssistantTab(
    assistant: AiAssistantId,
    preferredUrl?: string
  ): Promise<number | null> {
    if (this.lastKnownAssistantTab?.assistant === assistant) {
      const tabExists = await browser.tabs
        .get(this.lastKnownAssistantTab.tabId)
        .then(
          () => true,
          () => false
        );
      if (tabExists) {
        if (preferredUrl) {
          await browser.tabs.update(this.lastKnownAssistantTab.tabId, {
            url: preferredUrl,
            active: false,
          });
        }
        return this.lastKnownAssistantTab.tabId;
      }
      this.lastKnownAssistantTab = null;
    }

    // Get automator configuration
    const automator = getAutomatorById(assistant);
    if (!automator) {
      return null;
    }

    const matchingTabs = await browser.tabs.query({
      url: automator.urlGlobs as unknown as string[],
    });

    const tab =
      matchingTabs.find((candidate) => {
        if (!preferredUrl || !candidate.url) return true;
        return candidate.url === preferredUrl;
      }) ?? matchingTabs[0];

    if (tab?.id) {
      if (preferredUrl && tab.url !== preferredUrl) {
        await browser.tabs.update(tab.id, { url: preferredUrl, active: false });
      }
      this.lastKnownAssistantTab = { assistant, tabId: tab.id };
      return tab.id;
    }

    const created = await browser.tabs.create({
      url: preferredUrl ?? automator.url,
      active: false,
    });
    if (!created.id) {
      return null;
    }
    this.lastKnownAssistantTab = { assistant, tabId: created.id };
    return created.id;
  }

  private async dispatchToContent(
    assistant: AiAssistantId,
    command: BackgroundToContentCommand,
    preferredUrl?: string,
    context?: {
      readonly requestId?: string;
      readonly watchId?: string;
      readonly errorCode?: ChatError["code"];
    }
  ) {
    const tabId = await this.ensureAssistantTab(assistant, preferredUrl);
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
      await browser.tabs.sendMessage(tabId, command);
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
