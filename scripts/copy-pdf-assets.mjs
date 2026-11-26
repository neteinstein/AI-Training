// Copies the PDF viewer's worker, character maps and standard fonts from the installed
// pdfjs-dist package into public/pdfjs, where the browser can load them from our own origin.
// Runs after every install, so the copied files always match the installed version.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "node_modules", "pdfjs-dist");
const target = join(root, "public", "pdfjs");

if (!existsSync(source)) {
  console.warn("pdfjs-dist is not installed; skipping the PDF viewer assets.");
  process.exit(0);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(join(source, "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.min.mjs"));
cpSync(join(source, "cmaps"), join(target, "cmaps"), { recursive: true });
cpSync(join(source, "standard_fonts"), join(target, "standard_fonts"), { recursive: true });
console.log("PDF viewer assets copied to public/pdfjs");
