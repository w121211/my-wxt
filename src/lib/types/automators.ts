// lib/types/automators.ts
// Domain types for AI assistant integrations
// (data models only, no message types)

import { SelectorMap } from "../services/automators/types";

export type AiAssistantId = "chatgpt" | "claude" | "gemini" | "grok";

export interface LoginWaitOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface LoginState {
  readonly assistantId: AiAssistantId;
  readonly authenticated: boolean;
  readonly defaultModelId?: string;
  readonly availableModelIds?: readonly string[];
  readonly message?: string;
}

export interface ChatEntry {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly updatedAt: string;
  readonly modelId?: string;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system" | "tool" | "unknown";
  readonly createdAt: string;
  readonly contentMarkdown: string;
  readonly contentHtml?: string;
}

export interface ChatPage {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly modelId?: string;
  readonly updatedAt: string;
  readonly messages: readonly ChatMessage[];
}

export interface ChatTarget {
  readonly id?: string;
  readonly url?: string;
  readonly modelId?: string;
}

export interface PromptSubmission {
  readonly messageId: string;
  readonly prompt: string;
  readonly conversation?: ChatTarget;
  readonly modelId?: string;
  readonly timeoutMs?: number;
}

export interface ChatDelta {
  readonly messageId: string;
  readonly html?: string;
  readonly markdown?: string;
  readonly timestamp: string;
}

export interface ChatResponse {
  readonly messageId: string;
  readonly html: string;
  readonly markdown: string;
  readonly finishedAt: string;
  readonly usage?: Record<string, number>;
}

export interface ChatError {
  readonly code:
    | "not-logged-in"
    | "unsupported"
    | "navigation-failed"
    | "prompt-failed"
    | "timeout"
    | "unexpected";
  readonly message: string;
  readonly messageId?: string;
  readonly details?: Record<string, unknown>;
}

/**
 * Interface that all assistant automators must implement
 * Defines the contract for interacting with AI assistant websites
 */
export interface AiAssistantAutomator {
  readonly id: AiAssistantId;
  readonly url: string;
  readonly urlGlobs: readonly string[];
  readonly selectors: SelectorMap;

  // Tasks
  extractChatEntries(): Promise<readonly ChatEntry[]>;
  extractChatPage(target: ChatTarget): Promise<ChatPage>;
  waitForLoggedIn(options: LoginWaitOptions): Promise<LoginState>;
  openChat(target: ChatTarget): Promise<void>;
  sendPrompt(request: PromptSubmission): Promise<void>;
  watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse>;
}
