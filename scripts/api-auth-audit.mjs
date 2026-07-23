const baseUrl = (
  process.env.API_AUDIT_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  'http://localhost:3000'
).replace(/\/$/, '');

const protectedChecks = [
  { method: 'GET', path: '/api/admin/readiness' },
  { method: 'GET', path: '/api/admin/audit' },
  { method: 'GET', path: '/api/admin/leads' },
  { method: 'GET', path: '/api/admin/notifications' },
  { method: 'POST', path: '/api/admin/notifications/test' },
  { method: 'PATCH', path: '/api/admin/notifications/test-notification-id', body: { action: 'requeue' } },
  { method: 'GET', path: '/api/admin/products' },
  { method: 'PATCH', path: '/api/admin/products', body: { productId: 'BS-TEST', stock: 1 } },
  { method: 'PATCH', path: '/api/admin/reviews/test-review-id', body: { pinned: true } },
  { method: 'GET', path: '/api/admin/support' },
  { method: 'PATCH', path: '/api/admin/support/test-thread-id', body: { status: 'closed' } },
  // This route intentionally returns 400 before auth when Supabase is absent locally.
  { method: 'POST', path: '/api/admin/test-customer', allowedStatuses: [400, 401, 403, 503] },
  { method: 'GET', path: '/api/auth/profile' },
  { method: 'GET', path: '/api/customer/orders' },
  { method: 'GET', path: '/api/customer/profile' },
  { method: 'PUT', path: '/api/customer/profile', body: { fullName: 'Audit Customer' } },
  { method: 'GET', path: '/api/orders' },
  { method: 'PATCH', path: '/api/orders/BX-AUTH-AUDIT', body: { status: 'paid_confirmed' } },
  { method: 'POST', path: '/api/reviews', body: {
    productSlug: 'chameleon-mario-sofa-01',
    styleId: 'chameleon-mario-sofa',
    customerName: 'Audit Customer',
    country: 'ES',
    rating: 5,
    comment: 'Audit review should require login.',
    locale: 'en'
  } }
];

const publicChecks = [
  { method: 'GET', path: '/api/health', allowedStatuses: [200] },
  { method: 'POST', path: '/api/leads', body: {}, allowedStatuses: [400] },
  { method: 'POST', path: '/api/analytics/consent', body: {}, allowedStatuses: [400] },
  { method: 'POST', path: '/api/analytics/consent', rawBody: '{', allowedStatuses: [400] },
  { method: 'GET', path: '/api/analytics/consent', allowedStatuses: [200] },
  { method: 'POST', path: '/api/analytics/events', body: {}, allowedStatuses: [400] },
  { method: 'POST', path: '/api/analytics/events', rawBody: '{', allowedStatuses: [400] },
  { method: 'POST', path: '/api/orders', body: {}, allowedStatuses: [400] },
  { method: 'GET', path: '/api/orders/BX-AUTH-AUDIT', allowedStatuses: [400, 404, 405, 503] },
  { method: 'GET', path: '/api/support', allowedStatuses: [400] },
  { method: 'POST', path: '/api/support', body: {}, allowedStatuses: [400] },
  { method: 'PATCH', path: '/api/support', body: {}, allowedStatuses: [400] }
];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(check) {
  const options = {
    method: check.method,
    cache: 'no-store',
    headers: {}
  };

  if (check.rawBody !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = check.rawBody;
  } else if (check.body !== undefined) {
    options.headers['content-type'] = 'application/json';
    options.body = JSON.stringify(check.body);
  }

  return fetch(baseUrl + check.path, options);
}

async function checkProtectedApi(check) {
  const response = await request(check);
  assert(
    (check.allowedStatuses ?? [401, 403, 503]).includes(response.status),
    `${check.method} ${check.path} should reject anonymous access, received HTTP ${response.status}`
  );
  console.log(`OK protected ${check.method} ${check.path}`);
}

async function checkPublicApi(check) {
  const response = await request(check);
  assert(
    check.allowedStatuses.includes(response.status),
    `${check.method} ${check.path} expected HTTP ${check.allowedStatuses.join('/')} but received ${response.status}`
  );
  console.log(`OK public ${check.method} ${check.path}`);
}

const failures = [];
for (const check of protectedChecks) {
  try {
    await checkProtectedApi(check);
  } catch (error) {
    failures.push(error.message);
    console.error(`FAIL ${error.message}`);
  }
}

for (const check of publicChecks) {
  try {
    await checkPublicApi(check);
  } catch (error) {
    failures.push(error.message);
    console.error(`FAIL ${error.message}`);
  }
}

if (failures.length) {
  console.error(`API auth audit failed for ${failures.length} check(s). Base URL: ${baseUrl}`);
  process.exit(1);
}

console.log(`API auth audit passed. Base URL: ${baseUrl}`);
