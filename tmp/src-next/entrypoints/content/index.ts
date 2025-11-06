// src/entrypoints/content/index.ts
// Content script: matches automators by URL and manages actions/watchers

import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { registry } from '@/lib/automators/registry';
import { matchUrl } from '@/lib/matcher';
import { createLogger } from '@/lib/utils/logger';
import type { PageSessionId, PageRef } from '@/lib/ws/types';
import type { BgToContent, ContentToBg } from '@/lib/runtime/types';
import type { AutomatorDefinition, PageSession, StopFn, ActionContext } from '@/lib/automators/types';
import type { MatchCandidate } from '@/lib/matcher/types';

const logger = createLogger('content');

class ContentService {
  private port: Browser.runtime.Port | null = null;
  private activeAutomator: AutomatorDefinition | null = null;
  private session: PageSession | null = null;
  private stopWatchers: StopFn[] = [];
  private eventSeq = 0;

  async init(): Promise<void> {
    logger.info('Initializing content script', { url: window.location.href });

    // Find matching automator using page-specific urlGlobs
    const candidates: MatchCandidate[] = registry.flatMap((automator) =>
      Object.values(automator.pages).flatMap((page) =>
        page.urlGlobs.map((glob) => ({
          slug: automator.slug,
          pattern: glob,
        }))
      )
    );

    try {
      const match = matchUrl(window.location.href, candidates);

      if (!match) {
        logger.info('No matching automator for this URL');
        return;
      }

      logger.info('Matched automator', { slug: match.slug, pattern: match.best.pattern });

      this.activeAutomator = registry.find((a) => a.slug === match.slug) || null;

      if (!this.activeAutomator) {
        logger.error('Automator not found in registry', { slug: match.slug });
        return;
      }

      // Create session
      const tabId = await this.getTabId();
      const frameId = 0; // TODO: get actual frame ID
      const sessionId: PageSessionId = `${tabId}:${frameId}:${this.activeAutomator.slug}`;

      this.session = {
        id: sessionId,
        automator: this.activeAutomator.slug,
        page: { tabId, frameId, url: window.location.href },
        startedAt: Date.now(),
      };

      // Connect to background
      this.port = browser.runtime.connect({ name: `content-${sessionId}` });

      this.port.onMessage.addListener((msg: BgToContent) => {
        this.handleBgMessage(msg);
      });

      this.port.onDisconnect.addListener(() => {
        logger.info('Port disconnected');
        this.cleanup();
      });

      // Start watchers
      this.startWatchers();

      logger.info('Content script initialized', { sessionId });
    } catch (error) {
      logger.error('Failed to initialize content script', { error });
    }
  }

  private async getTabId(): Promise<number> {
    return new Promise((resolve) => {
      browser.runtime.sendMessage({ type: 'getTabId' }, (response) => {
        resolve(response?.tabId || 0);
      });
    });
  }

  private startWatchers(): void {
    if (!this.activeAutomator || !this.session) {
      return;
    }

    const watcherCtx = {
      session: this.session,
      logger: createLogger(`watcher:${this.activeAutomator.slug}`),
    };

    for (const [name, watcherFn] of Object.entries(this.activeAutomator.watchers)) {
      logger.info('Starting watcher', { name });

      const emit = (eventName: string, payload: unknown) => {
        this.eventSeq++;

        const msg: ContentToBg = {
          type: 'watcherEvent',
          sessionId: this.session!.id,
          automator: this.activeAutomator!.slug,
          page: this.session!.page,
          name: eventName as `watcher.${string}`,
          seq: this.eventSeq,
          data: payload,
        };

        this.port?.postMessage(msg);
      };

      const stopFn = watcherFn(watcherCtx, emit as never);
      this.stopWatchers.push(stopFn);
    }

    // Send automator.started event
    this.sendLifecycleEvent('automator.started');
  }

  private handleBgMessage(msg: BgToContent): void {
    if (msg.type === 'runAction') {
      this.runAction(msg.requestId, msg.name, msg.params);
    } else if (msg.type === 'cancelAction') {
      logger.warn('Action cancellation not yet implemented', { targetRequestId: msg.targetRequestId });
    }
  }

  private async runAction(requestId: string, name: string, params: unknown): Promise<void> {
    if (!this.activeAutomator || !this.session) {
      this.sendError(requestId, 'NO_SESSION', 'No active session');
      return;
    }

    const actionFn = this.activeAutomator.actions[name];

    if (!actionFn) {
      this.sendError(requestId, 'BAD_PARAMS', `Unknown action: ${name}`);
      return;
    }

    const actionCtx: ActionContext = {
      session: this.session,
      logger: createLogger(`action:${this.activeAutomator.slug}:${name}`),

      /**
       * Navigate to a new URL and wait for page to load
       */
      navigateTo: async (url: string) => {
        return new Promise((resolve) => {
          const handleLoad = () => {
            window.removeEventListener('load', handleLoad);
            // Wait a bit for content to settle
            setTimeout(resolve, 500);
          };

          window.addEventListener('load', handleLoad);

          // Trigger navigation
          window.location.href = url;
        });
      },
    };

    try {
      logger.info('Running action', { name, requestId });
      const result = await actionFn(actionCtx, params as never);

      const msg: ContentToBg = {
        type: 'actionResult',
        requestId,
        data: result,
      };

      this.port?.postMessage(msg);
    } catch (error) {
      logger.error('Action failed', { name, requestId, error });
      this.sendError(requestId, 'ACTION_FAILED', String(error));
    }
  }

  private sendError(requestId: string, code: string, message: string): void {
    const msg: ContentToBg = {
      type: 'actionError',
      requestId,
      code: code as 'ACTION_FAILED' | 'BAD_PARAMS' | 'NO_SESSION' | 'TIMEOUT',
      message,
    };

    this.port?.postMessage(msg);
  }

  private sendLifecycleEvent(name: string): void {
    if (!this.session) {
      return;
    }

    this.eventSeq++;

    const msg: ContentToBg = {
      type: 'watcherEvent',
      sessionId: this.session.id,
      automator: this.activeAutomator!.slug,
      page: this.session.page,
      name: name as `watcher.${string}`,
      seq: this.eventSeq,
      data: {},
    };

    this.port?.postMessage(msg);
  }

  private cleanup(): void {
    logger.info('Cleaning up content script');

    // Stop all watchers
    for (const stopFn of this.stopWatchers) {
      stopFn();
    }
    this.stopWatchers = [];

    // Send automator.stopped event
    this.sendLifecycleEvent('automator.stopped');

    this.port = null;
    this.activeAutomator = null;
    this.session = null;
  }
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const service = new ContentService();
    service.init();
  },
});
