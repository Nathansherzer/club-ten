/* ==========================================================
   lib/snack-ads.js — Snack Media activation gate (publisher 5296)

   OFF BY DEFAULT. Nothing is emitted, and no Snack request can be
   made, unless BOTH of these hold:

     1. SNACK_ENABLED is explicitly true (a reviewable, committed
        change — never a runtime, env or query-string toggle), AND
     2. the request's Host is exactly the staging hostname.

   When the gate is closed, applySnack() returns the HTML byte-for-byte
   unchanged and sets no headers, so production output is identical to
   a build without this file.

   Why server-side rather than injecting from the page: Snack's doc
   specifies a preload immediately followed by a parser-blocking
   op.js (fetchpriority="high"), then an async boot. Injecting those
   from script changes all three properties — the preload loses its
   head start, op.js stops blocking the parser, and fetchPriority set
   as a property is less reliably honoured than the parse-time
   attribute. Emitting the documented markup verbatim preserves the
   ordering and timing Snack's wrapper expects.

   Consent: when the gate is open, the page's own gtag block, gtag.js
   loader, AdSense loader and old interim consent script are replaced
   TOGETHER by Snack's emailed head block (lib/snack-head-block.js,
   verbatim, including their CMP). Consent Mode regional defaults are
   identical in both. Scope of this phase: home, club and archive pages
   only; every other route is OUTSIDE this QA phase and is untouched.

   Deliberately NOT included:
     - Interstitial     : excluded by the agreed ad formats.
     - Outstream video  : excluded by the agreed ad formats.

   The sticky floor and sidebar gutters are auto-injected by op.js —
   there are no manual slots here. Format and placement are Snack-side
   settings, not site code.
   ========================================================== */

import { SNACK_HEAD_BLOCK } from "./snack-head-block.js";

/** Explicit switch. Flipping this to true is a deliberate commit. */
export const SNACK_ENABLED = false;

/** The only host allowed to serve ad markup. Exact match, no suffixes. */
export const SNACK_HOST = "staging.topclubten.com";

/**
 * Lowercase and strip any :port from a Host header.
 * "Staging.TopClubTen.com:443" → "staging.topclubten.com"
 */
export function normalizeHost(host) {
  if (!host) return "";
  return String(host).toLowerCase().trim().split(":")[0];
}

/**
 * True only when the switch is on AND the request Host is exactly the
 * staging host. Reads `host` only — never x-forwarded-host, which a
 * client can set. A production build has SNACK_ENABLED false, so a
 * spoofed Host still yields nothing there.
 */
export function snackActive(req) {
  if (!SNACK_ENABLED) return false;
  return normalizeHost(req?.headers?.host) === SNACK_HOST;
}

/**
 * The legacy AdSense loader tag, matched by its src. Only ever removed
 * inside the open gate, so it stays in place on production.
 */
const ADSENSE_LOADER_RE =
  /[ \t]*<script\b[^>]*\bsrc="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"]*"[^>]*><\/script>[ \t]*\r?\n?/g;

/**
 * The page's own consent-defaults + gtag config block and gtag.js
 * loader. Snack's block carries its own copy of all of this, in its
 * own order, so this is replaced rather than added to (no duplicate
 * gtag config, no duplicate gtag.js loader).
 */
const PAGE_GTAG_RE =
  /<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];[\s\S]*?<\/script>\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-M8E5NFRXB5"><\/script>/g;

/**
 * Footer "Cookie settings" link. OLD is what the templates ship today
 * (it calls the removed consent-analytics.js handler or a Google
 * revocation call that is not loaded on staging). NEW is Jason's
 * supplied call, window.admiral('show', 'cmp.main'), unchanged, wrapped
 * in one small guard: if window.admiral is not a function, or the call
 * throws, the click does nothing and raises no error. No other vendor
 * API is used, and the guard never reports that a window opened.
 * Jason's original, unguarded markup:
 *   <a href="#" onclick="window.admiral('show', 'cmp.main'); return false;">Cookie settings</a>
 */
const OLD_COOKIE_LINK =
  '<a href="#" onclick="if (window.ctCookieSettings) { window.ctCookieSettings(); } else if (window.googlefc) { window.googlefc.showRevocationMessage(); } return false;">Cookie settings</a>';
const NEW_COOKIE_LINK =
  `<a href="#" onclick="if (typeof window.admiral === 'function') { try { window.admiral('show', 'cmp.main'); } catch (e) {} } return false;">Cookie settings</a>`;

/** The old interim analytics-consent banner script. */
const OLD_CONSENT_RE = /[ \t]*<script src="\/js\/consent-analytics\.js" defer><\/script>[ \t]*\r?\n?/g;

const countMatches = (html, re) => (html.match(re) || []).length;

/**
 * Gate closed  → returns `html` unchanged, sets no headers.
 * Gate open    → adds the `snack-ads` class (which is what enables the
 *                sticky-floor spacing in style.css), then swaps the
 *                page's gtag block + gtag.js loader for Snack's head
 *                block, and removes the legacy AdSense loader and the
 *                old consent-analytics script (staging QA only).
 *                Makes the response uncacheable.
 *
 * Also swaps the footer Cookie settings link for Jason's CMP call
 * (guarded, see NEW_COOKIE_LINK). Fails closed: if the page does not
 * contain exactly one gtag block, one old consent script and one old
 * Cookie settings link, nothing is changed and no ad or CMP
 * markup is emitted, rather than risk duplicate loaders.
 *
 * Cache isolation: ad-bearing HTML is host-dependent, and two of the
 * renderers otherwise send `public, max-age=...`. A shared cache that
 * ignored Host could then replay staging HTML on production. Forcing
 * no-store (plus Vary: Host) removes that class of leak entirely —
 * staging is a QA surface and loses nothing by being uncached.
 * Deployment-level isolation already applies too: production builds
 * carry SNACK_ENABLED false, and Vercel caches are per-deployment.
 */
export function applySnack(req, res, html) {
  if (!snackActive(req)) return html;

  if (
    countMatches(html, PAGE_GTAG_RE) !== 1 ||
    countMatches(html, OLD_CONSENT_RE) !== 1 ||
    html.split(OLD_COOKIE_LINK).length !== 2 ||
    !html.includes('<html lang="en">')
  ) {
    return html;
  }

  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Vary", "Host");

  return html
    .replace(ADSENSE_LOADER_RE, "")
    .replace(OLD_CONSENT_RE, "")
    .replace(OLD_COOKIE_LINK, () => NEW_COOKIE_LINK)
    .replace(PAGE_GTAG_RE, () => SNACK_HEAD_BLOCK.trimEnd())
    .replace('<html lang="en">', '<html lang="en" class="snack-ads">');
}
