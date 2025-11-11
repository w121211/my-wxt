// scripts/dev-ws-server.mjs
// Minimal WebSocket dev server that speaks the AiAssistantAutomatorV2 bridge protocol
// Run with: node scripts/dev-ws-server.mjs

import { WebSocketServer, WebSocket } from 'ws';
import readline from 'node:readline';
import process from 'node:process';

const DEFAULT_PORT = Number.parseInt(process.env.BRIDGE_PORT ?? '3456', 10);
const DEFAULT_ASSISTANT = process.env.BRIDGE_ASSISTANT ?? 'chatgpt';
const SUPPORTED_ASSISTANTS = new Set(['chatgpt', 'claude', 'gemini', 'grok']);

const wss = new WebSocketServer({ port: DEFAULT_PORT });
let activeSocket = null;
const activeWatches = new Map(); // watchId -> { assistant }

const prefix = (label) => `[^${label}]`;
const log = (...args) => console.log(prefix('server'), ...args);
const warn = (...args) => console.warn(prefix('warn'), ...args);
const error = (...args) => console.error(prefix('error'), ...args);

const infoConnectionState = () => {
  if (activeSocket?.readyState === WebSocket.OPEN) {
    log('Extension bridge connected');
  } else {
    warn(`Waiting for extension bridge on ws://127.0.0.1:${DEFAULT_PORT}`);
  }
};

const sendMessage = (message) => {
  if (!activeSocket || activeSocket.readyState !== WebSocket.OPEN) {
    warn('Cannot send message – no active bridge connection');
    return;
  }
  const payload = JSON.stringify(message);
  console.log(prefix('send'), payload);
  activeSocket.send(payload);
};

const randomId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const buildHelpText = () => `
Commands (assistant defaults to ${DEFAULT_ASSISTANT}):
  help                               Show this help text
  watch [assistant] [--chat=id]      Start watching the landing page or a chat
  unwatch <watchId> [assistant]      Stop an active watch (assistant inferred when possible)
  prompt [assistant] [--chat=id] ... Submit a prompt (use --chat to target existing chat)
  tests [assistant]                  Run the automator test suite (includes snapshots)
  close                              Request the extension to close the bridge
  exit | quit                        Terminate the dev server
`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});
rl.setPrompt('ws-dev> ');

const resolveAssistant = (token) =>
  token && SUPPORTED_ASSISTANTS.has(token) ? token : DEFAULT_ASSISTANT;

wss.on('connection', (socket, request) => {
  activeSocket = socket;
  log('Bridge connected from', request.socket.remoteAddress ?? 'unknown host');

  const helloMessage = {
    type: 'connection:hello',
    assistant: DEFAULT_ASSISTANT,
    port: DEFAULT_PORT,
    client: 'dev-ws-server',
  };
  sendMessage(helloMessage);

  socket.on('message', (data) => {
    console.log(prefix('recv'), data.toString());
  });

  socket.on('close', () => {
    warn('Bridge disconnected');
    activeSocket = null;
    infoConnectionState();
  });

  socket.on('error', (err) => {
    error('Socket error:', err);
  });
});

wss.on('listening', () => {
  log(`Dev WS server listening on ws://127.0.0.1:${DEFAULT_PORT}`);
  console.log(buildHelpText());
  infoConnectionState();
  rl.prompt();
});

wss.on('error', (err) => {
  error('WebSocket server error:', err);
  process.exitCode = 1;
});

const parsePromptCommand = (tokens) => {
  const result = { assistant: resolveAssistant(tokens[0]), chatId: undefined, text: '' };
  const startIndex = SUPPORTED_ASSISTANTS.has(tokens[0]) ? 1 : 0;
  const remaining = tokens.slice(startIndex);
  const textParts = [];

  for (let i = 0; i < remaining.length; i += 1) {
    const part = remaining[i];
    if (part === '--chat') {
      result.chatId = remaining[i + 1];
      i += 1;
      continue;
    }
    if (part.startsWith('--chat=')) {
      result.chatId = part.slice(7);
      continue;
    }
    textParts.push(part);
  }

  result.text = textParts.join(' ').trim();
  return result;
};

const parseWatchCommand = (tokens) => {
  const result = { assistant: resolveAssistant(tokens[0]), chatId: undefined, intervalMs: undefined };
  const startIndex = SUPPORTED_ASSISTANTS.has(tokens[0]) ? 1 : 0;
  const remaining = tokens.slice(startIndex);

  for (let i = 0; i < remaining.length; i += 1) {
    const part = remaining[i];
    if (part === '--chat') {
      result.chatId = remaining[i + 1];
      i += 1;
      continue;
    }
    if (part.startsWith('--chat=')) {
      result.chatId = part.slice(7);
      continue;
    }
    if (part === '--interval') {
      const value = Number.parseInt(remaining[i + 1], 10);
      if (!Number.isNaN(value)) {
        result.intervalMs = value;
      }
      i += 1;
      continue;
    }
    if (part.startsWith('--interval=')) {
      const value = Number.parseInt(part.slice(11), 10);
      if (!Number.isNaN(value)) {
        result.intervalMs = value;
      }
    }
  }

  return result;
};

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) {
    rl.prompt();
    return;
  }

  const [command, ...rest] = trimmed.split(/\s+/);

  switch (command) {
    case 'help':
      console.log(buildHelpText());
      break;
    case 'watch': {
      const { assistant, chatId, intervalMs } = parseWatchCommand(rest);
      const watchId = randomId('watch');
      const requestId = randomId('req');
      sendMessage({
        type: 'ws:watch-page',
        assistant,
        requestId,
        watchId,
        chatId,
        intervalMs,
      });
      activeWatches.set(watchId, { assistant });
      log(`Started watch ${watchId} for ${assistant}${chatId ? ` (chat: ${chatId})` : ''}`);
      break;
    }
    case 'unwatch': {
      if (!rest.length) {
        warn('Usage: unwatch <watchId> [assistant]');
        break;
      }
      const watchId = rest[0];
      const assistantOverride = rest[1] && SUPPORTED_ASSISTANTS.has(rest[1]) ? rest[1] : null;
      const watchMeta = activeWatches.get(watchId);
      const assistant = assistantOverride ?? watchMeta?.assistant;
      if (!assistant) {
        warn(`Unknown assistant for watch ${watchId}. Provide it explicitly.`);
        break;
      }
      sendMessage({
        type: 'ws:watch-page-stop',
        assistant,
        watchId,
      });
      activeWatches.delete(watchId);
      log(`Stopped watch ${watchId} (${assistant})`);
      break;
    }
    case 'prompt': {
      const { assistant, chatId, text } = parsePromptCommand(rest);
      if (!text) {
        warn('Usage: prompt [assistant] [--chat=id] <prompt text>');
        break;
      }
      const input = chatId ? { prompt: text, chatId } : { prompt: text };
      const requestId = randomId('req');
      sendMessage({ type: 'ws:submit-prompt', assistant, requestId, input });
      break;
    }
    case 'tests': {
      const assistant = resolveAssistant(rest[0]);
      const requestId = randomId('req');
      sendMessage({
        type: 'ws:run-tests',
        assistant,
        requestId,
      });
      break;
    }
    case 'close':
      sendMessage({ type: 'connection:close' });
      break;
    case 'exit':
    case 'quit':
      rl.close();
      break;
    default:
      warn(`Unknown command: ${command}`);
      console.log(buildHelpText());
  }

  rl.prompt();
});

rl.on('SIGINT', () => rl.close());

rl.on('close', () => {
  log('Shutting down dev WS server');
  activeSocket?.close();
  wss.close(() => process.exit(0));
});
