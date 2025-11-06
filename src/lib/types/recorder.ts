// lib/types/recorder.ts
// Domain types for the DOM recording feature
// (data models only, no message types)

import type { AssistantId } from './automators';

// ============================================================================
// Recorder Data Models
// ============================================================================

/**
 * A captured DOM snapshot from an assistant website
 */
export interface RecorderFixture {
  readonly id: string;
  readonly assistantId: AssistantId | 'unknown';
  readonly capturedAt: string;
  readonly url: string;
  readonly title: string;
  readonly html: string;
}

/**
 * Metadata about a fixture (without the full HTML content)
 * Used for displaying fixture lists in the UI
 */
export interface RecorderFixtureMeta {
  readonly id: string;
  readonly assistantId: AssistantId | 'unknown';
  readonly capturedAt: string;
  readonly url: string;
  readonly title: string;
  readonly htmlBytes: number;
}

/**
 * The recorder's current state
 * Used to sync UI across popup and background
 */
export interface RecorderUiState {
  readonly recording: boolean;
  readonly fixtures: readonly RecorderFixtureMeta[];
}
