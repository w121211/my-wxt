// src/lib/runtime/types.ts
// Message types for background <-> content script communication

import type {
  AutomatorSlug,
  PageRef,
  PageSessionId,
} from '../ws/types';

export interface BgRunAction {
  type: 'runAction';
  requestId: string;
  sessionId: PageSessionId;
  automator: AutomatorSlug;
  name: string;
  params: unknown;
}

export interface BgCancelAction {
  type: 'cancelAction';
  targetRequestId: string;
}

export type BgToContent = BgRunAction | BgCancelAction;

export interface CtActionResult {
  type: 'actionResult';
  requestId: string;
  data: unknown;
}

export interface CtActionError {
  type: 'actionError';
  requestId: string;
  code: 'ACTION_FAILED' | 'BAD_PARAMS' | 'NO_SESSION' | 'TIMEOUT';
  message: string;
  details?: Record<string, unknown>;
}

export interface CtWatcherEvent {
  type: 'watcherEvent';
  sessionId: PageSessionId;
  automator: AutomatorSlug;
  page: PageRef;
  name: `watcher.${string}`;
  seq: number;
  data: unknown;
}

export type ContentToBg = CtActionResult | CtActionError | CtWatcherEvent;
