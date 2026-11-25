/* ==========================================================
   lib/snack-page.js — shared Snack head transform and verifier.

   Two page families, one source of truth (lib/snack-head-block.js):

   1. AD pages (home, clubs, archive, dated puzzles, blog index, blog
      posts): the full Snack head block (CMP, consent defaults, bridge,
      gtag, ad-quality, loader) + <html class="snack-ads"> for the
      footer clearance.
   2. NON-AD pages (about, contact, how-to-play, privacy, reference,
      utm-links): the SAME block without the ad-quality and Snack loader
      scripts (Jason, 25 Nov: the CMP, Google consent defaults and bridge
      work without them). Same CMP, same stored choice, same Cookie
      settings link, no ad scripts, no snack-ads class.

   The old standard head is: the page's own consent-defaults + gtag
   config block, the gtag.js loader, (optionally) the AdSense loader,
   and /js/consent-analytics.js. Snack's block carries its own consent
   defaults, gtag config and gtag.js loader in the required order, so
   the old tags are REPLACED, not added to.

   Blog posts are transformed at serve time (api/blog-post.js) so every
   current and future post inherits the integration. renderSnackPage()
   NEVER silently falls back to the old tags:
     status "snack"     the canonical block was applied AND verified
     status "safe"      the head was not recognised: every ad / analytics
                        / consent tag is stripped (the post is readable
                        but loads no ads, no tracking, no CMP) and the
                        caller must log loudly and not cache it
     status "blocked"   even stripping could not make the page safe: the
                        caller must not serve it
   scripts/check-snack-pages.js fails (exit 1, with the reason) for any
   blog-src file that would not get status "snack".
   ========================================================== */

import { SNACK_HEAD_BLOCK } from "./snack-head-block.js";

export { SNACK_HEAD_BLOCK };

export const ADSENSE_LOADER_RE =
  /[ \t]*<script\b[^>]*\bsrc="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js[^"]*"[^>]*><\/script>[ \t]*\r?\n?/g;
export const PAGE_GTAG_RE =
  /<script>\s*window\.dataLayer = window\.dataLayer \|\| \[\];[\s\S]*?<\/script>\s*<script async src="https:\/\/www\.googletagmanager\.com\/gtag\/js\?id=G-M8E5NFRXB5"><\/script>/g;
export const OLD_CONSENT_RE = /[ \t]*<script src="\/js\/consent-analytics\.js" defer><\/script>[ \t]*\r?\n?/g;
// /privacy was deliberately kept free of gtag (its comment says why); it only
// carries this comment + the old consent script.
export const PRIVACY_OLD_HEAD_RE =
  /[ \t]*<!-- Google Analytics \(gtag loader \+ Consent Mode config\) is intentionally[\s\S]*?-->\r?\n[ \t]*<script src="\/js\/consent-analytics\.js" defer><\/script>[ \t]*\r?\n?/;

export const OLD_COOKIE_LINK =
  '<a href="#" onclick="if (window.ctCookieSettings) { window.ctCookieSettings(); } else if (window.googlefc) { window.googlefc.showRevocationMessage(); } return false;">Cookie settings</a>';
// Jason's supplied call, window.admiral('show', 'cmp.main'), unchanged,
// inside one guard so a missing/blocked CMP does nothing and raises nothing.
export const NEW_COOKIE_LINK =
  `<a href="#" onclick="if (typeof window.admiral === 'function') { try { window.admiral('show', 'cmp.main'); } catch (e) {} } return false;">Cookie settings</a>`;

export const SNACK_HTML_TAG = '<html lang="en" class="snack-ads">';
const PLAIN_HTML_TAG = '<html lang="en">';

/* ---- CMP-only variant, derived (never hand-copied) from the verbatim block ---- */

const AD_UNIT_START = "<!-- Snack Media - Ad Quality -->";
const AD_UNIT_TAIL_RE =
  /^<!-- Snack Media - Ad Quality -->\s*<link rel="preload" href="https:\/\/snackmedia-ron-tagan\.adlightning\.com\/op\.js" as="script">\s*<script fetchpriority="high" src="https:\/\/snackmedia-ron-tagan\.adlightning\.com\/op\.js"><\/script>\s*<!-- Snack Media - Loader -->\s*<script async src="https:\/\/boot\.pbstck\.com\/v1\/adm\/[0-9a-f-]+"><\/script>\s*$/;

/** The vendor block minus its ad-quality + Snack loader tail. Throws if the
 *  tail is not exactly those scripts (so a vendor edit cannot slip through). */
export function deriveCmpOnlyBlock(block = SNACK_HEAD_BLOCK) {
  const at = block.indexOf(AD_UNIT_START);
  if (at < 0 || block.indexOf(AD_UNIT_START, at + 1) >= 0) throw new Error("ad-quality marker not found exactly once in the Snack block");
  if (!AD_UNIT_TAIL_RE.test(block.slice(at))) throw new Error("the end of the Snack block is not exactly the ad-quality + loader scripts");
  return block.slice(0, at).trimEnd();
}

const GTAG_LOADER_TAIL =
  '\n<!-- gtag.js loader -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=G-M8E5NFRXB5"></script>';

/** CMP-only block minus the gtag.js loader: Admiral CMP, consent defaults and
 *  bridge stay verbatim, but nothing loads Google Analytics. (The inline
 *  gtag('config') call just queues into dataLayer and is inert without the
 *  loader; leaving it keeps the vendor's inline scripts untouched and the
 *  bridge's gtag() calls defined.) Used on /privacy, /reference, /utm-links. */
export function deriveCmpNoAnalyticsBlock(block = SNACK_HEAD_BLOCK) {
  const cmp = deriveCmpOnlyBlock(block);
  if (!cmp.endsWith(GTAG_LOADER_TAIL)) throw new Error("the gtag.js loader is not the last element of the CMP-only block");
  return cmp.slice(0, -GTAG_LOADER_TAIL.length);
}

/** Page variants.
 *   "ads"       full Snack block + snack-ads class (home, clubs, archive, dated pages, blog)
 *   "analytics" CMP-only block: CMP + consent-gated analytics, NO ad scripts (about, contact, how-to-play)
 *   "cmp"       CMP only: shared consent controls + Cookie settings, NO analytics, NO ads (privacy, reference, utm-links) */
export const VARIANTS = ["ads", "analytics", "cmp"];
export function blockFor(variant) {
  if (variant === "ads") return SNACK_HEAD_BLOCK.trimEnd();
  if (variant === "analytics") return deriveCmpOnlyBlock();
  if (variant === "cmp") return deriveCmpNoAnalyticsBlock();
  throw new Error(`unknown variant "${variant}"`);
}

/* ---- verification ---- */

// Loader / config markers that must exist ONLY inside the verbatim block.
// (gtag('event', ...) calls are allowed anywhere: they are not loaders.)
const TRACKER_RE =
  /googletagmanager\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|adsbygoogle|fundingchoices|googlefc|consent-analytics|pbstck\.com|adlightning\.com|cloudforestsystems\.com|gtag\(\s*['"](?:config|consent|js)['"]|window\.dataLayer\s*=/i;

const count = (s, needle) => s.split(needle).length - 1;

/** Problems with an already-transformed page. [] means canonical. */
export function snackPageProblems(html, { variant = "ads" } = {}) {
  const p = [];
  const ads = variant === "ads";
  const block = blockFor(variant);
  const nBlock = count(html, block);
  if (nBlock !== 1) p.push(`${variant} head block present ${nBlock} times (need exactly 1)`);
  if (nBlock === 1) {
    const headEnd = html.indexOf("</head>");
    const at = html.indexOf(block);
    if (headEnd < 0 || at > headEnd) p.push("head block is not inside <head>");
    const rest = html.replace(block, "");
    const m = rest.match(TRACKER_RE);
    if (m) p.push(`an ad/analytics/consent tag outside the Snack block: "${m[0]}"`);
  }
  if (ads && !html.includes(SNACK_HTML_TAG)) p.push('missing <html class="snack-ads">');
  if (!ads && html.includes("snack-ads")) p.push("non-ad page carries the snack-ads class");
  if (!ads && /boot\.pbstck\.com|adlightning\.com/i.test(html)) p.push("non-ad page carries ad scripts");
  if (variant === "cmp" && /googletagmanager\.com/i.test(html)) p.push("analytics-free page loads gtag.js");
  if (count(html, NEW_COOKIE_LINK) !== 1) p.push("new Cookie settings link not present exactly once");
  if (count(html, OLD_COOKIE_LINK) !== 0) p.push("old Cookie settings link still present");
  return p;
}

/* ---- the transforms ---- */

const matchCount = (s, re) => (s.match(re) || []).length;

function oldHeadProblems(html, { allowNoGtag = false } = {}) {
  const problems = [];
  const gtag = matchCount(html, PAGE_GTAG_RE);
  if (!(gtag === 1 || (allowNoGtag && gtag === 0 && matchCount(html, PRIVACY_OLD_HEAD_RE) === 1))) problems.push("gtag block is not present exactly once");
  if (!(allowNoGtag && gtag === 0) && matchCount(html, OLD_CONSENT_RE) !== 1) problems.push("consent-analytics.js tag is not present exactly once");
  if (count(html, OLD_COOKIE_LINK) !== 1) problems.push("old Cookie settings link is not present exactly once");
  if (matchCount(html, ADSENSE_LOADER_RE) > 1) problems.push("more than one AdSense loader");
  if (!html.includes(PLAIN_HTML_TAG)) problems.push('plain <html lang="en"> tag not found');
  return problems;
}

/** Transform + VERIFY from the OLD head. @returns {{html: string, changed: boolean, problems: string[]}} */
export function snackifyPage(html, { variant = "ads" } = {}) {
  const ads = variant === "ads";
  const problems = oldHeadProblems(html, { allowNoGtag: !ads });
  if (problems.length) return { html, changed: false, problems };
  const block = blockFor(variant);
  let out = html
    .replace(ADSENSE_LOADER_RE, "")
    .replace(OLD_COOKIE_LINK, () => NEW_COOKIE_LINK);
  if (matchCount(out, PAGE_GTAG_RE) === 1) {
    out = out.replace(OLD_CONSENT_RE, "").replace(PAGE_GTAG_RE, () => block);
  } else {
    out = out.replace(PRIVACY_OLD_HEAD_RE, () => `  ${block}\n`);
  }
  if (ads) out = out.replace(PLAIN_HTML_TAG, SNACK_HTML_TAG);
  const after = snackPageProblems(out, { variant });
  if (after.length) return { html, changed: false, problems: after.map((x) => "result check: " + x) };
  return { html: out, changed: true, problems: [] };
}

/* ---- safe fallback: strip everything that loads ads, analytics or a CMP ---- */

const SCRIPT_RE = /<script\b[^>]*>[\s\S]*?<\/script\s*>/gi;
const LINK_PRELOAD_RE = /<link\b[^>]*>/gi;
const INS_RE = /<ins\b[^>]*adsbygoogle[^>]*>[\s\S]*?<\/ins\s*>/gi;
const COOKIE_ANCHOR_RE = /<a\b[^>]*(?:ctCookieSettings|googlefc|admiral)[^>]*>\s*Cookie settings\s*<\/a>/gi;

export function stripAdsAndTracking(html) {
  return html
    .replace(SCRIPT_RE, (tag) => (TRACKER_RE.test(tag) || /adsbygoogle|\bgtag\s*\(|\bdataLayer\b/i.test(tag) ? "" : tag))
    .replace(LINK_PRELOAD_RE, (tag) => (TRACKER_RE.test(tag) ? "" : tag))
    .replace(INS_RE, "")
    // No consent tool is loaded in this state, so the link points at the policy page.
    .replace(COOKIE_ANCHOR_RE, '<a href="/privacy">Cookie settings</a>');
}

/** @returns {{html: string|null, status: "snack"|"safe"|"blocked", problems: string[]}} */
export function renderSnackPage(html, opts = {}) {
  const r = snackifyPage(html, opts);
  if (r.changed) return { html: r.html, status: "snack", problems: [] };
  const safe = stripAdsAndTracking(html);
  const leftover = safe.match(TRACKER_RE) || safe.match(/googletagmanager|adsbygoogle|doubleclick/i);
  if (leftover) return { html: null, status: "blocked", problems: [...r.problems, `could not be made safe, still contains "${leftover[0]}"`] };
  return { html: safe, status: "safe", problems: r.problems };
}
