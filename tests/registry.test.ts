// tests/lib/services/automators/registry.test.ts
import { describe, it, expect } from "vitest";
import {
  automatorRegistry,
  getAutomatorById,
  detectAssistantIdFromUrl,
  getAutomatorByUrl,
} from "@/lib/services/automators/registry.js";
import { ChatgptAutomator } from "@/lib/services/automators/chatgpt-automator.js";
import { ClaudeAutomator } from "@/lib/services/automators/claude-extractor";
import { GeminiAutomator } from "@/lib/services/automators/gemini-extractor";
import { GrokAutomator } from "@/lib/services/automators/grok-automator";
import type { AiAssistantId } from "@/lib/types/automators";

describe("automatorRegistry", () => {
  it("should contain all four automator instances", () => {
    expect(automatorRegistry).toHaveProperty("chatgpt");
    expect(automatorRegistry).toHaveProperty("claude");
    expect(automatorRegistry).toHaveProperty("gemini");
    expect(automatorRegistry).toHaveProperty("grok");
  });

  it("should contain correct automator types", () => {
    expect(automatorRegistry.chatgpt).toBeInstanceOf(ChatgptAutomator);
    expect(automatorRegistry.claude).toBeInstanceOf(ClaudeAutomator);
    expect(automatorRegistry.gemini).toBeInstanceOf(GeminiAutomator);
    expect(automatorRegistry.grok).toBeInstanceOf(GrokAutomator);
  });

  it("should have correct IDs for each automator", () => {
    expect(automatorRegistry.chatgpt.id).toBe("chatgpt");
    expect(automatorRegistry.claude.id).toBe("claude");
    expect(automatorRegistry.gemini.id).toBe("gemini");
    expect(automatorRegistry.grok.id).toBe("grok");
  });
});

describe("getAutomatorById", () => {
  it("should return chatgpt automator for 'chatgpt' id", () => {
    const automator = getAutomatorById("chatgpt");
    expect(automator).toBe(automatorRegistry.chatgpt);
    expect(automator.id).toBe("chatgpt");
  });

  it("should return claude automator for 'claude' id", () => {
    const automator = getAutomatorById("claude");
    expect(automator).toBe(automatorRegistry.claude);
    expect(automator.id).toBe("claude");
  });

  it("should return gemini automator for 'gemini' id", () => {
    const automator = getAutomatorById("gemini");
    expect(automator).toBe(automatorRegistry.gemini);
    expect(automator.id).toBe("gemini");
  });

  it("should return grok automator for 'grok' id", () => {
    const automator = getAutomatorById("grok");
    expect(automator).toBe(automatorRegistry.grok);
    expect(automator.id).toBe("grok");
  });

  it("should return the same instance on multiple calls (singleton behavior)", () => {
    const first = getAutomatorById("chatgpt");
    const second = getAutomatorById("chatgpt");
    expect(first).toBe(second);
  });
});

describe("detectAssistantIdFromUrl", () => {
  describe("ChatGPT URLs", () => {
    it("should detect chatgpt from chat.openai.com", () => {
      expect(detectAssistantIdFromUrl("https://chat.openai.com/")).toBe(
        "chatgpt"
      );
      expect(detectAssistantIdFromUrl("https://chat.openai.com/c/123")).toBe(
        "chatgpt"
      );
      expect(detectAssistantIdFromUrl("https://chat.openai.com/chat/123")).toBe(
        "chatgpt"
      );
      expect(
        detectAssistantIdFromUrl(
          "https://chat.openai.com/c/abc-123-def-456-ghi-789"
        )
      ).toBe("chatgpt");
    });

    it("should detect chatgpt from chatgpt.com", () => {
      expect(detectAssistantIdFromUrl("https://chatgpt.com/")).toBe("chatgpt");
      expect(detectAssistantIdFromUrl("https://chatgpt.com/c/123")).toBe(
        "chatgpt"
      );
      expect(
        detectAssistantIdFromUrl("https://chatgpt.com/g/g-xyz123-custom-gpt")
      ).toBe("chatgpt");
      expect(detectAssistantIdFromUrl("https://chatgpt.com/share/abc123")).toBe(
        "chatgpt"
      );
    });
  });

  describe("Claude URLs", () => {
    it("should detect claude from claude.ai", () => {
      expect(detectAssistantIdFromUrl("https://claude.ai/")).toBe("claude");
      expect(detectAssistantIdFromUrl("https://claude.ai/chat/123")).toBe(
        "claude"
      );
      expect(
        detectAssistantIdFromUrl("https://claude.ai/new?mode=extended")
      ).toBe("claude");
      expect(
        detectAssistantIdFromUrl(
          "https://claude.ai/chat/abc-123-def-456-ghi-789"
        )
      ).toBe("claude");
      expect(detectAssistantIdFromUrl("https://claude.ai/project/proj-123")).toBe(
        "claude"
      );
    });
  });

  describe("Gemini URLs", () => {
    it("should detect gemini from gemini.google.com", () => {
      expect(detectAssistantIdFromUrl("https://gemini.google.com/")).toBe(
        "gemini"
      );
      expect(detectAssistantIdFromUrl("https://gemini.google.com/app")).toBe(
        "gemini"
      );
      expect(
        detectAssistantIdFromUrl("https://gemini.google.com/app/123")
      ).toBe("gemini");
      expect(
        detectAssistantIdFromUrl("https://gemini.google.com/chat/abc-123")
      ).toBe("gemini");
    });

    it("should detect gemini from aistudio.google.com", () => {
      expect(detectAssistantIdFromUrl("https://aistudio.google.com/")).toBe(
        "gemini"
      );
      expect(detectAssistantIdFromUrl("https://aistudio.google.com/app")).toBe(
        "gemini"
      );
      expect(
        detectAssistantIdFromUrl("https://aistudio.google.com/chat/123")
      ).toBe("gemini");
    });
  });

  describe("Grok URLs", () => {
    it("should detect grok from grok.com", () => {
      expect(detectAssistantIdFromUrl("https://grok.com/")).toBe("grok");
      expect(detectAssistantIdFromUrl("https://grok.com/chat")).toBe("grok");
      expect(detectAssistantIdFromUrl("https://grok.com/project/123-456")).toBe(
        "grok"
      );
      expect(detectAssistantIdFromUrl("https://grok.com/c/abc123")).toBe(
        "grok"
      );
      expect(detectAssistantIdFromUrl("https://grok.com/i/grok/abc123")).toBe(
        "grok"
      );
    });

    it("should detect grok from x.ai domains", () => {
      expect(detectAssistantIdFromUrl("https://x.ai/")).toBe("grok");
      expect(detectAssistantIdFromUrl("https://accounts.x.ai/sign-in")).toBe(
        "grok"
      );
      expect(detectAssistantIdFromUrl("https://accounts.x.ai/signup")).toBe(
        "grok"
      );
      expect(detectAssistantIdFromUrl("https://api.x.ai/")).toBe("grok");
    });

    it("should detect grok from subdomains", () => {
      expect(detectAssistantIdFromUrl("https://app.grok.com/")).toBe("grok");
      expect(detectAssistantIdFromUrl("https://chat.grok.com/")).toBe("grok");
      expect(detectAssistantIdFromUrl("https://www.grok.com/")).toBe("grok");
    });
  });

  describe("Invalid URLs", () => {
    it("should return null for non-AI assistant URLs", () => {
      expect(detectAssistantIdFromUrl("https://google.com/")).toBe(null);
      expect(detectAssistantIdFromUrl("https://github.com/")).toBe(null);
      expect(detectAssistantIdFromUrl("https://example.com/")).toBe(null);
    });

    it("should return null for empty string", () => {
      expect(detectAssistantIdFromUrl("")).toBe(null);
    });

    it("should return null for partial matches", () => {
      expect(detectAssistantIdFromUrl("https://not-claude.ai/")).toBe(null);
      expect(detectAssistantIdFromUrl("https://fakechatgpt.com/")).toBe(null);
    });
  });

  describe("Edge cases", () => {
    it("should handle URLs with query parameters", () => {
      expect(detectAssistantIdFromUrl("https://claude.ai/?theme=dark")).toBe(
        "claude"
      );
      expect(detectAssistantIdFromUrl("https://chatgpt.com/?model=gpt-4")).toBe(
        "chatgpt"
      );
    });

    it("should handle URLs with hash fragments", () => {
      expect(detectAssistantIdFromUrl("https://claude.ai/#section")).toBe(
        "claude"
      );
      expect(detectAssistantIdFromUrl("https://chatgpt.com/#home")).toBe(
        "chatgpt"
      );
    });

    it("should handle URLs with both http and https", () => {
      expect(detectAssistantIdFromUrl("http://claude.ai/")).toBe("claude");
      expect(detectAssistantIdFromUrl("https://claude.ai/")).toBe("claude");
    });
  });
});

describe("getAutomatorByUrl", () => {
  it("should return chatgpt automator for ChatGPT URLs", () => {
    const automator = getAutomatorByUrl("https://chatgpt.com/");
    expect(automator).toBe(automatorRegistry.chatgpt);
    expect(automator?.id).toBe("chatgpt");
  });

  it("should return claude automator for Claude URLs", () => {
    const automator = getAutomatorByUrl("https://claude.ai/");
    expect(automator).toBe(automatorRegistry.claude);
    expect(automator?.id).toBe("claude");
  });

  it("should return gemini automator for Gemini URLs", () => {
    const automator = getAutomatorByUrl("https://gemini.google.com/");
    expect(automator).toBe(automatorRegistry.gemini);
    expect(automator?.id).toBe("gemini");
  });

  it("should return grok automator for Grok URLs", () => {
    const automator = getAutomatorByUrl("https://grok.com/");
    expect(automator).toBe(automatorRegistry.grok);
    expect(automator?.id).toBe("grok");
  });

  it("should return null for non-AI assistant URLs", () => {
    expect(getAutomatorByUrl("https://google.com/")).toBe(null);
    expect(getAutomatorByUrl("https://github.com/")).toBe(null);
  });

  it("should return the same instance as getAutomatorById", () => {
    const byUrl = getAutomatorByUrl("https://claude.ai/");
    const byId = getAutomatorById("claude");
    expect(byUrl).toBe(byId);
  });
});

describe("Integration tests", () => {
  it("should maintain consistent behavior across all helper functions", () => {
    const testCases: Array<{
      url: string;
      expectedId: AiAssistantId | null;
    }> = [
      { url: "https://chatgpt.com/", expectedId: "chatgpt" },
      { url: "https://claude.ai/", expectedId: "claude" },
      { url: "https://gemini.google.com/", expectedId: "gemini" },
      { url: "https://grok.com/", expectedId: "grok" },
      { url: "https://example.com/", expectedId: null },
    ];

    for (const { url, expectedId } of testCases) {
      const detectedId = detectAssistantIdFromUrl(url);
      const automatorByUrl = getAutomatorByUrl(url);

      expect(detectedId).toBe(expectedId);

      if (expectedId === null) {
        expect(automatorByUrl).toBe(null);
      } else {
        expect(automatorByUrl).toBe(automatorRegistry[expectedId]);
        expect(automatorByUrl).toBe(getAutomatorById(expectedId));
        expect(automatorByUrl?.id).toBe(expectedId);
      }
    }
  });

  it("should ensure all automators have required properties", () => {
    const automators = Object.values(automatorRegistry);

    for (const automator of automators) {
      // Check required properties exist
      expect(automator).toHaveProperty("id");
      expect(automator).toHaveProperty("url");
      expect(automator).toHaveProperty("urlGlobs");
      expect(automator).toHaveProperty("selectors");

      // Check required methods exist
      expect(automator).toHaveProperty("extractChatEntries");
      expect(automator).toHaveProperty("extractChatPage");
      expect(automator).toHaveProperty("waitForLoggedIn");
      expect(automator).toHaveProperty("openChat");
      expect(automator).toHaveProperty("sendPrompt");
      expect(automator).toHaveProperty("watchResponse");

      // Check types
      expect(typeof automator.id).toBe("string");
      expect(typeof automator.url).toBe("string");
      expect(Array.isArray(automator.urlGlobs)).toBe(true);
      expect(typeof automator.selectors).toBe("object");
      expect(typeof automator.extractChatEntries).toBe("function");
      expect(typeof automator.extractChatPage).toBe("function");
      expect(typeof automator.waitForLoggedIn).toBe("function");
      expect(typeof automator.openChat).toBe("function");
      expect(typeof automator.sendPrompt).toBe("function");
      expect(typeof automator.watchResponse).toBe("function");
    }
  });
});
