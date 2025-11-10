// lib/services/automators-v2/grok-automator-v2.ts
// V2 Automator for Grok AI Assistant

import type {
  AiAssistantAutomatorV2,
  AiAssistantId,
  LoginWaitOptions,
  LoginState,
  ChatEntry,
  ChatTarget,
  ChatPage,
  ChatMessage,
  ConversationRef,
  ConversationState,
  ConversationStatus,
  SubmitPromptInput,
  SubmitPromptResult,
  Unsubscribe,
  ListChatEntriesParams,
} from "../../types/automators-v2";
import type { SelectorMap } from "../automators/types";
import {
  querySelector,
  querySelectorAll,
  waitForElement,
  getText,
} from "../../utils/selectors";

const selectors: SelectorMap = {
  // Authentication - Based on snapshot-grok-1762602619450
  loginIndicator: [
    'button[data-slot="button"][aria-haspopup="menu"]', // User menu button in sidebar footer
    'img[alt="pfp"]', // Profile picture
    'div[data-sidebar="footer"] button', // Any button in sidebar footer
  ],

  // Sidebar structure
  sidebar: [
    'div[data-sidebar="sidebar"]',
    'div[data-state="expanded"][data-collapsible]',
  ],

  sidebarContent: ['div[data-sidebar="content"]'],

  // Model selection
  modelSelector: [
    "button#model-select-trigger",
    'button[aria-label="Model select"]',
  ],

  modelName: [
    "button#model-select-trigger span", // The "Auto" text
    'button[aria-label="Model select"] span',
  ],

  // Chat history in sidebar
  chatHistoryContainer: [
    'div[data-sidebar="content"]',
    'ul[data-sidebar="menu"]',
  ],

  chatItems: [
    'a[href^="/c/"]', // Chat links in history
  ],

  // Chat history page (/history?tab=conversations) - Based on snapshot-grok-1762602678874
  historyPageContainer: [
    'div[role="tabpanel"][data-state="active"]',
    "div#radix-_r_14v_-content-conversations",
  ],

  historyChatEntries: [
    "div[data-selected]", // Chat entry containers
  ],

  // Main chat interface
  chatContainer: ["main", 'div[data-testid="drop-container"]'],

  messageInput: [
    '[data-placeholder="How can Grok help?"][contenteditable]',
    'form [role="textbox"][data-placeholder="How can Grok help?"]',
    'form [role="textbox"]',
    '[role="textbox"][contenteditable="true"]',
    '[role="textbox"][contenteditable]',
    '[data-placeholder][contenteditable]',
    'textarea[aria-label="Ask Grok anything"]',
    'div[contenteditable="true"][role="textbox"]',
    'div[contenteditable="true"]',
    'p[data-placeholder="How can Grok help?"]',
    'p[data-placeholder="What do you want to know?"]',
  ],

  // Grok's authenticated composer sends on Enter; no reliable send button is rendered.
  // Leave submit selectors empty so submitPrompt falls back to a synthetic Enter keypress.
  submitButton: [],

  attachButton: ['button[aria-label="Attach"]', 'button[aria-label*="attach"]'],

  // Messages - Based on snapshot-grok-1762602699780
  messageContainer: [
    "div#last-reply-container", // Container for all messages
  ],

  messageBlocks: [
    'div[id^="response-"]', // Each message has id like "response-{uuid}"
  ],

  // Generation state
  generatingIndicator: [
    'button[aria-label*="Stop"]',
    'div[data-generating="true"]',
  ],

  // Error states
  errorMessage: ['div[role="alert"]', 'div[data-error="true"]'],

  // New chat button
  newChatButton: [
    'a[data-sidebar="menu-button"][href="/"]',
    'button[aria-label*="New chat"]',
  ],
};

export class GrokAutomatorV2 implements AiAssistantAutomatorV2 {
  static readonly id: AiAssistantId = "grok";
  static readonly url = "https://grok.com/";
  static readonly urlGlobs = [
    "*://grok.com/*",
    "*://*.grok.com/*",
    "*://x.ai/*",
    "*://*.x.ai/*",
  ] as const;

  readonly id = GrokAutomatorV2.id;
  readonly url = GrokAutomatorV2.url;
  readonly urlGlobs = GrokAutomatorV2.urlGlobs;
  readonly selectors = selectors;

  // ============================================================================
  // Extractors
  // ============================================================================

  async getLoginState(options?: LoginWaitOptions): Promise<LoginState> {
    const { timeoutMs = 5000, pollIntervalMs = 100 } = options || {};

    try {
      // Wait for login indicator to appear
      const loginElement = await waitForElement(selectors.loginIndicator, {
        timeout: timeoutMs,
      });

      if (!loginElement) {
        return {
          assistantId: "grok",
          authenticated: false,
          message: "Not logged in - login indicator not found",
        };
      }

      // Extract model information
      const defaultModelId = await this.extractDefaultModel();
      const availableModelIds = await this.extractAvailableModels();

      return {
        assistantId: "grok",
        authenticated: true,
        defaultModelId,
        availableModelIds,
        message: "Successfully authenticated",
      };
    } catch (error) {
      // Login indicator not found within timeout
      return {
        assistantId: "grok",
        authenticated: false,
        message: error instanceof Error ? error.message : "Login check timeout",
      };
    }
  }

  async getChatEntries(
    params?: ListChatEntriesParams
  ): Promise<readonly ChatEntry[]> {
    const { limit, sinceId } = params || {};

    try {
      const historyContainer = querySelector(selectors.historyPageContainer);
      if (historyContainer) {
        return this.extractHistoryPageEntries(historyContainer, {
          limit,
          sinceId,
        });
      }

      // Wait for sidebar to be available
      const sidebar = await waitForElement(selectors.sidebar, {
        timeout: 5000,
      });

      if (!sidebar) {
        return [];
      }

      // Get all chat links from sidebar
      // Chat links are in the History section: a[href^="/c/"]
      const chatLinks = querySelectorAll(selectors.chatItems);
      const entries: ChatEntry[] = [];

      for (const linkElement of chatLinks) {
        const href = linkElement.getAttribute("href");
        if (!href) continue;

        const chatId = this.extractChatIdFromUrl(href);
        if (!chatId) continue;

        // Skip if we've reached the sinceId
        if (sinceId && chatId === sinceId) {
          break;
        }

        // Extract title from span inside the link
        const titleElement = linkElement.querySelector("span");
        const title = titleElement ? getText(titleElement) : "Untitled";

        entries.push({
          id: chatId,
          title,
          url: `https://grok.com${href}`,
          updatedAt: "", // Sidebar doesn't show timestamps
        });

        // Stop if we've reached the limit
        if (limit && entries.length >= limit) {
          break;
        }
      }

      return entries;
    } catch (error) {
      console.error("Failed to get chat entries:", error);
      return [];
    }
  }

  async getChatPage(
    target: ChatTarget | { readonly chatId: string }
  ): Promise<ChatPage> {
    const chatId = "chatId" in target ? target.chatId : target.id;
    if (!chatId) {
      throw new Error("Chat ID is required");
    }

    try {
      // Navigate to chat if not already there
      const currentUrl = window.location.href;
      const expectedUrl = `https://grok.com/c/${chatId}`;

      if (!currentUrl.includes(`/c/${chatId}`)) {
        window.location.href = expectedUrl;
        // Wait for navigation
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      // Wait for message container to load
      const messageContainer = await waitForElement(
        selectors.messageContainer,
        {
          timeout: 5000,
        }
      );

      if (!messageContainer) {
        throw new Error("Message container not found");
      }

      // Extract all messages
      const messageBlocks = querySelectorAll(selectors.messageBlocks);
      const messages: ChatMessage[] = [];

      for (const messageBlock of messageBlocks) {
        // Extract message ID from element id (e.g., "response-{uuid}")
        const messageId = messageBlock.id?.replace("response-", "") || "";

        // Determine role based on position/structure
        // In Grok, odd-indexed messages are user, even-indexed are assistant
        const role = messages.length % 2 === 0 ? "user" : "assistant";

        // Extract message content
        // Content is in the first div > div inside the message block
        const contentElement = messageBlock.querySelector("div > div");
        const contentHtml = contentElement?.innerHTML || "";

        // Convert HTML to markdown (simple conversion)
        const contentMarkdown = this.htmlToMarkdown(contentHtml);

        messages.push({
          id: messageId,
          role,
          createdAt: new Date().toISOString(), // Grok doesn't show timestamps in UI
          contentMarkdown,
          contentHtml,
        });
      }

      // Extract title from page title or first user message
      const pageTitle = document.title.replace(" - Grok", "");
      const title =
        pageTitle !== "Grok"
          ? pageTitle
          : messages[0]?.contentMarkdown || "Untitled";

      return {
        chatId,
        title,
        url: expectedUrl,
        updatedAt: new Date().toISOString(),
        messages,
      };
    } catch (error) {
      console.error("Failed to get chat page:", error);
      throw error;
    }
  }

  async getConversationStatus(
    ref: ConversationRef
  ): Promise<ConversationStatus> {
    const { chatId, messageId } = ref;

    try {
      // Check if there's a stop/generating indicator
      const generatingIndicator = querySelector(selectors.generatingIndicator);

      if (generatingIndicator) {
        return {
          chatId,
          messageId,
          state: "generating",
        };
      }

      if (this.hasThoughtIndicator()) {
        return {
          chatId,
          messageId,
          state: "generating",
        };
      }

      // Check for error messages
      const errorElement = querySelector(selectors.errorMessage);
      if (errorElement) {
        const errorText = getText(errorElement);
        return {
          chatId,
          messageId,
          state: "error",
          error: {
            code: "unexpected",
            message: errorText || "An error occurred",
          },
        };
      }

      // Otherwise, conversation is idle
      return {
        chatId,
        messageId,
        state: "idle",
      };
    } catch (error) {
      console.error("Failed to get conversation status:", error);
      return {
        chatId,
        messageId,
        state: "error",
        error: {
          code: "unexpected",
          message: error instanceof Error ? error.message : "Unknown error",
        },
      };
    }
  }

  // ============================================================================
  // Actions
  // ============================================================================

  /**
   * Navigate to a chat page (or home for new chat)
   * NOTE: This will reload the page if navigation is needed
   */
  async goToChatPage(input: {
    readonly chatId?: string;
    readonly target?: ChatTarget;
  }): Promise<{ navigated: boolean; url: string }> {
    const { chatId, target } = input;
    const currentUrl = window.location.href;

    let targetUrl: string;

    if (chatId) {
      targetUrl = `https://grok.com/c/${chatId}`;
      if (currentUrl.includes(`/c/${chatId}`)) {
        return { navigated: false, url: currentUrl };
      }
    } else if (target?.url) {
      targetUrl = target.url;
      if (currentUrl === targetUrl) {
        return { navigated: false, url: currentUrl };
      }
    } else {
      targetUrl = "https://grok.com/";
      // Check if already on home page
      if (
        currentUrl === "https://grok.com/" ||
        currentUrl === "https://grok.com" ||
        currentUrl.match(/^https:\/\/grok\.com\/?$/)
      ) {
        return { navigated: false, url: currentUrl };
      }
    }

    // Navigate to target URL
    window.location.href = targetUrl;
    // This line won't execute if navigation happens, but included for type safety
    return { navigated: true, url: targetUrl };
  }

  async submitPrompt(
    input: SubmitPromptInput,
    signal?: AbortSignal
  ): Promise<SubmitPromptResult> {
    const { prompt } = input;

    try {
      // Don't navigate here - assume we're already on the right page
      // Use goToChatPage() separately if navigation is needed

      // Wait for input field to be available
      const inputElement = await waitForElement(selectors.messageInput, {
        timeout: 5000,
      });

      if (!inputElement) {
        throw new Error("Message input field not found");
      }

      // Set the prompt text
      // Check if it's a contenteditable div or textarea
      if (
        inputElement.tagName === "P" &&
        inputElement.hasAttribute("data-placeholder")
      ) {
        // It's a contenteditable paragraph
        inputElement.textContent = prompt;
        // Trigger input event
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (inputElement.tagName === "TEXTAREA") {
        (inputElement as HTMLTextAreaElement).value = prompt;
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        // Try setting textContent as fallback
        inputElement.textContent = prompt;
        inputElement.dispatchEvent(new Event("input", { bubbles: true }));
      }

      // Wait a moment for the UI to update
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Find a submit control or synthesize the Enter key Grok expects
      const submitButton = querySelector(selectors.submitButton);

      // Check if aborted before submitting
      if (signal?.aborted) {
        throw new Error("Submission aborted");
      }

      if (submitButton) {
        (submitButton as HTMLButtonElement).click();
      } else {
        const submitted = this.triggerSubmitWithEnter(inputElement);
        if (!submitted) {
          throw new Error(
            "Unable to submit prompt - need authenticated snapshot of a send action"
          );
        }
      }

      // Wait for the message to be sent and get the message ID
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get the last message block to extract message ID
      const messageBlocks = querySelectorAll(selectors.messageBlocks);
      const lastMessage = messageBlocks[messageBlocks.length - 1];
      const messageId = lastMessage?.id?.replace("response-", "") || "";

      // Get the current chat ID from URL
      const currentChatId =
        this.extractChatIdFromUrl(window.location.href) || "";

      return {
        chatId: currentChatId,
        messageId,
      };
    } catch (error) {
      console.error("Failed to submit prompt:", error);
      throw error;
    }
  }

  // ============================================================================
  // Watchers
  // ============================================================================

  watchConversationStatus(
    ref: ConversationRef,
    onChange: (status: ConversationStatus) => void
  ): Unsubscribe {
    let isActive = true;
    let previousState: ConversationState | null = null;

    const checkStatus = async () => {
      if (!isActive) return;

      try {
        const status = await this.getConversationStatus(ref);

        // Only call onChange if the state has changed
        if (status.state !== previousState) {
          previousState = status.state;
          onChange(status);
        }
      } catch (error) {
        console.error("Error watching conversation status:", error);
      }

      // Continue polling if still active
      if (isActive) {
        setTimeout(checkStatus, 500); // Poll every 500ms
      }
    };

    // Start polling
    checkStatus();

    // Return unsubscribe function
    return () => {
      isActive = false;
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private extractHistoryPageEntries(
    container: Element,
    params: ListChatEntriesParams = {}
  ): ChatEntry[] {
    const { limit, sinceId } = params;
    const historyEntries = querySelectorAll(
      selectors.historyChatEntries,
      container
    );
    const entries: ChatEntry[] = [];

    for (const entryElement of historyEntries) {
      const linkElement = entryElement.querySelector('a[href^="/c/"]');
      const href = linkElement?.getAttribute("href");
      if (!href) continue;

      const chatId = this.extractChatIdFromUrl(href);
      if (!chatId) continue;

      if (sinceId && chatId === sinceId) {
        break;
      }

      const metadataBlock =
        entryElement.querySelector("div > div:last-child") ??
        entryElement.querySelector("div > div:nth-of-type(2)");
      const fallbackTitleNode = metadataBlock?.firstElementChild ?? null;
      const titleNode =
        metadataBlock?.querySelector("div") ?? fallbackTitleNode;
      const timestampNode = metadataBlock?.querySelector("span");

      entries.push({
        id: chatId,
        title: titleNode ? getText(titleNode) : "Untitled",
        url: `https://grok.com${href}`,
        updatedAt: timestampNode ? getText(timestampNode) : "",
      });

      if (limit && entries.length >= limit) {
        break;
      }
    }

    return entries;
  }

  private triggerSubmitWithEnter(inputElement: Element): boolean {
    const interactiveElement =
      inputElement instanceof HTMLElement
        ? inputElement
        : (inputElement.querySelector(
            '[contenteditable], textarea, input'
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

  private hasThoughtIndicator(): boolean {
    const container = querySelector(selectors.messageContainer);
    if (!container) return false;

    const spans = Array.from(container.querySelectorAll("span"));
    return spans.some((span) => {
      const text = span.textContent?.trim() ?? "";
      return /^Thought for \d+s?/i.test(text);
    });
  }

  private async extractDefaultModel(): Promise<string | undefined> {
    try {
      const modelElement = querySelector(selectors.modelName);
      if (modelElement) {
        const modelText = getText(modelElement);
        return modelText || undefined;
      }
    } catch (error) {
      console.warn("Failed to extract default model:", error);
    }
    return undefined;
  }

  private async extractAvailableModels(): Promise<
    readonly string[] | undefined
  > {
    // Would need to click model selector and scrape dropdown
    // Not implementing in this iteration
    return undefined;
  }

  private extractChatIdFromUrl(url: string): string | null {
    // Based on snapshot: /c/cdb24689-c4e3-4703-8a48-31433ed288a1
    const match = url.match(/\/c\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  private htmlToMarkdown(html: string): string {
    // Simple HTML to Markdown conversion
    // This is a basic implementation - could be enhanced
    let markdown = html;

    // Convert headings
    markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, "# $1\n");
    markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, "## $1\n");
    markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, "### $1\n");

    // Convert bold and italic
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, "**$1**");
    markdown = markdown.replace(/<b>(.*?)<\/b>/gi, "**$1**");
    markdown = markdown.replace(/<em>(.*?)<\/em>/gi, "*$1*");
    markdown = markdown.replace(/<i>(.*?)<\/i>/gi, "*$1*");

    // Convert lists
    markdown = markdown.replace(/<ul>(.*?)<\/ul>/gis, "$1");
    markdown = markdown.replace(/<ol>(.*?)<\/ol>/gis, "$1");
    markdown = markdown.replace(/<li>(.*?)<\/li>/gi, "- $1\n");

    // Convert paragraphs
    markdown = markdown.replace(/<p>(.*?)<\/p>/gi, "$1\n\n");

    // Convert line breaks
    markdown = markdown.replace(/<br\s*\/?>/gi, "\n");

    // Remove remaining HTML tags
    markdown = markdown.replace(/<[^>]+>/g, "");

    // Decode HTML entities
    markdown = markdown.replace(/&nbsp;/g, " ");
    markdown = markdown.replace(/&lt;/g, "<");
    markdown = markdown.replace(/&gt;/g, ">");
    markdown = markdown.replace(/&amp;/g, "&");

    return markdown.trim();
  }
}
