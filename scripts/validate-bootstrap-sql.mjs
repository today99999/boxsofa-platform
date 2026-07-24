import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL("..", import.meta.url)));
const bootstrapPath = join(root, "supabase", "schema.sql");

function dollarQuoteAt(sql, index) {
  const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(index));
  return match?.[0] ?? null;
}

export function validateBootstrapSql(sql) {
  assert.doesNotMatch(sql, /^(?:\+|-)\s*(?:--|create\b|alter\b|drop\b|insert\b|update\b|delete\b|grant\b|revoke\b|begin\b|commit\b)/im, "bootstrap SQL contains a patch artifact");
  assert.doesNotMatch(sql, /^(?:<<<<<<<|=======|>>>>>>>)/m, "bootstrap SQL contains a merge conflict marker");

  let state = "normal";
  let blockDepth = 0;
  let dollarQuote = "";
  let statements = 0;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (state === "line-comment") {
      if (char === "\n") state = "normal";
      continue;
    }
    if (state === "block-comment") {
      if (char === "/" && next === "*") {
        blockDepth += 1;
        index += 1;
      } else if (char === "*" && next === "/") {
        blockDepth -= 1;
        index += 1;
        if (blockDepth === 0) state = "normal";
      }
      continue;
    }
    if (state === "single-quote") {
      if (char === "'" && next === "'") index += 1;
      else if (char === "'") state = "normal";
      continue;
    }
    if (state === "double-quote") {
      if (char === '"' && next === '"') index += 1;
      else if (char === '"') state = "normal";
      continue;
    }
    if (state === "dollar-quote") {
      if (sql.startsWith(dollarQuote, index)) {
        index += dollarQuote.length - 1;
        dollarQuote = "";
        state = "normal";
      }
      continue;
    }

    if (char === "-" && next === "-") {
      state = "line-comment";
      index += 1;
    } else if (char === "/" && next === "*") {
      state = "block-comment";
      blockDepth = 1;
      index += 1;
    } else if (char === "'") {
      state = "single-quote";
    } else if (char === '"') {
      state = "double-quote";
    } else if (char === "$") {
      const quote = dollarQuoteAt(sql, index);
      if (quote) {
        dollarQuote = quote;
        state = "dollar-quote";
        index += quote.length - 1;
      }
    } else if (char === ";") {
      statements += 1;
    }
  }

  assert.equal(state, "normal", `bootstrap SQL ended inside ${state}`);
  assert.equal(blockDepth, 0, "bootstrap SQL has an unclosed block comment");
  assert.ok(statements > 20, "bootstrap SQL should contain executable statements");
  return { statements };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = validateBootstrapSql(readFileSync(bootstrapPath, "utf8"));
  console.log(`Bootstrap SQL lexical validation passed: ${result.statements} statements.`);
}
