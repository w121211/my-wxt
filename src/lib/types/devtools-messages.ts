/**
 * Message types for DevTools Panel ↔ Content Script communication
 * Used for test streaming and automator inspection
 */

import type { AiAssistantId } from "./automators-v2";

// ====================
// Test Result Types
// ====================

export type FunctionResult = {
  readonly status: "success" | "error" | "pending";
  readonly data?: any;
  readonly error?: string;
  readonly duration?: number;
};

export type SelectorTestResult = {
  readonly status: "found" | "not-found";
  readonly count: number;
  readonly samples: readonly (string | null)[];
};

export type SelectorResults = Record<string, SelectorTestResult>;

export type TestSummary = {
  readonly total: number;
  readonly passed: number;
  readonly failed: number;
  readonly duration: number;
};

// ====================
// DevTools Test Messages (Content → DevTools)
// ====================

export type DevToolsTestMessage =
  | {
      readonly type: "test:suite:start";
      readonly automatorId: AiAssistantId;
      readonly timestamp: string;
    }
  | {
      readonly type: "test:suite:complete";
      readonly automatorId: AiAssistantId;
      readonly timestamp: string;
      readonly summary: TestSummary;
    }
  | {
      readonly type: "test:started";
      readonly automatorId: AiAssistantId;
      readonly testName: string;
      readonly category: "selector" | "extractor" | "action" | "watcher";
      readonly timestamp: string;
    }
  | {
      readonly type: "test:result";
      readonly automatorId: AiAssistantId;
      readonly testName: string;
      readonly category: "selector" | "extractor" | "action" | "watcher";
      readonly result: FunctionResult | SelectorTestResult;
      readonly timestamp: string;
    }
  | {
      readonly type: "test:error";
      readonly automatorId: AiAssistantId;
      readonly testName: string;
      readonly category: "selector" | "extractor" | "action" | "watcher";
      readonly error: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "selector:results";
      readonly automatorId: AiAssistantId;
      readonly results: SelectorResults;
      readonly timestamp: string;
    }
  | {
      readonly type: "automator:status";
      readonly automatorId: AiAssistantId;
      readonly status: "initializing" | "testing" | "idle" | "error";
      readonly message?: string;
      readonly timestamp: string;
    }
  | {
      readonly type: "watcher:update";
      readonly automatorId: AiAssistantId;
      readonly watcherName: string;
      readonly data: any;
      readonly timestamp: string;
    };

// ====================
// DevTools Command Messages (DevTools → Content)
// ====================

export type DevToolsCommand =
  | {
      readonly type: "devtools:run-tests";
      readonly automatorId: AiAssistantId;
    }
  | {
      readonly type: "devtools:test-function";
      readonly automatorId: AiAssistantId;
      readonly functionName: string;
      readonly args: readonly any[];
    }
  | {
      readonly type: "devtools:refresh-selectors";
      readonly automatorId: AiAssistantId;
    }
  | {
      readonly type: "devtools:submit-prompt";
      readonly automatorId: AiAssistantId;
      readonly prompt: string;
      readonly chatId?: string;
      readonly messageId?: string;
    }
  | {
      readonly type: "devtools:navigate-to-chat";
      readonly automatorId: AiAssistantId;
      readonly chatId?: string;
    };

// ====================
// DevTools Message Union
// ====================

export type DevToolsMessage = DevToolsTestMessage | DevToolsCommand;
