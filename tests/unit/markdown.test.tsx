import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "@/components/markdown/markdown";

const render = (source: string) => renderToStaticMarkup(<Markdown>{source}</Markdown>);

describe("Markdown rendering", () => {
  test("renders the formatting trainers use", () => {
    const html = render(
      [
        "# Título",
        "",
        "Um parágrafo com **negrito** e *itálico*.",
        "",
        "1. Papel",
        "2. Contexto",
        "",
        "| Momento | Tempo |",
        "| --- | --- |",
        "| Abertura | 10 min |",
        "",
        "```",
        "És um professor de Ciências.",
        "```",
        "",
        "> Reveja sempre a resposta.",
      ].join("\n"),
    );

    expect(html).toContain("<strong>negrito</strong>");
    expect(html).toContain("<em>itálico</em>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<table");
    expect(html).toContain("<pre>");
    expect(html).toContain("<blockquote>");
  });

  test("shifts headings down one level, since the page has its own h1", () => {
    const html = render("# Primeiro\n\n## Segundo\n\n### Terceiro");
    expect(html).not.toContain("<h1");
    expect(html).toContain("<h2>Primeiro</h2>");
    expect(html).toContain("<h3>Segundo</h3>");
    expect(html).toContain("<h4>Terceiro</h4>");
  });

  test("external links open in a new tab without handing over the opener", () => {
    const html = render(
      "[Wikipédia](https://pt.wikipedia.org/) e [contacto](mailto:a@example.org)",
    );
    expect(html).toContain(
      '<a href="https://pt.wikipedia.org/" target="_blank" rel="noopener noreferrer nofollow">',
    );
    expect(html).toContain('<a href="mailto:a@example.org">');
  });

  test.each([
    ["script element", "<script>alert(1)</script>"],
    ["inline event handler", '<img src="x" onerror="alert(1)">'],
    ["frame", '<iframe src="https://evil.example"></iframe>'],
    ["style element", "<style>body{display:none}</style>"],
    ["form", '<form action="https://evil.example"><input name="password"></form>'],
    ["svg with script", "<svg><script>alert(1)</script></svg>"],
    ["html inside a paragraph", 'Texto <b onclick="alert(1)">com</b> html'],
  ])("drops raw HTML: %s", (_label, source) => {
    const html = render(source);
    // The markup is gone. Text that sat between stripped inline tags may remain, as plain text.
    expect(html).not.toMatch(/<script|<iframe|<style|<form|<input|<svg|<b\b|onerror|onclick/i);
  });

  test.each([
    ["javascript link", "[clique](javascript:alert(1))"],
    ["javascript link with odd casing", "[clique](JaVaScRiPt:alert(1))"],
    ["data link", "[clique](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)"],
    ["vbscript link", "[clique](vbscript:msgbox(1))"],
    ["reference-style javascript link", "[clique][x]\n\n[x]: javascript:alert(1)"],
  ])("neutralises a %s", (_label, source) => {
    const html = render(source);
    expect(html).not.toMatch(/href="\s*(javascript|data|vbscript):/i);
    expect(html).toContain("clique");
  });

  test("does not load images from other sites", () => {
    const html = render("![rastreio](https://evil.example/pixel.png)\n\nTexto depois.");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example");
    expect(html).toContain("Texto depois.");
  });
});
