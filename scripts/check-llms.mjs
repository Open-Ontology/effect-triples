import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist");
const siteUrl = new URL("https://triplex.build");
const index = await readFile(resolve(outDir, "llms.txt"), "utf8");

assert.match(index, /^# Triplex\n\n> \S[^\n]+\n/, "llms.txt needs an H1 and summary");
const summary = index.split("\n")[2];
assert.match(summary, /pre-1\.0/, "The summary must state maturity");
assert.match(
  summary,
  /npm install @triplex-build\/triplex/,
  "The summary must explain installation",
);
assert.doesNotMatch(index, /<!doctype|<html\b/i, "llms.txt must not be an HTML app shell");

const sections = index.split(/^## .+$/m).slice(1);
assert.ok(sections.length > 0, "llms.txt needs sections");
for (const section of sections) {
  const entries = section.split("\n").filter((line) => line.startsWith("- "));
  assert.ok(entries.length > 0, "Each section needs documentation links");
  for (const entry of entries) {
    assert.match(entry, /^- \[[^\]]+\]\([^)]+\): \S/, "Links need titles and notes");
  }
}

let localLinks = 0;
for (const [, href] of index.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
  const url = new URL(href);
  assert.equal(url.protocol, "https:", `Use absolute HTTPS links: ${href}`);
  if (url.origin !== siteUrl.origin) continue;

  const pathname = decodeURIComponent(url.pathname);
  const file = resolve(outDir, `.${pathname}`);
  assert.ok(file.startsWith(`${outDir}${sep}`), `Link leaves the docs output: ${href}`);
  assert.ok((await stat(file)).isFile(), `Missing built page: ${href}`);
  // Check the actual asset, so an HTTP fallback cannot mask a missing page.
  if (/\.(md|txt)$/.test(pathname)) {
    const content = await readFile(file, "utf8");
    assert.ok(content.trim().length > 0, `Empty documentation: ${href}`);
    assert.doesNotMatch(content, /<!doctype|<html\b/i, `HTML fallback at ${href}`);
  }
  localLinks++;
}
assert.ok(localLinks > 0, "llms.txt must link to local documentation");
console.log(`Verified llms.txt structure and ${localLinks} local documentation links.`);
