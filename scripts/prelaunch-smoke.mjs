const baseUrl = (process.env.SMOKE_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/$/, '');

const publicChecks = [
  { path: '/', includes: ['BoxSofa'] },
  { path: '/category/all', includes: ['BoxSofa'] },
  { path: '/product/chameleon-mario-sofa-01', includes: ['BoxSofa', 'application/ld+json', 'https://schema.org', 'Product'] },
  { path: '/product/single-029-fleece-01', includes: ['BoxSofa', 'application/ld+json', 'https://schema.org', 'Product'] },
  { path: '/product/pebble-sofa-01', includes: ['BoxSofa', 'application/ld+json', 'https://schema.org', 'Product'] },
  { path: '/product/waffle-sofa-04', includes: ['BoxSofa', 'application/ld+json', 'https://schema.org', 'Product'] },
  { path: '/product/marshmallow-sofa-01', includes: ['BoxSofa', 'application/ld+json', 'https://schema.org', 'Product'] },
  { path: '/product/cashew-sofa-01', includes: ['BoxSofa', 'application/ld+json', 'https://schema.org', 'Product'] },
  { path: '/shipping', includes: ['BoxSofa'] },
  { path: '/returns', includes: ['BoxSofa'] },
  { path: '/privacy', includes: ['BoxSofa'] },
  { path: '/terms', includes: ['BoxSofa'] },
  { path: '/faq', includes: ['BoxSofa'] },
  { path: '/robots.txt', includes: ['Sitemap'] },
  { path: '/sitemap.xml', includes: ['https://boxsofa.eu/', '/category/all', '/product/chameleon-mario-sofa-01', '/shipping', '/privacy'] },
];

const privateChecks = [
  { path: '/login' },
  { path: '/cart' },
  { path: '/orders' },
  { path: '/admin' },
  { path: '/admin/launch' },
  { path: '/admin/traffic' },
  { path: '/admin/orders' },
  { path: '/admin/products' },
  { path: '/admin/reviews' },
  { path: '/admin/customers' },
  { path: '/admin/audit' },
  { path: '/admin/notifications' },
  { path: '/admin/support' },
];

const protectedApiChecks = [
  { path: '/api/admin/readiness' },
  { path: '/api/admin/products' },
  { path: '/api/admin/support' },
  { path: '/api/admin/notifications' },
  { path: '/api/customer/orders' },
  { path: '/api/customer/profile' },
];

const mojibakePattern = /鍗|鍙|涓|缁|榫|娌|欏|彂|�/;
const stableMojibakePattern = /[\u934b\u934f\u6d93\u7f01\u6995\u6ccc\u6b0f\u5f42\ufffd]/;

async function checkPublicRoute(route) {
  const response = await fetch(baseUrl + route.path, { cache: 'no-store' });
  if (!response.ok) throw new Error(route.path + ' returned HTTP ' + response.status);
  const frameHeader = response.headers.get('x-frame-options');
  if (frameHeader !== 'SAMEORIGIN') throw new Error(route.path + ' missing X-Frame-Options SAMEORIGIN');
  const text = await response.text();
  if (stableMojibakePattern.test(text)) throw new Error(route.path + ' contains mojibake text');
  for (const fragment of route.includes || []) {
    if (!text.includes(fragment)) throw new Error(route.path + ' missing expected text: ' + fragment);
  }
}

async function checkPrivateRoute(route) {
  const response = await fetch(baseUrl + route.path, { cache: 'no-store' });
  if (!response.ok) throw new Error(route.path + ' returned HTTP ' + response.status);
  const cacheControl = response.headers.get('cache-control') || '';
  if (!cacheControl.includes('no-store')) throw new Error(route.path + ' missing no-store cache header');
  const text = await response.text();
  if (stableMojibakePattern.test(text)) throw new Error(route.path + ' contains mojibake text');
  if (!/name="robots" content="noindex,\s*nofollow"/.test(text)) {
    throw new Error(route.path + ' missing noindex,nofollow metadata');
  }
}

async function checkProtectedApi(route) {
  const response = await fetch(baseUrl + route.path, { cache: 'no-store' });
  if (response.status !== 401 && response.status !== 403 && response.status !== 503) {
    throw new Error(route.path + ' should reject anonymous access, received HTTP ' + response.status);
  }
}

async function checkHealth() {
  const response = await fetch(baseUrl + '/api/health', { cache: 'no-store' });
  if (!response.ok) throw new Error('/api/health returned HTTP ' + response.status);
  const cacheControl = response.headers.get('cache-control') || '';
  if (!cacheControl.includes('no-store')) throw new Error('/api/health missing no-store cache header');
  const body = await response.json();
  if (body.ok !== true || body.service !== 'boxsofa-platform') {
    throw new Error('/api/health returned unexpected payload');
  }
}

const failures = [];
for (const route of publicChecks) {
  try {
    await checkPublicRoute(route);
    console.log('OK ' + route.path);
  } catch (error) {
    failures.push(error.message);
    console.error('FAIL ' + error.message);
  }
}
for (const route of privateChecks) {
  try {
    await checkPrivateRoute(route);
    console.log('OK private ' + route.path);
  } catch (error) {
    failures.push(error.message);
    console.error('FAIL ' + error.message);
  }
}
for (const route of protectedApiChecks) {
  try {
    await checkProtectedApi(route);
    console.log('OK protected ' + route.path);
  } catch (error) {
    failures.push(error.message);
    console.error('FAIL ' + error.message);
  }
}
try {
  await checkHealth();
  console.log('OK /api/health');
} catch (error) {
  failures.push(error.message);
  console.error('FAIL ' + error.message);
}

if (failures.length) {
  console.error('Smoke test failed for ' + failures.length + ' check(s). Base URL: ' + baseUrl);
  process.exit(1);
}

console.log('Smoke test passed. Base URL: ' + baseUrl);
