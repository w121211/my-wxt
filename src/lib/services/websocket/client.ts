// lib/services/websocket/client.ts

import type { ExtensionMessage, ServerMessage, ConnectionStatus } from '../../types/websocket';

const DEFAULT_PORT = 3456;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10_000;

export type MessageHandler = (message: ServerMessage) => void;

export class WebsocketClient {
  private port: number;
  private websocket: WebSocket | null = null;
  private reconnectHandle: number | undefined;
  private connectionAttempt = 0;
  private isClosing = false;

  private readonly onMessage: MessageHandler;

  constructor(onMessage: MessageHandler, initialPort?: number) {
    this.onMessage = onMessage;
    this.port = initialPort ?? DEFAULT_PORT;
  }

  connect(): void {
    this.isClosing = false;
    this.connectionAttempt += 1;

    this.sendStatus({
      status: 'connecting',
      attempt: this.connectionAttempt,
      message: `Connecting to ws://127.0.0.1:${this.port}`,
    });

    if (this.websocket) {
      this.cleanupSocket();
    }

    this.websocket = new WebSocket(`ws://127.0.0.1:${this.port}`);
    this.websocket.addEventListener('open', this.handleOpen);
    this.websocket.addEventListener('close', this.handleClose);
    this.websocket.addEventListener('error', this.handleError);
    this.websocket.addEventListener('message', this.handleMessage);
  }

  disconnect(): void {
    this.isClosing = true;
    if (this.reconnectHandle) {
      clearTimeout(this.reconnectHandle);
      this.reconnectHandle = undefined;
    }
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.close();
    }
    this.cleanupSocket();
    this.websocket = null;
  }

  send(message: ExtensionMessage): void {
    if (!this.websocket || this.websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      console.log('[WS:OUT]', message);
      this.websocket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send outbound WS payload', error);
    }
  }

  updatePort(newPort: number): void {
    if (this.port !== newPort) {
      this.port = newPort;
      this.connectionAttempt = 0;
      this.disconnect();
      this.connect();
    }
  }

  private cleanupSocket(): void {
    if (!this.websocket) {
      return;
    }
    this.websocket.removeEventListener('open', this.handleOpen);
    this.websocket.removeEventListener('close', this.handleClose);
    this.websocket.removeEventListener('error', this.handleError);
    this.websocket.removeEventListener('message', this.handleMessage);
    if (this.websocket.readyState === WebSocket.OPEN || this.websocket.readyState === WebSocket.CONNECTING) {
      this.websocket.close();
    }
  }

  private scheduleReconnect(): void {
    if (this.isClosing) {
      return;
    }
    const delay = Math.min(
      BASE_RETRY_DELAY_MS * 2 ** Math.max(this.connectionAttempt - 1, 0),
      MAX_RETRY_DELAY_MS
    );
    if (this.reconnectHandle) {
      clearTimeout(this.reconnectHandle);
    }
    this.reconnectHandle = setTimeout(() => this.connect(), delay) as unknown as number;
  }

  private sendStatus(payload: ConnectionStatus): void {
    this.send({ type: 'connection:status', payload });
  }

  private handleOpen = (): void => {
    this.connectionAttempt = 0;
    this.sendStatus({
      status: 'open',
      message: 'Bridge connection established',
    });
  };

  private handleClose = (): void => {
    this.cleanupSocket();
    this.websocket = null;
    this.sendStatus({
      status: this.isClosing ? 'closed' : 'error',
      message: this.isClosing ? 'Bridge disconnected' : 'Bridge connection lost',
    });
    if (!this.isClosing) {
      this.scheduleReconnect();
    }
  };

  private handleError = (event: Event): void => {
    this.send({
      type: 'connection:error',
      payload: {
        code: 'ws-error',
        message: `WebSocket error: ${event.type}`,
      },
    });
  };

  private handleMessage = (event: MessageEvent<string>): void => {
    try {
      const message = JSON.parse(event.data) as ServerMessage;
      console.log('[WS:IN]', message);
      this.onMessage(message);
    } catch (error) {
      console.error('Failed to parse inbound WS payload', error);
      this.send({
        type: 'connection:error',
        payload: {
          code: 'invalid-message',
          message: 'Inbound message parsing failed',
          details: { raw: event.data },
        },
      });
    }
  };
}
