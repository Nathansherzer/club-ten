/* ==========================================================
   consent.js — cookie/tracking consent gate
   Include with: <script src="/js/consent.js" defer></script>

   Google Analytics is NOT loaded until the visitor accepts.
   Rejecting (or ignoring the banner) means it never loads.

   AdSense is handled differently, deliberately: the adsbygoogle.js
   script tag itself must stay present in every page's raw HTML
   unconditionally — that's how Google verifies site ownership and
   crawls for ad review, and hiding it behind a JS-only consent
   click would break both. Instead, ad *personalization* is what's
   gated: a page-level inline snippet (see any page's <head>) sets
   requestNonPersonalizedAds = 1 whenever there's no "accepted"
   consent on record, following Google's documented pattern for
   this. This file does not touch AdSense at all.

   Choice is remembered in localStorage so returning visitors
   aren't asked again.
   ========================================================== */

(function () {
  var CONSENT_KEY = "ct_consent"; // "accepted" | "rejected"
  var GA_ID        = "G-M8E5NFRXB5";

  function loadAnalytics() {
    var gtagScript = document.createElement("script");
    gtagScript.async = true;
    gtagScript.src   = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(gtagScript);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", GA_ID);
  }

  function showBanner() {
    var banner = document.createElement("div");
    banner.id  = "consentBanner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-label", "Cookie consent");
    banner.style.cssText =
      "position:fixed;left:0;right:0;bottom:0;z-index:500;" +
      "background:#16202f;border-top:1px solid #2c405c;" +
      "padding:16px;display:flex;flex-wrap:wrap;align-items:center;" +
      "justify-content:center;gap:14px;" +
      "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;" +
      "box-shadow:0 -4px 16px rgba(0,0,0,0.35);";

    banner.innerHTML =
      '<p style="color:#eef2f7;font-size:0.83rem;line-height:1.5;margin:0;max-width:520px;flex:1 1 260px">' +
        "We use cookies for analytics and to personalize ads. You can accept or reject non-essential cookies. " +
        '<a href="/privacy" style="color:#4caf6d">Privacy policy</a>.' +
      "</p>" +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button id="consentReject" style="background:none;border:1px solid #2c405c;border-radius:9px;color:#eef2f7;font-size:0.85rem;padding:10px 18px;cursor:pointer">Reject</button>' +
        '<button id="consentAccept" style="background:#4caf6d;border:none;border-radius:9px;color:#0c1a10;font-weight:700;font-size:0.85rem;padding:10px 18px;cursor:pointer">Accept</button>' +
      "</div>";

    document.body.appendChild(banner);

    document.getElementById("consentAccept").addEventListener("click", function () {
      localStorage.setItem(CONSENT_KEY, "accepted");
      banner.remove();
      loadAnalytics();
      // Ad personalization takes effect on next page load, when the
      // inline NPA snippet re-reads the stored consent value.
    });
    document.getElementById("consentReject").addEventListener("click", function () {
      localStorage.setItem(CONSENT_KEY, "rejected");
      banner.remove();
    });
  }

  var existing = localStorage.getItem(CONSENT_KEY);
  if (existing === "accepted") {
    loadAnalytics();
  } else if (existing !== "rejected") {
    showBanner();
  }
  // existing === "rejected": do nothing, GA never loads
})();
