// entrypoints/content.ts

import { browser } from 'wxt/browser';
import { resolveExtractor } from '../lib/assistants/registry';
import { detectAssistantFromHost } from '../lib/assistants/hosts';
import type { AssistantExtractor, AssistantId } from '../lib/types/assistants';
import type {
  BackgroundToContentCommand,
  ContentToBackgroundNotification,
} from '../lib/types/runtime';
import type { RecorderFixture } from '../lib/types/recorder';

export default defineContentScript({
  matches: [
    '*://chatgpt.com/*',
    '*://www.chatgpt.com/*',
    '*://claude.ai/*',
    '*://gemini.google.com/*',
    '*://grok.com/*',
    '*://www.grok.com/*',
  ],
  async main() {
    const assistantId = detectAssistantFromHost(window.location.hostname);
    if (!assistantId) {
      return;
    }

    // Listen for commands from the background script
    browser.runtime.onMessage.addListener((command: BackgroundToContentCommand) => {
      // Recorder command can run on any page, even if the assistant isn't fully supported
      if (command.type === 'recorder:capture') {
        handleRecorderCapture(command.assistantId, assistantId);
        return;
      }

      // All other commands are assistant-specific
      if (command.assistantId !== assistantId) {
        return;
      }

      let extractor: AssistantExtractor;
      try {
        extractor = resolveExtractor(assistantId);
      } catch (error) {
        // This is expected for assistants that are not yet implemented.
        // We can ignore this error for now, as the recorder will still work.
        return;
      }

      switch (command.type) {
        case 'assistant:extract-chat-list':
          handleExtractChatList(extractor, assistantId);
          break;
        case 'assistant:extract-chat':
          handleExtractChat(extractor, assistantId, command.payload);
          break;
        case 'assistant:process-prompt':
          handleProcessPrompt(extractor, assistantId, command.payload);
          break;
      }
    });

    // Perform initial login check, but don't crash if the extractor is missing
    try {
      const extractor = resolveExtractor(assistantId);
      initializeLoginState(extractor, assistantId);
    } catch (error) {
      // This is expected, so we don't need to log an error.
      // A warning could be useful for debugging.
      console.warn(
        `Skipping initial login state check for "${assistantId}": extractor not implemented.`,
      );
    }
  },
});

const sendNotification = (notification: ContentToBackgroundNotification) => {
  return browser.runtime.sendMessage(notification);
};

const notifyExtractorError = (
  assistantId: AssistantId,
  error: unknown,
  context: string,
  promptId?: string
) => {
  return sendNotification({
    type: 'chat:error',
    assistantId,
    payload: {
      code: 'unexpected',
      message: `${context} failed: ${error}`,
      details: { context, promptId },
    },
  });
};

const initializeLoginState = async (extractor: AssistantExtractor, assistantId: AssistantId) => {
  try {
    const state = await extractor.waitForLoggedIn({ timeoutMs: 10_000, pollIntervalMs: 500 });
    await sendNotification({ type: 'assistant:login-state', assistantId, payload: state });
  } catch (error) {
    await notifyExtractorError(assistantId, error, 'waitForLoggedIn');
  }
};

const handleExtractChatList = async (extractor: AssistantExtractor, assistantId: AssistantId) => {
  try {
    const chats = await extractor.extractChatList();
    await sendNotification({ type: 'chat:list', assistantId, payload: chats });
  } catch (error) {
    await notifyExtractorError(assistantId, error, 'extractChatList');
  }
};

const handleExtractChat = async (
  extractor: AssistantExtractor,
  assistantId: AssistantId,
  target: any
) => {
  try {
    const details = await extractor.extractChat(target);
    await sendNotification({ type: 'chat:details', assistantId, payload: details });
  } catch (error) {
    await notifyExtractorError(assistantId, error, 'extractChat');
  }
};

const handleProcessPrompt = async (
  extractor: AssistantExtractor,
  assistantId: AssistantId,
  request: any
) => {
  try {
    if (request.conversation) {
      await extractor.openChat(request.conversation);
    }
    await extractor.sendPrompt(request);
    const response = await extractor.watchResponse(request, (delta) => {
      void sendNotification({ type: 'chat:delta', assistantId, payload: delta });
    });
    await sendNotification({ type: 'chat:response', assistantId, payload: response });
  } catch (error) {
    await notifyExtractorError(assistantId, error, 'sendPrompt', request.promptId);
  }
};

const handleRecorderCapture = (
  requestedAssistantId: AssistantId | 'unknown',
  detectedAssistantId: AssistantId
) => {
  const targetAssistant = requestedAssistantId === 'unknown' ? detectedAssistantId : requestedAssistantId;
  const html = document.documentElement?.outerHTML ?? '';
  const fixture: RecorderFixture = {
    id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `fixture-${Date.now()}`,
    assistantId: targetAssistant,
    capturedAt: new Date().toISOString(),
    url: window.location.href,
    title: document.title,
    html,
  };
  void sendNotification({ type: 'recorder:fixture', payload: fixture });
};
