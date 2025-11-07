// lib/automators/chatgpt-automator.ts
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
  waitForElementDetached,
  click,
  fill,
  getText,
  extractData,
  waitForCondition,
} from "../../utils/selectors";
import { SelectorMap } from "./types";

type MessageData = {
  role: string;
  content: string;
  contentMarkdown: string;
};

export const selectors = {
  // Authentication
  loginIndicator: [
    'button[data-testid="profile-button"]',
    'div[data-testid="user-menu"]',
    'button:has(> div > div[style*="background-image"])', // Avatar button
  ],

  modelSelector: [
    'button[data-testid="model-switcher"]',
    'div[class*="model-switcher"]',
  ],

  modelName: [
    'button[data-testid="model-switcher"] span',
    'div[class*="model-name"]',
  ],

  // Chat List
  chatListContainer: [
    'nav[aria-label="Chat history"]',
    'div[class*="sidebar"] ol',
    "nav ol",
  ],

  chatItems: ["nav ol > li a", 'div[class*="sidebar"] ol li a'],

  chatItemData: {
    fields: {
      title: {
        selector: "div",
        attr: "textContent",
      },
      url: {
        attr: "href",
      },
    },
  },

  newChatButton: [
    'a[href="/"]',
    'button:has-text("New chat")',
    'nav a[href="/"]',
  ],

  // Chat View
  chatTitle: ["h1", 'div[class*="chat-title"]'],

  messageBlocks: [
    "div[data-message-author-role]",
    'div[data-testid^="conversation-turn"]',
    'article[class*="message"]',
  ],

  messageData: {
    fields: {
      role: {
        attr: "data-message-author-role",
      },
      content: {
        selector: [
          'div[class*="markdown"]',
          'div[class*="message-content"]',
          "div.whitespace-pre-wrap",
        ],
        attr: "innerHTML",
      },
      contentMarkdown: {
        selector: [
          'div[class*="markdown"]',
          'div[class*="message-content"]',
          "div.whitespace-pre-wrap",
        ],
        attr: "textContent",
      },
    },
  },

  messageInput: [
    'textarea[data-id="root"]',
    "textarea#prompt-textarea",
    'textarea[placeholder*="Message"]',
  ],

  submitButton: [
    'button[data-testid="send-button"]',
    'button[data-testid="fruitjuice-send-button"]',
    'textarea[data-id="root"] ~ button',
  ],

  generatingIndicator: [
    'button[data-testid="stop-button"]',
    'button:has-text("Stop generating")',
    'div[class*="generating"]',
  ],

  streamingMessage: [
    'div[data-message-author-role="assistant"]:last-of-type',
    'article[class*="message"]:last-of-type',
  ],

  errorMessage: ['div[class*="error"]', 'div[role="alert"]'],
};

export class ChatgptAutomator implements AiAssistantAutomator {
  static readonly id = "chatgpt" as const;
  static readonly urlGlobs = [
    "*://chatgpt.com/*",
    "*://chat.openai.com/*",
  ] as const;
  static readonly url = "https://chatgpt.com/";

  readonly id = ChatgptAutomator.id;
  readonly urlGlobs = ChatgptAutomator.urlGlobs;
  readonly url = ChatgptAutomator.url;
  readonly selectors = selectors;

  // private readonly config = {
  //   defaultTimeout: 30000,
  //   pollInterval: 100,
  //   // generateMessageId: (index: number, element: Element) => {
  //   //   // Try to extract actual message ID from data attributes
  //   //   const dataId = element.getAttribute("data-message-id");
  //   //   if (dataId) return dataId;

  //   //   // Fallback to index-based ID
  //   //   return `msg-${index}`;
  //   // },
  // };

  /**
   * Wait for user to be logged in
   */
  async waitForLoggedIn(options: LoginWaitOptions = {}): Promise<LoginState> {
    const { timeoutMs = 300000, pollIntervalMs = 1000 } = options;

    try {
      // Wait for login indicator to appear
      await waitForElement(this.selectors.loginIndicator, {
        timeout: timeoutMs,
      });

      // Extract model information
      const defaultModelId = await this.extractDefaultModel();
      const availableModelIds = await this.extractAvailableModels();

      return {
        assistantId: "chatgpt",
        authenticated: true,
        defaultModelId,
        availableModelIds,
        message: "Successfully logged in to ChatGPT",
      };
    } catch (error) {
      return {
        assistantId: "chatgpt",
        authenticated: false,
        message: error instanceof Error ? error.message : "Login timeout",
      };
    }
  }

  /**
   * Extract list of recent chats
   */
  async extractChatEntries(): Promise<readonly ChatEntry[]> {
    const chatItems = querySelectorAll(this.selectors.chatItems);

    const entries: ChatEntry[] = [];

    for (const [index, item] of chatItems.entries()) {
      try {
        const data = extractData<{
          title: string | null;
          url: string | null;
          chatId: string | null;
        }>(item, this.selectors.chatItemData || {});

        // const url = item.getAttribute("href");
        const id = this.extractChatIdFromUrl(data?.url ?? null);

        entries.push({
          id: id || `chat-${index}`,
          title: data?.title || getText(item) || "Untitled Chat",
          url: data?.url
            ? new URL(data?.url, window.location.origin).href
            : window.location.href,
          updatedAt: new Date().toISOString(), // ChatGPT doesn't expose this easily
        });
      } catch (error) {
        console.warn("Failed to extract chat item:", error);
      }
    }

    return entries;
  }

  /**
   * Navigate to and open a specific chat
   */
  async openChat(target: ChatTarget): Promise<void> {
    // If URL provided, navigate directly
    if (target.url) {
      window.location.href = target.url;
      await waitForElement(this.selectors.messageBlocks, {
        timeout: 10000,
      });
      return;
    }

    // If ID provided, find and click the chat link
    if (target.id) {
      const chatItems = querySelectorAll(this.selectors.chatItems || []);

      for (const item of chatItems) {
        const url = item.getAttribute("href");
        const id = this.extractChatIdFromUrl(url);

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

    // Start new chat if no target specified
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
   * Extract full chat details including all messages
   */
  async extractChatPage(target: ChatTarget): Promise<ChatPage> {
    // Extract chat metadata
    // const chatTitle = getText(
    //   querySelector(this.selectors.chatTitle || []) || document.body
    // );
    const chatTitle = querySelector(this.selectors.chatTitle);
    const chatTitleText = chatTitle ? getText(chatTitle) : "Unknown";
    const id =
      target.id || this.extractChatIdFromUrl(window.location.href) || "current";
    const url = window.location.href;

    // Extract all messages
    const messageElements = querySelectorAll(this.selectors.messageBlocks);
    const messages: ChatMessage[] = [];

    for (const [index, element] of messageElements.entries()) {
      try {
        const data = extractData<MessageData>(
          element,
          this.selectors.messageData
        );

        // const messageId =
        // this.config?.generateMessageId?.(index, element) || `msg-${index}`;
        const messageId = this.generateMessageId(index, element);

        messages.push({
          id: messageId,
          role: this.normalizeRole(data?.role),
          createdAt: new Date().toISOString(), // Not easily available in ChatGPT
          contentMarkdown: data?.contentMarkdown || "",
          contentHtml: data?.content || "",
        });
      } catch (error) {
        console.warn("Failed to extract message:", error);
      }
    }

    return {
      id,
      title: chatTitleText,
      url,
      modelId: target.modelId || (await this.extractDefaultModel()),
      updatedAt: new Date().toISOString(),
      messages,
    };
  }

  /**
   * Submit a prompt to ChatGPT
   */
  async sendPrompt(request: PromptSubmission): Promise<void> {
    const { prompt, conversation, modelId, timeoutMs = 30000 } = request;

    // Navigate to conversation if specified
    if (conversation) {
      await this.openChat(conversation);
    }

    // Find input field
    const inputElement = await waitForElement(this.selectors.messageInput, {
      timeout: timeoutMs,
    });

    // Type the prompt
    fill(inputElement, prompt);

    // Small delay for UI to register input
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Find and click submit button
    const submitButton = querySelector(this.selectors.submitButton);
    if (!submitButton) {
      throw this.createError(
        "prompt-failed",
        "Submit button not found",
        request.promptId
      );
    }

    click(submitButton);

    // Wait for response to start (generating indicator appears)
    try {
      await waitForElement(this.selectors.generatingIndicator || [], {
        timeout: 5000,
        state: "attached",
      });
    } catch {
      // Indicator might not appear if response is very fast
    }
  }

  /**
   * Watch for streaming response and emit deltas
   */
  async watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse> {
    const { promptId, timeoutMs = 120000 } = request;

    const startTime = Date.now();
    let lastContent = "";
    let responseComplete = false;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        observer.disconnect();
        reject(this.createError("timeout", "Response timeout", promptId));
      }, timeoutMs);

      // Watch for changes to the streaming message
      const observer = new MutationObserver(() => {
        try {
          const streamingElement = querySelector(
            this.selectors.streamingMessage
          );

          if (!streamingElement) return;

          const data = extractData<MessageData>(
            streamingElement,
            this.selectors.messageData
          );
          const currentContent = data?.content || "";
          const currentMarkdown = data?.contentMarkdown || "";

          // Emit delta if content changed
          if (currentMarkdown !== lastContent) {
            lastContent = currentMarkdown;

            handleDelta({
              promptId,
              html: currentContent,
              markdown: currentMarkdown,
              timestamp: new Date().toISOString(),
            });
          }

          // Check if generation is complete (indicator disappeared)
          const generatingIndicator = querySelector(
            this.selectors.generatingIndicator || []
          );

          if (!generatingIndicator && currentMarkdown) {
            responseComplete = true;
            clearTimeout(timeoutId);
            observer.disconnect();

            resolve({
              promptId,
              html: currentContent,
              markdown: currentMarkdown,
              finishedAt: new Date().toISOString(),
            });
          }
        } catch (error) {
          clearTimeout(timeoutId);
          observer.disconnect();
          reject(
            this.createError(
              "unexpected",
              error instanceof Error ? error.message : "Unknown error",
              promptId
            )
          );
        }
      });

      // Observe the chat container for changes
      const chatContainer = document.body;
      observer.observe(chatContainer, {
        childList: true,
        subtree: true,
        characterData: true,
      });

      // Initial check
      setTimeout(() => {
        observer.takeRecords();
      }, 100);
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
    // ChatGPT doesn't expose this easily in the UI
    // Would need to click model selector and scrape dropdown
    return undefined;
  }

  private extractChatIdFromUrl(url: string | null): string | null {
    if (!url) return null;

    // ChatGPT URLs: /c/{id} or /chat/{id}
    const match = url.match(/\/c(?:hat)?\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  private normalizeRole(
    role: string | undefined
  ): "user" | "assistant" | "system" | "tool" | "unknown" {
    if (!role) return "unknown";

    const normalized = role.toLowerCase();
    if (normalized === "user") return "user";
    if (normalized === "assistant") return "assistant";
    if (normalized === "system") return "system";
    if (normalized === "tool") return "tool";

    return "unknown"; // Default fallback
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

  generateMessageId(index: number, element: Element): string {
    // Try to extract actual message ID from data attributes
    const dataId = element.getAttribute("data-message-id");
    if (dataId) return dataId;

    // Fallback to index-based ID
    return `msg-${index}`;
  }
}
