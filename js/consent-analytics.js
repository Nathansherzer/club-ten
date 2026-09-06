/* ==========================================================
   consent-analytics.js — INTERIM analytics consent (Consent Mode v2)

   Stopgap while the site is not yet approved for AdSense. Google's
   certified CMP message is delivered through the ad-serving path, so
   it does not display until the site is approved — which leaves
   EEA/UK/CH visitors stuck in the default `denied` state and GA4
   blind for them. This banner collects analytics consent directly
   and drives Consent Mode's `analytics_storage` signal so GA4 works
   for consenting UK/EEA visitors in the meantime.

   Scope is deliberately narrow:
   - ANALYTICS ONLY. It never touches ad_storage / ad_user_data /
     ad_personalization — ads aren't serving, and Google's CMP will
     own ad consent once the site is approved.
   - Shown only to likely EEA/UK/CH visitors (the ones denied by
     default in the <head>). Everyone else was granted by default and
     needs no prompt.

   REMOVE THIS FILE once "Messages shown" in AdSense is climbing above
   0 (i.e. Google's own CMP is live). At that point Google's CMP
   handles both ad and analytics consent and this becomes redundant.
   ========================================================== */
(function () {
  var KEY = "ct_analytics_consent"; // "granted" | "denied"

  function gtag() { (window.dataLayer = window.dataLayer || []).push(arguments); }
  function apply(state) { gtag("consent", "update", { analytics_storage: state }); }

  // Region heuristic. Our Consent Mode default denies analytics for
  // EEA/UK/CH (Google resolves region server-side by IP); here we only
  // need to decide whether to SHOW the banner. Timezone is a
  // network-free, privacy-friendly proxy. Misfires are low-stakes: a
  // wrongly-shown banner just offers a choice; a wrongly-hidden one
  // leaves a real EEA visitor safely denied (compliant, just less data).
  function likelyEEA() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      return /^Europe\//.test(tz) ||
        ["Atlantic/Reykjavik", "Atlantic/Canary", "Atlantic/Madeira", "Atlantic/Azores"].indexOf(tz) !== -1;
    } catch (e) {
      return true; // can't tell → err toward asking (safe/compliant)
    }
  }

  function whenReady(fn) {
    if (document.body) fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function showBanner() {
    if (document.getElementById("ctConsent")) return;

    var b = document.createElement("div");
    b.id = "ctConsent";
    b.setAttribute("role", "dialog");
    b.setAttribute("aria-label", "Analytics consent");
    b.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:600;" +
      "background:#16202f;border-top:1px solid #2c405c;" +
      "padding:16px;display:flex;flex-wrap:wrap;align-items:center;" +
      "justify-content:center;gap:14px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "box-shadow:0 -4px 16px rgba(0,0,0,0.35)";

    b.innerHTML =
      '<p style="color:#eef2f7;font-size:0.83rem;line-height:1.5;margin:0;max-width:520px;flex:1 1 260px">' +
        "We use Google Analytics cookies to understand how the site is used. " +
        "You can accept or decline. " +
        '<a href="/privacy" style="color:#4caf6d">Privacy policy</a>.' +
      "</p>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button id="ctDecline" style="background:none;border:1px solid #2c405c;border-radius:9px;color:#eef2f7;font-size:0.85rem;padding:10px 18px;cursor:pointer">Decline</button>' +
        '<button id="ctAccept" style="background:#4caf6d;border:none;border-radius:9px;color:#0c1a10;font-weight:700;font-size:0.85rem;padding:10px 18px;cursor:pointer">Accept</button>' +
      "</div>";

    document.body.appendChild(b);

    document.getElementById("ctAccept").addEventListener("click", function () {
      localStorage.setItem(KEY, "granted");
      apply("granted");
      b.remove();
    });
    document.getElementById("ctDecline").addEventListener("click", function () {
      localStorage.setItem(KEY, "denied");
      apply("denied");
      b.remove();
    });
  }

  // Footer "Cookie settings" link re-opens the choice, so withdrawing
  // consent is as easy as giving it (ICO requirement).
  window.ctCookieSettings = function () { whenReady(showBanner); };

  var choice = localStorage.getItem(KEY);
  if (choice === "granted") {
    apply("granted"); // re-affirm every load; default is denied for EEA/UK/CH
  } else if (choice === "denied") {
    // respect the decline; already denied by default, nothing to do
  } else if (likelyEEA()) {
    whenReady(showBanner);
  }
})();
