// lib/automators/gemini-extractor.ts
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

export const selectors = {
  // Authentication
  loginIndicator: [
    'button[aria-label*="Google Account"]',
    'div[data-test-id="profile-button"]',
    'img[alt*="Google Account"]',
    'a[aria-label*="profile"]',
  ],

  modelSelector: ['button[aria-label*="model"]', 'div[class*="model-picker"]'],

  modelName: ['button[aria-label*="model"] span', 'div[class*="model-name"]'],

  // Chat List
  chatListContainer: [
    'nav[aria-label*="chat"]',
    'div[class*="chat-list"]',
    "aside nav",
  ],

  chatItems: [
    "div[data-chat-id]",
    'nav a[href*="/chat/"]',
    'div[class*="chat-item"]',
  ],

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

  newChatButton: [
    'button[aria-label*="New chat"]',
    'a[href="/"]',
    'button:has-text("New chat")',
  ],

  // Chat View
  chatTitle: ["h1", 'div[class*="chat-title"]'],

  messageBlocks: ["message-content", 'div[class*="message"]', "div[data-role]"],

  messageData: {
    fields: {
      role: {
        attr: "data-role",
      },
      content: {
        selector: [
          'div[class*="markdown"]',
          'div[class*="model-response"]',
          "div.content",
        ],
        attr: "innerHTML",
      },
      contentMarkdown: {
        selector: [
          'div[class*="markdown"]',
          'div[class*="model-response"]',
          "div.content",
        ],
        attr: "textContent",
      },
    },
  },

  messageInput: [
    'rich-textarea[placeholder*="Enter"]',
    'div[contenteditable="true"]',
    'textarea[placeholder*="Enter"]',
  ],

  submitButton: [
    'button[aria-label*="Send"]',
    'button[mattooltip*="Send"]',
    'button:has(mat-icon:has-text("send"))',
  ],

  generatingIndicator: [
    'button[aria-label*="Stop"]',
    'div[class*="generating"]',
    "mat-spinner",
  ],

  streamingMessage: [
    "message-content:last-of-type",
    'div[class*="message"]:last-of-type',
  ],

  errorMessage: ['div[role="alert"]', 'div[class*="error"]'],
};

export class GeminiAutomator implements AiAssistantAutomator {
  static readonly id = "gemini";
  static readonly urlGlobs = [
    "*://gemini.google.com/*",
    "*://aistudio.google.com/*",
  ];
  static readonly url = "https://gemini.google.com/app";

  readonly id = GeminiAutomator.id;
  readonly urlGlobs = GeminiAutomator.urlGlobs;
  readonly url = GeminiAutomator.url;
  readonly selectors = selectors;

  private readonly config = {
    defaultTimeout: 30000,
    pollInterval: 100,
    generateMessageId: (index: number, element: Element) => {
      const dataId = element.getAttribute("data-message-id");
      if (dataId) return dataId;

      return `gemini-msg-${index}`;
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
        assistantId: "gemini",
        authenticated: true,
        defaultModelId,
        availableModelIds,
        message: "Successfully logged in to Gemini",
      };
    } catch (error) {
      return {
        assistantId: "gemini",
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
      await waitForElement(this.selectors.messageBlocks, { timeout: 10000 });
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

  async extractChatPage(target: ChatTarget): Promise<ChatPage> {
    const chatTitle = getText(
      querySelector(this.selectors.chatTitle || []) || document.body
    );
    const id =
      target.id || this.extractChatIdFromUrl(window.location.href) || "current";
    const url = window.location.href;

    const messageElements = querySelectorAll(this.selectors.messageBlocks);
    const messages: ChatMessage[] = [];

    for (const [index, element] of messageElements.entries()) {
      try {
        const data = extractData(element, this.selectors.messageData);
        const messageId =
          this.config?.generateMessageId?.(index, element) || `msg-${index}`;

        messages.push({
          id: messageId,
          role: this.normalizeRole(data?.role),
          createdAt: new Date().toISOString(),
          contentMarkdown: data?.contentMarkdown || "",
          contentHtml: data?.content || "",
        });
      } catch (error) {
        console.warn("Failed to extract message:", error);
      }
    }

    return {
      id,
      title: chatTitle || "Gemini Conversation",
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

    const inputElement = await waitForElement(this.selectors.messageInput, {
      timeout: timeoutMs,
    });

    // Gemini might use contenteditable or rich-textarea
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
        request.messageId
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
      messageId: request.messageId,
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

    // Gemini URLs: /chat/{id}
    const match = url.match(/\/chat\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  private normalizeRole(
    role: string | undefined
  ): "user" | "assistant" | "system" | "tool" {
    if (!role) return "assistant";

    const normalized = role.toLowerCase();
    if (normalized === "user") return "user";
    if (normalized === "assistant" || normalized === "model")
      return "assistant";
    if (normalized === "system") return "system";
    if (normalized === "tool") return "tool";

    return "assistant";
  }

  private createError(
    code: ChatError["code"],
    message: string,
    messageId?: string,
    details?: Record<string, unknown>
  ): ChatError {
    return {
      code,
      message,
      messageId,
      details,
    };
  }
}
