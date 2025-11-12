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

export interface SelectorMap {
  readonly [key: string]: CssSelector | SelectorSpec;
}

// Ai assistant site data

export type ChatStatus = "idle" | "generating" | "error";

export interface ChatEntry {
  readonly chatId?: string;
  readonly url?: string;
  readonly title: string;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system" | "tool" | "unknown";
  readonly content: string;
  // readonly contentMarkdown: string;
  // readonly contentHtml?: string;
  readonly createdAt?: string;
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
  readonly details?: Record<string, unknown>;
}

interface BasePage {
  readonly url: string;
  readonly title: string;
  readonly isLoggedIn: boolean;
}

export interface LandingPage extends BasePage {
  readonly slug: "landing-page";
  readonly chatEntries?: ChatEntry[];
  readonly availableModelIds?: string[];
}

export interface ChatPage extends BasePage {
  readonly slug: "chat-page";
  readonly chatId: string;
  readonly status: ChatStatus;
  readonly modelId?: string;
  readonly messages: readonly ChatMessage[];
  readonly updatedAt: string;
}

export interface PageEvent {
  readonly timestamp: Date;
  readonly page: ChatPage | LandingPage;
}

// Ai assistant automator schema

export type AiAssistantId = "chatgpt" | "claude" | "gemini" | "grok";

export interface SubmitPromptInput {
  readonly prompt: string;
  readonly chatId?: string;
  readonly modelId?: string;
  readonly context?: {
    readonly attachments?: readonly File[];
    readonly system?: string;
  };
}

export interface SubmitPromptResult {
  readonly chatId: string;
}

export type Unsubscribe = () => void;

export interface AiAssistantAutomatorV2 {
  readonly id: AiAssistantId;
  readonly url: string;
  readonly urlGlobs: readonly string[];
  readonly selectors: SelectorMap;

  // URL Helpers (for background script coordination)
  getUrl(params?: { chatId?: string }): string;

  // Extractors (assume already on correct page - no navigation)
  getLandingPage(): Promise<LandingPage>;
  getChatPage(chatId: string): Promise<ChatPage>;

  // Actions (assume already on correct page - no navigation)
  submitPrompt(
    input: SubmitPromptInput,
    signal?: AbortSignal
  ): Promise<SubmitPromptResult>;

  // Watchers
  watchPage(
    options: { chatId?: string },
    onChange: (event: PageEvent) => void
  ): Unsubscribe;
}
