// lib/services/automators-v2/gemini-automator-v2_1.ts
// V2.1 Automator for Google Gemini AI Assistant - Refactored to match new V2 interface

import type {
  AiAssistantAutomatorV2,
  AiAssistantId,
  SelectorMap,
  ChatEntry,
  ChatPage,
  LandingPage,
  ChatMessage,
  ChatStatus,
  SubmitPromptInput,
  SubmitPromptResult,
  PageEvent,
  Unsubscribe,
} from "../../types/automators-v2.js";
import {
  querySelector,
  querySelectorAll,
  waitForElement,
  waitForCondition,
  getText,
} from "../../utils/selectors.js";

const selectors: SelectorMap = {
  // Authentication
  signInButton: 'a[aria-label="Sign in"]',
  userAccountButton: [
    'a[href*="SignOutOptions"]',
    'a[aria-label^="Google Account:"]',
  ],

  // Sidebar structure
  sidebarContainer:
    'bard-sidenav-container[data-test-id="bard-sidenav-container"]',
  conversationsList: 'conversations-list[data-test-id="all-conversations"]',
  conversationItems: 'div[data-test-id="conversation"][role="button"]',

  // Model selection
  modelSelector: [
    'div[data-test-id="bard-mode-menu-button"]',
    "bard-mode-switcher button",
  ],
  modelName: [
    'div[data-test-id="bard-mode-menu-button"] span',
    "bard-mode-switcher button span",
  ],

  // Main chat interface
  chatHistory: [
    "div#chat-history",
    'infinite-scroller[data-test-id="chat-history-container"]',
  ],

  // Message input
  messageInput: [
    'div[role="textbox"][aria-label="Enter a prompt here"]',
    'div[role="textbox"][data-placeholder="Ask Gemini"]',
    'rich-textarea div[role="textbox"]',
  ],

  uploadButton: [
    'button[aria-label="Open upload file menu"]',
    "uploader button",
  ],

  // Messages
  userQueryBlocks: "user-query",
  modelResponseBlocks: "model-response",
  messageContent: "message-content",

  // Generation state
  generatingIndicator: [
    'message-content [aria-busy="true"]',
    'model-response [aria-busy="true"]',
    'div[role="status"][aria-busy="true"]',
  ],

  // Error states
  errorMessage: ['div[role="alert"]', 'div[data-error="true"]'],

  // New chat button
  newChatButton: [
    'button[data-test-id="expanded-button"][aria-label="New chat"]',
    'side-nav-action-button[data-test-id="new-chat-button"] button',
  ],
};

export class GeminiAutomatorV2 implements AiAssistantAutomatorV2 {
  static readonly id: AiAssistantId = "gemini";
  static readonly url = "https://gemini.google.com/";
  static readonly urlGlobs = [
    "*://gemini.google.com/*",
    "*://*.gemini.google.com/*",
  ] as const;

  readonly id = GeminiAutomatorV2.id;
  readonly url = GeminiAutomatorV2.url;
  readonly urlGlobs = GeminiAutomatorV2.urlGlobs;
  readonly selectors = selectors;

  // ============================================================================
  // URL Helpers
  // ============================================================================

  getUrl(params?: { chatId?: string }): string {
    return params?.chatId
      ? this.buildChatUrl(params.chatId)
      : "https://gemini.google.com/app";
  }

  // ============================================================================
  // Extractors
  // ============================================================================

  async getLandingPage(): Promise<LandingPage> {
    const url = window.location.href;
    const title =
      document.title.replace(" - Google Gemini", "") || "Google Gemini";

    // Check login status
    const isLoggedIn = await this.checkIsLoggedIn();

    // Extract chat entries if logged in
    let chatEntries: ChatEntry[] | undefined;
    if (isLoggedIn) {
      chatEntries = await this.extractChatEntries();
    }

    // Extract available model IDs
    let availableModelIds: string[] | undefined;
    if (isLoggedIn) {
      availableModelIds = await this.extractAvailableModels();
    }

    return {
      slug: "landing-page",
      url,
      title,
      isLoggedIn,
      chatEntries,
      availableModelIds,
    };
  }

  async getChatPage(chatId: string): Promise<ChatPage> {
    if (!chatId) {
      throw new Error("Chat ID is required");
    }

    // Verify we're on the correct page (no navigation)
    const currentChatId = this.extractChatIdFromUrl(window.location.href);
    if (currentChatId !== chatId) {
      throw new Error(
        `Wrong chat page. Expected chat ID: ${chatId}, but currently on: ${
          currentChatId || "landing page"
        }`
      );
    }

    const url = this.buildChatUrl(chatId);

    // Check login status
    const isLoggedIn = await this.checkIsLoggedIn();

    // Wait for chat history container to load
    const chatHistory = await waitForElement(selectors.chatHistory, {
      timeout: 5000,
    });

    if (!chatHistory) {
      throw new Error("Chat history container not found");
    }

    // Extract all messages
    const messages = await this.extractMessages(chatHistory);

    // Extract title from page or first user message
    const pageTitle = document.title.replace(" - Google Gemini", "");
    const title =
      pageTitle !== "Google Gemini"
        ? pageTitle
        : messages[0]?.content || "Untitled";

    // Get chat status
    const status = await this.getChatStatus();

    // Extract model ID
    const modelId = await this.extractCurrentModel();

    return {
      slug: "chat-page",
      url,
      title,
      isLoggedIn,
      chatId,
      status,
      modelId,
      messages,
      updatedAt: new Date().toISOString(),
    };
  }

  // ============================================================================
  // Actions
  // ============================================================================

  async submitPrompt(
    input: SubmitPromptInput,
    signal?: AbortSignal
  ): Promise<SubmitPromptResult> {
    const { prompt, chatId } = input;

    try {
      // Verify we're on the correct page if chatId is specified (no navigation)
      if (chatId) {
        const currentChatId = this.extractChatIdFromUrl(window.location.href);
        if (currentChatId !== chatId) {
          throw new Error(
            `Wrong chat page. Expected chat ID: ${chatId}, but currently on: ${
              currentChatId || "landing page"
            }`
          );
        }
      }

      // Wait for input field to be available
      const inputElement = await waitForElement(selectors.messageInput, {
        timeout: 5000,
      });

      if (!inputElement) {
        throw new Error("Message input field not found");
      }

      // Set the prompt text
      if (
        inputElement instanceof HTMLElement &&
        inputElement.isContentEditable
      ) {
        inputElement.textContent = prompt;
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (inputElement instanceof HTMLInputElement) {
        inputElement.value = prompt;
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (inputElement instanceof HTMLTextAreaElement) {
        inputElement.value = prompt;
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        inputElement.textContent = prompt;
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      }

      const existingUserMessageCount = this.getUserPromptElements().length;

      // Wait a moment for the UI to update
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Check if aborted before submitting
      if (signal?.aborted) {
        throw new Error("Submission aborted");
      }

      // Gemini sends on Enter - synthesize Enter keypress
      const submitted = this.triggerSubmitWithEnter(inputElement);
      if (!submitted) {
        throw new Error(
          "Unable to submit prompt - Enter key simulation failed"
        );
      }

      // Wait for the message to be sent
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        await waitForCondition(
          () => this.getUserPromptElements().length > existingUserMessageCount,
          { timeout: 5000, interval: 200 }
        );
      } catch (error) {
        console.warn("Timed out waiting for user message to render", error);
      }

      // Get the current chat ID from URL (Gemini assigns one on first message)
      let resolvedChatId =
        chatId || this.extractChatIdFromUrl(window.location.href);

      if (!resolvedChatId) {
        // Wait for URL to update with the new chat ID
        try {
          await waitForCondition(
            () => {
              const chatId = this.extractChatIdFromUrl(window.location.href);
              if (chatId) {
                resolvedChatId = chatId;
                return true;
              }
              return false;
            },
            { timeout: 5000, interval: 200 }
          );
        } catch (error) {
          console.warn("Timed out waiting for chat ID in URL", error);
        }
      }

      if (!resolvedChatId) {
        throw new Error("Could not determine chat ID after submission");
      }

      return {
        chatId: resolvedChatId,
      };
    } catch (error) {
      console.error("Failed to submit prompt:", error);
      throw error;
    }
  }

  // ============================================================================
  // Watchers
  // ============================================================================

  watchPage(
    options: { chatId?: string },
    onChange: (event: PageEvent) => void
  ): Unsubscribe {
    const { chatId } = options;
    let isActive = true;
    let observer: MutationObserver | null = null;
    let debounceTimer: number | null = null;

    const handleChange = async () => {
      if (!isActive) return;

      try {
        let page: ChatPage | LandingPage;

        if (chatId) {
          // Watch specific chat page
          page = await this.getChatPage(chatId);
        } else {
          // Determine current page type from URL
          const currentChatId = this.extractChatIdFromUrl(window.location.href);
          if (currentChatId) {
            page = await this.getChatPage(currentChatId);
          } else {
            page = await this.getLandingPage();
          }
        }

        onChange({
          timestamp: new Date(),
          page,
        });
      } catch (error) {
        console.error("Error watching page:", error);
      }
    };

    const debouncedHandleChange = () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => {
        handleChange();
      }, 250); // Debounce for 250ms
    };

    // Set up MutationObserver to watch for DOM changes
    const startObserving = async () => {
      try {
        // Determine what to observe based on page type
        let targetElement: Element | null;

        if (chatId) {
          // Watch chat history for chat pages
          targetElement = await waitForElement(selectors.chatHistory, {
            timeout: 5000,
          });
        } else {
          // Watch body for general page changes
          targetElement = document.body;
        }

        if (!targetElement || !isActive) return;

        // Create observer
        observer = new MutationObserver(() => {
          debouncedHandleChange();
        });

        // Start observing
        observer.observe(targetElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ["aria-busy"],
        });

        // Emit initial state
        handleChange();
      } catch (error) {
        console.error("Error setting up page observer:", error);
      }
    };

    startObserving();

    // Return unsubscribe function
    return () => {
      isActive = false;
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async checkIsLoggedIn(): Promise<boolean> {
    // Check for sign-in button (logged out state)
    const signInButton = querySelector(selectors.signInButton);
    if (signInButton) {
      return false;
    }

    // Check for user account button (logged in state)
    const userAccountButton = await waitForElement(
      selectors.userAccountButton,
      { timeout: 2000 }
    );

    return !!userAccountButton;
  }

  private async extractChatEntries(): Promise<ChatEntry[]> {
    try {
      // Wait for conversations list to be available
      const conversationsList = await waitForElement(
        selectors.conversationsList,
        { timeout: 3000 }
      );

      if (!conversationsList) {
        return [];
      }

      // Get all conversation items
      const conversationItems = querySelectorAll(
        selectors.conversationItems,
        conversationsList
      );
      const entries: ChatEntry[] = [];

      for (let i = 0; i < conversationItems.length; i++) {
        const item = conversationItems[i];

        // Extract title from the div content
        const titleDiv = item.querySelector("div");
        const title = titleDiv ? getText(titleDiv) : "Untitled";

        // Skip entries without a title
        if (!title) {
          console.warn("Skipping conversation without title");
          continue;
        }

        // Extract chat ID from jslog attribute
        // Format: jslog="...BardVeMetadataKey:[...["c_8ff45103dadaa300",..."
        const jslog = item.getAttribute("jslog");
        const match = jslog?.match(/["']c_([a-f0-9]+)["']/i);
        const chatId = match?.[1] || undefined;

        entries.push({
          chatId,
          title,
          url: undefined,
        });
      }

      return entries;
    } catch (error) {
      console.error("Failed to extract chat entries:", error);
      return [];
    }
  }

  private async extractAvailableModels(): Promise<string[] | undefined> {
    try {
      const modelElement = querySelector(selectors.modelName);
      if (modelElement) {
        const modelText = getText(modelElement);
        return modelText ? [modelText] : undefined;
      }
    } catch (error) {
      console.warn("Failed to extract available models:", error);
    }
    return undefined;
  }

  private async extractCurrentModel(): Promise<string | undefined> {
    try {
      const modelElement = querySelector(selectors.modelName);
      if (modelElement) {
        const modelText = getText(modelElement);
        return modelText || undefined;
      }
    } catch (error) {
      console.warn("Failed to extract current model:", error);
    }
    return undefined;
  }

  private async getChatStatus(): Promise<ChatStatus> {
    try {
      // Check if there's a generating indicator
      const generatingIndicator = querySelector(selectors.generatingIndicator);

      if (generatingIndicator) {
        return "generating";
      }

      // Check for error messages
      const errorElement = querySelector(selectors.errorMessage);
      if (errorElement) {
        return "error";
      }

      // Otherwise, conversation is idle
      return "idle";
    } catch (error) {
      console.error("Failed to get chat status:", error);
      return "error";
    }
  }

  private async extractMessages(container: Element): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];

    // Find all user queries and model responses
    const userQueries = querySelectorAll(selectors.userQueryBlocks, container);
    const modelResponses = querySelectorAll(
      selectors.modelResponseBlocks,
      container
    );

    // Process messages in order (user query followed by model response)
    for (
      let i = 0;
      i < Math.max(userQueries.length, modelResponses.length);
      i++
    ) {
      // Extract user message
      if (i < userQueries.length) {
        const userQuery = userQueries[i];
        const userMessage = this.extractUserMessage(userQuery);
        if (userMessage) {
          messages.push(userMessage);
        }
      }

      // Extract assistant message
      if (i < modelResponses.length) {
        const modelResponse = modelResponses[i];
        const assistantMessage = this.extractAssistantMessage(modelResponse);
        if (assistantMessage) {
          messages.push(assistantMessage);
        }
      }
    }

    return messages;
  }

  private extractUserMessage(element: Element): ChatMessage | null {
    try {
      // Prefer the dedicated user-query-content container for IDs
      const contentWrapper = element.querySelector(
        'div[id^="user-query-content"]'
      );
      const messageId = contentWrapper?.id || this.generateMessageId();

      const contentElement =
        contentWrapper?.querySelector('div[role="heading"][aria-level="2"]') ||
        contentWrapper ||
        element;

      // Extract plain text content only
      const content = getText(contentElement);

      return {
        id: messageId,
        role: "user",
        content,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("Failed to extract user message:", error);
      return null;
    }
  }

  private extractAssistantMessage(element: Element): ChatMessage | null {
    try {
      // Find the message content using custom querySelector
      const messageContentElement = querySelector(
        selectors.messageContent,
        element
      );
      if (!messageContentElement) return null;

      // Find the div with id starting with "model-response-message-content"
      const contentDiv = messageContentElement.querySelector(
        'div[id^="model-response-message-content"]'
      );
      if (!contentDiv) return null;

      // Extract message ID from the div id
      const fullId = contentDiv.id; // e.g., "model-response-message-contentr_3e53c5834ff80d91"
      const messageId =
        fullId.replace("model-response-message-contentr_", "") ||
        this.generateMessageId();

      // Extract plain text content only
      const content = getText(contentDiv);

      return {
        id: messageId,
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("Failed to extract assistant message:", error);
      return null;
    }
  }

  private extractChatIdFromUrl(url: string): string | null {
    // Based on snapshot: /app/64765a2fe8d21b39
    const match = url.match(/\/app\/([a-f0-9]+)/i);
    return match ? match[1] : null;
  }

  private buildChatUrl(chatId: string): string {
    return `https://gemini.google.com/app/${chatId}`;
  }

  private getUserPromptElements(): Element[] {
    return Array.from(
      document.querySelectorAll('div[id^="user-query-content"]')
    );
  }

  private triggerSubmitWithEnter(inputElement: Element): boolean {
    const interactiveElement =
      inputElement instanceof HTMLElement
        ? inputElement
        : (inputElement.querySelector(
            "[contenteditable], textarea, input"
          ) as HTMLElement | null);

    if (!interactiveElement) {
      return false;
    }

    interactiveElement.focus();

    this.dispatchEnterKeyEvent(interactiveElement, "keydown");
    this.dispatchEnterKeyEvent(interactiveElement, "keypress");
    this.dispatchEnterKeyEvent(interactiveElement, "keyup");

    return true;
  }

  private dispatchEnterKeyEvent(
    target: HTMLElement,
    type: "keydown" | "keypress" | "keyup"
  ): void {
    const event = new KeyboardEvent(type, {
      key: "Enter",
      code: "Enter",
      bubbles: true,
      cancelable: true,
    });

    target.dispatchEvent(event);
  }

  private generateMessageId(): string {
    // Generate a random message ID similar to Gemini's format
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }
}
