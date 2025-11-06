// src/entrypoints/background/index.ts
// Background script: manages WebSocket connection and routes messages between WS and content scripts

import { browser } from 'wxt/browser';
import type { Browser } from 'wxt/browser';
import { WsClient } from '@/lib/ws/client';
import { registry } from '@/lib/automators/registry';
import { createLogger } from '@/lib/utils/logger';
import type { Message, RequestMessage, PageSessionId, PageRef } from '@/lib/ws/types';
import type { BgToContent, ContentToBg } from '@/lib/runtime/types';
import type { MatchCandidate } from '@/lib/matcher/types';

const logger = createLogger('bg');

interface SessionInfo {
  port: Browser.runtime.Port;
  sessionId: PageSessionId;
  automator: string;
  tabId: number;
  frameId: number;
  url: string;
}

class BackgroundService {
  private wsClient: WsClient | null = null;
  private sessions = new Map<PageSessionId, SessionInfo>();

  async init(): Promise<void> {
    logger.info('Initializing background service');

    // Connect to WebSocket server
    this.wsClient = new WsClient({
      url: 'ws://localhost:8080',
      reconnectDelayMs: 1000,
      maxReconnectDelayMs: 30000,
    });

    this.wsClient.onMessage((msg) => this.handleWsMessage(msg));
    this.wsClient.connect();

    // Listen for content script connections
    browser.runtime.onConnect.addListener((port) => this.handlePortConnect(port));

    logger.info('Background service initialized');
  }

  private handleWsMessage(msg: Message): void {
    if (msg.kind === 'request') {
      this.handleWsRequest(msg);
    }
  }

  private async handleWsRequest(req: RequestMessage): Promise<void> {
    logger.info('Received WS request', { id: req.id, automator: req.automator, name: req.name });

    try {
      // Smart session resolution: find or create session
      const session = await this.resolveSession(req.automator, req.page);

      // Forward to content script
      const bgMsg: BgToContent = {
        type: 'runAction',
        requestId: req.id,
        sessionId: session.sessionId,
        automator: req.automator,
        name: req.name,
        params: req.data,
      };

      session.port.postMessage(bgMsg);
    } catch (error) {
      logger.error('Failed to resolve session', { error });
      this.wsClient?.send({
        kind: 'error',
        v: 1,
        ts: Date.now(),
        id: req.id,
        code: 'NO_SESSION',
        message: String(error),
      });
    }
  }

  /**
   * Smart session resolution:
   * 1. If page.tabId specified → use that specific tab
   * 2. If session exists for automator → reuse it
   * 3. If no session → create new tab with automator's default URL
   */
  private async resolveSession(automator: string, page?: PageRef): Promise<SessionInfo> {
    // 1. Explicit tab targeting
    if (page?.tabId !== undefined) {
      const session = this.findSession(automator, page);
      if (session) {
        return session;
      }
      // Tab specified but no session - this shouldn't happen normally
      throw new Error(`No session found for tab ${page.tabId}`);
    }

    // 2. Try to find any existing session for this automator
    const existingSessions = Array.from(this.sessions.values()).filter(
      (s) => s.automator === automator
    );

    if (existingSessions.length > 0) {
      logger.info('Reusing existing session', { sessionId: existingSessions[0].sessionId });
      return existingSessions[0];
    }

    // 3. No session exists - create new one
    logger.info('No session found, creating new one', { automator });
    return await this.createNewSession(automator);
  }

  /**
   * Creates a new session by opening a new tab with the automator's default URL
   */
  private async createNewSession(automator: string): Promise<SessionInfo> {
    const automatorDef = registry.find((a) => a.slug === automator);
    if (!automatorDef) {
      throw new Error(`Unknown automator: ${automator}`);
    }

    // Get first page as default
    const defaultPage = Object.values(automatorDef.pages)[0];
    if (!defaultPage) {
      throw new Error(`No pages defined for automator: ${automator}`);
    }

    logger.info('Creating new tab', { automator, url: defaultPage.url });

    // Create new tab with default URL
    const tab = await browser.tabs.create({
      url: defaultPage.url,
      active: false, // Don't steal focus
    });

    if (!tab.id) {
      throw new Error('Failed to create tab');
    }

    // Wait for content script to initialize and register session
    return await this.waitForSession(automator, { tabId: tab.id }, 10000);
  }

  /**
   * Waits for a session to be registered by the content script
   */
  private async waitForSession(
    automator: string,
    page: PageRef,
    timeoutMs: number
  ): Promise<SessionInfo> {
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        const session = this.findSession(automator, page);
        if (session) {
          clearInterval(checkInterval);
          resolve(session);
          return;
        }

        if (Date.now() - startTime > timeoutMs) {
          clearInterval(checkInterval);
          reject(new Error(`Timeout waiting for session: ${automator} in tab ${page.tabId}`));
        }
      }, 100); // Check every 100ms
    });
  }

  private findSession(automator: string, page?: PageRef): SessionInfo | null {
    const candidates = Array.from(this.sessions.values()).filter(
      (s) => s.automator === automator
    );

    if (candidates.length === 0) {
      return null;
    }

    if (page?.tabId !== undefined) {
      const exact = candidates.find(
        (s) => s.tabId === page.tabId && (page.frameId === undefined || s.frameId === page.frameId)
      );
      return exact || null;
    }

    if (candidates.length > 1) {
      logger.warn('Multiple sessions found, using first', { automator, count: candidates.length });
    }

    return candidates[0];
  }

  private handlePortConnect(port: Browser.runtime.Port): void {
    logger.info('Port connected', { name: port.name });

    port.onMessage.addListener((msg: ContentToBg) => {
      this.handleContentMessage(msg);
    });

    port.onDisconnect.addListener(() => {
      const session = Array.from(this.sessions.values()).find((s) => s.port === port);
      if (session) {
        logger.info('Session disconnected', { sessionId: session.sessionId });
        this.sessions.delete(session.sessionId);

        // Send page.offline event
        this.wsClient?.send({
          kind: 'event',
          v: 1,
          ts: Date.now(),
          automator: session.automator,
          name: 'page.offline',
          page: { tabId: session.tabId, frameId: session.frameId, url: session.url },
          seq: 0,
          data: {},
        });
      }
    });
  }

  private handleContentMessage(msg: ContentToBg): void {
    if (msg.type === 'actionResult') {
      this.wsClient?.send({
        kind: 'response',
        v: 1,
        ts: Date.now(),
        id: msg.requestId,
        data: msg.data,
      });
    } else if (msg.type === 'actionError') {
      this.wsClient?.send({
        kind: 'error',
        v: 1,
        ts: Date.now(),
        id: msg.requestId,
        code: msg.code,
        message: msg.message,
        details: msg.details,
      });
    } else if (msg.type === 'watcherEvent') {
      // Register session if not already registered
      if (!this.sessions.has(msg.sessionId)) {
        // This shouldn't happen, but handle gracefully
        logger.warn('Received watcher event for unknown session', { sessionId: msg.sessionId });
        return;
      }

      this.wsClient?.send({
        kind: 'event',
        v: 1,
        ts: Date.now(),
        automator: msg.automator,
        name: msg.name,
        page: msg.page,
        seq: msg.seq,
        data: msg.data,
      });
    }
  }

  registerSession(
    port: Browser.runtime.Port,
    sessionId: PageSessionId,
    automator: string,
    tabId: number,
    frameId: number,
    url: string
  ): void {
    logger.info('Registering session', { sessionId, automator, tabId, frameId });

    this.sessions.set(sessionId, {
      port,
      sessionId,
      automator,
      tabId,
      frameId,
      url,
    });

    // Send page.online event
    this.wsClient?.send({
      kind: 'event',
      v: 1,
      ts: Date.now(),
      automator,
      name: 'page.online',
      page: { tabId, frameId, url },
      seq: 0,
      data: {},
    });
  }
}

export default defineBackground(() => {
  const service = new BackgroundService();
  service.init();
});
