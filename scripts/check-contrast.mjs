// WCAG contrast audit for theme tokens in src/styles/themes.css.
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/styles/themes.css", import.meta.url), "utf8");
const block = (sel) => {
  const i = css.indexOf(sel);
  const body = css.slice(css.indexOf("{", i) + 1, css.indexOf("}", i));
  return Object.fromEntries(
    [...body.matchAll(/(--c-[\w-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1], m[2]]),
  );
};
const lum = (hex) => {
  const c = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const pairs = [
  ["--c-text", "--c-bg", 4.5],
  ["--c-text", "--c-surface", 4.5],
  ["--c-text-muted", "--c-bg", 4.5],
  ["--c-text-muted", "--c-surface", 4.5],
  ["--c-text-muted", "--c-surface-2", 4.5],
  ["--c-text-subtle", "--c-bg", 4.5],
  ["--c-text-subtle", "--c-surface", 4.5],
  ["--c-accent", "--c-bg", 4.5],
  ["--c-accent", "--c-surface", 4.5],
  ["--c-accent", "--c-accent-soft", 4.5],
  ["--c-on-accent", "--c-accent", 4.5],
  ["--c-on-primary", "--c-primary", 4.5],
  ["--c-primary-edge", "--c-bg", 3],
  ["--c-on-primary", "--c-primary-hover", 4.5],
  ["--c-success", "--c-surface", 4.5],
  ["--c-warning", "--c-surface", 4.5],
  ["--c-error", "--c-surface", 4.5],
  ["--c-info", "--c-surface", 4.5],
  ["--c-code-text", "--c-code-bg", 4.5],
  ["--c-border-input", "--c-surface", 3],
  ["--c-border-input", "--c-bg", 3],
];
let fail = 0;
for (const [name, sel] of [
  ["light", ':root[data-theme="light"]'],
  ["dark", ':root[data-theme="dark"]'],
]) {
  const t = block(sel);
  for (const [fg, bg, min] of pairs) {
    if (!t[fg] || !t[bg]) continue;
    const r = ratio(t[fg], t[bg]);
    const ok = r >= min;
    if (!ok) fail++;
    console.log(
      `${ok ? "pass" : "FAIL"} ${name.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)} (min ${min})`,
    );
  }
}
process.exit(fail ? 1 : 0);
