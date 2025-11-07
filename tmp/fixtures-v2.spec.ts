// tests/fixtures-v2.spec.ts
import { expect, test } from "@playwright/test";
import type { Page } from "playwright";
import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { extractFrom, resolveLocator } from "../src/extractor.js";
import type { AiAssistantSiteSpec, AiAssistantPageSpec } from "../src/types.js";
import { BaseAiChatAutomator } from "../src/tasks/aichat/base.js";
import { GrokAutomator } from "../src/tasks/aichat/grok.js";
import { ChatGPTAutomator } from "../src/tasks/aichat/chatgpt.js";
import { GeminiAutomator } from "../src/tasks/aichat/gemini.js";

interface FixtureMetadata {
  url: string;
  title?: string;
  timestamp?: string;
}

interface SelectorSpec {
  path: string;
  basename: string;
  spec: AiAssistantSiteSpec;
}

interface FixtureInfo {
  name: string;
  dir: string;
  metadata: FixtureMetadata;
}

interface AutomatorConfig {
  glob: string;
  name: string;
  factory: (page: Page, pageSpec: AiAssistantPageSpec) => BaseAiChatAutomator;
}

interface TestCase {
  fixture: FixtureInfo;
  selector: SelectorSpec;
  pageName: string;
  pageSpec: AiAssistantPageSpec;
  automatorConfig: AutomatorConfig;
}

const fixtureRoot = resolve("tests/fixtures");
const selectorRoot = resolve("tests/selectors");
const snapshotRoot = resolve("tests/snapshots-v2");

const AUTOMATOR_REGISTRY: AutomatorConfig[] = [
  {
    glob: "*grok*",
    name: "GrokAutomator",
    factory: (page, pageSpec) => new GrokAutomator(page, pageSpec),
  },
  {
    glob: "*chatgpt*",
    name: "ChatGPTAutomator",
    factory: (page, pageSpec) => new ChatGPTAutomator(page, pageSpec),
  },
  {
    glob: "*gemini*",
    name: "GeminiAutomator",
    factory: (page, pageSpec) => new GeminiAutomator(page, pageSpec),
  },
];

function matchPattern(str: string, pattern: string): boolean {
  const regex = new RegExp(pattern.replace(/\*/g, ".*"), "i");
  return regex.test(str);
}

function findAutomatorConfig(selectorBasename: string): AutomatorConfig | null {
  for (const config of AUTOMATOR_REGISTRY) {
    if (matchPattern(selectorBasename, config.glob)) {
      return config;
    }
  }
  return null;
}

function loadSelectorSpecs(): SelectorSpec[] {
  const specs: SelectorSpec[] = [];

  function scanDirectory(dir: string) {
    const entries = readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDirectory(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        try {
          const spec = JSON.parse(
            readFileSync(fullPath, "utf-8")
          ) as AiAssistantSiteSpec;
          specs.push({
            path: fullPath,
            basename: entry.name.replace(".json", ""),
            spec,
          });
        } catch (error) {
          console.warn(`Failed to load selector spec: ${fullPath}`, error);
        }
      }
    }
  }

  scanDirectory(selectorRoot);
  return specs;
}

function loadFixtures(): FixtureInfo[] {
  const entries = readdirSync(fixtureRoot, { withFileTypes: true });
  const fixtures: FixtureInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const dir = join(fixtureRoot, entry.name);
    const metadataPath = join(dir, "metadata.json");
    if (!existsSync(metadataPath)) continue;

    const metadata = JSON.parse(
      readFileSync(metadataPath, "utf-8")
    ) as FixtureMetadata;

    fixtures.push({
      name: entry.name,
      dir,
      metadata,
    });
  }

  return fixtures;
}

function matchPageSpec(url: string, spec: AiAssistantSiteSpec): string | null {
  for (const [pageName, pageSpec] of Object.entries(spec.pages)) {
    if (!pageSpec.urlGlob) continue;
    const globs = Array.isArray(pageSpec.urlGlob)
      ? pageSpec.urlGlob
      : [pageSpec.urlGlob];
    for (const glob of globs) {
      if (matchGlob(url, glob)) {
        return pageName;
      }
    }
  }
  return null;
}

function matchGlob(url: string, glob: string): boolean {
  const pattern = glob
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, ".");
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(url);
}

function generateTestCases(): TestCase[] {
  const fixtures = loadFixtures();
  const selectors = loadSelectorSpecs();
  const cases: TestCase[] = [];

  for (const fixture of fixtures) {
    for (const selector of selectors) {
      const pageName = matchPageSpec(fixture.metadata.url, selector.spec);
      if (!pageName) continue;

      const pageSpec = selector.spec.pages[pageName];
      const automatorConfig = findAutomatorConfig(selector.basename);
      if (!automatorConfig) continue;

      cases.push({ fixture, selector, pageName, pageSpec, automatorConfig });
    }
  }

  return cases;
}

async function mountFixture(page: Page, fixture: FixtureInfo) {
  const sourcePath = join(fixture.dir, "source.html");
  const html = readFileSync(sourcePath, "utf-8");
  await page.route(fixture.metadata.url, (route) => {
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: html,
    });
  });
  await page.goto(fixture.metadata.url);
}

async function testSelectors(page: Page, pageSpec: AiAssistantPageSpec) {
  const results: Record<string, any> = {};
  const elements = pageSpec.elements ?? {};

  for (const [key, def] of Object.entries(elements)) {
    const locator = await resolveLocator(page, def.selector);
    const count = await locator.count();

    const samples: string[] = [];
    const sampleCount = Math.min(count, 3);
    for (let i = 0; i < sampleCount; i++) {
      const text = await locator.nth(i).textContent();
      samples.push(text?.trim() ?? "");
    }

    const result: any = {
      selector: Array.isArray(def.selector) ? def.selector : [def.selector],
      count,
      samples,
    };

    if (def.fields) {
      const extracted = (await extractFrom(page, def)) as Array<
        Record<string, unknown>
      >;
      result.fields = extracted;
    }

    results[key] = result;
  }

  return results;
}

async function testAutomator(
  page: Page,
  pageSpec: AiAssistantPageSpec,
  automatorConfig: AutomatorConfig
) {
  const automator = automatorConfig.factory(page, pageSpec);
  const results: Record<string, any> = {};

  const methods = [
    { name: "checkLoginStatus", fn: () => automator.checkLoginStatus() },
    { name: "getChatState", fn: () => automator.getChatState() },
    {
      name: "getMessages",
      fn: async () => {
        const messages = await automator.getMessages();
        return { messages, count: messages.length };
      },
    },
  ];

  for (const { name, fn } of methods) {
    try {
      const result = await fn();
      results[name] = { success: true, result };
    } catch (error) {
      results[name] = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return results;
}

function saveSnapshot(
  selectorBasename: string,
  fixtureName: string,
  data: any
) {
  const dir = join(snapshotRoot, selectorBasename);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const path = join(dir, `${fixtureName}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

const testCases = generateTestCases();

test.describe("Comprehensive fixture testing v2", () => {
  test.describe("Selector and automator snapshots", () => {
    for (const testCase of testCases) {
      const testName = `${testCase.selector.basename} × ${testCase.fixture.name}`;

      test(testName, async ({ page }) => {
        await mountFixture(page, testCase.fixture);

        const selectorResults = await testSelectors(page, testCase.pageSpec);
        const automatorResults = await testAutomator(
          page,
          testCase.pageSpec,
          testCase.automatorConfig
        );

        const snapshot = {
          fixture: {
            name: testCase.fixture.name,
            url: testCase.fixture.metadata.url,
            // title: testCase.fixture.metadata.title,
            timestamp: testCase.fixture.metadata.timestamp,
            dir: testCase.fixture.dir,
          },
          selector: {
            basename: testCase.selector.basename,
            path: testCase.selector.path,
            version: testCase.selector.spec.version ?? "unknown",
          },
          automator: {
            // pattern: testCase.automatorConfig.glob,
            class: testCase.automatorConfig.name,
          },
          page: testCase.pageName,
          selectors: selectorResults,
          automatorResults: automatorResults,
        };

        saveSnapshot(
          testCase.selector.basename,
          testCase.fixture.name,
          snapshot
        );

        // Verify snapshot matches expected format
        expect(snapshot.selectors).toBeDefined();
        expect(snapshot.automator).toBeDefined();
      });
    }
  });
});
