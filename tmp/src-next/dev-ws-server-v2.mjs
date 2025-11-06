// scripts/dev-ws-server-v2.mjs
// Simple WebSocket server for testing automators
// Run with: node scripts/dev-ws-server-v2.mjs

import { WebSocket, WebSocketServer } from 'ws';
import readline from 'node:readline';

const defaultPort = Number.parseInt(process.env.WS_PORT ?? '8080', 10);
const assistants = new Set(['chatgpt', 'claude', 'gemini', 'grok']);

const wss = new WebSocketServer({ port: defaultPort });

let activeSocket = null;
let connId = null;
let requestCounter = 0;
let pendingRequests = new Map();

const logPrefix = (label) => `[\x1b[36m${label}\x1b[0m]`;

const log = (...messages) => {
  console.log(logPrefix('server'), ...messages);
};

const infoClientState = () => {
  if (activeSocket) {
    console.log(logPrefix('info'), 'Extension connected', connId ? `(${connId})` : '');
  } else {
    console.log(
      logPrefix('warn'),
      `Awaiting extension connection on ws://127.0.0.1:${defaultPort}`
    );
  }
};

const sendMessage = (message) => {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    console.log(logPrefix('warn'), 'No connected client; ignoring send request');
    return;
  }
  const payload = JSON.stringify(message);
  console.log(logPrefix('send'), payload);
  activeSocket.send(payload);
};

const generateRequestId = () => {
  requestCounter++;
  return `req-${requestCounter}-${Date.now()}`;
};

const helpText = `
Commands:
  help                                  Show this help text
  status                                Show connection status

  Action commands:
  send <automator> <prompt>            Send prompt (e.g., send chatgpt Hello)
  extract <automator>                  Extract chat entries
  ready <automator>                    Check if automator is ready

  Low-level commands:
  request <automator> <action> <json>  Send custom request with JSON params

  Server commands:
  exit                                 Stop the server

Examples:
  send chatgpt What is 2+2?
  extract chatgpt
  ready chatgpt
  request chatgpt sendPrompt {"prompt":"test"}
`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.setPrompt('ws> ');

const printHelp = () => console.log(helpText.trim());

wss.on('connection', (socket, request) => {
  activeSocket = socket;
  log('Extension connected', request.socket.remoteAddress ?? 'unknown client');

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log(logPrefix('recv'), JSON.stringify(msg, null, 2));

      if (msg.kind === 'hello') {
        connId = msg.connId;
        log('Received hello', connId);
        infoClientState();
      } else if (msg.kind === 'response') {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          console.log(logPrefix('result'), JSON.stringify(msg.data, null, 2));
          pendingRequests.delete(msg.id);
        }
      } else if (msg.kind === 'error') {
        const pending = pendingRequests.get(msg.id);
        if (pending) {
          console.log(
            logPrefix('error'),
            `[${msg.code}] ${msg.message}`,
            msg.details || ''
          );
          pendingRequests.delete(msg.id);
        } else {
          console.log(logPrefix('error'), `[${msg.code}] ${msg.message}`);
        }
      } else if (msg.kind === 'event') {
        console.log(
          logPrefix('event'),
          `${msg.automator} - ${msg.name}`,
          JSON.stringify(msg.data, null, 2)
        );
      }
    } catch (error) {
      console.error(logPrefix('error'), 'Failed to parse message', error);
    }
  });

  socket.on('close', () => {
    console.log(logPrefix('warn'), 'Extension disconnected');
    activeSocket = null;
    connId = null;
    infoClientState();
  });

  socket.on('error', (error) => {
    console.error(logPrefix('error'), 'Socket error', error);
  });
});

wss.on('listening', () => {
  log(`WebSocket server listening on ws://127.0.0.1:${defaultPort}`);
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

    case 'status':
      infoClientState();
      break;

    case 'send': {
      if (rest.length < 2) {
        console.log(logPrefix('warn'), 'Usage: send <automator> <prompt text>');
        break;
      }
      const [automator, ...promptParts] = rest;
      if (!assistants.has(automator)) {
        console.log(logPrefix('warn'), `Unknown automator: ${automator}`);
        console.log(logPrefix('info'), `Available: ${Array.from(assistants).join(', ')}`);
        break;
      }
      const prompt = promptParts.join(' ');
      const requestId = generateRequestId();
      pendingRequests.set(requestId, { automator, action: 'sendPrompt' });
      sendMessage({
        kind: 'request',
        v: 1,
        ts: Date.now(),
        id: requestId,
        automator,
        name: 'sendPrompt',
        data: { prompt },
      });
      break;
    }

    case 'extract': {
      if (rest.length < 1) {
        console.log(logPrefix('warn'), 'Usage: extract <automator>');
        break;
      }
      const automator = rest[0];
      if (!assistants.has(automator)) {
        console.log(logPrefix('warn'), `Unknown automator: ${automator}`);
        break;
      }
      const requestId = generateRequestId();
      pendingRequests.set(requestId, { automator, action: 'extractChatEntries' });
      sendMessage({
        kind: 'request',
        v: 1,
        ts: Date.now(),
        id: requestId,
        automator,
        name: 'extractChatEntries',
        data: {},
      });
      break;
    }

    case 'ready': {
      if (rest.length < 1) {
        console.log(logPrefix('warn'), 'Usage: ready <automator>');
        break;
      }
      const automator = rest[0];
      if (!assistants.has(automator)) {
        console.log(logPrefix('warn'), `Unknown automator: ${automator}`);
        break;
      }
      const requestId = generateRequestId();
      pendingRequests.set(requestId, { automator, action: 'isReady' });
      sendMessage({
        kind: 'request',
        v: 1,
        ts: Date.now(),
        id: requestId,
        automator,
        name: 'isReady',
        data: {},
      });
      break;
    }

    case 'request': {
      if (rest.length < 3) {
        console.log(
          logPrefix('warn'),
          'Usage: request <automator> <action> <json-params>'
        );
        break;
      }
      const [automator, action, ...jsonParts] = rest;
      if (!assistants.has(automator)) {
        console.log(logPrefix('warn'), `Unknown automator: ${automator}`);
        break;
      }
      try {
        const params = JSON.parse(jsonParts.join(' '));
        const requestId = generateRequestId();
        pendingRequests.set(requestId, { automator, action });
        sendMessage({
          kind: 'request',
          v: 1,
          ts: Date.now(),
          id: requestId,
          automator,
          name: action,
          data: params,
        });
      } catch (error) {
        console.log(logPrefix('error'), 'Invalid JSON params', error.message);
      }
      break;
    }

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
  console.log(logPrefix('server'), 'Shutting down server');
  activeSocket?.close();
  wss.close(() => process.exit(0));
});
