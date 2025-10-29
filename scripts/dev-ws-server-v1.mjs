// scripts/dev-bridge-server.mjs
// Run with: node scripts/dev-bridge-server.mjs

import { WebSocket, WebSocketServer } from 'ws';
import readline from 'node:readline';

const defaultPort = Number.parseInt(process.env.BRIDGE_PORT ?? '3456', 10);
const defaultAssistant = process.env.BRIDGE_ASSISTANT ?? 'chatgpt';
const assistants = new Set(['chatgpt', 'claude', 'gemini', 'grok']);

const wss = new WebSocketServer({ port: defaultPort });

let activeSocket = null;

const logPrefix = (label) => `[\x1b[36m${label}\x1b[0m]`;

const log = (...messages) => {
  console.log(logPrefix('server'), ...messages);
};

const infoClientState = () => {
  if (activeSocket) {
    console.log(logPrefix('info'), 'Background bridge connected');
  } else {
    console.log(
      logPrefix('warn'),
      `Awaiting bridge connection on ws://127.0.0.1:${defaultPort}`
    );
  }
};

const sendMessage = (message) => {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    console.log(logPrefix('warn'), 'No connected bridge; ignoring send request');
    return;
  }
  const payload = JSON.stringify(message);
  console.log(logPrefix('send'), payload);
  activeSocket.send(payload);
};

const randomPromptId = () =>
  `prompt-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;

const helpText = `
Commands:
  help                       Show this help text
  list [assistant]           Request current chat list (assistant defaults to ${defaultAssistant})
  prompt [assistant] <text>  Send a prompt to the assistant
  close                      Ask the extension to close the bridge
  exit                       Stop the dev server
`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.setPrompt('bridge> ');

const printHelp = () => console.log(helpText.trim());

wss.on('connection', (socket, request) => {
  activeSocket = socket;
  log(
    'Bridge connected',
    request.socket.remoteAddress ?? 'unknown client'
  );
  const hello = {
    type: 'bridge:hello',
    assistant: defaultAssistant,
    port: defaultPort,
    client: 'dev-bridge',
  };
  sendMessage(hello);

  socket.on('message', (data) => {
    console.log(logPrefix('recv'), data.toString());
  });

  socket.on('close', () => {
    console.log(logPrefix('warn'), 'Bridge disconnected');
    activeSocket = null;
    infoClientState();
  });

  socket.on('error', (error) => {
    console.error(logPrefix('error'), 'Socket error', error);
  });
});

wss.on('listening', () => {
  log(`Dev bridge listening on ws://127.0.0.1:${defaultPort}`);
  infoClientState();
  printHelp();
  rl.prompt();
});

wss.on('error', (error) => {
  console.error(logPrefix('error'), 'WebSocket server error', error);
  process.exitCode = 1;
});

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  const [command, ...rest] = trimmed.split(/\s+/);

  switch (command) {
    case 'help':
      printHelp();
      break;
    case 'list': {
      const maybeAssistant = rest[0];
      const assistant = assistants.has(maybeAssistant)
        ? maybeAssistant
        : defaultAssistant;
      sendMessage({
        type: 'chat:list',
        assistant,
      });
      break;
    }
    case 'prompt': {
      if (!rest.length) {
        console.log(
          logPrefix('warn'),
          'Usage: prompt [assistant] <message text>'
        );
        break;
      }
      const maybeAssistant = rest[0];
      const assistant = assistants.has(maybeAssistant)
        ? maybeAssistant
        : defaultAssistant;
      const textParts = assistants.has(maybeAssistant)
        ? rest.slice(1)
        : rest;
      const promptText = textParts.join(' ');
      if (!promptText) {
        console.log(logPrefix('warn'), 'Provide text for the prompt payload');
        break;
      }
      sendMessage({
        type: 'chat:prompt',
        assistant,
        request: {
          promptId: randomPromptId(),
          prompt: promptText,
        },
      });
      break;
    }
    case 'close':
      sendMessage({ type: 'bridge:close' });
      break;
    case 'exit':
    case 'quit':
      rl.close();
      break;
    default:
      console.log(logPrefix('warn'), `Unknown command: ${command}`);
      printHelp();
  }

  rl.prompt();
});

rl.on('SIGINT', () => {
  rl.close();
});

rl.on('close', () => {
  console.log(logPrefix('server'), 'Closing dev bridge');
  activeSocket?.close();
  wss.close(() => process.exit(0));
});
