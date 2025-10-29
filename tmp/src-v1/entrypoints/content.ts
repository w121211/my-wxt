// src/entrypoints/content.ts

import { resolveExtractor } from '../lib/assistantRegistry';
import { detectAssistantFromHost } from '../lib/assistantHosts';
import type {
  AssistantExtractor,
  AssistantId,
  AssistantNotification,
  ChatTarget,
  PromptSubmission,
} from '../lib/types/assistantBridge';
import type {
  RecorderCaptureCommand,
  RecorderFixture,
  RecorderFixtureMessage,
} from '../lib/types/recorder';

const detectAssistant = (): AssistantId | null => {
  const host = window.location.hostname;
  return detectAssistantFromHost(host);
};

type BackgroundCommand =
  | {
      readonly assistantId: AssistantId;
      readonly kind: 'extract-chat-list';
    }
  | {
    readonly assistantId: AssistantId;
    readonly kind: 'extract-chat';
    readonly payload: ChatTarget;
  }
  | {
    readonly assistantId: AssistantId;
    readonly kind: 'process-prompt';
    readonly payload: PromptSubmission;
  };

export default defineContentScript({
  matches: [
    '*://chat.openai.com/*',
    '*://chatgpt.com/*',
    '*://www.chatgpt.com/*',
    '*://claude.ai/*',
    '*://gemini.google.com/*',
    '*://grok.com/*',
    '*://www.grok.com/*',
  ],
  async main() {
    const assistant = detectAssistant();
    if (!assistant) {
      return;
    }

    const handleRecorderCapture = async (command: RecorderCaptureCommand) => {
      const targetAssistant =
        command.assistantId === 'unknown' ? assistant : command.assistantId;
      const fixture = captureFixture(targetAssistant);
      const message: RecorderFixtureMessage = {
        type: 'recorder:fixture',
        payload: fixture,
      };
      await browser.runtime.sendMessage(message);
    };

    browser.runtime.onMessage.addListener((message) => {
      if (isRecorderCaptureCommand(message)) {
        void handleRecorderCapture(message);
      }
    });

    let extractor: AssistantExtractor;
    try {
      extractor = resolveExtractor(assistant);
    } catch (error) {
      await sendNotification({
        assistantId: assistant,
        type: 'chat:error',
        payload: {
          code: 'unsupported',
          message: `Extractor not available: ${error}`,
        },
      });
      return;
    }

    await initializeLoginState(extractor, assistant);

    browser.runtime.onMessage.addListener(
      async (command: BackgroundCommand) => {
        console.log('[content] Received message:', JSON.stringify(command));
        if (!command || command.assistantId !== assistant) {
          return;
        }
        switch (command.kind) {
          case 'extract-chat-list':
            await handleChatList(extractor, assistant);
            break;
          case 'extract-chat':
            await handleChatDetails(extractor, assistant, command.payload);
            break;
          case 'process-prompt':
            await handlePrompt(extractor, assistant, command.payload);
            break;
          default:
            await sendNotification({
              assistantId: assistant,
              type: 'chat:error',
              payload: {
                code: 'unsupported',
                message: `Unknown command ${(command as { kind?: string }).kind}`,
              },
            });
        }
      }
    );
  },
});

const captureFixture = (assistant: AssistantId | 'unknown'): RecorderFixture => {
  const html = document.documentElement?.outerHTML ?? '';
  const fixture: RecorderFixture = {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `fixture-${Date.now()}`,
    assistantId: assistant,
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    html,
  };
  return fixture;
};

const isRecorderCaptureCommand = (message: unknown): message is RecorderCaptureCommand => {
  if (!message || typeof message !== 'object') {
    return false;
  }
  return (message as { readonly type?: string }).type === 'recorder:capture';
};

const initializeLoginState = async (
  extractor: AssistantExtractor,
  assistant: AssistantId
) => {
  try {
    const state = await extractor.waitForLoggedIn({
      timeoutMs: 10_000,
      pollIntervalMs: 500,
    });
    await sendNotification({
      assistantId: assistant,
      type: 'login:state',
      payload: state,
    });
  } catch (error) {
    await sendNotification({
      assistantId: assistant,
      type: 'chat:error',
      payload: {
        code: 'unexpected',
        message: `Failed waiting for login: ${error}`,
      },
    });
  }
};

const handleChatList = async (
  extractor: AssistantExtractor,
  assistant: AssistantId
) => {
  try {
    const chats = await extractor.extractChatList();
    await sendNotification({
      assistantId: assistant,
      type: 'chat:list',
      payload: chats,
    });
  } catch (error) {
    await notifyExtractorError(assistant, error, 'extractChatList');
  }
};

const handleChatDetails = async (
  extractor: AssistantExtractor,
  assistant: AssistantId,
  target: ChatTarget
) => {
  try {
    const details = await extractor.extractChat(target);
    await sendNotification({
      assistantId: assistant,
      type: 'chat:details',
      payload: details,
    });
  } catch (error) {
    await notifyExtractorError(assistant, error, 'extractChat');
  }
};

const handlePrompt = async (
  extractor: AssistantExtractor,
  assistant: AssistantId,
  request: PromptSubmission
) => {
  try {
    if (request.conversation) {
      await extractor.openChat(request.conversation);
    }
    await extractor.sendPrompt(request);
    const response = await extractor.watchResponse(request, (delta) => {
      void sendNotification({
        assistantId: assistant,
        type: 'chat:delta',
        payload: delta,
      });
    });
    await sendNotification({
      assistantId: assistant,
      type: 'chat:response',
      payload: response,
    });
  } catch (error) {
    await notifyExtractorError(assistant, error, 'sendPrompt');
  }
};

const sendNotification = async (message: AssistantNotification) => {
  await browser.runtime.sendMessage(message);
};

const notifyExtractorError = async (
  assistant: AssistantId,
  error: unknown,
  context: string
) => {
  await sendNotification({
    assistantId: assistant,
    type: 'chat:error',
    payload: {
      code: 'unexpected',
      message: `${context} failed: ${error}`,
      details: { context },
    },
  });
};
