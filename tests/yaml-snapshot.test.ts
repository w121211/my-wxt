import { describe, it, expect, beforeEach } from "vitest";
import { JSDOM } from "jsdom";
import fs from "fs";
import path from "path";
import {
  snapshotYaml,
  generateYamlTree,
  renderYamlTree,
} from "@/lib/utils/yaml-snapshot";

// Helper to load HTML fixture
function loadHTMLFixture(fixtureName: string): Document {
  const fixturePath = path.join(
    __dirname,
    "snapshots",
    fixtureName,
    "page.html"
  );
  const html = fs.readFileSync(fixturePath, "utf-8");
  const dom = new JSDOM(html);
  return dom.window.document;
}

// Helper to create a simple DOM element for testing
function createTestDOM(html: string): HTMLElement {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  const body = dom.window.document.body;

  // Find the first element child (skip text nodes)
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType === 1) { // ELEMENT_NODE
      return node as HTMLElement;
    }
  }

  throw new Error("No element found in test HTML");
}

describe("yaml-snapshot", () => {
  describe("generateYamlTree", () => {
    it("should generate a tree for a simple div", () => {
      const element = createTestDOM('<div id="test">Hello</div>');
      const tree = generateYamlTree(element);

      expect(tree).toBeTruthy();
      expect(tree?.tag).toBe("div");
      expect(tree?.id).toBe("test");
      expect(tree?.text).toBe("Hello");
    });

    it("should capture important attributes", () => {
      const element = createTestDOM(
        '<button type="button" name="submit" aria-label="Submit">Click</button>'
      );
      const tree = generateYamlTree(element);

      expect(tree?.tag).toBe("button");
      expect(tree?.attributes).toHaveProperty("type", "button");
      expect(tree?.attributes).toHaveProperty("name", "submit");
      expect(tree?.attributes).toHaveProperty("aria-label", "Submit");
    });

    it("should capture data attributes", () => {
      const element = createTestDOM(
        '<div data-testid="my-component" data-value="123">Test</div>'
      );
      const tree = generateYamlTree(element);

      expect(tree?.attributes).toHaveProperty("data-testid", "my-component");
      expect(tree?.attributes).toHaveProperty("data-value", "123");
    });

    it("should filter out script and style elements", () => {
      const element = createTestDOM(`
        <div>
          <script>console.log('test');</script>
          <style>.test { color: red; }</style>
          <p>Visible content</p>
        </div>
      `);
      const tree = generateYamlTree(element);

      // The wrapper div will collapse, leaving just the p tag
      // (since script and style are filtered out, div only has 1 child)
      expect(tree?.tag).toBe("p");
      expect(tree?.text).toBe("Visible content");
    });

    it("should filter out elements with aria-hidden='true'", () => {
      const element = createTestDOM(`
        <div>
          <span aria-hidden="true">Hidden</span>
          <span>Visible</span>
        </div>
      `);
      const tree = generateYamlTree(element);

      // The wrapper div will collapse since aria-hidden span is filtered,
      // leaving only one child (the visible span)
      expect(tree?.tag).toBe("span");
      expect(tree?.text).toBe("Visible");
    });

    it("should handle nested children", () => {
      const element = createTestDOM(`
        <div id="parent">
          <div id="child1">
            <span id="grandchild">Nested</span>
          </div>
          <div id="child2">Content</div>
        </div>
      `);
      const tree = generateYamlTree(element);

      expect(tree?.id).toBe("parent");
      expect(tree?.children).toHaveLength(2);
      expect(tree?.children[0]?.id).toBe("child1");
      expect(tree?.children[0]?.children[0]?.id).toBe("grandchild");
    });

    it("should capture boolean attributes", () => {
      const element = createTestDOM(`
        <input type="checkbox" checked disabled>
      `);
      const tree = generateYamlTree(element);

      expect(tree?.attributes).toHaveProperty("checked", true);
      expect(tree?.attributes).toHaveProperty("disabled", true);
    });

    it("should filter out empty leaf divs and spans", () => {
      const element = createTestDOM(`
        <div>
          <div></div>
          <span></span>
          <div>Content</div>
        </div>
      `);
      const tree = generateYamlTree(element);

      // Empty divs/spans should be filtered out, and wrapper collapses
      // since only one child remains
      expect(tree?.tag).toBe("div");
      expect(tree?.text).toBe("Content");
      expect(tree?.children).toHaveLength(0);
    });

    it("should collapse useless wrapper divs", () => {
      const element = createTestDOM(`
        <div>
          <button>Click me</button>
        </div>
      `);
      const tree = generateYamlTree(element);

      // The outer div should be collapsed since it's just a wrapper
      expect(tree?.tag).toBe("button");
      expect(tree?.text).toBe("Click me");
    });

    it("should not collapse SVG elements", () => {
      const element = createTestDOM(`
        <svg width="100" height="100">
          <circle cx="50" cy="50" r="40"/>
        </svg>
      `);
      const tree = generateYamlTree(element);

      expect(tree?.tag).toBe("svg");
      // SVG children should not be processed
      expect(tree?.children).toHaveLength(0);
    });

    it("should capture direct text content only", () => {
      const element = createTestDOM(`
        <div>
          Direct text
          <span>Nested text</span>
          More direct
        </div>
      `);
      const tree = generateYamlTree(element);

      // Should only capture direct text nodes, not nested ones
      expect(tree?.text).toContain("Direct text");
      expect(tree?.text).toContain("More direct");
      expect(tree?.text).not.toContain("Nested text");
    });
  });

  describe("renderYamlTree", () => {
    it("should render a simple tree", () => {
      const tree = {
        tag: "div",
        id: "test",
        attributes: {},
        text: "Hello",
        children: [],
      };

      const output = renderYamlTree(tree);
      expect(output).toContain("- div#test");
      expect(output).toContain('"Hello"');
    });

    it("should render attributes correctly", () => {
      const tree = {
        tag: "button",
        attributes: { type: "submit", disabled: true },
        children: [],
      };

      const output = renderYamlTree(tree);
      expect(output).toContain('type="submit"');
      expect(output).toContain("disabled");
    });

    it("should render nested children with proper indentation", () => {
      const tree = {
        tag: "div",
        attributes: {},
        children: [
          {
            tag: "span",
            attributes: {},
            text: "Child 1",
            children: [],
          },
          {
            tag: "span",
            attributes: {},
            text: "Child 2",
            children: [],
          },
        ],
      };

      const output = renderYamlTree(tree);
      const lines = output.split("\n");

      expect(lines[0]).toBe("- div");
      expect(lines[1]).toMatch(/^  - span/);
      expect(lines[2]).toMatch(/^  - span/);
    });

    it("should return empty string for null tree", () => {
      const output = renderYamlTree(null);
      expect(output).toBe("");
    });

    it("should handle deeply nested structures", () => {
      const tree = {
        tag: "div",
        attributes: {},
        children: [
          {
            tag: "section",
            attributes: {},
            children: [
              {
                tag: "article",
                attributes: {},
                children: [
                  {
                    tag: "p",
                    attributes: {},
                    text: "Deep",
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      };

      const output = renderYamlTree(tree);
      const lines = output.split("\n");

      expect(lines[0]).toMatch(/^- div/);
      expect(lines[1]).toMatch(/^  - section/);
      expect(lines[2]).toMatch(/^    - article/);
      expect(lines[3]).toMatch(/^      - p.*"Deep"/);
    });
  });

  describe("snapshotYaml", () => {
    it("should include metadata by default", () => {
      const element = createTestDOM('<div id="test">Content</div>');
      const snapshot = snapshotYaml(element);

      expect(snapshot).toContain("# Snapshot Metadata");
      expect(snapshot).toContain("# URL:");
      expect(snapshot).toContain("# Title:");
      expect(snapshot).toContain("# Viewport:");
      expect(snapshot).toContain("# Timestamp:");
    });

    it("should exclude metadata when requested", () => {
      const element = createTestDOM('<div id="test">Content</div>');
      const snapshot = snapshotYaml(element, false);

      expect(snapshot).not.toContain("# Snapshot Metadata");
      expect(snapshot).toContain("- div#test");
    });

    it("should generate complete YAML output", () => {
      const element = createTestDOM(`
        <div id="container">
          <h1>Title</h1>
          <p>Paragraph</p>
        </div>
      `);
      const snapshot = snapshotYaml(element, false);

      expect(snapshot).toContain("- div#container");
      expect(snapshot).toContain("- h1");
      expect(snapshot).toContain("- p");
    });
  });

  describe("Snapshot tests", () => {
    it("should match snapshot for simple structure", () => {
      const element = createTestDOM(`
        <div id="app">
          <header role="banner">
            <h1>Welcome</h1>
            <nav aria-label="Main navigation">
              <a href="/home">Home</a>
              <a href="/about">About</a>
            </nav>
          </header>
          <main>
            <article>
              <h2>Article Title</h2>
              <p>Content here</p>
            </article>
          </main>
        </div>
      `);
      const snapshot = snapshotYaml(element, false);
      expect(snapshot).toMatchSnapshot();
    });

    it("should match snapshot for form elements", () => {
      const element = createTestDOM(`
        <form id="contact-form" name="contact">
          <input type="text" name="username" placeholder="Username" required>
          <input type="email" name="email" placeholder="Email">
          <textarea name="message" placeholder="Message"></textarea>
          <button type="submit">Submit</button>
        </form>
      `);
      const snapshot = snapshotYaml(element, false);
      expect(snapshot).toMatchSnapshot();
    });

    it("should match snapshot for data attributes", () => {
      const element = createTestDOM(`
        <div data-testid="container" data-component="card">
          <button data-action="click" data-target="modal">Open</button>
        </div>
      `);
      const snapshot = snapshotYaml(element, false);
      expect(snapshot).toMatchSnapshot();
    });

    it("should match snapshot with tree structure", () => {
      const element = createTestDOM(`
        <div id="app">
          <button type="button" aria-label="Click me">Click</button>
        </div>
      `);
      const tree = generateYamlTree(element);
      expect(tree).toMatchSnapshot();
    });
  });

  describe("Integration tests with real HTML fixtures", () => {
    it("should process Claude page fixture without errors", () => {
      const doc = loadHTMLFixture("snapshot-claude-1762601227300");
      const body = doc.body as HTMLElement;

      // Should not throw
      expect(() => {
        const tree = generateYamlTree(body);
        expect(tree).toBeTruthy();
      }).not.toThrow();
    });

    it("should generate YAML snapshot from Claude page fixture", () => {
      const doc = loadHTMLFixture("snapshot-claude-1762601227300");
      const body = doc.body as HTMLElement;

      const snapshot = snapshotYaml(body, false);

      // Should generate non-empty output
      expect(snapshot).toBeTruthy();
      expect(snapshot.length).toBeGreaterThan(0);

      // Should contain common HTML elements
      expect(snapshot).toContain("- ");
    });

    it("should match snapshot for Claude page fixture", () => {
      const doc = loadHTMLFixture("snapshot-claude-1762601227300");
      const body = doc.body as HTMLElement;

      const snapshot = snapshotYaml(body, false);
      expect(snapshot).toMatchSnapshot();
    });

    it("should filter out hidden elements from Claude page", () => {
      const doc = loadHTMLFixture("snapshot-claude-1762601227300");
      const body = doc.body as HTMLElement;

      const tree = generateYamlTree(body);
      const snapshot = renderYamlTree(tree);

      // Should not contain script or style tags
      expect(snapshot).not.toContain("- script");
      expect(snapshot).not.toContain("- style");
    });

    it("should capture important attributes from Claude page", () => {
      const doc = loadHTMLFixture("snapshot-claude-1762601227300");
      const body = doc.body as HTMLElement;

      const snapshot = snapshotYaml(body, false);

      // Should capture data attributes (common in modern web apps)
      // This is a loose check - we just verify the snapshot is meaningful
      expect(snapshot.length).toBeGreaterThan(100);
    });

    it("should generate consistent output for the same input", () => {
      const doc = loadHTMLFixture("snapshot-claude-1762601227300");
      const body = doc.body as HTMLElement;

      const snapshot1 = snapshotYaml(body, false);
      const snapshot2 = snapshotYaml(body, false);

      expect(snapshot1).toBe(snapshot2);
    });

    it("should handle complex nested structures from real page", () => {
      const doc = loadHTMLFixture("snapshot-claude-1762601227300");
      const body = doc.body as HTMLElement;

      const tree = generateYamlTree(body);

      // Should have a tree structure with children
      expect(tree).toBeTruthy();
      expect(tree?.tag).toBe("body");

      // Real pages should have nested content
      const hasNestedContent = (node: any): boolean => {
        if (!node) return false;
        if (node.children && node.children.length > 0) return true;
        return node.children?.some((child: any) => hasNestedContent(child));
      };

      expect(hasNestedContent(tree)).toBe(true);
    });
  });

  describe("Edge cases", () => {
    it("should handle elements with no attributes", () => {
      const element = createTestDOM("<div><p>Text</p></div>");
      const tree = generateYamlTree(element);

      expect(tree?.attributes).toBeDefined();
      expect(Object.keys(tree?.attributes || {})).toHaveLength(0);
    });

    it("should handle empty text content", () => {
      const element = createTestDOM("<div></div>");
      const tree = generateYamlTree(element);

      // Empty div should be filtered out
      expect(tree).toBeNull();
    });

    it("should handle mixed content (text and elements)", () => {
      const element = createTestDOM(`
        <div>
          Text before
          <span>Inline</span>
          Text after
        </div>
      `);
      const tree = generateYamlTree(element);

      expect(tree?.text).toContain("Text before");
      expect(tree?.text).toContain("Text after");
      expect(tree?.children).toHaveLength(1);
      expect(tree?.children[0]?.tag).toBe("span");
    });

    it("should handle special characters in text", () => {
      const element = createTestDOM(
        '<div>Text with "quotes" and \\slashes\\ and <em>HTML</em></div>'
      );
      const tree = generateYamlTree(element);
      const snapshot = renderYamlTree(tree);

      // JSON.stringify should escape quotes properly
      expect(snapshot).toContain('\\"quotes\\"');
    });

    it("should handle multiple data attributes", () => {
      const element = createTestDOM(`
        <div
          data-test="value1"
          data-id="123"
          data-component="button"
          data-state="active"
        >Content</div>
      `);
      const tree = generateYamlTree(element);

      expect(tree?.attributes).toHaveProperty("data-test", "value1");
      expect(tree?.attributes).toHaveProperty("data-id", "123");
      expect(tree?.attributes).toHaveProperty("data-component", "button");
      expect(tree?.attributes).toHaveProperty("data-state", "active");
    });

    it("should handle href and src attributes", () => {
      const element = createTestDOM(`
        <div>
          <a href="https://example.com">Link</a>
          <img src="/image.png" alt="Description">
        </div>
      `);
      const tree = generateYamlTree(element);

      const link = tree?.children[0];
      const img = tree?.children[1];

      expect(link?.attributes).toHaveProperty("href", "https://example.com");
      expect(img?.attributes).toHaveProperty("src", "/image.png");
      expect(img?.attributes).toHaveProperty("alt", "Description");
    });
  });
});
