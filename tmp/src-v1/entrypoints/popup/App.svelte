<!-- src/entrypoints/popup/App.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import type {
    RecorderBackgroundRequest,
    RecorderFixtureMeta,
    RecorderStateUpdateMessage,
    RecorderUiState,
  } from '../../lib/types/recorder';

  let recording = false;
  let fixtures: RecorderFixtureMeta[] = [];
  let loading = true;
  let busy = false;
  let downloading = false;
  let lastError: string | null = null;

  const formatTimestamp = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    const datePart = date.toLocaleDateString();
    const timePart = date.toLocaleTimeString();
    return `${datePart} ${timePart}`;
  };

  const refreshState = async () => {
    loading = true;
    lastError = null;
    try {
      const response = (await browser.runtime.sendMessage({
        type: 'recorder:get-state',
      } satisfies RecorderBackgroundRequest)) as RecorderUiState | null;
      if (response) {
        recording = response.recording;
        fixtures = [...response.fixtures];
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : `${error}`;
    } finally {
      loading = false;
    }
  };

  const updateState = (payload: RecorderUiState) => {
    recording = payload.recording;
    fixtures = [...payload.fixtures];
  };

  const setRecording = async (next: boolean) => {
    if (busy) {
      return;
    }
    busy = true;
    lastError = null;
    try {
      await browser.runtime.sendMessage({
        type: 'recorder:set-recording',
        recording: next,
      } satisfies RecorderBackgroundRequest);
      await refreshState();
    } catch (error) {
      lastError = error instanceof Error ? error.message : `${error}`;
    } finally {
      busy = false;
    }
  };

  const clearFixtures = async () => {
    if (busy) {
      return;
    }
    busy = true;
    lastError = null;
    try {
      await browser.runtime.sendMessage({
        type: 'recorder:clear-fixtures',
      } satisfies RecorderBackgroundRequest);
      await refreshState();
    } catch (error) {
      lastError = error instanceof Error ? error.message : `${error}`;
    } finally {
      busy = false;
    }
  };

  const downloadFixtures = async () => {
    if (busy) {
      return;
    }
    busy = true;
    downloading = true;
    lastError = null;
    try {
      await browser.runtime.sendMessage({
        type: 'recorder:download-all',
      } satisfies RecorderBackgroundRequest);
    } catch (error) {
      lastError = error instanceof Error ? error.message : `${error}`;
    } finally {
      downloading = false;
      busy = false;
    }
  };

  onMount(() => {
    void refreshState();
    const listener = (message: unknown) => {
      if (!message || typeof message !== 'object') {
        return;
      }
      const typed = message as RecorderStateUpdateMessage;
      if (typed.type !== 'recorder:state-updated') {
        return;
      }
      updateState(typed.payload);
    };
    browser.runtime.onMessage.addListener(listener);
    return () => {
      browser.runtime.onMessage.removeListener(listener);
    };
  });
</script>

<main>
  <header>
    <h1>Fixture Recorder</h1>
    <p class="subtitle">
      Toggle recording to capture assistant pages as reusable DOM fixtures.
    </p>
  </header>

  <section class="panel recording">
    <label>
      <input
        type="checkbox"
        bind:checked={recording}
        disabled={loading || busy}
        on:change={(event) =>
          setRecording(
            (event.currentTarget as HTMLInputElement | null)?.checked ?? false
          )}
      />
      <span>{recording ? 'Recording enabled' : 'Recording disabled'}</span>
    </label>
    <p class="hint">
      {recording
        ? 'The extension captures supported assistant pages automatically when they finish loading.'
        : 'Enable recording before navigating to assistant pages you want to fixture.'}
    </p>
  </section>

  {#if lastError}
    <p class="error">⚠️ {lastError}</p>
  {/if}

  <section class="panel fixtures">
    <header>
      <h2>Recent Fixtures</h2>
      <span>{fixtures.length}</span>
    </header>
    <div class="actions">
      <button
        type="button"
        class="primary"
        on:click={downloadFixtures}
        disabled={fixtures.length === 0 || busy}
      >
        {downloading ? 'Packaging…' : 'Download fixtures zip'}
      </button>
      <button
        type="button"
        class="secondary"
        on:click={clearFixtures}
        disabled={fixtures.length === 0 || busy}
      >
        Clear all fixtures
      </button>
    </div>

    {#if loading}
      <p class="status">Loading recorder state…</p>
    {:else if fixtures.length === 0}
      <p class="status">No fixtures captured yet.</p>
    {:else}
      <ul>
        {#each fixtures.slice(0, 5) as fixture}
          <li>
            <div class="meta">
              <span class="title">{fixture.title || 'Untitled page'}</span>
              <span class="info">
                {fixture.assistantId} · {formatTimestamp(fixture.capturedAt)} ·
                {Math.round(fixture.htmlBytes / 1024)} KB
              </span>
              <span class="url" title={fixture.url}>{fixture.url}</span>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  :global(body) {
    width: 320px;
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    color: #1f2933;
    background: #f7f9fb;
  }

  main {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  header h1 {
    margin: 0 0 4px;
    font-size: 18px;
  }

  .subtitle {
    margin: 0;
    color: #5b6876;
    font-size: 13px;
  }

  .panel {
    background: #fff;
    border-radius: 12px;
    padding: 12px 14px;
    box-shadow: 0 2px 10px rgba(15, 23, 42, 0.08);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .panel.recording label {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 600;
  }

  .panel.recording input[type='checkbox'] {
    width: 20px;
    height: 20px;
  }

  .hint {
    margin: 0;
    color: #5b6876;
    font-size: 12px;
    line-height: 1.4;
  }

  button {
    border: 0;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
    cursor: pointer;
  }

  button.primary {
    background: #2563eb;
    color: #fff;
  }

  button.primary:disabled {
    background: #9cb5f1;
    cursor: default;
  }

  button.secondary {
    background: #e2e8f0;
    color: #1f2933;
  }

  button.secondary:disabled {
    background: #e6ecf4;
    color: #9aa5b1;
    cursor: default;
  }

  .error {
    margin: 0;
    color: #d12d4c;
    font-size: 13px;
    font-weight: 600;
  }

  .panel.fixtures header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .actions button {
    flex: 1;
  }

  .panel.fixtures h2 {
    margin: 0;
    font-size: 15px;
  }

  .panel.fixtures span {
    font-size: 13px;
    color: #5b6876;
  }

  .status {
    margin: 0;
    color: #5b6876;
    font-size: 13px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  li {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    align-items: flex-start;
  }

  .meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .title {
    font-weight: 600;
    font-size: 13px;
  }

  .info {
    color: #5b6876;
    font-size: 12px;
  }

  .url {
    color: #9aa5b1;
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 180px;
  }
</style>
