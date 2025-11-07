/**
 * This script generates a simplified DOM snapshot of a webpage, designed to
 * help developers easily write selectors for automation and testing. It captures
 * essential structural and attribute information while filtering out noise.
 */

// --- Public Types ---

/**
 * The generated YAML node, representing a simplified element in the tree.
 */
type YamlNode = {
  tag: string;
  id?: string;
  // CSS Classes are intentionally removed for simplicity.
  attributes: Record<string, string | boolean>;
  text?: string;
  children: YamlNode[];
};

// --- Public API ---

/**
 * Generates and renders a complete DOM snapshot for a given DOM element.
 * @param rootElement The root DOM element to start the snapshot from (e.g., document.body).
 * @returns A YAML-like string representation of the simplified DOM tree.
 */
export function snapshotYaml(rootElement: HTMLElement): string {
  const snapshot = generateYamlTree(rootElement);
  return renderYamlTree(snapshot);
}

/**
 * Generates the simplified DOM tree from a DOM element.
 * @param rootElement The root DOM element to start generating the tree from.
 * @returns The root YamlNode of the generated tree, or null if the element is not visible.
 */
export function generateYamlTree(rootElement: HTMLElement): YamlNode | null {
  return buildTreeRecursive(rootElement);
}

/**
 * Renders a generated DOM tree into our custom YAML-like string format.
 * @param rootNode The root YamlNode of the tree, or null.
 * @returns A string representing the tree in a human-readable format.
 */
export function renderYamlTree(rootNode: YamlNode | null): string {
  if (!rootNode) {
    return "";
  }
  const lines: string[] = [];
  renderNodeRecursive(rootNode, lines, 0);
  return lines.join("\n");
}

// --- Private Implementation ---

// NOISY_CLASSES_REGEX and getFilteredClasses are removed as all classes are being omitted.
const IMPORTANT_ATTRIBUTES = [
  "data-testid",
  "data-cy",
  "data-qa",
  "name",
  "placeholder",
  "alt",
  "href",
  "src",
  "for",
  "type",
  "value",
  "role", // Keep ARIA role
];

/**
 * Recursively builds the simplified DOM tree.
 */
function buildTreeRecursive(element: Element): YamlNode | null {
  const tag = element.tagName.toLowerCase();

  // 1. Filter out non-visible, script, style, or hidden elements
  if (
    !isElementVisible(element) ||
    ["script", "style", "link", "meta"].includes(tag) ||
    element.getAttribute("aria-hidden") === "true"
  ) {
    return null;
  }

  // 2. Create the YamlNode
  const node: YamlNode = {
    tag,
    id: element.id || undefined,
    attributes: getImportantAttributes(element),
    text: getDirectText(element) || undefined,
    children: [],
  };

  // 3. Recurse on children (unless it's an SVG)
  if (tag !== 'svg') {
    const childNodes = element.children;
    for (let i = 0; i < childNodes.length; i++) {
      const childNode = buildTreeRecursive(childNodes[i]);
      if (childNode) {
        node.children.push(childNode);
      }
    }
  }

  // 4. Filter out "empty leaf" nodes (divs/spans with no text, children, or attributes)
  const isEmptyLeaf =
    (node.tag === 'div' || node.tag === 'span') &&
    !node.text &&
    node.children.length === 0 &&
    Object.keys(node.attributes).length === 0;

  if (isEmptyLeaf) {
    return null; // Discard this node
  }

  // 5. Collapse useless wrappers
  const isWrapper =
    node.tag === 'div' &&
    !node.id &&
    !node.text &&
    Object.keys(node.attributes).length === 0 &&
    node.children.length === 1 &&
    typeof node.children[0] !== 'string';

  if (isWrapper) {
    return node.children[0] as YamlNode;
  }

  return node;
}

/**
 * Recursively renders the YamlNode and its children to an array of strings.
 */
function renderNodeRecursive(node: YamlNode, lines: string[], indent: number) {
  const prefix = "  ".repeat(indent);
  let line = `${prefix}- ${node.tag}`;

  if (node.id) {
    line += `#${node.id}`;
  }

  const attrs = Object.entries(node.attributes);
  if (attrs.length > 0) {
    const attrStrings = attrs.map(([key, value]) =>
      value === true ? key : `${key}=${JSON.stringify(value)}`
    );
    line += ` [${attrStrings.join(", ")}]`;
  }

  if (node.text) {
    line += `: ${JSON.stringify(node.text)}`;
  }

  lines.push(line);

  node.children.forEach((child) => {
    renderNodeRecursive(child, lines, indent + 1);
  });
}

// --- Helper Functions ---

// getFilteredClasses function is removed.

function getImportantAttributes(element: Element): Record<string, string | boolean> {
  const attrs: Record<string, string | boolean> = {};
  for (const attr of IMPORTANT_ATTRIBUTES) {
    if (element.hasAttribute(attr)) {
      attrs[attr] = element.getAttribute(attr) || "";
    }
  }
  // Add state attributes
  if ((element as HTMLInputElement).disabled) attrs["disabled"] = true;
  if ((element as HTMLInputElement).checked) attrs["checked"] = true;
  if ((element as HTMLSelectElement).multiple) attrs["multiple"] = true;
  if (element.hasAttribute("aria-expanded")) {
    attrs["aria-expanded"] = element.getAttribute("aria-expanded")!;
  }

  return attrs;
}

function getDirectText(element: Element): string {
  let text = "";
  for (const child of Array.from(element.childNodes)) {
    if (
      child.nodeType === Node.TEXT_NODE &&
      child.textContent?.trim()
    ) {
      text += ` ${child.textContent.trim()}`;
    }
  }
  return text.trim();
}

function isElementVisible(element: Element): boolean {
  // Basic visibility check
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}
