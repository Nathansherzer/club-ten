#!/usr/bin/env node
/* scripts/check-snack-pages.js — local pre-deploy check for the Snack integration.
   Renders every AD page type through the real handlers (no network, no vendor
   code executed) and asserts the integration is applied exactly once, in
   order, with no duplicate loaders. Asserts the NON-AD static/policy/utility
   pages carry the CMP-only block (no ad scripts) and a Cookie settings link:
   about/contact/how-to-play keep consent-gated analytics, privacy/reference/utm-links load no analytics.
   Validates EVERY blog-src file (published, scheduled or unregistered) would
   get the canonical integration, and self-tests the failure path (a
   deliberately nonstandard head must never ship ads/tracking/old consent).
   Run: node scripts/check-snack-pages.js        Exit 1 on any failure. */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { SNACK_HEAD_BLOCK, NEW_COOKIE_LINK, OLD_COOKIE_LINK, SNACK_HTML_TAG, blockFor, renderSnackPage, snackPageProblems } from "../lib/snack-page.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CLUBS = ["arsenal", "chelsea", "liverpool", "manchester-city", "manchester-united", "tottenham"];

async function render(mod, query) {
  const h = (await import(pathToFileURL(join(ROOT, mod)).href)).default;
  let body = "", status = 200, headers = {};
  const res = { status(c) { status = c; return res; }, send(b) { body = String(b); return res; }, json(j) { body = JSON.stringify(j); return res; }, setHeader(k, v) { headers[k] = v; return res; }, redirect(c, u) { status = c; body = "REDIRECT " + u; return res; }, end(b) { if (b) body = String(b); return res; } };
  const origErr = console.error; const logged = []; console.error = (...a) => logged.push(a.join(" "));
  try { await h({ method: "GET", query, headers: { host: "topclubten.com" } }, res); } finally { console.error = origErr; }
  return { body, status, headers, logged };
}
const n = (s, re) => (s.match(re) || []).length;
const BLOCK = SNACK_HEAD_BLOCK.trimEnd();

function checkIncluded(name, html) {
  const idx = (k) => html.indexOf(k);
  const head = html.slice(0, html.indexOf("</head>"));
  const f = [];
  const need = (ok, what) => { if (!ok) f.push(what); };
  need(html.includes(SNACK_HTML_TAG), "html class snack-ads");
  need(html.includes(BLOCK), "head block verbatim");
  need(head.includes(BLOCK), "head block inside <head>");
  need(n(html, /Consent Mode Bridge/g) === 1, "exactly one bridge");
  need(n(html, /window\.__tcfapi\('addEventListener',\s*2,/g) === 1, "exactly one TCF listener");
  need(n(html, /getConsentForGTM/g) === 0, "old bridge helper absent from page code");
  need(n(html, /gtag\/js\?id=G-M8E5NFRXB5/g) === 1, "exactly one gtag.js loader");
  need(n(html, /gtag\('config', 'G-M8E5NFRXB5'\)/g) === 1, "exactly one gtag config");
  need(n(html, /'ad_storage': 'denied'/g) === 1, "denied defaults once");
  need(n(html, /'region': \['AT'/g) === 1 && n(html, /wait_for_update': 500/g) === 1, "regional defaults + wait_for_update once");
  need(n(html, /adsbygoogle/g) === 0, "no AdSense loader");
  need(n(html, /consent-analytics/g) === 0, "no old consent script");
  need(n(html, /cloudforestsystems\.com\/dist\//g) === 1, "one CMP loader");
  need(n(html, /adlightning\.com\/op\.js"/g) === 2, "ad-quality preload+script once each");
  need(n(html, /boot\.pbstck\.com\/v1\/adm\//g) === 1, "one Snack loader");
  need(n(html, /googlesyndication|doubleclick|fundingchoices/g) === 0, "no Google ad/FC loader in page source");
  need(!/<video|interstitial/i.test(html), "no video/interstitial markup");
  need(html.split(NEW_COOKIE_LINK).length === 2 && html.split(OLD_COOKIE_LINK).length === 1, "one new Cookie settings link, no old one");
  const order = idx("gtag('consent', 'default'") < idx("gtag('config'") && idx("gtag('config'") < idx('"__tcfapiLocator"') && idx('"__tcfapiLocator"') < idx("Consent Mode Bridge") && idx("Consent Mode Bridge") < idx("gtag/js?id") && idx("gtag/js?id") < idx('adlightning.com/op.js"') && idx('adlightning.com/op.js"') < idx("boot.pbstck.com");
  need(order, "script order defaults>config>CMP>bridge>gtag.js>op.js>boot");
  return f;
}
function checkNonAd(name, html, variant) {
  const f = [];
  const need = (ok, what) => { if (!ok) f.push(what); };
  let block; try { block = blockFor(variant); } catch (e) { return [`cannot derive ${variant} block: ` + e.message]; }
  const analytics = variant === "analytics";
  const idx = (k) => html.indexOf(k);
  const head = html.slice(0, html.indexOf("</head>"));
  need(head.includes(block), `${variant} block verbatim inside <head>`);
  need(!block.includes("adlightning") && !block.includes("boot.pbstck.com"), "derived block has no ad-quality/loader scripts");
  need(html.includes(PLAIN) && !html.includes("snack-ads"), 'plain <html lang="en">, no snack-ads class');
  need(n(html, /Consent Mode Bridge/g) === 1 && n(html, /window\.__tcfapi\('addEventListener',\s*2,/g) === 1, "exactly one bridge + TCF listener");
  need(n(html, /gtag\/js\?id=G-M8E5NFRXB5/g) === (analytics ? 1 : 0), analytics ? "exactly one gtag.js loader (consent-gated analytics)" : "NO gtag.js loader (no analytics)");
  need(n(html, /googletagmanager\.com/g) === (analytics ? 1 : 0), analytics ? "gtag.js is the only Google Tag Manager host reference" : "no googletagmanager.com reference at all");
  need(n(html, /gtag\('config', 'G-M8E5NFRXB5'\)/g) === 1, "one gtag config call (inert when no loader)");
  need(n(html, /'ad_storage': 'denied'/g) === 1 && n(html, /wait_for_update': 500/g) === 1, "denied regional defaults once");
  need(n(html, /cloudforestsystems\.com\/dist\//g) === 1, "one CMP loader");
  need(n(html, /adlightning\.com|boot\.pbstck\.com|adsbygoogle|googlesyndication|doubleclick|fundingchoices|googlefc/g) === 0, "no ad scripts, AdSense or FC loader");
  need(n(html, /consent-analytics|ctCookieSettings/g) === 0, "no old consent banner code");
  need(!/<video|interstitial/i.test(html), "no video/interstitial markup");
  need(html.split(NEW_COOKIE_LINK).length === 2 && html.split(OLD_COOKIE_LINK).length === 1, "one new Cookie settings link, no old one");
  need(idx("gtag('consent', 'default'") < idx("gtag('config'") && idx("gtag('config'") < idx('"__tcfapiLocator"') && idx('"__tcfapiLocator"') < idx("Consent Mode Bridge") && (!analytics || idx("Consent Mode Bridge") < idx("gtag/js?id")), analytics ? "script order defaults>config>CMP>bridge>gtag.js" : "script order defaults>config>CMP>bridge");
  const p = snackPageProblems(html, { variant }); if (p.length) f.push(...p);
  return f;
}
const PLAIN = '<html lang="en">';

let fails = 0, total = 0;
const report = (name, f) => { total++; if (f.length) { fails++; console.log("FAIL", name, "->", f.join("; ")); } };

const jobs = [["home", "api/home-page.js", {}], ["archive", "api/archive-page.js", {}]];
for (const c of CLUBS) jobs.push([`club ${c}`, "api/club-page.js", { club: c }]);
const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
const dates = [...new Set(readdirSync(join(ROOT, "puzzles")).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d) && d <= today))].sort().slice(-3);
for (const c of CLUBS) for (const d of dates) jobs.push([`dated ${c} ${d}`, "api/puzzle-page.js", { club: c, date: d }]);
const { POSTS } = await import(pathToFileURL(join(ROOT, "api/blog-post.js")).href);
for (const s of Object.keys(POSTS)) if (POSTS[s] <= today) jobs.push([`blog ${s}`, "api/blog-post.js", { slug: s }]);

for (const [name, mod, q] of jobs) {
  const r = await render(mod, q);
  if (r.status !== 200) { report(name, [`status ${r.status}`]); continue; }
  const f = checkIncluded(name, r.body);
  if (r.logged.length) f.push("handler logged: " + r.logged[0]);
  report(name, f);
}
report("blog index (static)", checkIncluded("blog/index", readFileSync(join(ROOT, "blog/index.html"), "utf8")));
// Owner decision (25 Nov): About/Contact/How to Play = CMP + consent-gated analytics, no ads.
// Privacy/reference/utm-links = shared CMP controls + Cookie settings only: no analytics, no ads.
for (const p of ["about.html", "contact.html", "how-to-play.html"]) report(`non-ad analytics ${p}`, checkNonAd(p, readFileSync(join(ROOT, p), "utf8"), "analytics"));
for (const p of ["privacy.html", "reference.html", "utm-links.html"]) report(`non-ad no-analytics ${p}`, checkNonAd(p, readFileSync(join(ROOT, p), "utf8"), "cmp"));

// ---- every blog-src file (published, scheduled, or not yet registered) gets the canonical integration ----
const srcFiles = readdirSync(join(ROOT, "blog-src")).filter((x) => x.endsWith(".html"));
for (const s of Object.keys(POSTS)) if (!existsSync(join(ROOT, "blog-src", `${s}.html`))) report(`blog source ${s}`, ["registered in POSTS but blog-src file is missing"]);
for (const file of srcFiles) {
  const slug = file.replace(/\.html$/, "");
  const f = [];
  if (!(slug in POSTS)) f.push("file is not registered in POSTS (api/blog-post.js), so it would 404");
  const r = renderSnackPage(readFileSync(join(ROOT, "blog-src", file), "utf8"));
  if (r.status !== "snack") f.push(`head not recognised (${r.status}): ${r.problems.join("; ")}. This post would be served WITHOUT ads, analytics or consent. Fix its head to match the standard blog head.`);
  report(`blog-src/${file} canonical head`, f);
}

// ---- self-test of the failure path: nonstandard heads must never ship old ads/tracking ----
{
  const base = readFileSync(join(ROOT, "blog-src", "arsenal-trivia.html"), "utf8");
  const bad = (re) => /googletagmanager\.com|googlesyndication|adsbygoogle|consent-analytics|gtag\(\s*'(config|consent|js)'|dataLayer\s*=/i.test(re);
  const variants = {
    "second gtag block": base.replace("</head>", "<script>window.dataLayer = window.dataLayer || []; gtag('config','G-OTHER');</script></head>"),
    "consent script missing": base.replace('<script src="/js/consent-analytics.js" defer></script>', ""),
    "AdSense loader duplicated": base.replace("</head>", '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1" crossorigin="anonymous"></script></head>'),
    "uppercase/odd script tag": base.replace("</head>", '<SCRIPT\n async src="https://www.googletagmanager.com/gtag/js?id=G-X"></SCRIPT></head>'),
    "head already has Snack block": base.replace("</head>", SNACK_HEAD_BLOCK + "</head>"),
  };
  for (const [name, html] of Object.entries(variants)) {
    const r = renderSnackPage(html);
    const f = [];
    if (r.status === "snack") f.push("nonstandard head was accepted as canonical");
    if (r.status === "safe" && bad(r.html)) f.push("safe fallback still contains ad/analytics/consent code");
    if (r.status === "blocked" && r.html) f.push("blocked result still has html");
    if (r.status !== "snack" && !r.problems.length) f.push("no problem message explains the failure");
    report(`self-test: ${name} -> ${r.status}`, f);
  }
  const unsafe = renderSnackPage(base.replace("</head>", "</head><img src=\"https://pagead2.googlesyndication.com/pixel.gif\">"));
  report(`self-test: tracker the stripper cannot remove -> ${unsafe.status}`, unsafe.status === "blocked" && unsafe.html === null ? [] : ["expected blocked"]);
  // a "newly generated post": copy of the standard head under a new slug/title/date must be canonical
  const fresh = base.replace(/<title>[^<]*<\/title>/, "<title>Brand new post | Club Ten</title>").replace(/arsenal-trivia/g, "brand-new-post");
  report("self-test: newly generated post -> snack", renderSnackPage(fresh).status === "snack" ? [] : ["new post not canonical: " + renderSnackPage(fresh).problems.join("; ")]);
}

console.log(`${total - fails}/${total} checks passed`);
process.exit(fails ? 1 : 0);
