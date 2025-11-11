// lib/types/runtime.ts
// Internal communication protocol within the extension
// (background ↔ content scripts ↔ popup)

import type {
  AiAssistantId,
  ChatError,
  PageEvent,
  SubmitPromptInput,
  SubmitPromptResult,
} from "./automators-v2";
import type { RunTestsResultPayload } from "./websocket";

// ============================================================================
// Background → Content Script Commands
// ============================================================================

/**
 * Commands sent FROM background TO content scripts
 */
export type BackgroundToContentCommand =
  | {
      readonly type: "assistant:watch-page";
      readonly assistantId: AiAssistantId;
      readonly payload: {
        readonly requestId: string;
        readonly watchId: string;
        readonly chatId?: string;
        readonly intervalMs?: number;
      };
    }
  | {
      readonly type: "assistant:watch-page-stop";
      readonly assistantId: AiAssistantId;
      readonly payload: { readonly watchId: string };
    }
  | {
      readonly type: "assistant:submit-prompt";
      readonly assistantId: AiAssistantId;
      readonly payload: {
        readonly requestId: string;
        readonly input: SubmitPromptInput;
      };
    }
  | {
      readonly type: "assistant:run-tests";
      readonly assistantId: AiAssistantId;
      readonly payload: { readonly requestId: string };
    };

// ============================================================================
// Content Script → Background Notifications
// ============================================================================

/**
 * Notifications sent FROM content scripts TO background
 */
export type ContentToBackgroundNotification =
  | {
      readonly type: "ws:watch-page-update";
      readonly assistantId: AiAssistantId;
      readonly watchId?: string;
      readonly payload: PageEvent;
    }
  | {
      readonly type: "ws:submit-prompt-result";
      readonly assistantId: AiAssistantId;
      readonly requestId: string;
      readonly payload: SubmitPromptResult;
    }
  | {
      readonly type: "ws:run-tests-result";
      readonly assistantId: AiAssistantId;
      readonly requestId: string;
      readonly payload: RunTestsResultPayload;
    }
  | {
      readonly type: "ws:error";
      readonly assistantId: AiAssistantId;
      readonly requestId?: string;
      readonly watchId?: string;
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
