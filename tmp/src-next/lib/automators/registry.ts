// src/lib/automators/registry.ts
// Central registry of all automators

import type { AutomatorRegistry } from './types';
import { chatgptAutomator } from './chatgpt';

/**
 * Registry of all available automators.
 * Each automator will be imported and added here as they are implemented.
 */
export const registry: AutomatorRegistry = [
  chatgptAutomator,
  // Additional automators will be added here:
  // grokAutomator,
  // geminiAutomator,
  // claudeAutomator,
];
