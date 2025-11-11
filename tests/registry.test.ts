// tests/lib/services/automators/registry.test.ts
import { describe, it, expect } from "vitest";
import {
  automatorRegistry,
  getAutomatorByUrl,
} from "@/lib/services/automators/registry.js";
import { GeminiAutomatorV2 } from "@/lib/services/automators-v2/gemini-automator-v2";
import { GrokAutomatorV2 } from "@/lib/services/automators-v2/grok-automator-v2";

describe("automatorRegistry", () => {
  it("should be an array containing automator instances", () => {
    expect(Array.isArray(automatorRegistry)).toBe(true);
    expect(automatorRegistry.length).toBeGreaterThan(0);
  });

  it("should contain correct automator types", () => {
    const geminiAutomator = automatorRegistry.find((a) => a.id === "gemini");
    const grokAutomator = automatorRegistry.find((a) => a.id === "grok");

    expect(geminiAutomator).toBeInstanceOf(GeminiAutomatorV2);
    expect(grokAutomator).toBeInstanceOf(GrokAutomatorV2);
  });

  it("should have correct IDs for each automator", () => {
    const ids = automatorRegistry.map((a) => a.id);
    expect(ids).toContain("gemini");
    expect(ids).toContain("grok");
  });
});

describe("getAutomatorByUrl", () => {
  it("should return gemini automator for Gemini URLs", () => {
    const automator = getAutomatorByUrl("https://gemini.google.com/");
    const geminiFromRegistry = automatorRegistry.find((a) => a.id === "gemini");
    expect(automator).toBe(geminiFromRegistry);
    expect(automator?.id).toBe("gemini");
  });

  it("should return grok automator for Grok URLs", () => {
    const automator = getAutomatorByUrl("https://grok.com/");
    const grokFromRegistry = automatorRegistry.find((a) => a.id === "grok");
    expect(automator).toBe(grokFromRegistry);
    expect(automator?.id).toBe("grok");
  });

  it("should return null for non-AI assistant URLs", () => {
    expect(getAutomatorByUrl("https://google.com/")).toBe(null);
    expect(getAutomatorByUrl("https://github.com/")).toBe(null);
  });

  it("should return the same instance on multiple calls (singleton behavior)", () => {
    const first = getAutomatorByUrl("https://gemini.google.com/");
    const second = getAutomatorByUrl("https://gemini.google.com/");
    expect(first).toBe(second);
  });

  it("should handle URLs with query parameters", () => {
    expect(getAutomatorByUrl("https://gemini.google.com/?theme=dark")?.id).toBe(
      "gemini"
    );
    expect(getAutomatorByUrl("https://grok.com/?model=grok-2")?.id).toBe(
      "grok"
    );
  });

  it("should handle URLs with hash fragments", () => {
    expect(getAutomatorByUrl("https://gemini.google.com/#section")?.id).toBe(
      "gemini"
    );
    expect(getAutomatorByUrl("https://grok.com/#home")?.id).toBe("grok");
  });
});

describe("Integration tests", () => {
  it("should maintain consistent behavior for URL detection", () => {
    const testCases = [
      { url: "https://gemini.google.com/", expectedId: "gemini" },
      { url: "https://grok.com/", expectedId: "grok" },
      { url: "https://example.com/", expectedId: null },
    ];

    for (const { url, expectedId } of testCases) {
      const automatorByUrl = getAutomatorByUrl(url);

      if (expectedId === null) {
        expect(automatorByUrl).toBe(null);
      } else {
        expect(automatorByUrl?.id).toBe(expectedId);
        const fromRegistry = automatorRegistry.find((a) => a.id === expectedId);
        expect(automatorByUrl).toBe(fromRegistry);
      }
    }
  });

  it("should ensure all automators have required properties", () => {
    for (const automator of automatorRegistry) {
      // Check required properties exist
      expect(automator).toHaveProperty("id");
      expect(automator).toHaveProperty("urlGlobs");

      // Check types
      expect(typeof automator.id).toBe("string");
      expect(Array.isArray(automator.urlGlobs)).toBe(true);
    }
  });
});
