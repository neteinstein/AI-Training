import type { ComponentProps } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders Markdown written by trainers (course descriptions, text pages).
 *
 * Safety: raw HTML in the source is dropped, the output is sanitised, links can only be
 * http(s) or mailto, and images are not rendered (they would load from other sites).
 *
 * Headings are renumbered so that the largest one used becomes an <h2>, because the page
 * supplies its own <h1>: a text written with "#" and one written with "##" both read well.
 */

type HastNode = { type: string; tagName?: string; children?: HastNode[] };

const HEADING = /^h([1-6])$/;

function eachHeading(node: HastNode, visit: (heading: HastNode, level: number) => void) {
  const match = node.type === "element" && node.tagName ? HEADING.exec(node.tagName) : null;
  if (match) visit(node, Number(match[1]));
  for (const child of node.children ?? []) eachHeading(child, visit);
}

/** Rehype plugin: moves all headings by the same amount, so the top level used is <h2>. */
function rehypeHeadingsFromH2() {
  return (tree: HastNode) => {
    let top = 6;
    eachHeading(tree, (_heading, level) => {
      top = Math.min(top, level);
    });
    const shift = 2 - top;
    if (shift === 0) return;
    eachHeading(tree, (heading, level) => {
      heading.tagName = `h${Math.min(6, level + shift)}`;
    });
  };
}

function ExternalLink({
  href,
  children,
  node: _node,
  ...props
}: ComponentProps<"a"> & { node?: unknown }) {
  const external = typeof href === "string" && /^https?:\/\//i.test(href);
  return (
    <a
      href={href}
      {...props}
      {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
    >
      {children}
    </a>
  );
}

function ScrollableTable({
  children,
  node: _node,
  ...props
}: ComponentProps<"table"> & { node?: unknown }) {
  return (
    // A wide table scrolls inside its own box instead of stretching the page.
    <div className="not-prose my-6 overflow-x-auto" tabIndex={0} role="group">
      <table {...props} className="w-full border-collapse text-[0.9375rem]">
        {children}
      </table>
    </div>
  );
}

const components: Components = {
  a: ExternalLink,
  table: ScrollableTable,
  th: ({ node: _node, ...props }) => (
    <th
      {...props}
      className="border-border bg-muted border px-3 py-2 text-left font-semibold"
      scope="col"
    />
  ),
  td: ({ node: _node, ...props }) => (
    <td {...props} className="border-border border px-3 py-2 align-top" />
  ),
};

export function Markdown({
  children,
  className,
  size = "base",
}: {
  children: string;
  className?: string;
  /** "reading" is the larger size used for text pages. */
  size?: "base" | "reading";
}) {
  return (
    <div
      className={cn(
        "prose text-foreground max-w-[68ch]",
        size === "reading" ? "text-lg leading-[1.65]" : "text-[1.0625rem] leading-[1.65]",
        // Headings: serif, per the style sheet.
        "prose-headings:font-heading prose-headings:font-semibold prose-headings:text-foreground prose-headings:tracking-[-0.01em]",
        "prose-h2:mt-9 prose-h2:mb-3 prose-h2:text-[1.625rem] prose-h2:leading-[1.3]",
        "prose-h3:mt-7 prose-h3:mb-2 prose-h3:text-[1.375rem] prose-h3:leading-[1.3]",
        "prose-h4:mt-6 prose-h4:mb-2 prose-h4:text-lg",
        "prose-p:my-4 prose-li:my-1.5 prose-strong:text-foreground prose-strong:font-semibold",
        "prose-a:text-primary prose-a:font-medium prose-a:underline prose-a:underline-offset-2 hover:prose-a:text-primary-hover",
        // Quotes and code as tinted panels, not left-border accents.
        "prose-blockquote:border-0 prose-blockquote:bg-accent prose-blockquote:text-foreground prose-blockquote:rounded-2xl prose-blockquote:px-4 prose-blockquote:py-3 prose-blockquote:font-normal prose-blockquote:not-italic",
        "prose-blockquote:[&_p]:my-0 prose-blockquote:[&_p]:before:content-none prose-blockquote:[&_p]:after:content-none",
        "prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-2xl prose-pre:px-4 prose-pre:py-3.5 prose-pre:text-[0.9375rem] prose-pre:leading-[1.6] prose-pre:whitespace-pre-wrap",
        "prose-code:text-foreground prose-code:font-mono prose-code:font-normal prose-code:before:content-none prose-code:after:content-none",
        "prose-hr:border-border prose-li:marker:text-muted-foreground",
        // No stray space above the first block or below the last one.
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize, rehypeHeadingsFromH2]}
        skipHtml
        disallowedElements={["img"]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
