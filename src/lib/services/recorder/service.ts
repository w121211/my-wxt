// lib/services/recorder/service.ts

import { browser } from 'wxt/browser';
import type {
  RecorderFixture,
  RecorderFixtureMeta,
  RecorderUiState,
} from '../../types/recorder';
import type {
  BackgroundToPopupBroadcast,
  PopupToBackgroundRequest,
  PopupToBackgroundResponse,
} from '../../types/runtime';
import { buildRecorderArchive, buildRecorderArchiveName } from './archiver';

const RECORDER_STATE_KEY = 'recorder:state';
const RECORDER_FIXTURES_KEY = 'recorder:fixtures';
const MAX_RECORDER_FIXTURES = 50;

export class RecorderService {
  private recording = false;
  private fixtures: RecorderFixture[] = [];
  private isInitialized = false;

  constructor() {
    this.loadInitialState();
  }

  private async loadInitialState(): Promise<void> {
    if (this.isInitialized) {
      return;
    }
    const stored = await browser.storage.local.get({
      [RECORDER_STATE_KEY]: { recording: false },
      [RECORDER_FIXTURES_KEY]: [] as RecorderFixture[],
    });
    const stateValue = stored[RECORDER_STATE_KEY] as { readonly recording?: boolean } | undefined;
    const fixturesValue = stored[RECORDER_FIXTURES_KEY] as unknown;

    this.recording = stateValue?.recording ?? false;
    if (Array.isArray(fixturesValue)) {
      this.fixtures = fixturesValue.filter(this.isRecorderFixture);
    } else {
      this.fixtures = [];
    }
    this.isInitialized = true;
  }

  private isRecorderFixture(value: unknown): value is RecorderFixture {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const candidate = value as Partial<RecorderFixture>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.capturedAt === 'string' &&
      typeof candidate.url === 'string' &&
      typeof candidate.title === 'string' &&
      typeof candidate.html === 'string' &&
      typeof candidate.assistantId === 'string'
    );
  }

  private toUiState(): RecorderUiState {
    const encoder = new TextEncoder();
    return {
      recording: this.recording,
      fixtures: this.fixtures.map((fixture) => ({
        id: fixture.id,
        assistantId: fixture.assistantId,
        capturedAt: fixture.capturedAt,
        url: fixture.url,
        title: fixture.title,
        htmlBytes: encoder.encode(fixture.html).length,
      })),
    };
  }

  private async broadcastState(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }
    const message: BackgroundToPopupBroadcast = {
      type: 'recorder:state-updated',
      payload: this.toUiState(),
    };
    try {
      await browser.runtime.sendMessage(message);
    } catch (error) {
      console.debug('Recorder state broadcast skipped', error);
    }
  }

  public isRecording(): boolean {
    return this.recording;
  }

  public async addFixture(fixture: RecorderFixture): Promise<void> {
    await this.loadInitialState();
    this.fixtures = [fixture, ...this.fixtures].slice(0, MAX_RECORDER_FIXTURES);
    await browser.storage.local.set({ [RECORDER_FIXTURES_KEY]: this.fixtures });
    console.info('Recorder captured fixture', {
      id: fixture.id,
      assistant: fixture.assistantId,
      url: fixture.url,
    });
    await this.broadcastState();
  }

  public async handleRequest(
    request: PopupToBackgroundRequest
  ): Promise<PopupToBackgroundResponse> {
    await this.loadInitialState();

    switch (request.type) {
      case 'recorder:get-state':
        return this.toUiState();

      case 'recorder:set-recording':
        this.recording = request.recording;
        await browser.storage.local.set({
          [RECORDER_STATE_KEY]: { recording: this.recording },
        });
        await this.broadcastState();
        return { ok: true };

      case 'recorder:clear-fixtures':
        this.fixtures = [];
        await browser.storage.local.set({ [RECORDER_FIXTURES_KEY]: [] });
        await this.broadcastState();
        return { ok: true };

      case 'recorder:download-all':
        return this.downloadAllFixtures();

      case 'recorder:get-fixture':
        return this.fixtures.find((item) => item.id === request.id) ?? null;
    }
  }

  private async downloadAllFixtures(): Promise<{ ok: true }> {
    if (this.fixtures.length === 0) {
      return { ok: true };
    }

    const archiveBlob = await buildRecorderArchive(this.fixtures);
    if (!archiveBlob) {
      return { ok: true };
    }

    const archiveName = buildRecorderArchiveName(this.fixtures);

    // Create a data URL, which works in service workers, unlike createObjectURL
    const reader = new FileReader();
    reader.readAsDataURL(archiveBlob);
    const archiveUrl = await new Promise<string>((resolve) => {
      reader.onload = () => resolve(reader.result as string);
    });

    try {
      await browser.downloads.download({
        url: archiveUrl,
        filename: archiveName,
        saveAs: false,
        conflictAction: 'uniquify',
      });
    } catch (error) {
      console.error('Recorder archive download failed', error);
    }

    return { ok: true };
  }
}
