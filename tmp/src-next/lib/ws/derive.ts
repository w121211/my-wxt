// src/lib/ws/derive.ts
// Helper types for deriving request/response/event unions from automator APIs

import type {
  AutomatorSlug,
  EventMessage,
  RequestMessage,
  ResponseMessage,
} from './types';
import type {
  AutomatorApi,
  ActionParams,
  ActionResult,
  WatcherEventName,
  WatcherEventPayload,
} from '../automators/types';

export type AutomatorRequestOf<A extends AutomatorApi, S extends AutomatorSlug> = {
  [K in keyof A['actions'] & string]: RequestMessage<K, ActionParams<A['actions'][K]>> & {
    automator: S;
  };
}[keyof A['actions'] & string];

export type AutomatorEventOf<A extends AutomatorApi, S extends AutomatorSlug> = {
  [K in keyof A['watchers'] & string]: EventMessage<
    `watcher.${WatcherEventName<A['watchers'][K]>}`,
    WatcherEventPayload<A['watchers'][K]>
  > & { automator: S };
}[keyof A['watchers'] & string];

export type AutomatorResponse = ResponseMessage<unknown>;
