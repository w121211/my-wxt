// src/lib/automators/types.ts
// Core automator types and interfaces

import type {
  AutomatorSlug,
  PageRef,
  PageSessionId,
  UrlGlob,
} from '../ws/types';

export interface SelectorMap {
  readonly [key: string]: string;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface PageSession {
  id: PageSessionId;
  automator: AutomatorSlug;
  page: Required<PageRef> & { url: string };
  startedAt: number;
}

export interface ActionContext {
  session: PageSession;
  logger: Logger;

  /**
   * Navigate current tab to a new URL and wait for page to load
   * @param url - The URL to navigate to
   * @returns Promise that resolves when navigation completes
   */
  navigateTo(url: string): Promise<void>;
}

export interface WatcherContext {
  session: PageSession;
  logger: Logger;
}

export type StopFn = () => void;

export interface ActionType<Params, Result> {
  params: Params;
  result: Result;
}

export interface WatcherType<Name extends string, Payload> {
  name: Name;
  payload: Payload;
}

export interface AutomatorApi {
  actions: Record<string, ActionType<unknown, unknown>>;
  watchers: Record<string, WatcherType<string, unknown>>;
}

export type ActionParams<T> = T extends ActionType<infer P, unknown> ? P : never;
export type ActionResult<T> = T extends ActionType<unknown, infer R> ? R : never;
export type WatcherEventName<T> = T extends WatcherType<infer N, unknown> ? N : never;
export type WatcherEventPayload<T> = T extends WatcherType<string, infer W> ? W : never;

export type Emit<Name extends string, Payload> = (name: Name, payload: Payload) => void;

export interface PageDefinition {
  /** Default URL to open this page (e.g., for navigation) */
  url: string;
  /** URL glob patterns that match this page type */
  urlGlobs: UrlGlob[];
  /** Page-specific selectors */
  selectors: SelectorMap;
}

export interface AutomatorDefinition<A extends AutomatorApi = AutomatorApi> {
  slug: AutomatorSlug;
  /** Single URL glob pattern for overall automator matching */
  urlGlob: UrlGlob;
  /** Page definitions for different page types within this automator */
  pages: Record<string, PageDefinition>;
  actions: {
    [K in keyof A['actions'] & string]: (
      ctx: ActionContext,
      params: ActionParams<A['actions'][K]>
    ) => Promise<ActionResult<A['actions'][K]>>;
  };
  watchers: {
    [K in keyof A['watchers'] & string]: (
      ctx: WatcherContext,
      emit: Emit<
        `watcher.${WatcherEventName<A['watchers'][K]>}`,
        WatcherEventPayload<A['watchers'][K]>
      >
    ) => StopFn;
  };
}

export type AutomatorRegistry = ReadonlyArray<AutomatorDefinition<AutomatorApi>>;
