// src/lib/ws/types.ts
// Core WebSocket protocol types for automator communication

export type Version = 1;
export type AutomatorSlug = string;
export type UrlGlob = string;

export interface PageRef {
  tabId: number;
  frameId?: number;
  url?: string;
}

export type PageSessionId = `${number}:${number}:${AutomatorSlug}`;

export interface BaseMessage {
  v: Version;
  ts: number;
}

export interface HelloMessage extends BaseMessage {
  kind: 'hello';
  connId: string;
}

export interface ByeMessage extends BaseMessage {
  kind: 'bye';
  reason?: string;
}

export interface RequestMessage<Name extends string = string, Params = unknown>
  extends BaseMessage {
  kind: 'request';
  id: string;
  automator: AutomatorSlug;
  name: Name;
  page?: PageRef;
  data: Params;
}

export interface ResponseMessage<Result = unknown> extends BaseMessage {
  kind: 'response';
  id: string;
  data: Result;
}

export type LifecycleEventName =
  | 'page.online'
  | 'page.offline'
  | 'automator.started'
  | 'automator.stopped';

export interface EventMessage<Name extends string = string, Payload = unknown>
  extends BaseMessage {
  kind: 'event';
  automator: AutomatorSlug;
  name: Name;
  page: PageRef;
  seq: number;
  data: Payload;
}

export type ErrorCode =
  | 'NO_AUTOMATOR'
  | 'MULTIPLE_MATCH'
  | 'AMBIGUOUS_PAGE'
  | 'NO_SESSION'
  | 'TIMEOUT'
  | 'BAD_PARAMS'
  | 'VERSION_MISMATCH'
  | 'ACTION_FAILED';

export interface ErrorMessage extends BaseMessage {
  kind: 'error';
  id?: string;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export type Message =
  | HelloMessage
  | ByeMessage
  | RequestMessage
  | ResponseMessage
  | EventMessage
  | ErrorMessage;
