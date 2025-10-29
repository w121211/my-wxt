// lib/assistants/hosts.ts

import type { AssistantId } from '../types/assistants';

type AssistantHostPattern = {
  readonly host: RegExp;
  readonly assistantId: AssistantId;
};

const HOST_PATTERNS: readonly AssistantHostPattern[] = [
  { host: /(^|\.)chat\.openai\.com$/i, assistantId: 'chatgpt' },
  { host: /(^|\.)chatgpt\.com$/i, assistantId: 'chatgpt' },
  { host: /(^|\.)claude\.ai$/i, assistantId: 'claude' },
  { host: /(^|\.)gemini\.google\.com$/i, assistantId: 'gemini' },
  { host: /(^|\.)grok\.com$/i, assistantId: 'grok' },
];

export const detectAssistantFromHost = (host: string): AssistantId | null => {
  const match = HOST_PATTERNS.find((entry) => entry.host.test(host));
  return match ? match.assistantId : null;
};

export const detectAssistantFromUrl = (url: string | undefined | null): AssistantId | null => {
  if (!url) {
    return null;
  }
  try {
    const { hostname } = new URL(url);
    return detectAssistantFromHost(hostname);
  } catch {
    return null;
  }
};

export const getAssistantHostPatterns = (): readonly AssistantHostPattern[] => HOST_PATTERNS;
