const baseUrl = (process.env.PRODUCTION_BASE_URL || 'https://boxsofa-platform.vercel.app').replace(/\/$/, '');
const expectedSiteUrl = process.env.EXPECTED_SITE_URL || 'https://boxsofa.eu';

const response = await fetch(baseUrl + '/api/health', { cache: 'no-store' });
if (!response.ok) {
  console.error('Health endpoint returned HTTP ' + response.status);
  process.exit(1);
}

const health = await response.json();
const failures = [];
if (health.ok !== true) failures.push('health.ok is not true');
if (health.service !== 'boxsofa-platform') failures.push('unexpected service name');
if (health.siteUrl !== expectedSiteUrl) failures.push('NEXT_PUBLIC_SITE_URL should be ' + expectedSiteUrl + ', received ' + health.siteUrl);
if (health.supabaseConfigured !== true) failures.push('Supabase production environment variables are missing');
if (health.emailProviderConfigured !== true) failures.push('Email provider production environment variables are missing');
if (health.paymentEnabled !== false) failures.push('Payment should stay disabled before the final Stripe step');

if (failures.length) {
  console.error('Production readiness is not complete for ' + baseUrl);
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
  await new Promise((resolve) => setTimeout(resolve, 100));
} else {
  console.log('Production readiness passed for ' + baseUrl);
}
