// lib/utils/selectors.ts
// DOM selector utilities for Chrome extension content scripts
// Replacement for Playwright Locator API

/**
 * Try multiple selectors in order, return first matching element
 */
export function querySelector(
  selectors: string | string[],
  context: Document | Element = document
): Element | null {
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

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
  selectors: string | string[],
  context: Document | Element = document
): Element[] {
  const selectorArray = Array.isArray(selectors) ? selectors : [selectors];

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
  selectors: string | string[],
  options: {
    timeout?: number;
    context?: Document | Element;
    state?: 'attached' | 'detached' | 'visible' | 'hidden';
  } = {}
): Promise<Element> {
  const {
    timeout = 30000,
    context = document,
    state = 'attached',
  } = options;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${JSON.stringify(selectors)}`));
    }, timeout);

    // Check if element already exists
    const existing = querySelector(selectors, context);
    if (existing && checkElementState(existing, state)) {
      clearTimeout(timeoutId);
      resolve(existing);
      return;
    }

    // Watch for element to appear
    const observer = new MutationObserver(() => {
      const element = querySelector(selectors, context);
      if (element && checkElementState(element, state)) {
        clearTimeout(timeoutId);
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(context instanceof Document ? context.body : context, {
      childList: true,
      subtree: true,
      attributes: state === 'visible' || state === 'hidden',
    });
  });
}

/**
 * Wait for element to disappear from DOM
 */
export function waitForElementDetached(
  selectors: string | string[],
  options: {
    timeout?: number;
    context?: Document | Element;
  } = {}
): Promise<void> {
  const { timeout = 30000, context = document } = options;

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element detachment: ${JSON.stringify(selectors)}`));
    }, timeout);

    // Check if element already gone
    const existing = querySelector(selectors, context);
    if (!existing) {
      clearTimeout(timeoutId);
      resolve();
      return;
    }

    // Watch for element to disappear
    const observer = new MutationObserver(() => {
      const element = querySelector(selectors, context);
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
function checkElementState(element: Element, state: 'attached' | 'detached' | 'visible' | 'hidden'): boolean {
  switch (state) {
    case 'attached':
      return document.contains(element);
    case 'detached':
      return !document.contains(element);
    case 'visible':
      return isVisible(element);
    case 'hidden':
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
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
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
    element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  }
}

/**
 * Fill input/textarea with text
 */
export function fill(element: Element, text: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    // Set value
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      'value'
    )?.set;

    nativeInputValueSetter?.call(element, text);

    // Trigger events that frameworks expect
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (element instanceof HTMLElement && element.isContentEditable) {
    element.textContent = text;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Get text content from element
 */
export function getText(element: Element): string {
  return element.textContent?.trim() || '';
}

/**
 * Get attribute from element
 */
export function getAttribute(element: Element, attr: string): string | null {
  return element.getAttribute(attr);
}

/**
 * Extract data from element using field spec
 */
export function extractData(
  element: Element,
  spec: {
    selector?: string | string[];
    attr?: string;
    fields?: Record<string, any>;
  }
): any {
  // If selector provided, find nested element first
  const targetElement = spec.selector
    ? querySelector(spec.selector, element)
    : element;

  if (!targetElement) return null;

  // If fields defined, extract nested structure
  if (spec.fields) {
    const result: Record<string, any> = {};
    for (const [key, fieldSpec] of Object.entries(spec.fields)) {
      result[key] = extractData(targetElement, fieldSpec);
    }
    return result;
  }

  // Extract attribute or text
  if (spec.attr) {
    return getAttribute(targetElement, spec.attr);
  }

  return getText(targetElement);
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
        reject(new Error('Timeout waiting for condition'));
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}
