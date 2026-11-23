/**
 * Builds a small, valid PDF with landscape pages (like exported slides).
 * Used by the test suites and the development seed, so no binary fixture is committed.
 */
export function buildSamplePdf(pageCount = 3, title = "AI Training"): Uint8Array {
  if (!/^[\x20-\x7e]*$/.test(title) || /[()\\]/.test(title)) {
    throw new Error("The sample PDF title must be plain ASCII without parentheses or backslashes.");
  }

  const pagesObject = 2;
  const fontObject = 3;
  const bodies: string[] = [
    `<< /Type /Catalog /Pages ${pagesObject} 0 R >>`,
    "", // pages tree, filled in below
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const pageObjects: number[] = [];

  for (let index = 0; index < pageCount; index += 1) {
    const pageObject = bodies.length + 1;
    const contentObject = pageObject + 1;
    pageObjects.push(pageObject);
    const content = [
      `BT /F1 30 Tf 72 300 Td (${title}) Tj ET`,
      `BT /F1 16 Tf 72 262 Td (Page ${index + 1} of ${pageCount}) Tj ET`,
    ].join("\n");
    bodies.push(
      `<< /Type /Page /Parent ${pagesObject} 0 R /MediaBox [0 0 720 405] ` +
        `/Resources << /Font << /F1 ${fontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`,
    );
    bodies.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  }

  bodies[pagesObject - 1] =
    `<< /Type /Pages /Kids [${pageObjects.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  // Everything is ASCII, so string offsets equal byte offsets.
  let output = "%PDF-1.4\n";
  const offsets: number[] = [];
  bodies.forEach((body, index) => {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefOffset = output.length;
  output += `xref\n0 ${bodies.length + 1}\n0000000000 65535 f \n`;
  output += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  output += `trailer\n<< /Size ${bodies.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return new TextEncoder().encode(output);
}
