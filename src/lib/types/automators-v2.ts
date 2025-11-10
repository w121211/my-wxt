// lib/types/automators-v2.ts
// V2 API surface for assistant automators (types only)

export type CssSelector = string | string[];

export interface SelectorSpec {
  /** CSS selector(s) to find the element */
  selector?: CssSelector;
  /** Attribute to extract (default: textContent) */
  attr?: string;
  /** Nested fields for structured data */
  fields?: Record<string, SelectorSpec>;
}
w;

export interface SelectorMap {
  readonly [key: string]: CssSelector | SelectorSpec;
}

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
  readonly chatId: string;
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

// export interface ChatDelta {
//   readonly messageId: string;
//   readonly html?: string;
//   readonly markdown?: string;
//   readonly timestamp: string;
// }

// export interface ChatResponse {
//   readonly messageId: string;
//   readonly html: string;
//   readonly markdown: string;
//   readonly finishedAt: string;
//   readonly usage?: Record<string, number>;
// }

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

export interface ConversationRef {
  readonly messageId: string;
  readonly chatId: string;
}

export interface SubmitPromptInput {
  readonly prompt: string;
  readonly chatId?: string;
  readonly target?: ChatTarget;
  readonly context?: {
    readonly attachments?: readonly File[];
    readonly system?: string;
  };
}

export interface SubmitPromptResult {
  readonly chatId: string;
  readonly messageId: string;
}

export type ConversationState = "idle" | "generating" | "error";

export interface ConversationStatus {
  readonly messageId?: string;
  readonly chatId: string;
  readonly state: ConversationState;
  readonly error?: ChatError;
}

// export type ResponseEvent =
//   | { type: "status"; status: ConversationStatus }
//   | { type: "delta"; delta: ChatDelta }
//   | { type: "committed"; messageId: string }
//   | { type: "done"; response: ChatResponse }
//   | { type: "error"; error: ChatError };

export type Unsubscribe = () => void;

export interface ListChatEntriesParams {
  readonly limit?: number;
  readonly sinceId?: string;
}

export interface AiAssistantAutomatorV2 {
  readonly id: AiAssistantId;
  readonly url: string;
  readonly urlGlobs: readonly string[];
  readonly selectors: SelectorMap;

  // Extractors
  getLoginState(options?: LoginWaitOptions): Promise<LoginState>;
  getChatEntries(params?: ListChatEntriesParams): Promise<readonly ChatEntry[]>;
  getChatPage(
    target: ChatTarget | { readonly chatId: string }
  ): Promise<ChatPage>;
  getConversationStatus(ref: ConversationRef): Promise<ConversationStatus>;

  // Actions
  goToChatPage(input: {
    readonly chatId?: string;
    readonly target?: ChatTarget;
  }): Promise<{ navigated: boolean; url: string }>;

  submitPrompt(
    input: SubmitPromptInput,
    signal?: AbortSignal
  ): Promise<SubmitPromptResult>;

  // Watchers
  watchConversationStatus(
    ref: ConversationRef,
    onChange: (status: ConversationStatus) => void
  ): Unsubscribe;

  // waitForLogin(options: LoginWaitOptions): Promise<LoginState>;
  // streamResponse(
  //   ref: ConversationRef,
  //   onEvent: (event: ResponseEvent) => void,
  //   signal?: AbortSignal
  // ): Promise<void>;
}
