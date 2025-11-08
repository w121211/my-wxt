// lib/automators/utils/stream-observer.ts
// Shared utility for observing streaming AI responses

import type { ChatDelta, ChatResponse, ChatError } from '../../../types/automators';
import { querySelector, extractData } from '../../../utils/selectors';
import type { SelectorSpec, FieldSpec } from '../../../types/automators';

export interface StreamObserverOptions {
  messageId: string;
  timeoutMs?: number;
  streamingMessageSelector: SelectorSpec;
  messageDataSpec: FieldSpec;
  generatingIndicatorSelector?: SelectorSpec;
  onDelta: (delta: ChatDelta) => void;
  onComplete: (response: ChatResponse) => void;
  onError: (error: ChatError) => void;
}

/**
 * Generic streaming response observer
 * Watches for changes to AI response and emits deltas
 */
export class StreamObserver {
  private observer: MutationObserver | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private lastContent = '';

  constructor(private options: StreamObserverOptions) {}

  /**
   * Start observing for streaming response
   */
  start(): void {
    const {
      messageId,
      timeoutMs = 120000,
      streamingMessageSelector,
      messageDataSpec,
      generatingIndicatorSelector,
      onDelta,
      onComplete,
      onError,
    } = this.options;

    // Set timeout
    this.timeoutId = setTimeout(() => {
      this.stop();
      onError({
        code: 'timeout',
        message: 'Response timeout',
        messageId,
      });
    }, timeoutMs);

    // Create observer
    this.observer = new MutationObserver(() => {
      try {
        this.checkForUpdates();
      } catch (error) {
        this.stop();
        onError({
          code: 'unexpected',
          message: error instanceof Error ? error.message : 'Unknown error',
          messageId,
        });
      }
    });

    // Start observing
    this.observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Initial check
    setTimeout(() => this.checkForUpdates(), 100);
  }

  /**
   * Stop observing
   */
  stop(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Check for content updates
   */
  private checkForUpdates(): void {
    const {
      messageId,
      streamingMessageSelector,
      messageDataSpec,
      generatingIndicatorSelector,
      onDelta,
      onComplete,
    } = this.options;

    // Find streaming message element
    const streamingElement = querySelector(streamingMessageSelector);
    if (!streamingElement) return;

    // Extract current content
    const data = extractData(streamingElement, messageDataSpec);
    const currentContent = data?.content || '';
    const currentMarkdown = data?.contentMarkdown || '';

    // Emit delta if content changed
    if (currentMarkdown !== this.lastContent) {
      this.lastContent = currentMarkdown;

      onDelta({
        messageId,
        html: currentContent,
        markdown: currentMarkdown,
        timestamp: new Date().toISOString(),
      });
    }

    // Check if generation is complete
    if (generatingIndicatorSelector) {
      const generatingIndicator = querySelector(generatingIndicatorSelector);

      if (!generatingIndicator && currentMarkdown) {
        this.stop();
        onComplete({
          messageId,
          html: currentContent,
          markdown: currentMarkdown,
          finishedAt: new Date().toISOString(),
        });
      }
    }
  }
}

/**
 * Convenience wrapper for watching a streaming response
 */
export function watchStreamingResponse(
  options: StreamObserverOptions
): Promise<ChatResponse> {
  return new Promise((resolve, reject) => {
    const observer = new StreamObserver({
      ...options,
      onComplete: (response) => {
        resolve(response);
      },
      onError: (error) => {
        reject(error);
      },
    });

    observer.start();
  });
}
