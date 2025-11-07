/**
 * Generates a minimal HTML snapshot for a given DOM element.
 * This is useful for getting a clean representation of the page structure.
 * @param rootElement The root DOM element to start the snapshot from (e.g., document.body).
 * @returns A string containing the simplified HTML.
 */
export function snapshotHtml(rootElement: HTMLElement): string {
  const clone = rootElement.cloneNode(true) as HTMLElement;
  cleanupHtmlRecursive(clone);
  return clone.outerHTML;
}

/**
 * Recursively cleans up the HTML tree by removing unwanted elements and attributes.
 * This function modifies the element in place.
 * @param element The element to clean.
 */
function cleanupHtmlRecursive(element: Element) {
  // 1. Remove unwanted attributes
  const allowedAttributes = [
    "href",
    "src",
    "alt",
    "for",
    "type",
    "placeholder",
    "value",
    "checked",
    "disabled",
    "selected",
    "role",
    "aria-label",
    "aria-level",
    "aria-checked",
    "aria-expanded",
    "aria-disabled",
    "title",
  ];
  if (element.attributes) {
    const attrs = Array.from(element.attributes);
    for (const attr of attrs) {
      if (!allowedAttributes.includes(attr.name.toLowerCase())) {
        element.removeAttribute(attr.name);
      }
    }
  }

  // 2. Recurse on children and remove unwanted nodes
  const childNodes = Array.from(element.childNodes);
  for (const child of childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const childElement = child as Element;
      const tagName = childElement.tagName.toLowerCase();

      // Remove unwanted tags
      if (["script", "style", "link", "meta", "noscript"].includes(tagName)) {
        element.removeChild(childElement);
        continue;
      }

      // Filter out non-visible elements, similar to isElementVisible but applied during cleanup
      const style = window.getComputedStyle(childElement);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        style.opacity === "0"
      ) {
        element.removeChild(childElement);
        continue;
      }

      cleanupHtmlRecursive(childElement);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      element.removeChild(child);
    } else if (child.nodeType === Node.TEXT_NODE) {
      // Remove empty/whitespace-only text nodes
      if (child.textContent?.trim() === "") {
        element.removeChild(child);
      }
    }
  }
}
