const baseUrl = (process.env.PRODUCTION_BASE_URL || 'https://boxsofa-platform.vercel.app').replace(/\/$/, '');
const expectedSiteUrl = process.env.EXPECTED_SITE_URL || 'https://boxsofa.eu';
const cronSecret = process.env.CRON_SECRET || '';
const environmentOnly = process.argv.includes('--environment-only');
const releaseMode = process.argv.includes('--release');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const emailProvider = (process.env.EMAIL_PROVIDER || '').trim().toLowerCase();
const emailFrom = (process.env.EMAIL_FROM || '').trim();
const emailApiKey = process.env.EMAIL_API_KEY || '';
const stripeSecretKey = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripePublishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

function isLikelyEmailAddress(value) {
  const emailMatch = value.match(/<([^>]+)>$/);
  const email = (emailMatch?.[1] || value).trim();
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email);
}

const configurationFailures = [];
if (environmentOnly) {
  if (!serviceRoleKey) configurationFailures.push('SUPABASE_SERVICE_ROLE_KEY is required.');
  if (emailProvider !== 'resend') configurationFailures.push('EMAIL_PROVIDER must be resend.');
  if (!isLikelyEmailAddress(emailFrom)) configurationFailures.push('EMAIL_FROM must be a valid sender address.');
  if (emailApiKey.length < 20) configurationFailures.push('EMAIL_API_KEY is missing or too short.');
  if (!cronSecret) configurationFailures.push('CRON_SECRET is required for production readiness.');
  if (cronSecret && cronSecret.length < 32) {
    configurationFailures.push('CRON_SECRET must be at least 32 characters for production readiness.');
  }
  if (releaseMode && process.env.EXPECT_PAYMENT_ENABLED !== 'true') {
    configurationFailures.push('EXPECT_PAYMENT_ENABLED must be true for release mode.');
  }
  if (releaseMode && !/^sk_(test|live)_[A-Za-z0-9_-]{20,}$/.test(stripeSecretKey)) {
    configurationFailures.push('STRIPE_SECRET_KEY is invalid.');
  }
  if (releaseMode && !/^whsec_[A-Za-z0-9_-]{20,}$/.test(stripeWebhookSecret)) {
    configurationFailures.push('STRIPE_WEBHOOK_SECRET is invalid.');
  }
  if (releaseMode && !/^pk_(test|live)_[A-Za-z0-9_-]{20,}$/.test(stripePublishableKey)) {
    configurationFailures.push('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is invalid.');
  }
}

if (configurationFailures.length) {
  console.error('Production readiness configuration is incomplete.');
  for (const failure of configurationFailures) console.error('- ' + failure);
  process.exit(1);
}

if (environmentOnly) {
  console.log('Production readiness configuration passed without printing secret values.');
  process.exit(0);
}

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
if (health.emailProviderConfigured !== true) {
  const emailIssues = Array.isArray(health.emailProviderStatus?.issues) && health.emailProviderStatus.issues.length
    ? health.emailProviderStatus.issues.join(' ')
    : 'Email provider production environment variables are missing or invalid';
  failures.push(emailIssues);
}
if (process.env.EXPECT_PAYMENT_ENABLED === 'true') {
  if (health.paymentEnabled !== true) failures.push('Stripe payment should be enabled for production');
} else if (health.paymentEnabled !== false) {
  failures.push('Payment should stay disabled before the final Stripe step');
}

if (failures.length) {
  console.error('Production readiness is not complete for ' + baseUrl);
  for (const failure of failures) console.error('- ' + failure);
  process.exitCode = 1;
  await new Promise((resolve) => setTimeout(resolve, 100));
} else {
  console.log('Production readiness passed for ' + baseUrl);
}
