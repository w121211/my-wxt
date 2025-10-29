// lib/types/websocket.ts
// External communication protocol between the extension and local server

import type {
  AssistantId,
  ChatTarget,
  ChatSummary,
  ChatDetails,
  ChatDelta,
  ChatResponse,
  ChatError,
  LoginState,
  PromptSubmission,
} from './assistants';

/**
 * Messages sent FROM the local server TO the extension
 */
export type ServerMessage =
  | {
      readonly type: 'connection:hello';
      readonly assistant: AssistantId;
      readonly port?: number;
      readonly client?: string;
    }
  | {
      readonly type: 'connection:close';
    }
  | {
      readonly type: 'chat:request-list';
      readonly assistant: AssistantId;
    }
  | {
      readonly type: 'chat:request-details';
      readonly assistant: AssistantId;
      readonly target: ChatTarget;
    }
  | {
      readonly type: 'chat:submit-prompt';
      readonly assistant: AssistantId;
      readonly request: PromptSubmission;
    };

/**
 * Messages sent FROM the extension TO the local server
 */
export type ExtensionMessage =
  | {
      readonly type: 'connection:status';
      readonly payload: ConnectionStatus;
    }
  | {
      readonly type: 'connection:error';
      readonly payload: ConnectionError;
    }
  | {
      readonly type: 'assistant:login-state';
      readonly assistantId: AssistantId;
      readonly payload: LoginState;
    }
  | {
      readonly type: 'chat:list';
      readonly assistantId: AssistantId;
      readonly payload: readonly ChatSummary[];
    }
  | {
      readonly type: 'chat:details';
      readonly assistantId: AssistantId;
      readonly payload: ChatDetails;
    }
  | {
      readonly type: 'chat:delta';
      readonly assistantId: AssistantId;
      readonly payload: ChatDelta;
    }
  | {
      readonly type: 'chat:response';
      readonly assistantId: AssistantId;
      readonly payload: ChatResponse;
    }
  | {
      readonly type: 'chat:error';
      readonly assistantId: AssistantId;
      readonly payload: ChatError;
    };

export interface ConnectionStatus {
  readonly status: 'connecting' | 'open' | 'closed' | 'error';
  readonly attempt?: number;
  readonly message?: string;
}

export interface ConnectionError {
  readonly code: 'ws-error' | 'invalid-message' | 'unhandled';
  readonly message: string;
  readonly details?: Record<string, unknown>;
}
