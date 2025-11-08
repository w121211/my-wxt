import { browser } from "wxt/browser";
import { WebsocketClient } from "../lib/services/websocket/client";
import { WebsocketRouter } from "../lib/services/websocket/router";
import type {
  ContentToBackgroundNotification,
  RuntimeMessage,
} from "../lib/types/runtime";

export default defineBackground(() => {
  let router: WebsocketRouter;
  const client = new WebsocketClient((message) => {
    console.log(message);
    router.handleMessage(message);
  });
  router = new WebsocketRouter(client);

  // Listen for messages from content scripts and popup
  browser.runtime.onMessage.addListener(
    (message: RuntimeMessage, sender, sendResponse) => {
      // Check if it's a notification from a content script
      if (isContentScriptNotification(message)) {
        // if (message.type === "recorder:fixture") {
        //   void recorderService.addFixture(message.payload);
        // } else {
        // }

        // Forward all other assistant notifications to the websocket server
        client.send(message);
      }

      // Other message types can be handled here if necessary
    }
  );

  // Start the websocket connection
  client.connect();

  return {
    onUnload() {
      client.disconnect();
      console.log("Background script unloaded");
    },
  };
});

// Type guards to differentiate incoming runtime messages

const contentNotificationTypes = new Set<
  ContentToBackgroundNotification["type"]
>([
  "assistant:login-state",
  "chat:list",
  "chat:details",
  "chat:delta",
  "chat:response",
  "chat:error",
  // "recorder:fixture",
]);

const isContentScriptNotification = (
  message: unknown
): message is ContentToBackgroundNotification => {
  return (
    !!message &&
    typeof message === "object" &&
    "type" in message &&
    typeof message.type === "string" &&
    contentNotificationTypes.has(
      message.type as ContentToBackgroundNotification["type"]
    )
  );
};
