// lib/types/runtime.ts
// Internal communication protocol within the extension
// (background ↔ content scripts ↔ popup)

import type {
  AiAssistantId,
  ChatTarget,
  ChatEntry,
  ChatPage,
  ChatDelta,
  ChatResponse,
  ChatError,
  LoginState,
  PromptSubmission,
} from "./automators";
import type { RecorderFixture, RecorderUiState } from "./recorder";

// ============================================================================
// Background → Content Script Commands
// ============================================================================

/**
 * Commands sent FROM background TO content scripts
 */
export type BackgroundToContentCommand =
  // | {
  //     readonly type: "recorder:capture";
  //     readonly assistantId: AssistantId | "unknown";
  //   }
  | {
      readonly type: "assistant:extract-chat-list";
      readonly assistantId: AiAssistantId;
    }
  | {
      readonly type: "assistant:extract-chat";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatTarget;
    }
  | {
      readonly type: "assistant:process-prompt";
      readonly assistantId: AiAssistantId;
      readonly payload: PromptSubmission;
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
      readonly type: "chat:details";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatPage;
    }
  | {
      readonly type: "chat:delta";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatDelta;
    }
  | {
      readonly type: "chat:response";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatResponse;
    }
  | {
      readonly type: "chat:error";
      readonly assistantId: AiAssistantId;
      readonly payload: ChatError;
    };
// | {
//     readonly type: "recorder:fixture";
//     readonly payload: RecorderFixture;
//   };

// ============================================================================
// Popup ↔ Background (Request/Response Pattern)
// ============================================================================

/**
 * Requests sent FROM popup TO background (expects a response via sendResponse)
 */
// export type PopupToBackgroundRequest =
//   | {
//       readonly type: "recorder:get-state";
//     }
//   | {
//       readonly type: "recorder:set-recording";
//       readonly recording: boolean;
//     }
//   | {
//       readonly type: "recorder:clear-fixtures";
//     }
//   | {
//       readonly type: "recorder:download-all";
//     }
//   | {
//       readonly type: "recorder:get-fixture";
//       readonly id: string;
//     };

/**
 * Response types for PopupToBackgroundRequest
 */
// export type PopupToBackgroundResponse =
//   | RecorderUiState
//   | RecorderFixture
//   | { readonly ok: true }
//   | null;

/**
 * Broadcasts sent FROM background TO popup (one-way, no response expected)
 */
// export type BackgroundToPopupBroadcast = {
//   readonly type: "recorder:state-updated";
//   readonly payload: RecorderUiState;
// };

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
