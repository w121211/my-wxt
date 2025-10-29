// src/lib/assistantRegistry.ts

import { createChatgptExtractor } from './extractors/chatgptExtractor';
import GeminiExtractor from './extractors/geminiExtractor';
import type { AssistantExtractor, AssistantId } from './types/assistantBridge';

type ExtractorFactory = () => AssistantExtractor;

const registry: Record<AssistantId, ExtractorFactory> = {
  chatgpt: createChatgptExtractor,
  claude: () => {
    throw new Error('Claude extractor not implemented yet');
  },
  gemini: () => new GeminiExtractor(),
  grok: () => {
    throw new Error('Grok extractor not implemented yet');
  },
};

export const resolveExtractor = (assistant: AssistantId): AssistantExtractor => {
  const factory = registry[assistant];
  if (!factory) {
    throw new Error(`Assistant ${assistant} is not registered`);
  }
  return factory();
};
