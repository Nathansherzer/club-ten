/* ==========================================================
   api/sitemap.js — dynamic sitemap generator
   URL: GET /sitemap.xml  (via vercel.json rewrite)

   Lists only the quality pages we want indexed: homepage, the
   six club pages, /how-to-play, /blog + posts, and /archive.
   Thin dated puzzle pages (/{club}/{date}) are intentionally
   excluded — they are noindex,follow and reachable via /archive
   for crawling. The old /{club}-football-quiz and
   /football-top-10-quiz landing pages were merged into the club
   pages / homepage and now 301-redirect there (see vercel.json).
   ========================================================== */

import { POSTS } from "./blog-post.js";

const BASE = "https://topclubten.com";

const STATIC = [
  { loc: "/",                              changefreq: "daily",   priority: "1.0" },
  { loc: "/arsenal",                       changefreq: "daily",   priority: "0.9" },
  { loc: "/chelsea",                       changefreq: "daily",   priority: "0.9" },
  { loc: "/liverpool",                     changefreq: "daily",   priority: "0.9" },
  { loc: "/manchester-city",               changefreq: "daily",   priority: "0.9" },
  { loc: "/manchester-united",             changefreq: "daily",   priority: "0.9" },
  { loc: "/tottenham",                     changefreq: "daily",   priority: "0.9" },
  { loc: "/how-to-play",                   changefreq: "monthly", priority: "0.5" },
  { loc: "/blog",                          changefreq: "weekly",  priority: "0.7" },
  { loc: "/archive",                       changefreq: "daily",   priority: "0.6" },
];

function londonToday() {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/London" });
}

function urlTag({ loc, changefreq, priority, lastmod }) {
  return [
    "  <url>",
    `    <loc>${BASE}${loc}</loc>`,
    lastmod ? `    <lastmod>${lastmod}</lastmod>` : "",
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>"
  ].filter(Boolean).join("\n");
}

export default async function handler(req, res) {
  const today = londonToday();

  const staticUrls = STATIC.map(p => urlTag(p));

  const blogUrls = Object.entries(POSTS)
    .filter(([, date]) => date <= today)
    .map(([slug, date]) => urlTag({
      loc:        `/blog/${slug}`,
      lastmod:    date,
      changefreq: "monthly",
      priority:   "0.7"
    }));

  // Dated puzzle pages (/{club}/{date}) are deliberately NOT listed here.
  // They are thin, near-duplicate archive stubs and are served with
  // noindex,follow (see api/puzzle-page.js). Google still reaches them by
  // crawling through /archive and the puzzle-nav links to honour the
  // noindex; we just don't actively submit ~400 low-value URLs. Only the
  // quality pages (home, clubs, how-to-play, blog, archive) belong here.

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...staticUrls,
    ...blogUrls,
    "</urlset>"
  ].join("\n");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=3600");
  return res.status(200).send(xml);
}
