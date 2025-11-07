// lib/services/automators/registry.ts
// Central registry for all automator instances and helper functions

import { isMatch } from "micromatch";
import { ChatgptAutomator } from "./chatgpt-automator";
import { ClaudeAutomator } from "./claude-extractor";
import { GeminiAutomator } from "./gemini-extractor";
import { GrokAutomator } from "./grok-automator";
import type {
  AiAssistantId,
  AiAssistantAutomator,
} from "../../types/automators";

/**
 * Shared global instances of automators (they are stateless)
 */
const chatgptAutomator = new ChatgptAutomator();
const claudeAutomator = new ClaudeAutomator();
const geminiAutomator = new GeminiAutomator();
const grokAutomator = new GrokAutomator();

/**
 * Registry of all automator instances
 */
export const automatorRegistry = {
  chatgpt: chatgptAutomator,
  claude: claudeAutomator,
  gemini: geminiAutomator,
  grok: grokAutomator,
} as const;

/**
 * Get automator instance by assistant ID
 */
export function getAutomatorById(id: AiAssistantId): AiAssistantAutomator {
  return automatorRegistry[id];
}

/**
 * Detect which assistant ID from URL
 */
export function detectAssistantIdFromUrl(url: string): AiAssistantId | null {
  if (ChatgptAutomator.urlGlobs.some((glob) => isMatch(url, glob))) {
    return ChatgptAutomator.id;
  }
  if (ClaudeAutomator.urlGlobs.some((glob) => isMatch(url, glob))) {
    return ClaudeAutomator.id;
  }
  if (GeminiAutomator.urlGlobs.some((glob) => isMatch(url, glob))) {
    return GeminiAutomator.id;
  }
  if (GrokAutomator.urlGlobs.some((glob) => isMatch(url, glob))) {
    return GrokAutomator.id;
  }
  return null;
}

/**
 * Get automator instance by URL (convenience wrapper)
 */
export function getAutomatorByUrl(url: string): AiAssistantAutomator | null {
  const assistantId = detectAssistantIdFromUrl(url);
  return assistantId ? getAutomatorById(assistantId) : null;
}

// /**
//  * Get all automator instances
//  */
// export function getAllAutomators(): readonly AiAssistantAutomator[] {
//   return [chatgptAutomator, claudeAutomator, geminiAutomator, grokAutomator];
// }

// /**
//  * Get all assistant IDs
//  */
// export function getAllAssistantIds(): readonly AiAssistantId[] {
//   return ["chatgpt", "claude", "gemini", "grok"];
// }
