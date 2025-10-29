// src/lib/types/assistantBridge.ts

export type AssistantId =
  | 'chatgpt'
  | 'claude'
  | 'gemini'
  | 'grok';

export interface LoginWaitOptions {
  readonly timeoutMs?: number;
  readonly pollIntervalMs?: number;
}

export interface LoginState {
  readonly assistantId: AssistantId;
  readonly authenticated: boolean;
  readonly defaultModelId?: string;
  readonly availableModelIds?: readonly string[];
  readonly message?: string;
}

export interface ChatSummary {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly updatedAt: string;
  readonly modelId?: string;
}

export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant' | 'system' | 'tool';
  readonly createdAt: string;
  readonly contentMarkdown: string;
  readonly contentHtml?: string;
}

export interface ChatDetails {
  readonly id: string;
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
  readonly promptId: string;
  readonly prompt: string;
  readonly conversation?: ChatTarget;
  readonly modelId?: string;
  readonly timeoutMs?: number;
}

export interface ChatDelta {
  readonly promptId: string;
  readonly html?: string;
  readonly markdown?: string;
  readonly timestamp: string;
}

export interface ChatResponse {
  readonly promptId: string;
  readonly html: string;
  readonly markdown: string;
  readonly finishedAt: string;
  readonly usage?: Record<string, number>;
}

export interface AssistantExtractor {
  waitForLoggedIn(options: LoginWaitOptions): Promise<LoginState>;
  extractChatList(): Promise<readonly ChatSummary[]>;
  openChat(target: ChatTarget): Promise<void>;
  extractChat(target: ChatTarget): Promise<ChatDetails>;
  sendPrompt(request: PromptSubmission): Promise<void>;
  watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse>;
}

export type AssistantNotification =
  | {
      readonly type: 'login:state';
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
      readonly payload: {
        readonly code:
          | 'not-logged-in'
          | 'unsupported'
          | 'navigation-failed'
          | 'prompt-failed'
          | 'timeout'
          | 'unexpected';
        readonly message: string;
        readonly promptId?: string;
        readonly details?: Record<string, unknown>;
      };
    };

export type BridgeInboundMessage =
  | {
      readonly type: 'bridge:hello';
      readonly assistant: AssistantId;
      readonly port?: number;
      readonly client?: string;
    }
  | {
      readonly type: 'chat:list';
      readonly assistant: AssistantId;
    }
  | {
      readonly type: 'chat:details';
      readonly assistant: AssistantId;
      readonly target: ChatTarget;
    }
  | {
      readonly type: 'chat:prompt';
      readonly assistant: AssistantId;
      readonly request: PromptSubmission;
    }
  | {
      readonly type: 'bridge:close';
    };

export type BridgeOutboundMessage =
  | AssistantNotification
  | {
      readonly type: 'bridge:status';
      readonly payload: BridgeStatusPayload;
    }
  | {
      readonly type: 'bridge:error';
      readonly payload: BridgeErrorPayload;
    };

export interface BridgeStatusPayload {
  readonly status: 'connecting' | 'open' | 'closed' | 'error';
  readonly attempt?: number;
  readonly message?: string;
}

export interface BridgeErrorPayload {
  readonly code: 'ws-error' | 'invalid-message' | 'unhandled';
  readonly message: string;
  readonly details?: Record<string, unknown>;
}
