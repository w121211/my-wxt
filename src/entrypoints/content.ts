import { browser } from "wxt/browser";
import { getAutomatorByUrl } from "../lib/services/automators/registry";
import { snapshotAria } from "../lib/utils/aria-snapshot";
import { snapshotYaml } from "@/lib/utils/yaml-snapshot";
import type {
  AiAssistantAutomator,
  AiAssistantId,
} from "../lib/types/automators";
import type {
  BackgroundToContentCommand,
  ContentToBackgroundNotification,
} from "../lib/types/runtime";

declare global {
  interface Window {
    __automator__?: AiAssistantAutomator;
    __snapshotAria__?: (element: Element) => string;
    __snapshotYaml__?: (element: Element) => string;
  }
}

export default defineContentScript({
  matches: [
    "*://chat.openai.com/*",
    "*://chatgpt.com/*",
    "*://claude.ai/*",
    "*://gemini.google.com/*",
    "*://aistudio.google.com/*",
    "*://grok.com/*",
  ],
  async main() {
    // console.log("[my-wxt] content script main() started");
    const automator = getAutomatorByUrl(window.location.href);
    if (!automator) {
      console.log("[my-wxt] no automator found for this URL");
      return;
    }
    console.log("[my-wxt] automator found:", automator.id);
    const assistantId = automator.id;

    // Expose automator to window for DevTools inspector
    (window as any).__automator__ = automator;
    (window as any).__snapshotAria__ = snapshotAria;
    (window as any).__snapshotYaml__ = snapshotYaml;
    console.log(
      "[my-wxt] __automator__, __snapshotAria__, __snapshotYaml__ exposed to window"
    );

    // Listen for commands from the background script
    browser.runtime.onMessage.addListener(
      (command: BackgroundToContentCommand) => {
        // Recorder command can run on any page, even if the assistant isn't fully supported
        // if (command.type === 'recorder:capture') {
        //   handleRecorderCapture(command.assistantId, assistantId);
        //   return;
        // }

        // All other commands are assistant-specific
        if (command.assistantId !== assistantId) {
          return;
        }

        switch (command.type) {
          case "assistant:extract-chat-list":
            handleExtractChatList(automator, assistantId);
            break;
          case "assistant:extract-chat":
            handleExtractChat(automator, assistantId, command.payload);
            break;
          case "assistant:process-prompt":
            handleProcessPrompt(automator, assistantId, command.payload);
            break;
        }
      }
    );

    // Perform initial login check
    initializeLoginState(automator, assistantId);
  },
});

const sendNotification = (notification: ContentToBackgroundNotification) => {
  return browser.runtime.sendMessage(notification);
};

const notifyAutomatorError = (
  assistantId: AiAssistantId,
  error: unknown,
  context: string,
  messageId?: string
) => {
  return sendNotification({
    type: "chat:error",
    assistantId,
    payload: {
      code: "unexpected",
      message: `${context} failed: ${error}`,
      details: { context, messageId },
    },
  });
};

const initializeLoginState = async (
  automator: AiAssistantAutomator,
  assistantId: AiAssistantId
) => {
  try {
    const state = await automator.waitForLoggedIn({
      timeoutMs: 10_000,
      pollIntervalMs: 500,
    });
    await sendNotification({
      type: "assistant:login-state",
      assistantId,
      payload: state,
    });
  } catch (error) {
    await notifyAutomatorError(assistantId, error, "waitForLoggedIn");
  }
};

const handleExtractChatList = async (
  automator: AiAssistantAutomator,
  assistantId: AiAssistantId
) => {
  try {
    const chats = await automator.extractChatEntries();
    await sendNotification({ type: "chat:list", assistantId, payload: chats });
  } catch (error) {
    await notifyAutomatorError(assistantId, error, "extractChatEntries");
  }
};

const handleExtractChat = async (
  automator: AiAssistantAutomator,
  assistantId: AiAssistantId,
  target: any
) => {
  try {
    const details = await automator.extractChatPage(target);
    await sendNotification({
      type: "chat:details",
      assistantId,
      payload: details,
    });
  } catch (error) {
    await notifyAutomatorError(assistantId, error, "extractChatPage");
  }
};

const handleProcessPrompt = async (
  automator: AiAssistantAutomator,
  assistantId: AiAssistantId,
  request: any
) => {
  try {
    if (request.conversation) {
      await automator.openChat(request.conversation);
    }
    await automator.sendPrompt(request);
    const response = await automator.watchResponse(request, (delta) => {
      void sendNotification({
        type: "chat:delta",
        assistantId,
        payload: delta,
      });
    });
    await sendNotification({
      type: "chat:response",
      assistantId,
      payload: response,
    });
  } catch (error) {
    await notifyAutomatorError(
      assistantId,
      error,
      "sendPrompt",
      request.messageId
    );
  }
};
