// lib/automators/types.ts

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

/**
 * Selector configuration for an AI assistant platform
 * Defines all the CSS selectors needed to interact with the platform
 */
// export interface AutomatorSelectors {
//   // ============================================================================
//   // Authentication
//   // ============================================================================

//   /** Indicator that user is logged in (e.g., user profile button) */
//   loginIndicator: SelectorSpec;

//   /** Model selector dropdown or indicator (optional) */
//   modelSelector?: SelectorSpec;

//   /** Model name display element (optional) */
//   modelName?: SelectorSpec;

//   // ============================================================================
//   // Chat List / Sidebar
//   // ============================================================================

//   /** Container for chat history list */
//   chatListContainer?: SelectorSpec;

//   /** Individual chat items in the sidebar */
//   chatItems?: SelectorSpec;

//   /** Extraction spec for chat item data */
//   chatItemData?: FieldSpec;

//   /** Button to start a new chat */
//   newChatButton?: SelectorSpec;

//   // ============================================================================
//   // Chat View
//   // ============================================================================

//   /** Chat title element */
//   chatTitle?: SelectorSpec;

//   /** Message container blocks (all messages in chat) */
//   messageBlocks: SelectorSpec;

//   /** Extraction spec for message data */
//   messageData: FieldSpec;

//   /** Input field for typing messages */
//   messageInput: SelectorSpec;

//   /** Submit button for sending messages */
//   submitButton: SelectorSpec;

//   /** Indicator that AI is currently generating a response */
//   generatingIndicator?: SelectorSpec;

//   /** The streaming response container (last message being generated) */
//   streamingMessage?: SelectorSpec;

//   // ============================================================================
//   // Error States
//   // ============================================================================

//   /** Error message container (optional) */
//   errorMessage?: SelectorSpec;
// }

/**
 * Complete specification for an AI assistant platform
 */
// export interface AiAssistantSpec {
//   /** Platform identifier */
//   id: "chatgpt" | "claude" | "gemini" | "grok";

//   /** URL glob pattern(s) for this platform */
//   urlGlob: string | string[];

//   /** CSS selectors for this platform */
//   // selectors: AutomatorSelectors;
//   selectors: Record<string, CssSelector | SelectorSpec>;

//   /** Platform-specific configuration */
//   config?: {
//     /** Default timeout for operations (ms) */
//     defaultTimeout?: number;

//     /** Interval for polling operations (ms) */
//     pollInterval?: number;

//     /** Custom message ID generation logic */
//     generateMessageId?: (index: number, element: Element) => string;
//   };
// }
