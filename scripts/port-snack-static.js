#!/usr/bin/env node
/* scripts/port-snack-static.js — one-shot port of a STATIC html file's old
   head tags to Snack's head block (same transform as api/blog-post.js).

   Usage:
     node scripts/port-snack-static.js blog/index.html                       (default: AD page, full block + snack-ads)
     node scripts/port-snack-static.js --variant=analytics about.html ...    (CMP + consent-gated analytics, no ads)
     node scripts/port-snack-static.js --variant=cmp privacy.html ...        (CMP + Cookie settings only: no analytics, no ads)

   Refuses (and changes nothing) unless the file has the standard old head
   exactly once, or is already ported, and the result verifies. Idempotent.
   An "analytics" page can be converted to "cmp" (drops only the gtag.js loader). */
import { readFileSync, writeFileSync } from "fs";
import { snackifyPage, snackPageProblems, blockFor, VARIANTS } from "../lib/snack-page.js";

const args = process.argv.slice(2);
const vArg = args.find((a) => a.startsWith("--variant="));
const variant = vArg ? vArg.split("=")[1] : "ads";
if (!VARIANTS.includes(variant)) { console.error(`unknown variant "${variant}" (use ${VARIANTS.join("|")})`); process.exit(2); }
let bad = 0;
for (const f of args.filter((a) => !a.startsWith("--"))) {
  const html = readFileSync(f, "utf8");
  if (!snackPageProblems(html, { variant }).length) { console.log(`already ported (${variant}): ${f}`); continue; }
  // already carries the CMP-only block and only needs its analytics loader dropped
  if (variant === "cmp" && html.includes(blockFor("analytics"))) {
    const out = html.replace(blockFor("analytics"), () => blockFor("cmp"));
    const after = snackPageProblems(out, { variant });
    if (after.length) { console.error(`REFUSED ${f}: ${after.join("; ")}`); bad++; continue; }
    writeFileSync(f, out); console.log(`converted analytics -> cmp: ${f}`); continue;
  }
  const r = snackifyPage(html, { variant });
  if (!r.changed) { console.error(`REFUSED ${f}: ${r.problems.join("; ")}`); bad++; continue; }
  writeFileSync(f, r.html);
  console.log(`ported (${variant}): ${f}`);
}
process.exit(bad ? 1 : 0);
