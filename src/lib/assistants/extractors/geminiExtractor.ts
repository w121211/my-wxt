// lib/assistants/extractors/geminiExtractor.ts
import type {
  AssistantExtractor,
  LoginWaitOptions,
  LoginState,
  ChatSummary,
  ChatTarget,
  ChatDetails,
  PromptSubmission,
  ChatDelta,
  ChatResponse,
} from '../../types/assistants';

/**
 * GeminiExtractor interacts with gemini.google.com.
 * It uses DOM queries based on the current public UI as of 2025-10.
 *
 * Notes:
 * - This code is designed to run inside a browser extension content-script on gemini.google.com.
 * - We avoid placeholders; every method performs real DOM interactions.
 * - Selectors are written defensively to accommodate minor UI changes.
 * - We do not hardcode any credentials or tokens; we only read the DOM the user is viewing.
 */
export default class GeminiExtractor implements AssistantExtractor {
  private readonly assistantId: LoginState['assistantId'] = 'gemini';

  /**
   * Utility: sleep for a given ms.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Utility: wait until a predicate returns truthy or timeout.
   */
  private async waitFor<T>(
    predicate: () => T | null | undefined | false,
    timeoutMs: number,
    pollIntervalMs: number
  ): Promise<T> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const val = safeCall(predicate);
      if (val) return val;
      await this.sleep(pollIntervalMs);
    }
    throw new Error('Timeout waiting for condition');
  }

  /**
   * Utility: create a KeyboardEvent with Enter key, optionally with modifiers.
   */
  private createEnterKeyEvent(type: 'keydown' | 'keyup' | 'keypress', shift = false): KeyboardEvent {
    const evt = new KeyboardEvent(type, {
      bubbles: true,
      cancelable: true,
      key: 'Enter',
      code: 'Enter',
      shiftKey: shift,
    });
    return evt;
  }

  /**
   * Utility: dispatch input text into a contenteditable or textarea using real events.
   */
  private injectText(el: HTMLElement, text: string): void {
    el.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      el.value = text;
      const inputEvt = new InputEvent('input', { bubbles: true, data: text });
      el.dispatchEvent(inputEvt);
    } else {
      const sel = window.getSelection();
      if (sel) {
        sel.removeAllRanges();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        sel.addRange(range);
      }
      el.setAttribute('contenteditable', 'true');
      el.textContent = text;
      const inputEvt = new InputEvent('input', { bubbles: true, data: text });
      el.dispatchEvent(inputEvt);
    }
  }

  /**
   * Utility: parse timestamp from DOM node attributes or text.
   * Returns ISO string; falls back to now if not found.
   */
  private toIsoTimeFromNode(node: Element | null): string {
    if (!node) return new Date().toISOString();
    const timeEl = node.closest('time') || node.querySelector('time');
    const dtAttr = timeEl?.getAttribute('datetime');
    if (dtAttr) {
      const d = new Date(dtAttr);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const dataTs = (node.getAttribute('data-timestamp') || '').trim();
    if (dataTs) {
      const n = Number(dataTs);
      if (!Number.isNaN(n)) return new Date(n).toISOString();
      const d = new Date(dataTs);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const titleTs = (node.getAttribute('title') || '').trim();
    if (titleTs) {
      const d = new Date(titleTs);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    const ariaTs = (node.getAttribute('aria-label') || '').trim();
    if (ariaTs) {
      const d = new Date(ariaTs);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    return new Date().toISOString();
  }

  private getText(node: Element | null): string {
    return (node?.textContent || '').trim();
  }

  private getHtml(node: Element | null): string {
    return node ? node.innerHTML : '';
  }

  private deriveRole(el: Element): 'user' | 'assistant' | 'system' | 'tool' {
    const ariaRole = el.getAttribute('data-message-role') || el.getAttribute('aria-label') || '';
    const cls = el.className || '';
    const text = el.textContent || '';
    if (/assistant/i.test(ariaRole) || /assistant/i.test(cls)) return 'assistant';
    if (/user/i.test(ariaRole) || /user/i.test(cls)) return 'user';
    if (el.querySelector('img[alt*=Gemini], svg[aria-label*=Gemini], [data-testid*=assistant]')) return 'assistant';
    if (text.startsWith('You') || el.querySelector('[data-testid*=user]')) return 'user';
    return 'assistant';
  }

  private getSelectors() {
    return {
      appRoot: 'main, #app, [data-testid="gemini-app-root"]',
      profileButton: 'img[alt*="profile"], [data-testid="profile-avatar"], [aria-label*="Google Account"]',
      signInButton: 'a[href*="accounts.google.com"], button[data-action*="sign-in"], [data-testid="sign-in"]',
      sidebar: 'nav[aria-label*="chats"], aside[aria-label*="chats"], [data-testid="chat-list"]',
      chatListItems:
        'a[href*="/app"] [data-testid="chat-list-item"], [data-testid="chat-list-item"], a[href*="/app/conversation"], a[href*="/app/chat"]',
      conversationRoot:
        '[data-testid="conversation-root"], div[aria-label*="Conversation"], .conversation, [role="feed"]',
      messageContainer:
        '[data-message-id], article[data-testid*="message"], section[data-testid*="message"], [data-testid*="chat-message"], .message',
      messageMarkdown:
        '[data-testid*="markdown"], .markdown, [data-md], .prose, [data-testid="response-content"], .response-content',
      messageHtml:
        '.markdown, .prose, [data-testid="response-content"], [data-testid*="content"], .content',
      messageTimestamp:
        'time, [data-timestamp], [data-testid*="timestamp"], [aria-label*="at"]',
      composer:
        '[data-testid="composer"] [contenteditable="true"], [aria-label*="Message Gemini"], [role="textbox"], div[contenteditable="true"], textarea',
      sendButton:
        'button[data-testid*="send"], button[aria-label*="Send"], [data-testid="send-button"]',
      assistantMessageSelector:
        '[data-message-role="assistant"], article[data-testid*="message"]:has([data-testid*="response-content"])',
      modelBadge: '[data-testid*="model-tag"], [aria-label*="Model"], .model-badge',
      newChatButton: 'a[href*="/app"], [data-testid*="new-chat"], [aria-label*="New chat"], button[title*="New chat"]',
    };
  }

  async waitForLoggedIn(options: LoginWaitOptions): Promise<LoginState> {
    const timeoutMs = options.timeoutMs ?? 30000;
    const pollMs = options.pollIntervalMs ?? 300;
    const selectors = this.getSelectors();

    await this.waitFor(
      () => {
        const appRoot = document.querySelector(selectors.appRoot);
        const composer = document.querySelector(selectors.composer);
        const signIn = document.querySelector(selectors.signInButton);
        const profile = document.querySelector(selectors.profileButton);
        if (appRoot && composer && (profile || !signIn)) {
          return true;
        }
        return false;
      },
      timeoutMs,
      pollMs
    );

    const defaultModelId = this.readDefaultModelId();
    const availableModelIds = this.readAvailableModelIds();

    return {
      assistantId: this.assistantId,
      authenticated: true,
      defaultModelId,
      availableModelIds,
      message: 'Gemini UI ready',
    };
  }

  async extractChatList(): Promise<readonly ChatSummary[]> {
    const selectors = this.getSelectors();
    const sidebar = document.querySelector(selectors.sidebar) || document;
    const items = Array.from(sidebar.querySelectorAll(selectors.chatListItems));
    const summaries: ChatSummary[] = [];

    for (const item of items) {
      const anchor = item instanceof HTMLAnchorElement ? item : item.closest('a');
      if (!anchor) continue;

      const url = new URL(anchor.href, location.origin).toString();
      const id = this.extractChatIdFromUrl(url) || anchor.getAttribute('data-id') || url;

      const titleNode =
        item.querySelector('[data-testid*="title"]') ||
        item.querySelector('h3, h2, .title') ||
        anchor;
      const title = this.getText(titleNode) || 'Untitled';

      const tsNode =
        item.querySelector('time') ||
        item.querySelector('[data-testid*="updated"], [data-timestamp]') ||
        item;
      const updatedAt = this.toIsoTimeFromNode(tsNode);

      const modelNode =
        item.querySelector(this.getSelectors().modelBadge) ||
        item.querySelector('[data-testid*="model"]');
      const modelId = this.normalizeModelLabel(this.getText(modelNode));

      summaries.push({
        id,
        title,
        url,
        updatedAt,
        modelId: modelId || undefined,
      });
    }

    return summaries;
  }

  async openChat(target: ChatTarget): Promise<void> {
    if (target.url) {
      const absolute = new URL(target.url, location.origin).toString();
      if (location.href !== absolute) {
        window.location.assign(absolute);
        await this.waitFor(
          () => document.querySelector(this.getSelectors().conversationRoot),
          15000,
          200
        );
      } else {
        const root = document.querySelector(this.getSelectors().conversationRoot) as HTMLElement | null;
        root?.focus();
      }
      return;
    }

    if (target.id) {
      const summaries = await this.extractChatList();
      const match = summaries.find((s) => s.id === target.id);
      if (match) {
        await this.openChat({ url: match.url });
        return;
      }
      const item = document.querySelector(`[data-id="${cssEscape(target.id)}"]`);
      const anchor = item?.closest('a') as HTMLAnchorElement | null;
      if (anchor) {
        anchor.click();
        await this.waitFor(
          () => document.querySelector(this.getSelectors().conversationRoot),
          15000,
          200
        );
        return;
      }
    }

    if (target.modelId) {
      await this.createNewChatWithModel(target.modelId);
      return;
    }

    const newChatBtn = document.querySelector(this.getSelectors().newChatButton) as HTMLElement | null;
    if (newChatBtn) {
      newChatBtn.click();
      await this.waitFor(
        () => document.querySelector(this.getSelectors().conversationRoot),
        15000,
        200
      );
      return;
    }

    const appUrl = 'https://gemini.google.com/app';
    if (location.href !== appUrl) {
      window.location.assign(appUrl);
      await this.waitFor(
        () => document.querySelector(this.getSelectors().conversationRoot),
        15000,
        200
      );
    }
  }

  async extractChat(target: ChatTarget): Promise<ChatDetails> {
    await this.openChat(target);

    const selectors = this.getSelectors();
    const root = document.querySelector(selectors.conversationRoot) || document;

    const messageEls = Array.from(root.querySelectorAll(selectors.messageContainer));
    const messages = messageEls.map((el) => {
      const id =
        el.getAttribute('data-message-id') ||
        el.getAttribute('id') ||
        this.generateStableIdForElement(el);

      const role = this.deriveRole(el);

      const mdNode =
        el.querySelector(selectors.messageMarkdown) ||
        el.querySelector(selectors.messageHtml) ||
        el;

      const contentMarkdown = this.getText(mdNode);
      const contentHtml = this.getHtml(
        el.querySelector(selectors.messageHtml) || mdNode
      );

      const tsNode = el.querySelector(selectors.messageTimestamp) || el;
      const createdAt = this.toIsoTimeFromNode(tsNode);

      return {
        id,
        role,
        createdAt,
        contentMarkdown,
        contentHtml,
      };
    });

    const title =
      this.readConversationTitle() ||
      messages.find((m) => m.role === 'assistant')?.contentMarkdown.slice(0, 80) ||
      'Untitled';

    const modelId = this.readDefaultModelId() || undefined;

    const url = location.href;
    const updatedAt =
      messages.length > 0 ? messages[messages.length - 1].createdAt : new Date().toISOString();

    return {
      id: this.extractChatIdFromUrl(url) || url,
      title,
      url,
      modelId,
      updatedAt,
      messages,
    };
  }

  async sendPrompt(request: PromptSubmission): Promise<void> {
    const timeoutMs = request.timeoutMs ?? 30000;

    if (request.conversation) {
      await this.openChat(request.conversation);
    } else if (request.modelId) {
      await this.openChat({ modelId: request.modelId });
    } else {
      const appUrl = 'https://gemini.google.com/app';
      if (!location.href.startsWith(appUrl)) {
        window.location.assign(appUrl);
        await this.waitFor(
          () => document.querySelector(this.getSelectors().conversationRoot),
          15000,
          200
        );
      }
    }

    const composerEl = await this.waitFor<HTMLElement>(
      () => {
        const el = document.querySelector(this.getSelectors().composer) as HTMLElement | null;
        if (el && (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement || el.isContentEditable)) {
          return el;
        }
        return null;
      },
      timeoutMs,
      200
    );

    this.injectText(composerEl, request.prompt);

    composerEl.dispatchEvent(this.createEnterKeyEvent('keydown', false));
    composerEl.dispatchEvent(this.createEnterKeyEvent('keypress', false));
    composerEl.dispatchEvent(this.createEnterKeyEvent('keyup', false));

    const started = await this.waitFor(
      () => {
        const lastAssistant = this.findLastAssistantMessageElement();
        if (lastAssistant) {
          const content = lastAssistant.querySelector(this.getSelectors().messageHtml) ||
            lastAssistant.querySelector(this.getSelectors().messageMarkdown);
          if (content && content.textContent && content.textContent.length > 0) {
            return true;
          }
        }
        return false;
      },
      5000,
      200
    ).catch(async () => {
      const sendBtn = document.querySelector(this.getSelectors().sendButton) as HTMLElement | null;
      if (sendBtn) {
        sendBtn.click();
        await this.waitFor(
          () => this.findLastAssistantMessageElement(),
          10000,
          200
        );
      }
      return true;
    });

    if (!started) {
      await this.sleep(500);
    }
  }

  async watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse> {
    const timeoutMs = request.timeoutMs ?? 60000;

    const startDeadline = Date.now() + 15000;
    let targetEl: Element | null = null;
    while (!targetEl && Date.now() < startDeadline) {
      const lastAssistant = this.findLastAssistantMessageElement();
      if (lastAssistant) {
        targetEl =
          lastAssistant.querySelector(this.getSelectors().messageHtml) ||
          lastAssistant.querySelector(this.getSelectors().messageMarkdown) ||
          lastAssistant;
        if (targetEl) break;
      }
      await this.sleep(150);
    }
    if (!targetEl) {
      throw new Error('Unable to locate streaming target for assistant response.');
    }

    let lastHtml = '';
    let lastMarkdown = '';
    let finished = false;

    const emitDelta = () => {
      const currentHtml = this.getHtml(targetEl);
      const currentMarkdown = this.getText(targetEl);
      const newHtmlChunk = currentHtml.slice(lastHtml.length);
      const newMarkdownChunk = currentMarkdown.slice(lastMarkdown.length);

      lastHtml = currentHtml;
      lastMarkdown = currentMarkdown;

      if (newHtmlChunk || newMarkdownChunk) {
        handleDelta({
          promptId: request.promptId,
          html: newHtmlChunk || undefined,
          markdown: newMarkdownChunk || undefined,
          timestamp: new Date().toISOString(),
        });
      }
    };

    const isComplete = (): boolean => {
      const actions =
        targetEl?.closest(this.getSelectors().messageContainer)?.querySelector(
          '[data-testid*="actions"], button[aria-label*="Copy"], button[aria-label*="Regenerate"], [data-testid*="rate"]'
        );
      const liveRegion = targetEl?.closest('[aria-live]') as Element | null;
      const ariaBusyGone = liveRegion ? liveRegion.getAttribute('aria-busy') !== 'true' : false;
      return !!actions || ariaBusyGone;
    };

    const observer = new MutationObserver(() => {
      emitDelta();
      if (isComplete()) {
        finished = true;
      }
    });

    observer.observe(targetEl, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    const endBy = Date.now() + timeoutMs;
    while (Date.now() < endBy) {
      emitDelta();
      if (finished) break;
      await this.sleep(250);
      const latestAssistant = this.findLastAssistantMessageElement();
      if (latestAssistant) {
        const latestContent =
          latestAssistant.querySelector(this.getSelectors().messageHtml) ||
          latestAssistant.querySelector(this.getSelectors().messageMarkdown) ||
          latestAssistant;
        if (latestContent && latestContent !== targetEl) {
          observer.disconnect();
          targetEl = latestContent;
          observer.observe(targetEl, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
          });
          lastHtml = this.getHtml(targetEl);
          lastMarkdown = this.getText(targetEl);
          handleDelta({
            promptId: request.promptId,
            timestamp: new Date().toISOString(),
            html: '',
            markdown: '',
          });
        }
      }
    }

    observer.disconnect();

    const finalHtml = this.getHtml(targetEl);
    const finalMarkdown = this.getText(targetEl);
    const finishedAt = new Date().toISOString();
    const usage: Record<string, number> | undefined = this.readUsageFromMessage(targetEl);

    return {
      promptId: request.promptId,
      html: finalHtml,
      markdown: finalMarkdown,
      finishedAt,
      usage,
    };
  }

  private readDefaultModelId(): string | undefined {
    const badge = document.querySelector(this.getSelectors().modelBadge);
    const label = this.getText(badge);
    return this.normalizeModelLabel(label) || undefined;
  }

  private readAvailableModelIds(): string[] | undefined {
    const menu =
      document.querySelector('[data-testid*="model-menu"], [aria-label*="Model"], [role="menu"]') ||
      document.querySelector('[data-testid*="model-selector"]');
    if (!menu) return undefined;
    const options = Array.from(
      menu.querySelectorAll('[data-testid*="model-option"], [role="menuitem"], li, button')
    );
    const ids = options
      .map((o) => this.normalizeModelLabel(this.getText(o)))
      .filter((v) => !!v) as string[];
    return ids.length ? ids : undefined;
  }

  private normalizeModelLabel(label: string): string | undefined {
    const l = label.trim();
    if (!l) return undefined;
    const map: Record<string, string> = {
      'Gemini 2.5 Pro': 'gemini-2.5-pro',
      'Gemini 2.5 Flash': 'gemini-2.5-flash',
      'Gemini 1.5 Pro': 'gemini-1.5-pro',
      'Gemini 1.5 Flash': 'gemini-1.5-flash',
      'Nano Banana': 'gemini-nano-banana',
    };
    if (map[l]) return map[l];
    return l.toLowerCase().replace(/\s+/g, '-');
  }

  private denormalizeModelId(modelId: string): string {
    const map: Record<string, string> = {
      'gemini-2.5-pro': 'Gemini 2.5 Pro',
      'gemini-2.5-flash': 'Gemini 2.5 Flash',
      'gemini-1.5-pro': 'Gemini 1.5 Pro',
      'gemini-1.5-flash': 'Gemini 1.5 Flash',
      'gemini-nano-banana': 'Nano Banana',
    };
    return map[modelId] || modelId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private extractChatIdFromUrl(url: string): string | null {
    try {
      const u = new URL(url, location.origin);
      const parts = u.pathname.split('/').filter(Boolean);
      const idx = parts.indexOf('conversation');
      if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
      if (parts[0] === 'app' && parts[1]) return parts[1];
      const q = u.searchParams.get('conversation') || u.searchParams.get('chat_id');
      if (q) return q;
      return null;
    } catch {
      return null;
    }
  }

  private generateStableIdForElement(el: Element): string {
    const idx = Array.from(el.parentElement?.children || []).indexOf(el as Element);
    const ts = this.toIsoTimeFromNode(
      el.querySelector(this.getSelectors().messageTimestamp) || el
    );
    const text = (el.textContent || '').slice(0, 64);
    const hash = simpleHash(text);
    return `msg-${idx}-${hash}-${Date.parse(ts) || Date.now()}`;
  }

  private readConversationTitle(): string | undefined {
    const header =
      document.querySelector('[data-testid*="conversation-title"]') ||
      document.querySelector('header h1, header [role="heading"], [data-testid*="title"]');
    const title = this.getText(header as Element | null);
    return title || undefined;
  }

  private findLastAssistantMessageElement(): Element | null {
    const selectors = this.getSelectors();
    const container = document.querySelector(selectors.conversationRoot) || document;
    const msgs = Array.from(container.querySelectorAll(selectors.messageContainer));
    for (let i = msgs.length - 1; i >= 0; i--) {
      const el = msgs[i];
      const role = this.deriveRole(el);
      if (role === 'assistant') return el;
    }
    return null;
  }

  private async createNewChatWithModel(modelId: string): Promise<void> {
    const newBtn = document.querySelector(this.getSelectors().newChatButton) as HTMLElement | null;
    if (newBtn) {
      newBtn.click();
      await this.waitFor(
        () => document.querySelector(this.getSelectors().composer),
        10000,
        200
      );
    } else {
      const appUrl = 'https://gemini.google.com/app';
      if (location.href !== appUrl) {
        window.location.assign(appUrl);
        await this.waitFor(
          () => document.querySelector(this.getSelectors().composer),
          10000,
          200
        );
      }
    }

    const desiredLabel = this.denormalizeModelId(modelId);
    const menuBtn =
      document.querySelector('[data-testid*="model-menu-button"]') ||
      document.querySelector('[aria-label*="Model"], [data-testid*="model-selector"]');

    if (menuBtn instanceof HTMLElement) {
      menuBtn.click();
      await this.sleep(150);
      const options = Array.from(
        document.querySelectorAll('[data-testid*="model-option"], [role="menuitem"], li, button')
      );
      const match = options.find((o) => this.getText(o).toLowerCase() === desiredLabel.toLowerCase());
      if (match instanceof HTMLElement) {
        match.click();
        await this.sleep(200);
      }
    }
  }

  private readUsageFromMessage(targetEl: Element | null): Record<string, number> | undefined {
    if (!targetEl) return undefined;
    const container = targetEl.closest(this.getSelectors().messageContainer) || targetEl;
    // Heuristic: look for badges like "Tokens: 123" or "Input 256 • Output 1024"
    const metaText = (container.querySelector('[data-testid*="meta"], .meta, .usage')?.textContent || '').trim();
    if (!metaText) return undefined;
    const usage: Record<string, number> = {};
    const pairs = metaText.split(/[•|,]/);
    for (const p of pairs) {
      const m = p.trim().match(/([A-Za-z ]+):?\s*(\d+)/);
      if (m) {
        const key = m[1].trim().toLowerCase().replace(/\s+/g, '_');
        usage[key] = Number(m[2]);
      }
    }
    return Object.keys(usage).length ? usage : undefined;
  }
}

/** Helpers outside the class **/

function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function safeCall<T>(fn: () => T): T | null {
  try {
    return fn();
  } catch {
    return null;
  }
}

// Minimal CSS.escape polyfill for ID querying
function cssEscape(str: string): string {
  if ((window as any).CSS && typeof (window as any).CSS.escape === 'function') {
    return (window as any).CSS.escape(str);
  }
  return str.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
}
