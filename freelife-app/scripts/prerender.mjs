import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const candidates = [
  path.join(root, "dist-ssr", "entry-server.js"),
  path.join(root, "dist-ssr", "assets", "entry-server.js"),
];
const serverEntry = candidates.find((file) => fs.existsSync(file));
if (!serverEntry) {
  console.error("Missing SSR bundle. Expected dist-ssr/entry-server.js");
  process.exit(1);
}

const mod = await import(serverEntry);
const {
  render,
  listPublicServices,
  getPublicServicePage,
  buildRobotsTxt,
  buildSitemapXml,
  buildLlmsTxt,
  buildLlmsFullTxt,
  isPrivatePath,
  SITE_ORIGIN,
  GTM_CONTAINER_ID,
  GA_MEASUREMENT_ID,
} = mod;

const AI_BOTS = ["GPTBot", "Google-Extended", "ClaudeBot", "CCBot", "PerplexityBot"];

function fail(message) {
  console.error(message);
  process.exit(1);
}

let services = [];
try {
  services = await listPublicServices();
  console.log(`public services: ${services.length}`);
} catch (error) {
  console.warn("Public catalog unavailable at build time; sitemap will list static routes only.");
  console.warn(error instanceof Error ? error.message : error);
}

const pages = [];
for (const service of services) {
  try {
    const page = await getPublicServicePage(service.slug);
    if (page?.service?.slug) pages.push(page);
    else console.warn(`skip ${service.slug}: empty page`);
  } catch (error) {
    console.warn(`skip ${service.slug}: ${error instanceof Error ? error.message : error}`);
  }
}

const jobs = [
  { path: "/", bootstrap: { services }, priority: "1.0", changefreq: "weekly" },
  { path: "/services", bootstrap: { services }, priority: "0.9", changefreq: "daily" },
  { path: "/faq", bootstrap: {}, priority: "0.5", changefreq: "monthly" },
  ...pages.map((page) => ({
    path: `/services/${page.service.slug}`,
    bootstrap: { servicePages: { [page.service.slug]: page } },
    priority: "0.8",
    changefreq: "weekly",
  })),
];

for (const job of jobs) {
  if (isPrivatePath(job.path)) fail(`Refusing to prerender private path ${job.path}`);
}

const template = fs.readFileSync(path.join(dist, "index.html"), "utf8");

function extractHoisted(rendered) {
  const tags = [];
  let rest = rendered;
  for (;;) {
    rest = rest.replace(/^(\s*<!--[\s\S]*?-->)+/, "");
    const start = rest.match(/^\s*<(title|meta|link|script)\b/i);
    if (!start) break;
    const tag = start[1].toLowerCase();
    const match = tag === "meta" || tag === "link"
      ? rest.match(/^\s*<[^>]+>/)
      : rest.match(new RegExp(`^\\s*<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "i"));
    if (!match) break;
    tags.push(match[0].trim());
    rest = rest.slice(match[0].length);
  }
  return { tags, body: rest.trim() };
}

function stripTemplateSeo(html) {
  return html
    .replace(/<title>[\s\S]*?<\/title>/gi, "")
    .replace(/<meta\s+[^>]*name=["']description["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*property=["']og:[^"']+["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*name=["']twitter:[^"']+["'][^>]*>/gi, "")
    .replace(/<link\s+[^>]*rel=["']canonical["'][^>]*>/gi, "")
    .replace(/<meta\s+[^>]*name=["']robots["'][^>]*>/gi, "");
}

function renderDocument(job, rendered) {
  const { tags, body } = extractHoisted(rendered);
  if (!tags.some((tag) => tag.startsWith("<title"))) fail(`No <title> for ${job.path}`);
  let html = stripTemplateSeo(template);
  html = html.replace("</head>", `    ${tags.join("\n    ")}\n  </head>`);
  const json = JSON.stringify(job.bootstrap).replace(/</g, "\\u003c");
  const bootstrapTag = `<script type="application/json" id="freeli-bootstrap">${json}</script>`;
  if (html.includes('id="freeli-bootstrap"')) {
    html = html.replace(/<script type="application\/json" id="freeli-bootstrap">[\s\S]*?<\/script>/, bootstrapTag);
  } else {
    html = html.replace("<body>", `<body>\n    ${bootstrapTag}`);
  }
  const root = `<div id="root" data-prerender="true" data-path="${job.path}">${body}</div>`;
  if (!html.includes('<div id="root"></div>')) fail("Client template is missing an empty #root");
  html = html.replace('<div id="root"></div>', root);
  // renderToString emits React prop names; browsers only honor the HTML attributes.
  html = html
    .replaceAll("fetchPriority=", "fetchpriority=")
    .replaceAll(" autoPlay=", " autoplay=")
    .replaceAll(" playsInline=", " playsinline=");
  return html;
}

function writeRoute(job, html) {
  const rel = job.path === "/" ? "index.html" : `${job.path.replace(/^\//, "")}/index.html`;
  const file = path.join(dist, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, html);
  return file;
}

const written = [];
for (const job of jobs) {
  const rendered = render(job.path, job.bootstrap);
  const html = renderDocument(job, rendered);
  const file = writeRoute(job, html);
  written.push({ ...job, html, file });
  console.log(`prerendered ${job.path} (${html.length} bytes)`);
}

const llmsServices = pages.map((page) => ({
  slug: page.service.slug,
  title: page.service.title,
  category: page.service.category,
  description: page.service.description || "",
}));
const sitemap = buildSitemapXml(jobs.map((job) => ({
  loc: job.path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${job.path}`,
  changefreq: job.changefreq,
  priority: job.priority,
})));
const artifacts = {
  "robots.txt": buildRobotsTxt(),
  "sitemap.xml": sitemap,
  "llms.txt": buildLlmsTxt(llmsServices),
  "llms-full.txt": buildLlmsFullTxt(llmsServices),
};
for (const [name, contents] of Object.entries(artifacts)) {
  fs.writeFileSync(path.join(dist, name), contents);
  fs.writeFileSync(path.join(root, "public", name), contents);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html))) {
    blocks.push(JSON.parse(match[1]));
  }
  return blocks;
}

function graphNodes(html) {
  return jsonLdBlocks(html).flatMap((block) => {
    assert(block["@context"] === "https://schema.org", "JSON-LD @context must be https://schema.org");
    const nodes = Array.isArray(block["@graph"]) ? block["@graph"] : [block];
    for (const node of nodes) assert(node && node["@type"], "JSON-LD node missing @type");
    return nodes;
  });
}

function hasType(nodes, type) {
  return nodes.some((node) => node["@type"] === type || (Array.isArray(node["@type"]) && node["@type"].includes(type)));
}

for (const page of written) {
  assert(page.html.includes('lang="zh-Hant-TW"'), `${page.path} missing lang`);
  assert(/<title>[^<]+<\/title>/.test(page.html), `${page.path} missing title text`);
  assert(page.html.includes('name="description"'), `${page.path} missing description`);
  assert(page.html.includes('rel="canonical"'), `${page.path} missing canonical`);
  assert(page.html.includes('property="og:title"'), `${page.path} missing og:title`);
  assert(page.html.includes('property="og:description"'), `${page.path} missing og:description`);
  assert(page.html.includes('property="og:url"'), `${page.path} missing og:url`);
  assert(page.html.includes('name="twitter:card"'), `${page.path} missing twitter card`);
  assert(!page.html.includes("FREELIFE"), `${page.path} still contains FREELIFE`);
  assert(!page.html.includes("FreeLife"), `${page.path} still contains FreeLife`);
  const h1s = page.html.match(/<h1[\s>]/g) || [];
  assert(h1s.length === 1, `${page.path} has ${h1s.length} h1 tags`);
  const imgs = page.html.match(/<img\b[^>]*>/g) || [];
  for (const img of imgs) {
    assert(/\balt="[^"]+"/.test(img), `${page.path} has an image without alt text: ${img.slice(0, 120)}`);
  }
  const nodes = graphNodes(page.html);
  assert(hasType(nodes, "Organization"), `${page.path} missing Organization`);
  assert(hasType(nodes, "WebSite"), `${page.path} missing WebSite`);
  const website = nodes.find((node) => node["@type"] === "WebSite");
  const action = website.potentialAction;
  assert(action && action["@type"] === "SearchAction", `${page.path} WebSite missing SearchAction`);
  const templateUrl = action.target?.urlTemplate || "";
  assert(templateUrl.includes("/services?q={search_term_string}"), `${page.path} SearchAction target is wrong`);
  assert(website.name === "Freeli" && website.alternateName === "FREELI", `${page.path} WebSite name`);
  const org = nodes.find((node) => node["@type"] === "Organization");
  assert(org.name === "Freeli" && org.url, `${page.path} Organization name`);
  const head = page.html.slice(0, page.html.indexOf("</head>"));
  assert(head.includes(GTM_CONTAINER_ID), `${page.path} head is missing GTM`);
  assert(head.includes(`gtag/js?id=${GA_MEASUREMENT_ID}`), `${page.path} head is missing GA4`);
  assert(head.includes("send_page_view: false") || head.includes("send_page_view:!1"), `${page.path} GA4 still sends an automatic page view`);
  assert(head.indexOf(GTM_CONTAINER_ID) < head.indexOf("<meta charset"), `${page.path} GTM is not the first thing in head`);
  const bodyStart = page.html.indexOf("<body>");
  const rootAt = page.html.indexOf('<div id="root"');
  const noscript = page.html.slice(bodyStart, rootAt);
  assert(noscript.includes(`ns.html?id=${GTM_CONTAINER_ID}`), `${page.path} is missing the GTM noscript iframe`);
}

const home = written.find((page) => page.path === "/");
assert(home.html.includes("專業不設限"), "Homepage HTML is missing the headline");
assert(home.html.includes("工作有選擇"), "Homepage HTML is missing the headline");
assert(home.html.includes("FREELI 匯聚經過認證的資深專業人才"), "Homepage HTML is missing the lead copy");
assert(home.html.includes("href=\"/services\""), "Homepage is missing a crawlable services link");
assert(home.html.includes('rel="preload"'), "Homepage is missing the hero preload");
assert(home.html.includes('fetchpriority="high"'), "Homepage hero is missing fetchpriority");
assert(!home.html.includes("fetchPriority="), "fetchPriority was not rewritten to fetchpriority");

const servicesPage = written.find((page) => page.path === "/services");
assert(servicesPage.html.includes("探索標準化服務"), "Services HTML is missing its heading");
if (services.length) {
  assert(servicesPage.html.includes(services[0].title), "Services HTML is missing catalog titles");
  assert(hasType(graphNodes(servicesPage.html), "ItemList"), "Services page missing ItemList");
}

const faq = written.find((page) => page.path === "/faq");
assert(faq.html.includes("Freeli 是什麼？"), "FAQ HTML is missing the first question");
assert(faq.html.includes("款項由平台代管"), "FAQ HTML is missing the escrow answer");
assert(hasType(graphNodes(faq.html), "FAQPage"), "FAQ page missing FAQPage");

for (const page of pages) {
  const file = written.find((item) => item.path === `/services/${page.service.slug}`);
  assert(file, `missing render for ${page.service.slug}`);
  assert(file.html.includes(page.service.title), `${page.service.slug} HTML missing its title`);
  assert(file.html.includes(page.service.description.slice(0, 24)), `${page.service.slug} HTML missing its description`);
  const nodes = graphNodes(file.html);
  assert(hasType(nodes, "Service"), `${page.service.slug} missing Service`);
  assert(hasType(nodes, "Person"), `${page.service.slug} missing Person`);
  assert(hasType(nodes, "BreadcrumbList"), `${page.service.slug} missing BreadcrumbList`);
  if (page.faqs?.length) assert(hasType(nodes, "FAQPage"), `${page.service.slug} missing FAQPage`);
  const person = nodes.find((node) => node["@type"] === "Person");
  assert(person.name === page.talent.name, `${page.service.slug} person name`);
  assert(!/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(JSON.stringify(person)), `${page.service.slug} person JSON includes an email`);
}

if (!isPrivatePath("/dashboard") || !isPrivatePath("/messages/1") || !isPrivatePath("/orders/abc") || !isPrivatePath("/payment") || !isPrivatePath("/chat")) {
  fail("private path matcher is too narrow");
}
if (isPrivatePath("/") || isPrivatePath("/services") || isPrivatePath("/services/brand-community-audit") || isPrivatePath("/faq")) {
  fail("public path was marked private");
}

const robots = artifacts["robots.txt"];
assert(robots.includes("Allow: /"), "robots.txt does not allow public pages");
assert(!/Disallow:\s+\/\s*$/m.test(robots), "robots.txt disallows the whole site");
for (const bot of AI_BOTS) assert(robots.includes(`User-agent: ${bot}`), `robots.txt missing ${bot}`);
for (const prefix of ["/dashboard", "/chat", "/contract", "/payment", "/order"]) {
  assert(robots.includes(`Disallow: ${prefix}`), `robots.txt missing Disallow ${prefix}`);
}
assert(robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`), "robots.txt missing sitemap");

const sitemapXml = artifacts["sitemap.xml"];
assert(sitemapXml.includes("<urlset"), "sitemap is not XML");
assert(sitemapXml.includes(`${SITE_ORIGIN}/</loc>`) || sitemapXml.includes(`${SITE_ORIGIN}/faq</loc>`), "sitemap missing public URLs");
for (const job of jobs) {
  const loc = job.path === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${job.path}`;
  assert(sitemapXml.includes(`<loc>${loc}</loc>`), `sitemap missing ${loc}`);
}
assert(!sitemapXml.includes("/dashboard"), "sitemap includes a private path");

const llms = artifacts["llms.txt"];
const full = artifacts["llms-full.txt"];
assert(llms.startsWith("# Freeli"), "llms.txt title");
assert(llms.includes("English") && llms.includes("two-sided freelance marketplace"), "llms.txt English summary");
assert(llms.includes(`${SITE_ORIGIN}/faq`), "llms.txt missing FAQ link");
assert(llms.includes("不公開"), "llms.txt missing private-data note");
assert(full.length > llms.length, "llms-full.txt should be longer than llms.txt");
assert(full.includes("企業如何合作"), "llms-full.txt missing how-it-works");
assert(!llms.includes("FREELIFE") && !full.includes("FREELIFE"), "llms files still say FREELIFE");

assert(!fs.existsSync(path.join(dist, "dashboard", "index.html")), "dashboard was prerendered");
console.log(`seo ok: ${written.length} html pages, robots.txt, sitemap.xml, llms.txt, llms-full.txt`);
