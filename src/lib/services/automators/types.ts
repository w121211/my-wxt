// lib/automators/types.ts
// Type definitions for AI assistant automators
// Inspired by tmp/src/types.ts but simplified for Chrome extension use

/**
 * Selector definition with fallback support
 * Can be a single selector string or array of fallback selectors
 */
export type Selector = string | string[];

/**
 * Field extraction specification
 */
export interface FieldSpec {
  /** CSS selector(s) to find the element */
  selector?: Selector;
  /** Attribute to extract (default: textContent) */
  attr?: string;
  /** Nested fields for structured data */
  fields?: Record<string, FieldSpec>;
}

/**
 * Selector configuration for an AI assistant platform
 * Defines all the CSS selectors needed to interact with the platform
 */
export interface AutomatorSelectors {
  // ============================================================================
  // Authentication
  // ============================================================================

  /** Indicator that user is logged in (e.g., user profile button) */
  loginIndicator: SelectorSpec;

  /** Model selector dropdown or indicator (optional) */
  modelSelector?: SelectorSpec;

  /** Model name display element (optional) */
  modelName?: SelectorSpec;

  // ============================================================================
  // Chat List / Sidebar
  // ============================================================================

  /** Container for chat history list */
  chatListContainer?: SelectorSpec;

  /** Individual chat items in the sidebar */
  chatItems?: SelectorSpec;

  /** Extraction spec for chat item data */
  chatItemData?: FieldSpec;

  /** Button to start a new chat */
  newChatButton?: SelectorSpec;

  // ============================================================================
  // Chat View
  // ============================================================================

  /** Chat title element */
  chatTitle?: SelectorSpec;

  /** Message container blocks (all messages in chat) */
  messageBlocks: SelectorSpec;

  /** Extraction spec for message data */
  messageData: FieldSpec;

  /** Input field for typing messages */
  messageInput: SelectorSpec;

  /** Submit button for sending messages */
  submitButton: SelectorSpec;

  /** Indicator that AI is currently generating a response */
  generatingIndicator?: SelectorSpec;

  /** The streaming response container (last message being generated) */
  streamingMessage?: SelectorSpec;

  // ============================================================================
  // Error States
  // ============================================================================

  /** Error message container (optional) */
  errorMessage?: SelectorSpec;
}

/**
 * Complete specification for an AI assistant platform
 */
export interface AiAssistantSpec {
  /** Platform identifier */
  id: "chatgpt" | "claude" | "gemini" | "grok";

  /** URL glob pattern(s) for this platform */
  urlGlob: string | string[];

  /** CSS selectors for this platform */
  selectors: AutomatorSelectors;

  /** Platform-specific configuration */
  config?: {
    /** Default timeout for operations (ms) */
    defaultTimeout?: number;

    /** Interval for polling operations (ms) */
    pollInterval?: number;

    /** Custom message ID generation logic */
    generateMessageId?: (index: number, element: Element) => string;
  };
}
