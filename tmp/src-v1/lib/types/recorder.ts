// src/lib/types/recorder.ts

import type { AssistantId } from './assistantBridge';

export interface RecorderFixture {
  readonly id: string;
  readonly assistantId: AssistantId | 'unknown';
  readonly capturedAt: string;
  readonly url: string;
  readonly title: string;
  readonly html: string;
}

export interface RecorderFixtureMeta {
  readonly id: string;
  readonly assistantId: AssistantId | 'unknown';
  readonly capturedAt: string;
  readonly url: string;
  readonly title: string;
  readonly htmlBytes: number;
}

export interface RecorderUiState {
  readonly recording: boolean;
  readonly fixtures: readonly RecorderFixtureMeta[];
}

export type RecorderBackgroundRequest =
  | {
      readonly type: 'recorder:get-state';
    }
  | {
      readonly type: 'recorder:set-recording';
      readonly recording: boolean;
    }
  | {
      readonly type: 'recorder:clear-fixtures';
    }
  | {
      readonly type: 'recorder:download-all';
    }
  | {
      readonly type: 'recorder:get-fixture';
      readonly id: string;
    };

export type RecorderBackgroundResponse =
  | RecorderUiState
  | RecorderFixture
  | { readonly ok: true }
  | null;

export type RecorderStateUpdateMessage = {
  readonly type: 'recorder:state-updated';
  readonly payload: RecorderUiState;
};

export type RecorderCaptureCommand = {
  readonly type: 'recorder:capture';
  readonly assistantId: AssistantId | 'unknown';
};

export type RecorderFixtureMessage = {
  readonly type: 'recorder:fixture';
  readonly payload: RecorderFixture;
};
