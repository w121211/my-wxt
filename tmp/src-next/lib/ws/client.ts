// src/lib/ws/client.ts
// WebSocket client with reconnection and message handling

import type { Message, HelloMessage, ByeMessage } from './types';
import { createLogger } from '../utils/logger';

const logger = createLogger('ws:client');

export interface WsClientConfig {
  url: string;
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

export type MessageHandler = (msg: Message) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private currentDelay: number;
  private handlers: Set<MessageHandler> = new Set();
  private connId: string = '';
  private shouldReconnect = true;

  constructor(private config: WsClientConfig) {
    this.currentDelay = config.reconnectDelayMs || 1000;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.warn('Already connected');
      return;
    }

    logger.info('Connecting to WebSocket', { url: this.config.url });

    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.onopen = () => {
        logger.info('WebSocket connected');
        this.currentDelay = this.config.reconnectDelayMs || 1000;
        this.sendHello();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: Message = JSON.parse(event.data);
          logger.debug('Received message', { kind: msg.kind });

          if (msg.kind === 'hello') {
            this.connId = msg.connId;
            logger.info('Received hello', { connId: this.connId });
          }

          for (const handler of this.handlers) {
            handler(msg);
          }
        } catch (error) {
          logger.error('Failed to parse message', { error });
        }
      };

      this.ws.onerror = (error) => {
        logger.error('WebSocket error', { error });
      };

      this.ws.onclose = () => {
        logger.info('WebSocket closed');
        this.ws = null;

        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      };
    } catch (error) {
      logger.error('Failed to create WebSocket', { error });
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  disconnect(reason?: string): void {
    this.shouldReconnect = false;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendBye(reason);
      this.ws.close();
    }

    this.ws = null;
  }

  send(msg: Message): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      logger.debug('Sent message', { kind: msg.kind });
    } else {
      logger.warn('Cannot send message: WebSocket not open', { kind: msg.kind });
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  private sendHello(): void {
    const hello: HelloMessage = {
      kind: 'hello',
      v: 1,
      ts: Date.now(),
      connId: crypto.randomUUID(),
    };
    this.send(hello);
  }

  private sendBye(reason?: string): void {
    const bye: ByeMessage = {
      kind: 'bye',
      v: 1,
      ts: Date.now(),
      reason,
    };
    this.send(bye);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    logger.info('Scheduling reconnect', { delayMs: this.currentDelay });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, this.currentDelay);

    const maxDelay = this.config.maxReconnectDelayMs || 30000;
    this.currentDelay = Math.min(this.currentDelay * 2, maxDelay);
  }
}
