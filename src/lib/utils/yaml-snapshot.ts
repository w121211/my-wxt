/**
 * This script generates a simplified DOM snapshot of a webpage, designed to
 * help developers easily write selectors for automation and testing. It captures
 * essential structural and attribute information while filtering out noise.
 */

// --- Public Types ---

/**
 * Metadata about the page snapshot.
 */
export type SnapshotMetadata = {
  url: string;
  title: string;
  viewport: {
    width: number;
    height: number;
  };
  timestamp: string;
  userAgent: string;
};

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
 * @param includeMetadata Whether to include page metadata at the top of the output (default: true).
 * @returns A YAML-like string representation of the simplified DOM tree.
 */
export function snapshotYaml(rootElement: HTMLElement, includeMetadata: boolean = true): string {
  const snapshot = generateYamlTree(rootElement);
  let output = "";

  if (includeMetadata) {
    const metadata = generateMetadata();
    output += renderMetadata(metadata) + "\n\n";
  }

  output += renderYamlTree(snapshot);
  return output;
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
  "name",
  "placeholder",
  "alt",
  "href",
  "src",
  "for",
  "type",
  "value",
  "role",
  "data-*", // All data attributes
  "aria-*", // All ARIA attributes
];

/**
 * Generates metadata about the current page.
 */
export function generateMetadata(): SnapshotMetadata {
  return {
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  };
}

/**
 * Renders metadata as a YAML-like comment block.
 */
export function renderMetadata(metadata: SnapshotMetadata): string {
  return `# Snapshot Metadata
# URL: ${metadata.url}
# Title: ${metadata.title}
# Viewport: ${metadata.viewport.width}x${metadata.viewport.height}
# Timestamp: ${metadata.timestamp}
# User Agent: ${metadata.userAgent}`;
}

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

  // Get all attribute names from the element
  const elementAttrs = element.getAttributeNames();

  // Check each attribute against IMPORTANT_ATTRIBUTES patterns
  for (const elementAttr of elementAttrs) {
    for (const pattern of IMPORTANT_ATTRIBUTES) {
      if (matchesAttributePattern(elementAttr, pattern)) {
        attrs[elementAttr] = element.getAttribute(elementAttr) || "";
        break; // Don't check other patterns once matched
      }
    }
  }

  // Add state attributes
  if ((element as HTMLInputElement).disabled) attrs["disabled"] = true;
  if ((element as HTMLInputElement).checked) attrs["checked"] = true;
  if ((element as HTMLSelectElement).multiple) attrs["multiple"] = true;

  return attrs;
}

/**
 * Checks if an attribute name matches a pattern (supports wildcards like "data-*").
 */
function matchesAttributePattern(attrName: string, pattern: string): boolean {
  if (pattern.endsWith("-*")) {
    const prefix = pattern.slice(0, -1); // Remove the "*"
    return attrName.startsWith(prefix);
  }
  return attrName === pattern;
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
