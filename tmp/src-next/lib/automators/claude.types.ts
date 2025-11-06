// src/lib/automators/claude.types.ts
// Claude automator API contract

import type {
  AutomatorApi,
  ActionType,
  WatcherType,
} from './types';

export type ClaudeSlug = 'claude';

export interface ClaudeApi extends AutomatorApi {
  actions: {
    sendPrompt: ActionType<
      { prompt: string },
      { reply: string; conversationId: string }
    >;
    extractChatEntries: ActionType<
      Record<string, never>,
      { entries: Array<{ id: string; role: 'user' | 'assistant'; text: string }> }
    >;
  };
  watchers: {
    chatUpdates: WatcherType<'chatUpdates', { conversationId: string; lastEntryId: string }>;
  };
}
