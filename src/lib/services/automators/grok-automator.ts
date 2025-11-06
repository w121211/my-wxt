// lib/automators/grok-automator.ts
// NOTE: Grok has a unique nested message structure where one block can contain
// both user and assistant messages

import type {
  AiAssistantAutomator,
  LoginWaitOptions,
  LoginState,
  ChatEntry,
  ChatTarget,
  ChatPage,
  ChatMessage,
  PromptSubmission,
  ChatDelta,
  ChatResponse,
  ChatError,
} from "../../types/automators";
import {
  querySelector,
  querySelectorAll,
  waitForElement,
  click,
  fill,
  getText,
  extractData,
  waitForCondition,
} from "../../utils/selectors";
import { watchStreamingResponse } from "./utils/stream-observer";

export class GrokAutomator implements AiAssistantAutomator {
  readonly id = "grok" as const;
  readonly urlGlobs = ["*://*.x.com/i/grok", "*://twitter.com/i/grok"];

  private readonly selectors = {
    // Authentication
    loginIndicator: [
      'div[data-testid="SideNav_AccountSwitcher_Button"]',
      'a[aria-label*="Profile"]',
      'div[data-testid="primaryColumn"]',
    ],

    modelSelector: [
      'button[aria-label*="model"]',
      'div[class*="model-selector"]',
    ],

    modelName: ['button[aria-label*="model"] span', 'div[class*="model-name"]'],

    // Chat List
    chatListContainer: ['nav[aria-label*="chat"]', 'div[class*="chat-list"]'],

    chatItems: ["div[data-chat-id]", 'a[href*="/grok/"]'],

    chatItemData: {
      fields: {
        title: {
          selector: ["span", 'div[class*="title"]'],
          attr: "textContent",
        },
        url: {
          attr: "href",
        },
      },
    },

    newChatButton: ['button[aria-label*="New"]', 'a[href="/i/grok"]'],

    // Chat View - Grok has nested message structure!
    chatTitle: ["h1", 'div[aria-label="Grok"]'],

    messageBlocks: [
      'div[data-testid="grok-message-block"]',
      'div[class*="message-block"]',
      'article[data-testid*="message"]',
    ],

    // Grok-specific: nested message extraction
    messageData: {
      fields: {
        userMessage: {
          selector: ['div[data-testid="user-message"]', 'div[class*="user"]'],
          attr: "textContent",
        },
        aiMessage: {
          selector: [
            'div[data-testid="ai-message"]',
            'div[class*="assistant"]',
          ],
          attr: "textContent",
        },
        assistantMessage: {
          selector: [
            'div[data-testid="assistant-message"]',
            'div[class*="response"]',
          ],
          attr: "textContent",
        },
      },
    },

    messageInput: [
      'div[contenteditable="true"]',
      'textarea[placeholder*="Ask Grok"]',
      'div[data-testid="grok-input"]',
    ],

    submitButton: [
      'button[aria-label*="Send"]',
      'button[data-testid="grok-send-button"]',
      'button[type="submit"]',
    ],

    generatingIndicator: [
      'button[aria-label*="Stop"]',
      'div[class*="generating"]',
    ],

    streamingMessage: [
      'div[data-testid="grok-message-block"]:last-of-type',
      'div[class*="message-block"]:last-of-type',
    ],

    errorMessage: ['div[role="alert"]', 'div[class*="error"]'],
  };

  private readonly config = {
    defaultTimeout: 30000,
    pollInterval: 100,
    generateMessageId: (index: number, element: Element) => {
      const dataId = element.getAttribute("data-message-id");
      if (dataId) return dataId;

      return `grok-msg-${index}`;
    },
  };

  async waitForLoggedIn(options: LoginWaitOptions = {}): Promise<LoginState> {
    const { timeoutMs = 300000 } = options;

    try {
      await waitForElement(this.selectors.loginIndicator, {
        timeout: timeoutMs,
      });

      const defaultModelId = await this.extractDefaultModel();
      const availableModelIds = await this.extractAvailableModels();

      return {
        assistantId: "grok",
        authenticated: true,
        defaultModelId,
        availableModelIds,
        message: "Successfully logged in to Grok",
      };
    } catch (error) {
      return {
        assistantId: "grok",
        authenticated: false,
        message: error instanceof Error ? error.message : "Login timeout",
      };
    }
  }

  async extractChatEntries(): Promise<readonly ChatEntry[]> {
    const chatItems = querySelectorAll(this.selectors.chatItems || []);
    const entries: ChatEntry[] = [];

    for (const [index, item] of chatItems.entries()) {
      try {
        const data = extractData(item, this.selectors.chatItemData || {});
        const url = item.getAttribute("href");
        const id =
          this.extractChatIdFromUrl(url) || item.getAttribute("data-chat-id");

        entries.push({
          id: id || `chat-${index}`,
          title: data?.title || getText(item) || "Untitled Chat",
          url: url
            ? new URL(url, window.location.origin).href
            : window.location.href,
          updatedAt: new Date().toISOString(),
        });
      } catch (error) {
        console.warn("Failed to extract chat item:", error);
      }
    }

    return entries;
  }

  async openChat(target: ChatTarget): Promise<void> {
    if (target.url) {
      window.location.href = target.url;
      await waitForElement(this.selectors.messageBlocks, {
        timeout: 10000,
      });
      return;
    }

    if (target.id) {
      const chatItems = querySelectorAll(this.selectors.chatItems || []);

      for (const item of chatItems) {
        const url = item.getAttribute("href");
        const id =
          this.extractChatIdFromUrl(url) || item.getAttribute("data-chat-id");

        if (id === target.id) {
          click(item);
          await waitForElement(this.selectors.messageBlocks, {
            timeout: 10000,
          });
          return;
        }
      }

      throw this.createError(
        "navigation-failed",
        `Chat with ID ${target.id} not found`
      );
    }

    const newChatBtn = querySelector(this.selectors.newChatButton || []);
    if (newChatBtn) {
      click(newChatBtn);
      await waitForCondition(
        () => !querySelector(this.selectors.messageBlocks),
        {
          timeout: 5000,
        }
      );
    }
  }

  /**
   * Extract chat with Grok-specific message parsing
   * Grok's UI can have nested user/assistant messages in single blocks
   */
  async extractChatPage(target: ChatTarget): Promise<ChatPage> {
    const chatTitle = getText(
      querySelector(this.selectors.chatTitle || []) || document.body
    );
    const id =
      target.id || this.extractChatIdFromUrl(window.location.href) || "current";
    const url = window.location.href;

    const messageBlocks = querySelectorAll(this.selectors.messageBlocks);
    const messages: ChatMessage[] = [];
    let messageIndex = 0;

    for (const block of messageBlocks) {
      try {
        const data = extractData(block, this.selectors.messageData);

        // Extract nested messages from Grok's structure
        const parsedMessages = this.parseGrokMessageBlock(data);

        for (const msg of parsedMessages) {
          messages.push({
            id: `grok-msg-${messageIndex++}`,
            role: msg.role,
            createdAt: new Date().toISOString(),
            contentMarkdown: msg.content,
            contentHtml: msg.content, // Grok usually has plain text
          });
        }
      } catch (error) {
        console.warn("Failed to extract message block:", error);
      }
    }

    return {
      id,
      title: chatTitle || "Grok Conversation",
      url,
      modelId: target.modelId || (await this.extractDefaultModel()),
      updatedAt: new Date().toISOString(),
      messages,
    };
  }

  async sendPrompt(request: PromptSubmission): Promise<void> {
    const { prompt, conversation, timeoutMs = 30000 } = request;

    if (conversation) {
      await this.openChat(conversation);
    }

    const inputElement = await waitForElement(
      this.selectors.messageInput,
      {
        timeout: timeoutMs,
      }
    );

    // Grok might use contenteditable
    if (inputElement instanceof HTMLElement && inputElement.isContentEditable) {
      inputElement.textContent = prompt;
      inputElement.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      fill(inputElement, prompt);
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const submitButton = querySelector(this.selectors.submitButton);
    if (!submitButton) {
      throw this.createError(
        "prompt-failed",
        "Submit button not found",
        request.promptId
      );
    }

    click(submitButton);

    try {
      await waitForElement(this.selectors.generatingIndicator || [], {
        timeout: 5000,
        state: "attached",
      });
    } catch {
      // Indicator might not appear if response is very fast
    }
  }

  async watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse> {
    return watchStreamingResponse({
      promptId: request.promptId,
      timeoutMs: request.timeoutMs,
      streamingMessageSelector: this.selectors.streamingMessage || [],
      messageDataSpec: this.selectors.messageData,
      generatingIndicatorSelector: this.selectors.generatingIndicator,
      onDelta: handleDelta,
      onComplete: (response) => response,
      onError: (error) => {
        throw error;
      },
    });
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Parse Grok's nested message structure
   * Reference: tmp/src/tasks/aichat/grok.ts (lines 41-76)
   */
  private parseGrokMessageBlock(
    data: any
  ): Array<{ role: "user" | "assistant"; content: string }> {
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [];

    if (!data || typeof data !== "object") return messages;

    // Extract user messages (can be array or string)
    const userParts = this.toStringParts(data.userMessage);

    // Extract AI messages (try both field names)
    const aiParts = this.toStringParts(data.aiMessage || data.assistantMessage);

    // Each user part becomes a separate message
    for (const userPart of userParts) {
      if (userPart.trim()) {
        messages.push({
          role: "user",
          content: userPart.trim(),
        });
      }
    }

    // AI responses are typically one continuous response
    if (aiParts.length > 0) {
      messages.push({
        role: "assistant",
        content: this.joinParts(aiParts),
      });
    }

    return messages;
  }

  /**
   * Convert unknown value to array of string parts
   * Reference: tmp/src/tasks/aichat/grok.ts (lines 18-34)
   */
  private toStringParts(value: unknown): string[] {
    if (value == null) return [];

    if (Array.isArray(value)) {
      const collected: string[] = [];
      for (const entry of value) {
        collected.push(...this.toStringParts(entry));
      }
      return collected;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? [trimmed] : [];
    }

    return [];
  }

  /**
   * Join parts with proper spacing
   * Reference: tmp/src/tasks/aichat/grok.ts (lines 12-16)
   */
  private joinParts(parts: string[]): string {
    return parts
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .join("\n\n");
  }

  private async extractDefaultModel(): Promise<string | undefined> {
    try {
      const modelElement = querySelector(this.selectors.modelName || []);
      if (modelElement) {
        return getText(modelElement) || undefined;
      }
    } catch {
      // Ignore errors
    }
    return undefined;
  }

  private async extractAvailableModels(): Promise<
    readonly string[] | undefined
  > {
    return undefined;
  }

  private extractChatIdFromUrl(url: string | null): string | null {
    if (!url) return null;

    // Grok URLs: /i/grok/{id}
    const match = url.match(/\/i\/grok\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  private createError(
    code: ChatError["code"],
    message: string,
    promptId?: string,
    details?: Record<string, unknown>
  ): ChatError {
    return {
      code,
      message,
      promptId,
      details,
    };
  }
}
