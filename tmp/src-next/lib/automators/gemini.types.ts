// src/lib/automators/gemini.types.ts
// Gemini automator API contract

import type {
  AutomatorApi,
  ActionType,
  WatcherType,
} from './types';

export type GeminiSlug = 'gemini';

export interface GeminiApi extends AutomatorApi {
  actions: {
    sendPrompt: ActionType<
      { prompt: string },
      { reply: string; conversationId: string }
    >;
    extractChatEntries: ActionType<
      Record<string, never>,
      { entries: Array<{ id: string; role: 'user' | 'model'; text: string }> }
    >;
  };
  watchers: {
    chatUpdates: WatcherType<'chatUpdates', { conversationId: string; lastEntryId: string }>;
  };
}
