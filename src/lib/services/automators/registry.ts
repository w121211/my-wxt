// lib/services/automators/registry.ts
// Central registry for all automator instances and helper functions

import { MatchPattern } from "wxt/utils/match-patterns";
// import { ChatgptAutomator } from "./chatgpt-automator";
// import { ClaudeAutomator } from "./claude-extractor";
// import { GeminiAutomator } from "./gemini-extractor";
// import { GrokAutomator } from "./grok-automator";
import { GrokAutomatorV2 } from "../automators-v2/grok-automator-v2";
import type {
  AiAssistantId,
  AiAssistantAutomatorV2,
} from "@/lib/types/automators-v2";

/**
 * Shared global instances of automators (they are stateless)
 */
// const chatgptAutomator = new ChatgptAutomator();
// const claudeAutomator = new ClaudeAutomator();
// const geminiAutomator = new GeminiAutomator();
// const grokAutomator = new GrokAutomator();
const grokAutomator = new GrokAutomatorV2();

/**
 * Registry of all automator instances
 */
export const automatorRegistry = {
  // chatgpt: chatgptAutomator,
  // claude: claudeAutomator,
  // gemini: geminiAutomator,
  grok: grokAutomator,
} as const;

/**
 * Detect which assistant ID from URL using WebExtension match patterns
 */
export function detectAssistantIdFromUrl(url: string): AiAssistantId | null {
  // if (
  //   ChatgptAutomator.urlGlobs.some((glob) =>
  //     new MatchPattern(glob).includes(url)
  //   )
  // ) {
  //   return ChatgptAutomator.id;
  // }
  // if (
  //   ClaudeAutomator.urlGlobs.some((glob) =>
  //     new MatchPattern(glob).includes(url)
  //   )
  // ) {
  //   return ClaudeAutomator.id;
  // }
  // if (
  //   GeminiAutomator.urlGlobs.some((glob) =>
  //     new MatchPattern(glob).includes(url)
  //   )
  // ) {
  //   return GeminiAutomator.id;
  // }
  // if (
  //   GrokAutomator.urlGlobs.some((glob) => new MatchPattern(glob).includes(url))
  // ) {
  //   return GrokAutomator.id;
  // }
  if (
    grokAutomator.urlGlobs.some((glob) => new MatchPattern(glob).includes(url))
  ) {
    return grokAutomator.id;
  }
  return null;
}

/**
 * Get automator instance by URL (convenience wrapper)
 */
export function getAutomatorByUrl(url: string): AiAssistantAutomatorV2 | null {
  const assistantId = detectAssistantIdFromUrl(url);
  // return assistantId ? getAutomatorById(assistantId) : null;

  if (assistantId === "grok") {
    return automatorRegistry["grok"];
  } else {
    throw new Error("Not implement yet");
  }
}
