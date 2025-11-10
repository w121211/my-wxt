// lib/types/runtime.ts
// Internal communication protocol within the extension
// (background ↔ content scripts ↔ popup)

import type {
  AiAssistantId,
  ChatTarget,
  ChatEntry,
  ChatPage,
  ChatError,
  LoginState,
  SubmitPromptInput,
  SubmitPromptResult,
  ConversationStatus,
} from "./automators-v2";

// ============================================================================
// Background → Content Script Commands
// ============================================================================

/**
 * Commands sent FROM background TO content scripts
 */
export type BackgroundToContentCommand =
  | {
      readonly type: "assistant:get-chat-list";
      readonly assistantId: AiAssistantId;
    }
  | {
      readonly type: "assistant:get-chat-page";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatTarget;
    }
  | {
      readonly type: "assistant:submit-prompt";
      readonly assistantId: AiAssistantId;
      readonly payload: SubmitPromptInput;
    };

// ============================================================================
// Content Script → Background Notifications
// ============================================================================

/**
 * Notifications sent FROM content scripts TO background
 */
export type ContentToBackgroundNotification =
  | {
      readonly type: "assistant:login-state";
      readonly assistantId: AiAssistantId;
      readonly payload: LoginState;
    }
  | {
      readonly type: "chat:list";
      readonly assistantId: AiAssistantId;
      readonly payload: readonly ChatEntry[];
    }
  | {
      readonly type: "chat:page";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatPage;
    }
  | {
      readonly type: "prompt:submitted";
      readonly assistantId: AiAssistantId;
      readonly payload: SubmitPromptResult;
    }
  | {
      readonly type: "conversation:status";
      readonly assistantId: AiAssistantId;
      readonly payload: ConversationStatus;
    }
  | {
      readonly type: "chat:error";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatError;
    };

// ============================================================================
// Union Types for Convenience
// ============================================================================

/**
 * All messages that can be sent via browser.runtime.sendMessage
 */
export type RuntimeMessage =
  | BackgroundToContentCommand
  | ContentToBackgroundNotification;
// | PopupToBackgroundRequest
// | BackgroundToPopupBroadcast;

/**
 * All messages sent by the background script
 */
export type BackgroundMessage = BackgroundToContentCommand;
// | BackgroundToPopupBroadcast;

/**
 * All messages sent by content scripts
 */
export type ContentMessage = ContentToBackgroundNotification;

/**
 * All messages sent by the popup
 */
// export type PopupMessage = PopupToBackgroundRequest;
