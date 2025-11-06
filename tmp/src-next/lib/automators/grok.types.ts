// src/lib/automators/grok.types.ts
// Grok automator API contract

import type {
  AutomatorApi,
  ActionType,
  WatcherType,
} from './types';

export type GrokSlug = 'grok';

export interface GrokApi extends AutomatorApi {
  actions: {
    sendPrompt: ActionType<
      { prompt: string },
      { reply: string; threadId: string }
    >;
    extractChatPage: ActionType<
      Record<string, never>,
      { title: string; threadId: string }
    >;
  };
  watchers: {
    chatUpdates: WatcherType<'chatUpdates', { threadId: string; lastEntryId: string }>;
  };
}
