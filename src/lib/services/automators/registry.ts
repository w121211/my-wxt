// lib/services/automators/registry.ts
// Central registry for all automator instances and helper functions

import { MatchPattern } from "wxt/utils/match-patterns";
// import { ChatgptAutomator } from "./chatgpt-automator";
// import { ClaudeAutomator } from "./claude-extractor";
// import { GeminiAutomator } from "./gemini-extractor";
// import { GrokAutomator } from "./grok-automator";
import { GrokAutomatorV2 } from "../automators-v2/grok-automator-v2.js";
import { GeminiAutomatorV2 } from "../automators-v2/gemini-automator-v2.js";
import type {
  AiAssistantAutomatorV2,
  AiAssistantId,
} from "../../types/automators-v2.js";

/**
 * Shared global instances of automators (they are stateless)
 */
// const chatgptAutomator = new ChatgptAutomator();
// const claudeAutomator = new ClaudeAutomator();
const geminiAutomator = new GeminiAutomatorV2();
const grokAutomator = new GrokAutomatorV2();

/**
 * Registry of all automator instances indexed by their ID
 */
export const automatorRegistry: Partial<
  Record<AiAssistantId, AiAssistantAutomatorV2>
> = {
  // chatgpt: chatgptAutomator,
  // claude: claudeAutomator,
  [GeminiAutomatorV2.id]: geminiAutomator,
  // grok: grokAutomator,
} as const;

/**
 * Get automator instance by URL using WebExtension match patterns
 */
export function getAutomatorByUrl(url: string): AiAssistantAutomatorV2 | null {
  const automator = Object.values(automatorRegistry).find((automator) =>
    automator.urlGlobs.some((glob) => new MatchPattern(glob).includes(url))
  );

  if (!automator) {
    console.warn(`[registry] No automator implemented for URL: ${url}`);
  }

  return automator ?? null;
}

/**
 * Get automator instance by assistant ID
 */
export function getAutomatorById(id: string): AiAssistantAutomatorV2 | null {
  return automatorRegistry[id as AiAssistantId] ?? null;
}
