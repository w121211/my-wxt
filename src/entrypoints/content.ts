import { browser } from "wxt/browser";
import { getAutomatorByUrl } from "../lib/services/automators/registry";
import { snapshotAria } from "../lib/utils/aria-snapshot";
import { snapshotYaml } from "../lib/utils/yaml-snapshot";
import type {
  BackgroundToContentCommand,
  ContentToBackgroundNotification,
} from "../lib/types/runtime";
import type {
  AiAssistantAutomatorV2,
  AiAssistantId,
  ChatTarget,
  SubmitPromptInput,
  ConversationRef,
} from "../lib/types/automators-v2";

declare global {
  interface Window {
    __automator__?: AiAssistantAutomatorV2;
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

    // Listen for commands from the background script and devtools panel
    browser.runtime.onMessage.addListener(
      (message: any, _sender, sendResponse) => {
        // Handle devtools panel function testing
        if (message.type === "TEST_AUTOMATOR_FUNCTION") {
          handleTestAutomatorFunction(automator, message)
            .then(sendResponse)
            .catch((error) => {
              console.error("[Content] Error in handleTestAutomatorFunction:", error);
              sendResponse({
                success: false,
                error: error.message || String(error),
              });
            });
          return true; // Indicates we will send a response asynchronously
        }

        // Handle background script commands
        const command = message as BackgroundToContentCommand;
        // All other commands are assistant-specific
        if (command.assistantId !== assistantId) {
          return;
        }

        switch (command.type) {
          case "assistant:get-chat-list":
            handleGetChatList(automator, assistantId);
            break;
          case "assistant:get-chat-page":
            handleGetChatPage(automator, assistantId, command.payload);
            break;
          case "assistant:submit-prompt":
            handleSubmitPrompt(automator, assistantId, command.payload);
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
  automator: AiAssistantAutomatorV2,
  assistantId: AiAssistantId
) => {
  try {
    const state = await automator.getLoginState({
      timeoutMs: 10_000,
      pollIntervalMs: 500,
    });
    await sendNotification({
      type: "assistant:login-state",
      assistantId,
      payload: state,
    });
  } catch (error) {
    await notifyAutomatorError(assistantId, error, "getLoginState");
  }
};

const handleGetChatList = async (
  automator: AiAssistantAutomatorV2,
  assistantId: AiAssistantId
) => {
  try {
    const chats = await automator.getChatEntries();
    await sendNotification({ type: "chat:list", assistantId, payload: chats });
  } catch (error) {
    await notifyAutomatorError(assistantId, error, "getChatEntries");
  }
};

const handleGetChatPage = async (
  automator: AiAssistantAutomatorV2,
  assistantId: AiAssistantId,
  target: ChatTarget
) => {
  try {
    const chatPage = await automator.getChatPage(target);
    await sendNotification({
      type: "chat:page",
      assistantId,
      payload: chatPage,
    });
  } catch (error) {
    await notifyAutomatorError(assistantId, error, "getChatPage");
  }
};

const handleSubmitPrompt = async (
  automator: AiAssistantAutomatorV2,
  assistantId: AiAssistantId,
  input: SubmitPromptInput
) => {
  try {
    // Submit the prompt
    const result = await automator.submitPrompt(input);

    // Notify that prompt was submitted
    await sendNotification({
      type: "prompt:submitted",
      assistantId,
      payload: result,
    });

    // Watch the conversation status and forward updates
    const conversationRef: ConversationRef = {
      messageId: result.messageId,
      chatId: result.chatId,
    };

    automator.watchConversationStatus(conversationRef, async (status) => {
      await sendNotification({
        type: "conversation:status",
        assistantId,
        payload: status,
      });
    });
  } catch (error) {
    await notifyAutomatorError(assistantId, error, "submitPrompt");
  }
};

// Handle function testing from devtools panel
const handleTestAutomatorFunction = async (
  automator: AiAssistantAutomatorV2,
  message: { functionName: string; args: any[] }
) => {
  const { functionName, args } = message;

  console.log("[Content] Testing automator function:", functionName, "with args:", args);

  try {
    // Check if the function exists on the automator
    if (typeof (automator as any)[functionName] !== "function") {
      console.error("[Content] Function not found:", functionName);
      return {
        success: false,
        error: `Function "${functionName}" not found on automator`,
      };
    }

    // Execute the function
    const result = await (automator as any)[functionName](...args);
    console.log("[Content] Function result:", result);

    return {
      success: true,
      data: result,
    };
  } catch (error: any) {
    console.error("[Content] Error executing function:", error);
    return {
      success: false,
      error: error.message || String(error),
    };
  }
};
