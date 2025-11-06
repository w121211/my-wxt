// src/lib/api/unions.ts
// Top-level unions of all automator requests, events, and responses

import type { AutomatorRequestOf, AutomatorEventOf, AutomatorResponse } from '../ws/derive';
import type { ChatGptApi, ChatGptSlug } from '../automators/chatgpt.types';
import type { GrokApi, GrokSlug } from '../automators/grok.types';
import type { GeminiApi, GeminiSlug } from '../automators/gemini.types';
import type { ClaudeApi, ClaudeSlug } from '../automators/claude.types';

export type AnyRequest =
  | AutomatorRequestOf<ChatGptApi, ChatGptSlug>
  | AutomatorRequestOf<GrokApi, GrokSlug>
  | AutomatorRequestOf<GeminiApi, GeminiSlug>
  | AutomatorRequestOf<ClaudeApi, ClaudeSlug>;

export type AnyEvent =
  | AutomatorEventOf<ChatGptApi, ChatGptSlug>
  | AutomatorEventOf<GrokApi, GrokSlug>
  | AutomatorEventOf<GeminiApi, GeminiSlug>
  | AutomatorEventOf<ClaudeApi, ClaudeSlug>;

export type AnyResponse = AutomatorResponse;
