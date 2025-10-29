// src/entrypoints/background.ts

import JSZip from 'jszip';
import { detectAssistantFromUrl } from '../lib/assistantHosts';
import type {
  AssistantId,
  AssistantNotification,
  BridgeInboundMessage,
  BridgeOutboundMessage,
  BridgeStatusPayload,
  ChatTarget,
  PromptSubmission,
} from '../lib/types/assistantBridge';
import type {
  RecorderBackgroundRequest,
  RecorderFixture,
  RecorderFixtureMessage,
  RecorderStateUpdateMessage,
  RecorderUiState,
  RecorderCaptureCommand,
} from '../lib/types/recorder';

const DEFAULT_ASSISTANT: AssistantId = 'chatgpt';
const DEFAULT_PORT = 3456;
const BASE_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 10_000;

type AssistantTab = {
  readonly assistant: AssistantId;
  readonly tabId: number;
};

type PendingPrompt = {
  readonly request: PromptSubmission;
  readonly assistant: AssistantId;
  readonly tabId: number;
};

const assistantTargets: Record<
  AssistantId,
  { readonly urlPatterns: readonly string[]; readonly homeUrl: string }
> = {
  chatgpt: {
    urlPatterns: ['*://chat.openai.com/*', '*://chatgpt.com/*'],
    homeUrl: 'https://chatgpt.com/',
  },
  claude: {
    urlPatterns: ['*://claude.ai/*'],
    homeUrl: 'https://claude.ai/new',
  },
  gemini: {
    urlPatterns: ['*://gemini.google.com/*'],
    homeUrl: 'https://gemini.google.com/app',
  },
  grok: {
    urlPatterns: ['*://grok.com/*', '*://x.com/*'],
    homeUrl: 'https://grok.com/',
  },
};

const RECORDER_STATE_KEY = 'recorder:state';
const RECORDER_FIXTURES_KEY = 'recorder:fixtures';
const MAX_RECORDER_FIXTURES = 50;
const INVALID_PATH_SEGMENT = /[<>:"/\\|?*\u0000-\u001f]+/g;
const MAX_SEGMENT_LENGTH = 150;

const sanitizePathSegment = (value: string, fallback: string): string => {
  const cleaned = value
    .replace(INVALID_PATH_SEGMENT, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  if (!cleaned || cleaned === '.' || cleaned === '..') {
    return fallback;
  }
  return cleaned.slice(0, MAX_SEGMENT_LENGTH);
};

const formatTimestampSegment = (iso: string): string => {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return 'unknown-timestamp';
  }
  const pad = (value: number) => value.toString().padStart(2, '0');
  return [
    `${parsed.getUTCFullYear()}${pad(parsed.getUTCMonth() + 1)}${pad(parsed.getUTCDate())}`,
    `${pad(parsed.getUTCHours())}${pad(parsed.getUTCMinutes())}${pad(parsed.getUTCSeconds())}`,
  ].join('T');
};

const deriveDomainSegment = (url: string): string => {
  try {
    const hostname = new URL(url).hostname || 'unknown-domain';
    return sanitizePathSegment(hostname, 'unknown-domain');
  } catch {
    return 'unknown-domain';
  }
};

const stripScheme = (url: string): string => {
  try {
    const parsed = new URL(url);
    return parsed.href.replace(/^https?:\/\//i, '');
  } catch {
    return url;
  }
};

const buildRecorderPath = (fixture: RecorderFixture): string => {
  const domain = deriveDomainSegment(fixture.url);
  const timestamp = formatTimestampSegment(fixture.capturedAt);
  const urlSegment = sanitizePathSegment(stripScheme(fixture.url), 'page');
  const filename = `${timestamp}--${urlSegment}.html`;
  return `${domain}/${filename}`;
};

const buildRecorderArchiveName = (fixtures: readonly RecorderFixture[]): string => {
  const mostRecent = fixtures[0]?.capturedAt ?? new Date().toISOString();
  const timestamp = formatTimestampSegment(mostRecent);
  return `recorder-fixtures-${timestamp}.zip`;
};

const buildRecorderArchiveResource = async (
  fixtures: readonly RecorderFixture[]
): Promise<{ readonly url: string; readonly cleanup: () => void } | null> => {
  const zip = new JSZip();
  for (const fixture of fixtures) {
    zip.file(buildRecorderPath(fixture), fixture.html);
  }
  const hasObjectUrl = typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function';
  if (hasObjectUrl) {
    try {
      const blob = await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/zip',
      });
      const url = URL.createObjectURL(blob);
      return {
        url,
        cleanup: () => {
          try {
            URL.revokeObjectURL(url);
          } catch (revokeError) {
            console.debug('Recorder archive URL cleanup failed', revokeError);
          }
        },
      };
    } catch (error) {
      console.error('Recorder zip blob generation failed', error);
    }
  }
  try {
    const base64 = await zip.generateAsync({
      type: 'base64',
      mimeType: 'application/zip',
    });
    return {
      url: `data:application/zip;base64,${base64}`,
      cleanup: () => {},
    };
  } catch (error) {
    console.error('Recorder zip data URL generation failed', error);
    return null;
  }
};

export default defineBackground(() => {
  let desiredAssistant: AssistantId = DEFAULT_ASSISTANT;
  let desiredPort = DEFAULT_PORT;
  let websocket: WebSocket | null = null;
  let reconnectHandle: number | undefined;
  let connectionAttempt = 0;
  let closing = false;
  let lastKnownAssistantTab: AssistantTab | null = null;
  const pendingPrompts = new Map<string, PendingPrompt>();
  let recorderInitialized = false;
  let recorderRecording = false;
  let recorderFixtures: RecorderFixture[] = [];

  const ensureRecorderInitialized = async () => {
    if (recorderInitialized) {
      return;
    }
    const stored = await browser.storage.local.get({
      [RECORDER_STATE_KEY]: { recording: false },
      [RECORDER_FIXTURES_KEY]: [] as RecorderFixture[],
    });
    const stateValue = stored[RECORDER_STATE_KEY] as { readonly recording?: boolean } | undefined;
    const fixturesValue = stored[RECORDER_FIXTURES_KEY] as unknown;
    recorderRecording = stateValue?.recording ?? false;
    if (Array.isArray(fixturesValue)) {
      recorderFixtures = fixturesValue.filter(isRecorderFixture);
    } else {
      recorderFixtures = [];
    }
    recorderInitialized = true;
  };

  const toRecorderUiState = (): RecorderUiState => {
    const encoder = new TextEncoder();
    return {
      recording: recorderRecording,
      fixtures: recorderFixtures.map((fixture) => ({
        id: fixture.id,
        assistantId: fixture.assistantId,
        capturedAt: fixture.capturedAt,
        url: fixture.url,
        title: fixture.title,
        htmlBytes: encoder.encode(fixture.html).length,
      })),
    };
  };

  const broadcastRecorderState = async () => {
    if (!recorderInitialized) {
      return;
    }
    const message: RecorderStateUpdateMessage = {
      type: 'recorder:state-updated',
      payload: toRecorderUiState(),
    };
    try {
      await browser.runtime.sendMessage(message);
    } catch (error) {
      console.debug('Recorder state broadcast skipped', error);
    }
  };

  const requestRecorderCapture = async (
    tabId: number,
    assistant: AssistantId | 'unknown'
  ) => {
    const command: RecorderCaptureCommand = {
      type: 'recorder:capture',
      assistantId: assistant,
    };
    try {
      await browser.tabs.sendMessage(tabId, command);
    } catch (error) {
      console.debug('Recorder capture dispatch failed', error);
    }
  };

  const triggerRecorderForActiveTab = async () => {
    const [activeTab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (!activeTab?.id) {
      return;
    }
    const assistant = detectAssistantFromUrl(activeTab.url);
    if (!assistant) {
      return;
    }
    await requestRecorderCapture(activeTab.id, assistant);
  };

  const handleRecorderFixture = async (message: RecorderFixtureMessage) => {
    await ensureRecorderInitialized();
    recorderFixtures = [message.payload, ...recorderFixtures].slice(
      0,
      MAX_RECORDER_FIXTURES
    );
    await browser.storage.local.set({
      [RECORDER_FIXTURES_KEY]: recorderFixtures,
    });
    console.info('Recorder captured fixture', {
      id: message.payload.id,
      assistant: message.payload.assistantId,
      url: message.payload.url,
    });
    await broadcastRecorderState();
  };

  const handleRecorderRequest = async (
    request: RecorderBackgroundRequest
  ): Promise<RecorderUiState | RecorderFixture | { readonly ok: true } | null> => {
    await ensureRecorderInitialized();
    switch (request.type) {
      case 'recorder:get-state':
        return toRecorderUiState();
      case 'recorder:set-recording':
        recorderRecording = request.recording;
        await browser.storage.local.set({
          [RECORDER_STATE_KEY]: { recording: recorderRecording },
        });
        await broadcastRecorderState();
        if (recorderRecording) {
          await triggerRecorderForActiveTab();
        }
        return { ok: true };
      case 'recorder:clear-fixtures':
        recorderFixtures = [];
        await browser.storage.local.set({
          [RECORDER_FIXTURES_KEY]: recorderFixtures,
        });
        await broadcastRecorderState();
        return { ok: true };
      case 'recorder:download-all':
        if (recorderFixtures.length === 0) {
          return { ok: true };
        }
        {
          const archive = await buildRecorderArchiveResource(recorderFixtures);
          if (!archive) {
            return { ok: true };
          }
          const archiveName = buildRecorderArchiveName(recorderFixtures);
          try {
            await browser.downloads.download({
              url: archive.url,
              filename: archiveName,
              saveAs: false,
              conflictAction: 'uniquify',
            });
          } catch (error) {
            console.error('Recorder archive download failed', error);
          } finally {
            setTimeout(() => {
              archive.cleanup();
            }, 10_000);
          }
        }
        return { ok: true };
      case 'recorder:get-fixture':
        return recorderFixtures.find((item) => item.id === request.id) ?? null;
      default:
        return { ok: true };
    }
  };

  void ensureRecorderInitialized();

  const sendStatusToServer = (payload: BridgeStatusPayload) => {
    sendToServer({
      type: 'bridge:status',
      payload,
    });
  };

  const scheduleReconnect = () => {
    if (closing) {
      return;
    }
    const delay = Math.min(
      BASE_RETRY_DELAY_MS * 2 ** Math.max(connectionAttempt - 1, 0),
      MAX_RETRY_DELAY_MS
    );
    if (reconnectHandle) {
      clearTimeout(reconnectHandle);
    }
    reconnectHandle = setTimeout(connect, delay) as unknown as number;
  };

  const connect = () => {
    connectionAttempt += 1;
    sendStatusToServer({
      status: 'connecting',
      attempt: connectionAttempt,
      message: `Connecting to ws://127.0.0.1:${desiredPort}`,
    });
    if (websocket) {
      websocket.removeEventListener('close', handleClose);
      websocket.removeEventListener('error', handleError);
      websocket.removeEventListener('message', handleMessage);
      websocket.close();
    }

    websocket = new WebSocket(`ws://127.0.0.1:${desiredPort}`);
    websocket.addEventListener('open', handleOpen);
    websocket.addEventListener('close', handleClose);
    websocket.addEventListener('error', handleError);
    websocket.addEventListener('message', handleMessage);
  };

  const disconnect = () => {
    closing = true;
    if (reconnectHandle) {
      clearTimeout(reconnectHandle);
      reconnectHandle = undefined;
    }
    if (websocket && websocket.readyState === WebSocket.OPEN) {
      websocket.close();
    }
    websocket = null;
  };

  const handleOpen = () => {
    connectionAttempt = 0;
    sendStatusToServer({
      status: 'open',
      message: 'Bridge connection established',
    });
  };

  const handleClose = () => {
    websocket?.removeEventListener('open', handleOpen);
    websocket?.removeEventListener('close', handleClose);
    websocket?.removeEventListener('message', handleMessage);
    websocket?.removeEventListener('error', handleError);
    websocket = null;
    sendStatusToServer({
      status: closing ? 'closed' : 'error',
      message: closing ? 'Bridge disconnected' : 'Bridge connection lost',
    });
    if (!closing) {
      scheduleReconnect();
    }
  };

  const handleError = (event: Event) => {
    sendStatusToServer({
      status: 'error',
      message: `WebSocket error: ${event.type}`,
    });
  };

  const handleMessage = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as BridgeInboundMessage;
      handleInboundMessage(payload);
    } catch (error) {
      console.error('Failed to parse inbound WS payload', error);
      sendToServer({
        type: 'bridge:error',
        payload: {
          code: 'invalid-message',
          message: 'Inbound message parsing failed',
          details: { raw: event.data },
        },
      });
    }
  };

  const sendToServer = (message: BridgeOutboundMessage) => {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
      return;
    }
    try {
      websocket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Failed to send outbound WS payload', error);
    }
  };

  const handleInboundMessage = async (message: BridgeInboundMessage) => {
    switch (message.type) {
      case 'bridge:hello':
        if (message.port && message.port !== desiredPort) {
          desiredPort = message.port;
          closing = false;
          connectionAttempt = 0;
          connect();
        }
        desiredAssistant = message.assistant;
        sendStatusToServer({
          status: 'open',
          message: `Ready for assistant ${desiredAssistant}`,
        });
        break;
      case 'bridge:close':
        disconnect();
        break;
      case 'chat:list':
        await dispatchToContent(message.assistant, {
          kind: 'extract-chat-list',
        });
        break;
      case 'chat:details':
        await dispatchToContent(message.assistant, {
          kind: 'extract-chat',
          payload: message.target,
        });
        break;
      case 'chat:prompt': {
        const tabId = await ensureAssistantTab(
          message.assistant,
          message.request.conversation?.url
        );
        if (tabId === null) {
          sendToServer({
            type: 'chat:error',
            assistantId: message.assistant,
            payload: {
              code: 'navigation-failed',
              message: 'Unable to locate or create assistant tab',
              details: { assistant: message.assistant },
            },
          });
          return;
        }
        pendingPrompts.set(message.request.promptId, {
          assistant: message.assistant,
          request: message.request,
          tabId,
        });
        await dispatchToContent(message.assistant, {
          kind: 'process-prompt',
          payload: message.request,
        });
        break;
      }
      default:
        sendToServer({
          type: 'chat:error',
          assistantId: desiredAssistant,
          payload: {
            code: 'unsupported',
            message: `Unsupported inbound message ${(message as { type: string }).type}`,
          },
        });
    }
  };

  const ensureAssistantTab = async (
    assistant: AssistantId,
    preferredUrl?: string
  ): Promise<number | null> => {
    if (
      lastKnownAssistantTab &&
      lastKnownAssistantTab.assistant === assistant
    ) {
      const tabExists = await browser.tabs.get(lastKnownAssistantTab.tabId).then(
        () => true,
        () => false
      );
      if (tabExists) {
        if (preferredUrl) {
          await browser.tabs.update(lastKnownAssistantTab.tabId, {
            url: preferredUrl,
            active: false,
          });
        }
        return lastKnownAssistantTab.tabId;
      }
      lastKnownAssistantTab = null;
    }

    const target = assistantTargets[assistant];
    if (!target) {
      return null;
    }

    const matchingTabs = await browser.tabs.query({
      url: target.urlPatterns as string[],
    });

    const tab =
      matchingTabs.find((candidate) => {
        if (!preferredUrl || !candidate.url) {
          return true;
        }
        return candidate.url === preferredUrl;
      }) ?? matchingTabs[0];

    if (tab && typeof tab.id === 'number') {
      if (preferredUrl && tab.url !== preferredUrl) {
        await browser.tabs.update(tab.id, {
          url: preferredUrl,
          active: false,
        });
      }
      lastKnownAssistantTab = { assistant, tabId: tab.id };
      return tab.id;
    }

    const created = await browser.tabs.create({
      url: preferredUrl ?? target.homeUrl,
      active: false,
    });
    if (!created.id) {
      return null;
    }
    lastKnownAssistantTab = { assistant, tabId: created.id };
    return created.id;
  };

  const dispatchToContent = async (
    assistant: AssistantId,
    command: ContentCommand
  ) => {
    const tabId = await ensureAssistantTab(assistant);
    if (tabId === null) {
      sendToServer({
        type: 'chat:error',
        assistantId: assistant,
        payload: {
          code: 'navigation-failed',
          message: 'Unable to resolve assistant tab',
        },
      });
      return;
    }
    try {
      const messageToSend = {
        ...command,
        assistantId: assistant,
      } satisfies BackgroundCommandMessage;
      console.log('[background] Sending to content:', JSON.stringify(messageToSend));
      await browser.tabs.sendMessage(tabId, messageToSend);
    } catch (error) {
      console.error('Failed to dispatch message to content script', error);
      sendToServer({
        type: 'chat:error',
        assistantId: assistant,
        payload: {
          code: 'prompt-failed',
          message: 'Content script communication failed',
          details: { error: `${error}` },
        },
      });
    }
  };

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (isRecorderFixtureMessage(message)) {
      void handleRecorderFixture(message);
      return;
    }
    if (isRecorderBackgroundRequest(message)) {
      void (async () => {
        try {
          const response = await handleRecorderRequest(message);
          sendResponse(response);
        } catch (error) {
          console.error('Recorder request failed', error);
          sendResponse(null);
        }
      })();
      return true;
    }
    if (!isAssistantNotificationMessage(message)) {
      return;
    }
    if (sender.tab?.id) {
      lastKnownAssistantTab = {
        assistant: message.assistantId,
        tabId: sender.tab.id,
      };
    }

    if (message.type === 'chat:delta' || message.type === 'chat:response') {
      const pending = pendingPrompts.get(message.payload.promptId);
      if (!pending) {
        console.warn('No pending prompt found for delta', message.payload);
      }
      if (message.type === 'chat:response') {
        pendingPrompts.delete(message.payload.promptId);
      }
    }
    sendToServer(message);
  });

  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!recorderInitialized) {
      void ensureRecorderInitialized();
      return;
    }
    if (!recorderRecording) {
      return;
    }
    if (changeInfo.status !== 'complete') {
      return;
    }
    const assistant = detectAssistantFromUrl(tab.url);
    if (!assistant) {
      return;
    }
    void requestRecorderCapture(tabId, assistant);
  });

  connect();

  return {
    onUnload() {
      disconnect();
    },
  };
});

type ContentCommand =
  | { readonly kind: 'extract-chat-list' }
  | { readonly kind: 'extract-chat'; readonly payload: ChatTarget }
  | { readonly kind: 'process-prompt'; readonly payload: PromptSubmission };

type BackgroundCommandMessage = ContentCommand & {
  readonly assistantId: AssistantId;
};

const assistantNotificationTypes: ReadonlySet<AssistantNotification['type']> = new Set<
  AssistantNotification['type']
>([
  'login:state',
  'chat:list',
  'chat:details',
  'chat:delta',
  'chat:response',
  'chat:error',
]);

const isAssistantNotificationMessage = (
  message: unknown
): message is AssistantNotification => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const type = (message as { readonly type?: string }).type;
  if (!type || !assistantNotificationTypes.has(type as AssistantNotification['type'])) {
    return false;
  }
  return typeof (message as { readonly assistantId?: unknown }).assistantId === 'string';
};

const isRecorderBackgroundRequest = (
  message: unknown
): message is RecorderBackgroundRequest => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  const type = (message as { readonly type?: string }).type;
  return (
    type === 'recorder:get-state' ||
    type === 'recorder:set-recording' ||
    type === 'recorder:clear-fixtures' ||
    type === 'recorder:download-all' ||
    type === 'recorder:get-fixture'
  );
};

const isRecorderFixtureMessage = (
  message: unknown
): message is RecorderFixtureMessage => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  if ((message as { readonly type?: string }).type !== 'recorder:fixture') {
    return false;
  }
  const payload = (message as RecorderFixtureMessage).payload;
  return isRecorderFixture(payload);
};

const isRecorderFixture = (value: unknown): value is RecorderFixture => {
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
};
