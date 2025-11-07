// lib/utils/selectors.ts
// DOM selector utilities for Chrome extension content scripts
// Replacement for Playwright Locator API

import type { CssSelector, SelectorSpec } from "../services/automators/types";

/**
 * Resolve a selector value to a CSS selector string or array
 * Extracts the selector from SelectorSpec objects or returns CssSelector as-is
 */
export function resolveCssSelector(
  value: CssSelector | SelectorSpec | undefined
): string | string[] {
  if (!value) return [];
  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }
  // It's a SelectorSpec - extract the selector property
  return value.selector || [];
}

/**
 * Try multiple selectors in order, return first matching element
 */
export function querySelector(
  selector: CssSelector | SelectorSpec,
  context: Document | Element = document
): Element | null {
  const selectorArray = resolveCssSelector(selector);

  for (const selector of selectorArray) {
    const element = context.querySelector(selector);
    if (element) return element;
  }

  return null;
}

/**
 * Try multiple selectors, return all matching elements
 */
export function querySelectorAll(
  selector: CssSelector | SelectorSpec,
  context: Document | Element = document
): Element[] {
  const selectorArray = resolveCssSelector(selector);

  for (const selector of selectorArray) {
    const elements = Array.from(context.querySelectorAll(selector));
    if (elements.length > 0) return elements;
  }

  return [];
}

/**
 * Wait for element to appear in DOM
 */
export function waitForElement(
  selector: CssSelector | SelectorSpec,
  options: {
    timeout?: number;
    context?: Document | Element;
    state?: "attached" | "detached" | "visible" | "hidden";
  } = {}
): Promise<Element> {
  const { timeout = 30000, context = document, state = "attached" } = options;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(
        new Error(`Timeout waiting for element: ${JSON.stringify(selector)}`)
      );
    }, timeout);

    // Check if element already exists
    const existing = querySelector(selector, context);
    if (existing && checkElementState(existing, state)) {
      clearTimeout(timeoutId);
      resolve(existing);
      return;
    }

    // Watch for element to appear
    const observer = new MutationObserver(() => {
      const element = querySelector(selector, context);
      if (element && checkElementState(element, state)) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(context instanceof Document ? context.body : context, {
      childList: true,
      subtree: true,
      attributes: state === "visible" || state === "hidden",
    });
  });
}

/**
 * Wait for element to disappear from DOM
 */
export function waitForElementDetached(
  selector: CssSelector | SelectorSpec,
  options: {
    timeout?: number;
    context?: Document | Element;
  } = {}
): Promise<void> {
  const { timeout = 30000, context = document } = options;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(
        new Error(
          `Timeout waiting for element detachment: ${JSON.stringify(selector)}`
        )
      );
    }, timeout);

    // Check if element already gone
    const existing = querySelector(selector, context);
    if (!existing) {
      clearTimeout(timeoutId);
      resolve();
      return;
    }

    // Watch for element to disappear
    const observer = new MutationObserver(() => {
      const element = querySelector(selector, context);
      if (!element) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve();
      }
    });

    observer.observe(context instanceof Document ? context.body : context, {
      childList: true,
      subtree: true,
    });
  });
}

/**
 * Check element visibility/attachment state
 */
function checkElementState(
  element: Element,
  state: "attached" | "detached" | "visible" | "hidden"
): boolean {
  switch (state) {
    case "attached":
      return document.contains(element);
    case "detached":
      return !document.contains(element);
    case "visible":
      return isVisible(element);
    case "hidden":
      return !isVisible(element);
  }
}

/**
 * Check if element is visible
 */
function isVisible(element: Element): boolean {
  if (!(element instanceof HTMLElement)) return true;

  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    element.offsetParent !== null
  );
}

/**
 * Click an element (with fallback to synthetic event)
 */
export function click(element: Element): void {
  if (element instanceof HTMLElement) {
    element.click();
  } else {
    element.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true })
    );
  }
}

/**
 * Fill input/textarea with text
 */
export function fill(element: Element, text: string): void {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    // Set value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype,
      "value"
    )?.set;

    nativeInputValueSetter?.call(element, text);

    // Trigger events that frameworks expect
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (element instanceof HTMLElement && element.isContentEditable) {
    element.textContent = text;
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

/**
 * Get text content from element
 */
export function getText(element: Element): string {
  return element.textContent?.trim() || "";
}

/**
 * Get attribute from element
 */
export function getAttribute(element: Element, attr: string): string | null {
  return element.getAttribute(attr);
}

/**
 * Extract data from element using field spec
 * @template T The expected return type shape
 * @returns The extracted data matching type T, or null if element not found
 */
export function extractData<T = unknown>(
  element: Element,
  spec: CssSelector | SelectorSpec
): T | null {
  // If spec is a plain CssSelector, find element and return text
  if (typeof spec === "string" || Array.isArray(spec)) {
    const targetElement = querySelector(spec, element);
    return (targetElement ? getText(targetElement) : null) as T | null;
  }

  // If selector provided, find nested element first
  const targetElement = spec.selector
    ? querySelector(resolveCssSelector(spec.selector), element)
    : element;

  if (!targetElement) return null;

  // If fields defined, extract nested structure
  if (spec.fields) {
    const result: Record<string, any> = {};
    for (const [key, fieldSpec] of Object.entries(spec.fields)) {
      result[key] = extractData(targetElement, fieldSpec);
    }
    return result as T;
  }

  // Extract attribute or text
  if (spec.attr) {
    return getAttribute(targetElement, spec.attr) as T | null;
  }

  return getText(targetElement) as T;
}

/**
 * Poll for condition to become true
 */
export function waitForCondition(
  condition: () => boolean,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const { timeout = 30000, interval = 100 } = options;

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      if (condition()) {
        resolve();
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error("Timeout waiting for condition"));
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}
