// src/lib/automators/chatgpt.types.ts
// ChatGPT automator API contract

import type {
  AutomatorApi,
  ActionType,
  WatcherType,
} from './types';

export type ChatGptSlug = 'chatgpt';

export interface ChatGptApi extends AutomatorApi {
  actions: {
    sendPrompt: ActionType<
      { prompt: string; conversationId?: string },
      { reply: string; conversationId: string }
    >;
    extractChatEntries: ActionType<
      Record<string, never>,
      { entries: Array<{ id: string; role: 'user' | 'assistant'; text: string }> }
    >;
    isReady: ActionType<Record<string, never>, { ready: boolean }>;
  };
  watchers: {
    chatUpdates: WatcherType<'chatUpdates', { entries: Array<{ id: string }> }>;
    modelChanged: WatcherType<'modelChanged', { model: string }>;
    connectionState: WatcherType<'connectionState', { state: 'online' | 'offline' }>;
  };
}
