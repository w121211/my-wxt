// src/lib/automators/chatgpt.ts
// ChatGPT automator implementation

import type { AutomatorDefinition } from './types';
import type { ChatGptApi, ChatGptSlug } from './chatgpt.types';

// Simple glob matcher helper (placeholder - use a real glob library in production)
function matchGlob(url: string, glob: string): boolean {
  const pattern = glob.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*');
  return new RegExp(`^${pattern}$`).test(url);
}

export const chatgptAutomator: AutomatorDefinition<ChatGptApi> = {
  slug: 'chatgpt' as ChatGptSlug,

  urlGlob: 'https://chatgpt.com/**',

  pages: {
    landing: {
      url: 'https://chatgpt.com/',
      urlGlobs: ['https://chatgpt.com/', 'https://chat.openai.com/'],
      selectors: {
        promptInput: 'textarea[data-id="root"]',
        sendButton: 'button[data-testid="send-button"]',
        newChatButton: '[data-testid="new-chat"]',
      },
    },

    conversation: {
      url: 'https://chatgpt.com/c/',
      urlGlobs: ['https://chatgpt.com/c/*', 'https://chat.openai.com/c/*'],
      selectors: {
        promptInput: 'textarea[data-id="root"]',
        sendButton: 'button[data-testid="send-button"]',
        chatThread: '[data-testid^="conversation-turn-"]',
        messageText: '.markdown',
        stopButton: 'button[data-testid="stop-button"]',
      },
    },
  },

  actions: {
    async sendPrompt(ctx, params) {
      const { prompt, conversationId } = params;
      ctx.logger.info('Sending prompt', { prompt, conversationId });

      // Determine target URL based on conversationId
      let targetUrl: string | null = null;
      if (conversationId) {
        targetUrl = `https://chatgpt.com/c/${conversationId}`;
      }

      // Check if we need to navigate
      const currentUrl = window.location.href;
      if (targetUrl && currentUrl !== targetUrl) {
        ctx.logger.info('Navigating to conversation', { from: currentUrl, to: targetUrl });
        await ctx.navigateTo(targetUrl);
        ctx.logger.info('Navigation complete');
      }

      // Helper to get selectors for current page
      const getSelectors = () => {
        const currentUrl = window.location.href;
        for (const page of Object.values(chatgptAutomator.pages)) {
          if (page.urlGlobs.some((glob) => matchGlob(currentUrl, glob))) {
            return page.selectors;
          }
        }
        throw new Error('Current page does not match any known page type');
      };

      const selectors = getSelectors();

      const input = document.querySelector<HTMLTextAreaElement>(selectors.promptInput);
      if (!input) {
        throw new Error('Prompt input not found');
      }

      input.value = prompt;
      input.dispatchEvent(new Event('input', { bubbles: true }));

      const sendBtn = document.querySelector<HTMLButtonElement>(selectors.sendButton);
      if (!sendBtn) {
        throw new Error('Send button not found');
      }

      sendBtn.click();

      // Wait for response (simplified - in real impl, watch for completion)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      return {
        reply: 'Response from ChatGPT',
        conversationId: conversationId || 'new-conv-123',
      };
    },

    async extractChatEntries(ctx) {
      ctx.logger.info('Extracting chat entries');

      const selectors = chatgptAutomator.pages.conversation.selectors;
      const turns = document.querySelectorAll(selectors.chatThread);
      const entries = Array.from(turns).map((turn, idx) => {
        const textEl = turn.querySelector(selectors.messageText);
        return {
          id: `entry-${idx}`,
          role: (idx % 2 === 0 ? 'user' : 'assistant') as 'user' | 'assistant',
          text: textEl?.textContent || '',
        };
      });

      return { entries };
    },

    async isReady(ctx) {
      ctx.logger.info('Checking if ChatGPT is ready');

      const getSelectors = () => {
        const currentUrl = window.location.href;
        for (const page of Object.values(chatgptAutomator.pages)) {
          if (page.urlGlobs.some((glob) => matchGlob(currentUrl, glob))) {
            return page.selectors;
          }
        }
        throw new Error('Current page does not match any known page type');
      };

      const selectors = getSelectors();
      const input = document.querySelector(selectors.promptInput);
      return { ready: !!input };
    },
  },

  watchers: {
    chatUpdates(ctx, emit) {
      ctx.logger.info('Starting chat updates watcher');

      const selectors = chatgptAutomator.pages.conversation.selectors;
      let lastCount = 0;

      const observer = new MutationObserver(() => {
        const turns = document.querySelectorAll(selectors.chatThread);
        if (turns.length !== lastCount) {
          lastCount = turns.length;
          emit('watcher.chatUpdates', {
            entries: Array.from(turns).map((_, idx) => ({ id: `entry-${idx}` })),
          });
        }
      });

      const container = document.body;
      observer.observe(container, { childList: true, subtree: true });

      return () => {
        ctx.logger.info('Stopping chat updates watcher');
        observer.disconnect();
      };
    },

    modelChanged(ctx, emit) {
      ctx.logger.info('Starting model changed watcher');
      // Placeholder - would watch for model selector changes
      return () => {
        ctx.logger.info('Stopping model changed watcher');
      };
    },

    connectionState(ctx, emit) {
      ctx.logger.info('Starting connection state watcher');
      // Placeholder - would watch for connection status
      return () => {
        ctx.logger.info('Stopping connection state watcher');
      };
    },
  },
};
