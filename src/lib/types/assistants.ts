// lib/types/assistants.ts
// Domain types for AI assistant integrations
// (data models only, no message types)

// ============================================================================
// Assistant Identity
// ============================================================================

export type AssistantId = 'chatgpt' | 'claude' | 'gemini' | 'grok';

// ============================================================================
// Authentication & Session
// ============================================================================

export interface LoginWaitOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface LoginState {
  readonly assistantId: AssistantId;
  readonly authenticated: boolean;
  readonly defaultModelId?: string;
  readonly availableModelIds?: readonly string[];
  readonly message?: string;
}

// ============================================================================
// Chat Data Models
// ============================================================================

export interface ChatSummary {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly updatedAt: string;
  readonly modelId?: string;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly createdAt: string;
  readonly contentMarkdown: string;
  readonly contentHtml?: string;
}

export interface ChatDetails {
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

// ============================================================================
// Prompt Submission & Response
// ============================================================================

export interface PromptSubmission {
  readonly promptId: string;
  readonly prompt: string;
  readonly conversation?: ChatTarget;
  readonly modelId?: string;
  readonly timeoutMs?: number;
}

export interface ChatDelta {
  readonly promptId: string;
  readonly html?: string;
  readonly markdown?: string;
  readonly timestamp: string;
}

export interface ChatResponse {
  readonly promptId: string;
  readonly html: string;
  readonly markdown: string;
  readonly finishedAt: string;
  readonly usage?: Record<string, number>;
}

// ============================================================================
// Error Handling
// ============================================================================

export interface ChatError {
  readonly code:
    | 'not-logged-in'
    | 'unsupported'
    | 'navigation-failed'
    | 'prompt-failed'
    | 'timeout'
    | 'unexpected';
  readonly message: string;
  readonly promptId?: string;
  readonly details?: Record<string, unknown>;
}

// ============================================================================
// Extractor Interface
// ============================================================================

/**
 * Interface that all assistant extractors must implement
 * Defines the contract for interacting with AI assistant websites
 */
export interface AssistantExtractor {
  waitForLoggedIn(options: LoginWaitOptions): Promise<LoginState>;
  extractChatList(): Promise<readonly ChatSummary[]>;
  openChat(target: ChatTarget): Promise<void>;
  extractChat(target: ChatTarget): Promise<ChatDetails>;
  sendPrompt(request: PromptSubmission): Promise<void>;
  watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse>;
}
