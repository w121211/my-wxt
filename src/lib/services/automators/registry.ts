// lib/services/automators/registry.ts
// Central registry for all automator instances and helper functions

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
 * Convert URL glob pattern to regex pattern
 * Supports patterns like: *://chatgpt.com/* or *://x.com/i/grok*
 */
function urlGlobToRegex(glob: string): RegExp {
  // Escape special regex characters except * and :
  let pattern = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");

  return new RegExp(`^${pattern}$`);
}

/**
 * Detect which assistant ID from URL
 */
export function detectAssistantIdFromUrl(url: string): AiAssistantId | null {
  if (
    ChatgptAutomator.urlGlobs.some((glob) => urlGlobToRegex(glob).test(url))
  ) {
    return ChatgptAutomator.id;
  }
  if (ClaudeAutomator.urlGlobs.some((glob) => urlGlobToRegex(glob).test(url))) {
    return ClaudeAutomator.id;
  }
  if (GeminiAutomator.urlGlobs.some((glob) => urlGlobToRegex(glob).test(url))) {
    return GeminiAutomator.id;
  }
  if (GrokAutomator.urlGlobs.some((glob) => urlGlobToRegex(glob).test(url))) {
    return GrokAutomator.id;
  }
  return null;
}

/**
 * Get automator instance by URL (convenience wrapper)
 */
export function getAutomatorByUrl(url: string): AiAssistantAutomator | null {
  console.debug(url);

  const assistantId = detectAssistantIdFromUrl(url);
  return assistantId ? getAutomatorById(assistantId) : null;
}
