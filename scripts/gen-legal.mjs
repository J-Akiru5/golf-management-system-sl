import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const base = "C:/Users/Lenovo/.local/share/opencode/worktree/2362d5/landing-legal/docs/legal";
const pairs = [
  ["privacy", `${base}/privacy-policy.draft.md`],
  ["terms", `${base}/terms-of-service.draft.md`],
];

mkdirSync("src/content/legal", { recursive: true });
for (const [name, from] of pairs) {
  const md = readFileSync(from, "utf8").replace(/\r\n/g, "\n");
  const escaped = md.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
  const header =
    "/**\n" +
    ` * ${name} copy. DRAFT: not reviewed by the club or its legal adviser.\n` +
    " *\n" +
    " * Generated from docs/legal by scripts/gen-legal.mjs. Edit the markdown and regenerate; do not\n" +
    " * edit this file by hand, or the next run will overwrite it.\n" +
    " */\n";
  const body = `${header}export const ${name}Markdown = \`${escaped}\`;\n`;
  writeFileSync(`src/content/legal/${name}.ts`, body);
  console.log(name, body.length);
}
