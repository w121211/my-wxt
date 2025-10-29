// src/lib/extractors/chatgptExtractor.ts

import type {
  AssistantExtractor,
  ChatDetails,
  ChatSummary,
  ChatTarget,
  ChatDelta,
  ChatResponse,
  LoginState,
  LoginWaitOptions,
  PromptSubmission,
} from '../types/assistantBridge';

const NOT_IMPLEMENTED = 'ChatGPT extractor not implemented yet';

export class ChatgptExtractor implements AssistantExtractor {
  async waitForLoggedIn(options: LoginWaitOptions): Promise<LoginState> {
    void options;
    throw new Error(NOT_IMPLEMENTED);
  }

  async extractChatList(): Promise<readonly ChatSummary[]> {
    throw new Error(NOT_IMPLEMENTED);
  }

  async openChat(target: ChatTarget): Promise<void> {
    void target;
    throw new Error(NOT_IMPLEMENTED);
  }

  async extractChat(target: ChatTarget): Promise<ChatDetails> {
    void target;
    throw new Error(NOT_IMPLEMENTED);
  }

  async sendPrompt(request: PromptSubmission): Promise<void> {
    void request;
    throw new Error(NOT_IMPLEMENTED);
  }

  async watchResponse(
    request: PromptSubmission,
    handleDelta: (delta: ChatDelta) => void
  ): Promise<ChatResponse> {
    void request;
    void handleDelta;
    throw new Error(NOT_IMPLEMENTED);
  }
}

export const createChatgptExtractor = (): AssistantExtractor => {
  return new ChatgptExtractor();
};
