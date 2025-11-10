// lib/types/websocket.ts
// External communication protocol between the extension and local server

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

/**
 * Messages sent FROM the local server TO the extension
 */
export type ServerMessage =
  | {
      readonly type: "connection:hello";
      readonly assistant: AiAssistantId;
      readonly port?: number;
      readonly client?: string;
    }
  | {
      readonly type: "connection:close";
    }
  | {
      readonly type: "chat:request-list";
      readonly assistant: AiAssistantId;
    }
  | {
      readonly type: "chat:request-page";
      readonly assistant: AiAssistantId;
      readonly target: ChatTarget;
    }
  | {
      readonly type: "chat:submit-prompt";
      readonly assistant: AiAssistantId;
      readonly input: SubmitPromptInput;
    };

/**
 * Messages sent FROM the extension TO the local server
 */
export type ExtensionMessage =
  | {
      readonly type: "connection:status";
      readonly payload: ConnectionStatus;
    }
  | {
      readonly type: "connection:error";
      readonly payload: ConnectionError;
    }
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

export interface ConnectionStatus {
  readonly status: "connecting" | "open" | "closed" | "error";
  readonly attempt?: number;
  readonly message?: string;
}

export interface ConnectionError {
  readonly code: "ws-error" | "invalid-message" | "unhandled";
  readonly message: string;
  readonly details?: Record<string, unknown>;
}
