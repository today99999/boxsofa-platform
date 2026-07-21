const baseUrl = (process.env.SEO_BASE_URL || process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');
const canonicalHost = 'https://boxsofa.eu';
const googleSiteVerification = 'ReHrUQ9HqM1xxiYbP5XKARBVSdAjkZzbq8V-4haDqGI';

const pageChecks = [
  { path: '/', titleIncludes: ['BoxSofa'], canonical: canonicalHost },
  { path: '/category/all', titleIncludes: ['Compressed Sofas'], canonical: `${canonicalHost}/category/all` },
  { path: '/product/chameleon-mario-sofa-01', titleIncludes: ['Compressed Sofa', 'BoxSofa'], canonical: `${canonicalHost}/product/chameleon-mario-sofa-01`, productJsonLd: true },
  { path: '/product/pebble-sofa-01', titleIncludes: ['Compressed Sofa', 'BoxSofa'], canonical: `${canonicalHost}/product/pebble-sofa-01`, productJsonLd: true },
  { path: '/guides', titleIncludes: ['Compressed Sofa', 'Guides'], canonical: `${canonicalHost}/guides` },
  { path: '/guides/sofa-in-a-box-europe', titleIncludes: ['Sofa in a Box', 'BoxSofa'], canonical: `${canonicalHost}/guides/sofa-in-a-box-europe`, faqJsonLd: true },
  { path: '/es/guias', titleIncludes: ['Guías', 'Sofás Comprimidos'], canonical: `${canonicalHost}/es/guias` },
  { path: '/es/guias/sofa-en-caja-europa', titleIncludes: ['Sofá en Caja', 'BoxSofa'], canonical: `${canonicalHost}/es/guias/sofa-en-caja-europa`, faqJsonLd: true },
  { path: '/es/guias/sofa-comprimido-madrid-piso-pequeno', titleIncludes: ['Madrid', 'BoxSofa'], canonical: `${canonicalHost}/es/guias/sofa-comprimido-madrid-piso-pequeno`, faqJsonLd: true },
  { path: '/shipping', titleIncludes: ['Shipping'], canonical: `${canonicalHost}/shipping` },
  { path: '/returns', titleIncludes: ['Returns'], canonical: `${canonicalHost}/returns` },
  { path: '/privacy', titleIncludes: ['Privacy'], canonical: `${canonicalHost}/privacy` },
  { path: '/terms', titleIncludes: ['Terms'], canonical: `${canonicalHost}/terms` },
  { path: '/faq', titleIncludes: ['FAQ'], canonical: `${canonicalHost}/faq` },
];

const privatePaths = ['/login', '/cart', '/orders', '/admin'];
const mojibakePattern = /[\u934b\u934f\u6d93\u7f01\u6995\u6ccc\u6b0f\u5f42\ufffd]/;
const staleLaunchCopyPattern = /before online payment launch|before payment is enabled|real online payment will be enabled later|online card payment (?:will be added|coming) later/i;

function getAttribute(html, pattern) {
  const match = html.match(pattern);
  return match ? match[1] : '';
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertDescription(path, description) {
  assert(description, `${path} missing meta description`);
  assert(description.length >= 70, `${path} meta description is too short`);
  assert(description.length <= 220, `${path} meta description is too long`);
  assert(!mojibakePattern.test(description), `${path} meta description contains mojibake`);
}

async function fetchText(path) {
  const response = await fetch(baseUrl + path, { cache: 'no-store' });
  assert(response.ok, `${path} returned HTTP ${response.status}`);
  return response.text();
}

async function checkPage(route) {
  const html = await fetchText(route.path);
  assert(!mojibakePattern.test(html), `${route.path} contains mojibake text`);
  assert(!staleLaunchCopyPattern.test(html), `${route.path} contains stale pre-payment copy`);

  const title = getAttribute(html, /<title>(.*?)<\/title>/i);
  assert(title, `${route.path} missing title`);
  assert(title.length >= 10, `${route.path} title is too short`);
  assert(title.length <= 90, `${route.path} title is too long`);
  for (const fragment of route.titleIncludes) {
    assert(title.includes(fragment), `${route.path} title missing ${fragment}`);
  }

  const description = getAttribute(html, /<meta name="description" content="([^"]*)"/i);
  assertDescription(route.path, description);

  const canonical = getAttribute(html, /<link rel="canonical" href="([^"]*)"/i);
  assert(canonical === route.canonical, `${route.path} canonical mismatch: ${canonical}`);

  const robots = getAttribute(html, /<meta name="robots" content="([^"]*)"/i);
  assert(!/noindex/i.test(robots), `${route.path} should be indexable`);

  const ogTitle = getAttribute(html, /<meta property="og:title" content="([^"]*)"/i);
  const ogDescription = getAttribute(html, /<meta property="og:description" content="([^"]*)"/i);
  assert(ogTitle, `${route.path} missing og:title`);
  assertDescription(`${route.path} og`, ogDescription);

  if (route.path === '/' && process.env.EXPECT_GOOGLE_VERIFICATION === 'true') {
    const verification = getAttribute(html, /<meta name="google-site-verification" content="([^"]*)"/i);
    assert(verification === googleSiteVerification, '/ missing Google site verification');
  }

  if (route.path === '/returns') {
    assert(html.includes('14 calendar days'), '/returns missing 14-day withdrawal period');
    assert(html.includes('50% of the product purchase price'), '/returns missing maximum return-cost estimate');
    assert(html.includes('defective, damaged or incorrect'), '/returns missing seller-paid faulty-item returns');
  }

  if (route.productJsonLd) {
    assert(html.includes('application/ld+json'), `${route.path} missing JSON-LD`);
    assert(html.includes('"@type":"Product"'), `${route.path} missing Product JSON-LD`);
    assert(html.includes('"priceCurrency":"EUR"'), `${route.path} missing EUR offer`);
    assert(html.includes('"@type":"FAQPage"'), `${route.path} missing product FAQ JSON-LD`);
  }

  if (route.faqJsonLd) {
    assert(html.includes('application/ld+json'), `${route.path} missing JSON-LD`);
    assert(html.includes('"@type":"FAQPage"'), `${route.path} missing FAQPage JSON-LD`);
  }

  console.log(`OK SEO ${route.path}`);
}

async function checkPrivateRobots(path) {
  const html = await fetchText(path);
  const robots = getAttribute(html, /<meta name="robots" content="([^"]*)"/i);
  assert(/noindex,\s*nofollow/i.test(robots), `${path} missing noindex,nofollow`);
  console.log(`OK private SEO ${path}`);
}

async function checkRobotsAndSitemap() {
  const robots = await fetchText('/robots.txt');
  assert(robots.includes(`Sitemap: ${baseUrl}/sitemap.xml`) || robots.includes('Sitemap: https://boxsofa.eu/sitemap.xml'), '/robots.txt missing sitemap');
  for (const rule of ['Disallow: /admin', 'Disallow: /api', 'Disallow: /cart', 'Disallow: /login', 'Disallow: /orders']) {
    assert(robots.includes(rule), `/robots.txt missing ${rule}`);
  }
  console.log('OK SEO /robots.txt');

  const sitemap = await fetchText('/sitemap.xml');
  assert(sitemap.includes('https://boxsofa.eu/'), '/sitemap.xml missing production host');
  assert(!sitemap.includes('localhost'), '/sitemap.xml contains localhost');
  for (const path of ['/', '/category/all', '/product/chameleon-mario-sofa-01', '/product/single-029-fleece-01', '/product/pebble-sofa-01', '/product/cashew-sofa-01', '/guides', '/guides/sofa-in-a-box-europe', '/es/guias', '/es/guias/sofa-en-caja-europa', '/es/guias/sofa-comprimido-madrid-piso-pequeno', '/shipping', '/privacy']) {
    const url = path === '/' ? 'https://boxsofa.eu' : `https://boxsofa.eu${path}`;
    assert(sitemap.includes(url), `/sitemap.xml missing ${url}`);
  }
  for (const path of ['/product/chameleon-mario-sofa-02', '/product/waffle-sofa-10', '/product/cashew-sofa-05']) {
    assert(!sitemap.includes(`https://boxsofa.eu${path}`), `/sitemap.xml should not include SKU variant ${path}`);
  }
  console.log('OK SEO /sitemap.xml');
}

const failures = [];
for (const route of pageChecks) {
  try {
    await checkPage(route);
  } catch (error) {
    failures.push(error.message);
    console.error(`FAIL ${error.message}`);
  }
}
for (const path of privatePaths) {
  try {
    await checkPrivateRobots(path);
  } catch (error) {
    failures.push(error.message);
    console.error(`FAIL ${error.message}`);
  }
}
try {
  await checkRobotsAndSitemap();
} catch (error) {
  failures.push(error.message);
  console.error(`FAIL ${error.message}`);
}

if (failures.length) {
  console.error(`SEO audit failed for ${failures.length} check(s). Base URL: ${baseUrl}`);
  process.exit(1);
}

console.log(`SEO audit passed. Base URL: ${baseUrl}`);
