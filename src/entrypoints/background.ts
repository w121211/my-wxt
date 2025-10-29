// entrypoints/background.ts

import { browser } from 'wxt/browser';
import { WebsocketClient } from '../lib/services/websocket/client';
import { WebsocketRouter } from '../lib/services/websocket/router';
import { RecorderService } from '../lib/services/recorder/service';
import { detectAssistantFromUrl } from '../lib/assistants/hosts';
import type {
  ContentToBackgroundNotification,
  PopupToBackgroundRequest,
  RuntimeMessage,
} from '../lib/types/runtime';

export default defineBackground(() => {
  const recorderService = new RecorderService();

  let router: WebsocketRouter;
  const client = new WebsocketClient((message) => {
    router.handleMessage(message);
  });
  router = new WebsocketRouter(client);

  // Listen for messages from content scripts and popup
  browser.runtime.onMessage.addListener((message: RuntimeMessage, sender, sendResponse) => {
    // Check if it's a request from the popup that expects a response
    if (isPopupRequest(message)) {
      recorderService.handleRequest(message).then(sendResponse).catch(console.error);
      return true; // Indicates that the response is sent asynchronously
    }

    // Check if it's a notification from a content script
    if (isContentScriptNotification(message)) {
      if (message.type === 'recorder:fixture') {
        void recorderService.addFixture(message.payload);
      } else {
        // Forward all other assistant notifications to the websocket server
        client.send(message);
      }
    }

    // Other message types can be handled here if necessary
  });

  // Listen for tab updates to trigger the recorder
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (!recorderService.isRecording() || changeInfo.status !== 'complete') {
      return;
    }
    const assistant = detectAssistantFromUrl(tab.url);
    if (!assistant) {
      return;
    }
    void browser.tabs.sendMessage(tabId, {
      type: 'recorder:capture',
      assistantId: assistant,
    });
  });

  // Start the websocket connection
  client.connect();

  return {
    onUnload() {
      client.disconnect();
      console.log('Background script unloaded');
    },
  };
});

// Type guards to differentiate incoming runtime messages

const popupRequestTypes = new Set<PopupToBackgroundRequest['type']>([
  'recorder:get-state',
  'recorder:set-recording',
  'recorder:clear-fixtures',
  'recorder:download-all',
  'recorder:get-fixture',
]);

const isPopupRequest = (message: unknown): message is PopupToBackgroundRequest => {
  return (
    !!message &&
    typeof message === 'object' &&
    'type' in message &&
    typeof message.type === 'string' &&
    popupRequestTypes.has(message.type as PopupToBackgroundRequest['type'])
  );
};

const contentNotificationTypes = new Set<ContentToBackgroundNotification['type']>([
  'assistant:login-state',
  'chat:list',
  'chat:details',
  'chat:delta',
  'chat:response',
  'chat:error',
  'recorder:fixture',
]);

const isContentScriptNotification = (
  message: unknown
): message is ContentToBackgroundNotification => {
  return (
    !!message &&
    typeof message === 'object' &&
    'type' in message &&
    typeof message.type === 'string' &&
    contentNotificationTypes.has(message.type as ContentToBackgroundNotification['type'])
  );
};
