// lib/types/websocket.ts
// External communication protocol between the extension and local server

import type {
  AiAssistantId,
  ChatError,
  PageEvent,
  SubmitPromptInput,
  SubmitPromptResult,
} from "./automators-v2";
import type { DevToolsTestMessage, TestSummary } from "./devtools-messages";

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
      readonly type: "ws:watch-page";
      readonly assistant: AiAssistantId;
      readonly requestId: string;
      readonly watchId: string;
      readonly chatId?: string;
      readonly intervalMs?: number;
    }
  | {
      readonly type: "ws:watch-page-stop";
      readonly assistant: AiAssistantId;
      readonly watchId: string;
    }
  | {
      readonly type: "ws:submit-prompt";
      readonly assistant: AiAssistantId;
      readonly requestId: string;
      readonly input: SubmitPromptInput;
    }
  | {
      readonly type: "ws:run-tests";
      readonly assistant: AiAssistantId;
      readonly requestId: string;
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

export interface RunTestsResultPayload {
  readonly summary: TestSummary;
  readonly events: readonly DevToolsTestMessage[];
  readonly snapshots?: SnapshotBundle;
}

export interface SnapshotBundle {
  readonly aria: string;
  readonly yaml: string;
  readonly generatedAt: string;
}

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
