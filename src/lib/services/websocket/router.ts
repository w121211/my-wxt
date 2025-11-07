// lib/services/websocket/router.ts

import { browser } from "wxt/browser";
import type {
  AiAssistantId,
  PromptSubmission,
  ChatTarget,
} from "../../types/automators";
import type { ServerMessage, ExtensionMessage } from "../../types/websocket";
import type { BackgroundToContentCommand } from "../../types/runtime";
import type { WebsocketClient } from "./client";
import { ChatgptAutomator } from "../automators/chatgpt-automator";
import { ClaudeAutomator } from "../automators/claude-extractor";
import { GeminiAutomator } from "../automators/gemini-extractor";
import { GrokAutomator } from "../automators/grok-automator";

type AssistantTab = {
  readonly assistant: AiAssistantId;
  readonly tabId: number;
};

type PendingPrompt = {
  readonly request: PromptSubmission;
  readonly assistant: AiAssistantId;
  readonly tabId: number;
};

export class WebsocketRouter {
  private desiredAssistant: AiAssistantId = "chatgpt";
  private lastKnownAssistantTab: AssistantTab | null = null;
  private readonly pendingPrompts = new Map<string, PendingPrompt>();

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
      case "chat:request-list":
        this.dispatchToContent(message.assistant, {
          type: "assistant:extract-chat-list",
          assistantId: message.assistant,
        });
        break;
      case "chat:request-details":
        this.dispatchToContent(message.assistant, {
          type: "assistant:extract-chat",
          assistantId: message.assistant,
          payload: message.target,
        });
        break;
      case "chat:submit-prompt":
        this.handleSubmitPrompt(message.assistant, message.request);
        break;
    }
  };

  private async handleSubmitPrompt(
    assistant: AiAssistantId,
    request: PromptSubmission
  ) {
    const tabId = await this.ensureAssistantTab(
      assistant,
      request.conversation?.url
    );
    if (tabId === null) {
      this.send({
        type: "chat:error",
        assistantId: assistant,
        payload: {
          code: "navigation-failed",
          message: "Unable to locate or create assistant tab",
          details: { assistant },
        },
      });
      return;
    }

    this.pendingPrompts.set(request.promptId, {
      assistant,
      request,
      tabId,
    });

    await this.dispatchToContent(assistant, {
      type: "assistant:process-prompt",
      assistantId: assistant,
      payload: request,
    });
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
    const AutomatorClass = this.getAutomatorClass(assistant);
    if (!AutomatorClass) {
      return null;
    }

    const matchingTabs = await browser.tabs.query({
      url: AutomatorClass.urlGlobs as unknown as string[],
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
      url: preferredUrl ?? AutomatorClass.url,
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
    command: BackgroundToContentCommand
  ) {
    const tabId = await this.ensureAssistantTab(assistant);
    if (tabId === null) {
      this.send({
        type: "chat:error",
        assistantId: assistant,
        payload: {
          code: "navigation-failed",
          message: "Unable to resolve assistant tab",
        },
      });
      return;
    }

    try {
      await browser.tabs.sendMessage(tabId, command);
    } catch (error) {
      console.error("Failed to dispatch message to content script", error);
      this.send({
        type: "chat:error",
        assistantId: assistant,
        payload: {
          code: "prompt-failed",
          message: "Content script communication failed",
          details: { error: `${error}` },
        },
      });
    }
  }

  private send(message: ExtensionMessage): void {
    this.client.send(message);
  }

  private getAutomatorClass(assistant: AiAssistantId) {
    switch (assistant) {
      case "chatgpt":
        return ChatgptAutomator;
      case "claude":
        return ClaudeAutomator;
      case "gemini":
        return GeminiAutomator;
      case "grok":
        return GrokAutomator;
      default:
        return null;
    }
  }
}
