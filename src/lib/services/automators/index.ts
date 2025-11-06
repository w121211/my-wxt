// lib/automators/index.ts
// Central export for all automator implementations
import { isMatch } from "micromatch";
import type {
  AiAssistantAutomator,
  AiAssistantId,
} from "../../types/automators";
import { ChatGPTAutomator } from "./chatgpt-automator";
import { ClaudeAutomator } from "./claude-extractor";
import { GeminiAutomator } from "./gemini-extractor";
import { GrokAutomator } from "./grok-automator";

// Create instances to access metadata
const automatorInstances = [
  new ChatGPTAutomator(),
  new ClaudeAutomator(),
  new GeminiAutomator(),
  new GrokAutomator(),
];

/**
 * Factory function to create the appropriate automator for a given assistant
 */
export function createAutomator(
  assistantId: AiAssistantId
): AiAssistantAutomator {
  switch (assistantId) {
    case "chatgpt":
      return new ChatGPTAutomator();
    case "claude":
      return new ClaudeAutomator();
    case "gemini":
      return new GeminiAutomator();
    case "grok":
      return new GrokAutomator();
    default:
      throw new Error(`Unknown assistant: ${assistantId}`);
  }
}

/**
 * Detect which assistant platform we're currently on based on URL glob
 */
export function detectAssistantFromUrl(
  url: string = window.location.href
): AiAssistantId | null {
  for (const automator of automatorInstances) {
    for (const glob of automator.urlGlobs) {
      if (isMatch(url, glob)) {
        return automator.id;
      }
    }
  }
  return null;
}

/**
 * Create an automator for the current page automatically
 */
export function createAutomatorForCurrentPage(): AiAssistantAutomator | null {
  const assistantId = detectAssistantFromUrl();
  return assistantId ? createAutomator(assistantId) : null;
}
