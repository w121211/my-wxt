// lib/services/automators-v2/grok-automator-v2-old.ts
// Implements AiAssistantAutomatorV2 against the updated V2 types without touching the newer Grok automator

import type {
  AiAssistantAutomatorV2,
  AiAssistantId,
  SelectorMap,
  LandingPage,
  ChatEntry,
  ChatPage,
  ChatMessage,
  ChatStatus,
  SubmitPromptInput,
  SubmitPromptResult,
  PageEvent,
  Unsubscribe,
} from '../../types/automators-v2.js';
import {
  querySelector,
  querySelectorAll,
  waitForElement,
  waitForCondition,
  getText,
} from '../../utils/selectors.js';

const selectors: SelectorMap = {
  loginIndicator: [
    'button[data-slot="button"][aria-haspopup="menu"]',
    'img[alt="pfp"]',
    'div[data-sidebar="footer"] button',
  ],
  sidebar: [
    'div[data-sidebar="sidebar"]',
    'div[data-state="expanded"][data-collapsible]',
  ],
  sidebarContent: 'div[data-sidebar="content"]',
  modelSelector: [
    'button#model-select-trigger',
    'button[aria-label="Model select"]',
  ],
  modelName: [
    'button#model-select-trigger span',
    'button[aria-label="Model select"] span',
  ],
  chatHistoryContainer: [
    'div[data-sidebar="content"]',
    'ul[data-sidebar="menu"]',
  ],
  chatItems: 'a[href^="/c/"]',
  historyPageContainer: 'div[role="tabpanel"][data-state="active"]',
  historyChatEntries: 'div[data-selected]',
  chatContainer: ['main', 'div[data-testid="drop-container"]'],
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
  submitButton: [],
  messageContainer: 'div#last-reply-container',
  messageBlocks: 'div[id^="response-"]',
  generatingIndicator: [
    'button[aria-label*="Stop"]',
    'div[data-generating="true"]',
  ],
  errorMessage: ['div[role="alert"]', 'div[data-error="true"]'],
  newChatButton: [
    'a[data-sidebar="menu-button"][href="/"]',
    'button[aria-label*="New chat"]',
  ],
};

export class GrokAutomatorV2 implements AiAssistantAutomatorV2 {
  static readonly id: AiAssistantId = 'grok';
  static readonly url = 'https://grok.com/';
  static readonly urlGlobs = [
    '*://grok.com/*',
    '*://*.grok.com/*',
    '*://x.ai/*',
    '*://*.x.ai/*',
  ] as const;

  readonly id = GrokAutomatorV2.id;
  readonly url = GrokAutomatorV2.url;
  readonly urlGlobs = GrokAutomatorV2.urlGlobs;
  readonly selectors = selectors;

  getUrl(params?: { chatId?: string }): string {
    return params?.chatId
      ? `https://grok.com/c/${params.chatId}`
      : 'https://grok.com/';
  }

  async getLandingPage(): Promise<LandingPage> {
    const url = window.location.href;
    const title = document.title.replace(' - Grok', '') || 'Grok';
    const isLoggedIn = await this.checkIsLoggedIn();

    let chatEntries: ChatEntry[] | undefined;
    let availableModelIds: string[] | undefined;

    if (isLoggedIn) {
      chatEntries = await this.extractChatEntries();
      availableModelIds = await this.extractAvailableModels();
    }

    return {
      slug: 'landing-page',
      url,
      title,
      isLoggedIn,
      chatEntries,
      availableModelIds,
    };
  }

  async getChatPage(chatId: string): Promise<ChatPage> {
    if (!chatId) {
      throw new Error('Chat ID is required');
    }

    const currentChatId = this.extractChatIdFromUrl(window.location.href);
    if (currentChatId !== chatId) {
      throw new Error(
        `Wrong chat page. Expected chat ID: ${chatId}, but currently on: ${
          currentChatId || 'landing page'
        }`
      );
    }

    const url = `https://grok.com/c/${chatId}`;
    const isLoggedIn = await this.checkIsLoggedIn();

    const messageContainer = await waitForElement(selectors.messageContainer, {
      timeout: 5000,
    });
    if (!messageContainer) {
      throw new Error('Message container not found');
    }

    const messages = await this.extractMessages(messageContainer);
    const pageTitle = document.title.replace(' - Grok', '');
    const title = pageTitle !== 'Grok' ? pageTitle : messages[0]?.content || 'Untitled';

    const status = await this.getChatStatus();
    const modelId = await this.extractCurrentModel();

    return {
      slug: 'chat-page',
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

  async submitPrompt(
    input: SubmitPromptInput,
    signal?: AbortSignal
  ): Promise<SubmitPromptResult> {
    const { prompt, chatId } = input;

    if (chatId) {
      const currentChatId = this.extractChatIdFromUrl(window.location.href);
      if (currentChatId !== chatId) {
        throw new Error(
          `Wrong chat page. Expected chat ID: ${chatId}, but currently on: ${
            currentChatId || 'landing page'
          }`
        );
      }
    }

    const inputElement = await waitForElement(selectors.messageInput, {
      timeout: 5000,
    });

    if (!inputElement) {
      throw new Error('Message input field not found');
    }

    if (inputElement instanceof HTMLElement && inputElement.isContentEditable) {
      inputElement.textContent = prompt;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (inputElement instanceof HTMLInputElement) {
      inputElement.value = prompt;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else if (inputElement instanceof HTMLTextAreaElement) {
      inputElement.value = prompt;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inputElement.textContent = prompt;
      inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const existingBlocks = this.getAllMessageBlocks().length;
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (signal?.aborted) {
      throw new Error('Submission aborted');
    }

    const submitted = this.triggerSubmitWithEnter(inputElement);
    if (!submitted) {
      throw new Error('Unable to submit prompt - Enter key simulation failed');
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    try {
      await waitForCondition(
        () => this.getAllMessageBlocks().length > existingBlocks,
        { timeout: 5000, interval: 200 }
      );
    } catch {
      // Continue even if UI confirmation times out
    }

    const resolvedChatId = chatId || this.extractChatIdFromUrl(window.location.href);
    if (!resolvedChatId) {
      throw new Error('Could not determine chat ID after submission');
    }

    return { chatId: resolvedChatId };
  }

  watchPage(
    _options: { chatId?: string },
    onChange: (event: PageEvent) => void
  ): Unsubscribe {
    let isActive = true;
    let observer: MutationObserver | null = null;
    let debounceTimer: number | null = null;

    const handleChange = async () => {
      if (!isActive) return;
      try {
        // Determine which page we're on based on current URL, not the requested chatId
        const currentChatId = this.extractChatIdFromUrl(window.location.href);

        const page = currentChatId
          ? await this.getChatPage(currentChatId)
          : await this.getLandingPage();
        onChange({ timestamp: new Date(), page });
      } catch (error) {
        console.error('Error in page observer handler:', error);
      }
    };

    const debouncedHandleChange = () => {
      if (debounceTimer) {
        window.clearTimeout(debounceTimer);
      }
      debounceTimer = window.setTimeout(() => handleChange(), 150);
    };

    const startObserving = async () => {
      try {
        // Detect current page type to determine which element to observe
        const currentChatId = this.extractChatIdFromUrl(window.location.href);
        let targetElement: Element | null = null;

        if (currentChatId) {
          try {
            targetElement = await waitForElement(selectors.messageContainer, {
              timeout: 2000,
            });
          } catch {
            targetElement = document.body;
          }
        } else {
          targetElement = document.body;
        }

        if (!targetElement || !isActive) return;

        observer = new MutationObserver(() => {
          debouncedHandleChange();
        });

        observer.observe(targetElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['aria-busy'],
        });

        handleChange();
      } catch (error) {
        console.error('Error setting up page observer:', error);
      }
    };

    startObserving();

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

  private async checkIsLoggedIn(): Promise<boolean> {
    const indicator = querySelector(selectors.loginIndicator);
    return !!indicator;
  }

  private async extractChatEntries(): Promise<ChatEntry[]> {
    try {
      const sidebar = await waitForElement(selectors.sidebar, { timeout: 3000 });
      if (!sidebar) {
        return [];
      }

      const chatLinks = querySelectorAll(selectors.chatItems, sidebar);
      const entries: ChatEntry[] = [];

      for (const link of chatLinks) {
        const href = link.getAttribute('href');
        if (!href) continue;
        const chatId = this.extractChatIdFromUrl(href) || undefined;
        const titleElement = link.querySelector('span');
        const title = titleElement ? getText(titleElement) : 'Untitled';
        entries.push({
          chatId,
          title,
          url: chatId ? `https://grok.com/c/${chatId}` : undefined,
        });
      }

      return entries;
    } catch (error) {
      console.error('Failed to extract chat entries:', error);
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
      console.warn('Failed to extract available models:', error);
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
      console.warn('Failed to extract current model:', error);
    }
    return undefined;
  }

  private async getChatStatus(): Promise<ChatStatus> {
    try {
      const generatingIndicator = querySelector(selectors.generatingIndicator);
      if (generatingIndicator) {
        return 'generating';
      }
      const errorElement = querySelector(selectors.errorMessage);
      if (errorElement) {
        return 'error';
      }
      return 'idle';
    } catch (error) {
      console.error('Failed to get chat status:', error);
      return 'error';
    }
  }

  private async extractMessages(container: Element): Promise<ChatMessage[]> {
    const messages: ChatMessage[] = [];
    const blocks = querySelectorAll(selectors.messageBlocks, container);

    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      const idRaw = block.id || '';
      const id = idRaw.replace('response-', '') || this.generateMessageId();
      const contentElement = block.querySelector('div > div') || block;
      const content = getText(contentElement);
      const role = i % 2 === 0 ? 'user' : 'assistant';

      messages.push({
        id,
        role,
        content,
        createdAt: new Date().toISOString(),
      });
    }

    return messages;
  }

  private getAllMessageBlocks(): Element[] {
    return querySelectorAll(selectors.messageBlocks);
  }

  private triggerSubmitWithEnter(inputElement: Element): boolean {
    const interactiveElement =
      inputElement instanceof HTMLElement
        ? inputElement
        : inputElement.querySelector('[contenteditable], textarea, input');

    if (!(interactiveElement instanceof HTMLElement)) {
      return false;
    }

    interactiveElement.focus();
    this.dispatchEnterKeyEvent(interactiveElement, 'keydown');
    this.dispatchEnterKeyEvent(interactiveElement, 'keypress');
    this.dispatchEnterKeyEvent(interactiveElement, 'keyup');
    return true;
  }

  private dispatchEnterKeyEvent(
    target: HTMLElement,
    type: 'keydown' | 'keypress' | 'keyup'
  ): void {
    const event = new KeyboardEvent(type, {
      key: 'Enter',
      code: 'Enter',
      bubbles: true,
      cancelable: true,
    });

    target.dispatchEvent(event);
  }

  private extractChatIdFromUrl(url: string): string | null {
    const match = url.match(/\/c\/([a-f0-9-]+)/i);
    return match ? match[1] : null;
  }

  private generateMessageId(): string {
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
  }
}
