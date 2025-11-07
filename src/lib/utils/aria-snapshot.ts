/**
 * The generated ARIA node, representing a semantic element in the tree.
 */
type AriaNode = {
  role: string;
  name: string;
  level?: number;
  disabled?: boolean;
  expanded?: boolean;
  checked?: boolean | "mixed";
  children: (AriaNode | string)[];
};

/**
 * Generates and renders a complete ARIA snapshot for a given DOM element.
 * @param rootElement The root DOM element to start the snapshot from (e.g., document.body).
 * @returns A YAML-like string representation of the ARIA tree.
 */
export function snapshotAria(rootElement: HTMLElement): string {
  const snapshot = generateAriaTree(rootElement);
  return renderAriaTree(snapshot);
}

/**
 * Generates the ARIA tree from a DOM element.
 * @param rootElement The root DOM element to start generating the tree from.
 * @returns The root AriaNode of the generated tree, or null if the element is not visible.
 */
export function generateAriaTree(rootElement: HTMLElement): AriaNode | null {
  return buildTreeRecursive(rootElement);
}

/**
 * Renders a generated ARIA tree into a YAML-like string.
 * @param rootNode The root AriaNode of the tree, or null.
 * @returns A string representing the tree in a human-readable format.
 */
export function renderAriaTree(rootNode: AriaNode | null): string {
  if (!rootNode) {
    return "";
  }
  const lines: string[] = [];
  renderNodeRecursive(rootNode, lines, 0);
  return lines.join("\n");
}

// --- Private Implementation ---

/**
 * Recursively builds the ARIA tree. This is the core logic.
 */
function buildTreeRecursive(element: Element): AriaNode | null {
  // 1. Filter out non-visible or presentation-only elements
  if (
    !isElementVisible(element) ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return null;
  }

  const role = getAriaRole(element);
  if (role === "presentation" || role === "none") {
    return null;
  }

  // 2. Determine the role and accessible name
  const name = getAccessibleName(element);

  // 3. Create the ARIA node
  const node: AriaNode = {
    role: role || "generic",
    name: name,
    children: [],
  };

  // 4. Gather states
  getAriaStates(element, node);

  // 5. Recurse on children
  const childNodes = element.childNodes;
  for (let i = 0; i < childNodes.length; i++) {
    const child = childNodes[i];

    if (child.nodeType === Node.ELEMENT_NODE) {
      const childNode = buildTreeRecursive(child as Element);
      if (childNode) {
        node.children.push(childNode);
      }
    } else if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        node.children.push(text);
      }
    }
  }

  // If a generic node has no name and only one child, hoist the child.
  if (node.role === "generic" && !node.name && node.children.length === 1) {
    const child = node.children[0];
    if (typeof child !== "string") return child;
  }

  return node;
}

/**
 * Recursively renders the ARIA node and its children to an array of strings.
 */
function renderNodeRecursive(node: AriaNode, lines: string[], indent: number) {
  const prefix = "  ".repeat(indent);
  let line = `${prefix}- ${node.role}`;

  if (node.name) {
    // Use JSON.stringify to handle quotes and special characters
    line += ` ${JSON.stringify(node.name)}`;
  }

  const attributes: string[] = [];
  if (node.disabled) attributes.push("disabled");
  if (node.expanded !== undefined) attributes.push(`expanded=${node.expanded}`);
  if (node.checked !== undefined) attributes.push(`checked=${node.checked}`);
  if (node.level) attributes.push(`level=${node.level}`);

  if (attributes.length > 0) {
    line += ` [${attributes.join(" ")}]`;
  }

  lines.push(line);

  node.children.forEach((child) => {
    if (typeof child === "string") {
      lines.push(`${prefix}  - text: ${JSON.stringify(child)}`);
    } else {
      renderNodeRecursive(child, lines, indent + 1);
    }
  });
}

/**
 * Determines if an element is visible to the user.
 */
function isElementVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0"
  );
}

/**
 * Determines the ARIA role of an element, considering both explicit and implicit roles.
 */
function getAriaRole(element: Element): string | null {
  const explicitRole = element.getAttribute("role");
  if (explicitRole) {
    return explicitRole;
  }

  // Simplified mapping of tag names to implicit ARIA roles
  const tagName = element.tagName.toLowerCase();
  switch (tagName) {
    case "a":
      return "link";
    case "button":
      return "button";
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return "heading";
    case "img":
      return "img";
    case "nav":
      return "navigation";
    case "ul":
      return "list";
    case "li":
      return "listitem";
    case "select":
      return "listbox";
    case "textarea":
      return "textbox";
    case "input":
      const type = (element as HTMLInputElement).type;
      switch (type) {
        case "button":
        case "submit":
        case "reset":
          return "button";
        case "checkbox":
          return "checkbox";
        case "radio":
          return "radio";
        case "range":
          return "slider";
        case "search":
          return "searchbox";
        default:
          return "textbox";
      }
    default:
      return null;
  }
}

/**
 * Calculates the accessible name of an element based on a simplified precedence order.
 */
function getAccessibleName(element: Element): string {
  // 1. aria-label
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel) {
    return ariaLabel;
  }

  // 2. Associated <label>
  if (element.id) {
    const label = document.querySelector(`label[for="${element.id}"]`);
    if (label) {
      return (label.textContent || "").trim();
    }
  }

  // 3. Direct text content (simplified)
  // We collect only top-level text nodes to avoid duplicating children's names.
  let directText = "";
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      directText += child.textContent;
    }
  }
  if (directText.trim()) {
    return directText.trim();
  }

  // 4. Placeholder for inputs
  if (element.hasAttribute("placeholder")) {
    return element.getAttribute("placeholder")!;
  }

  // 5. Alt attribute for images
  if (element.tagName.toLowerCase() === "img" && element.hasAttribute("alt")) {
    return element.getAttribute("alt")!;
  }

  // 6. Fallback to title attribute
  if (element.hasAttribute("title")) {
    return element.getAttribute("title")!;
  }

  return "";
}

/**
 * Gathers relevant ARIA states from an element and adds them to the AriaNode.
 */
function getAriaStates(element: Element, node: AriaNode) {
  if (
    element.hasAttribute("aria-disabled") &&
    element.getAttribute("aria-disabled") === "true"
  ) {
    node.disabled = true;
  }
  if (element.hasAttribute("aria-expanded")) {
    node.expanded = element.getAttribute("aria-expanded") === "true";
  }
  if (element.hasAttribute("aria-level")) {
    node.level = parseInt(element.getAttribute("aria-level")!, 10);
  }
  if (element.hasAttribute("aria-checked")) {
    const checked = element.getAttribute("aria-checked");
    if (checked === "true") node.checked = true;
    else if (checked === "false") node.checked = false;
    else if (checked === "mixed") node.checked = "mixed";
  }
}