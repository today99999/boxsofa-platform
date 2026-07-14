import { spawnSync } from 'child_process';

const primaryUrl = process.env.PRODUCTION_BASE_URL || 'https://boxsofa.eu';
const secondaryUrl = process.env.PRODUCTION_WWW_BASE_URL || 'https://www.boxsofa.eu';
const expectedSiteUrl = process.env.EXPECTED_SITE_URL || 'https://boxsofa.eu';

const checks = [
  { label: `smoke ${primaryUrl}`, command: 'npm', args: ['run', 'smoke'], env: { SMOKE_BASE_URL: primaryUrl } },
  { label: `seo ${primaryUrl}`, command: 'npm', args: ['run', 'seo:audit'], env: { SEO_BASE_URL: primaryUrl } },
  { label: `api auth ${primaryUrl}`, command: 'npm', args: ['run', 'api:auth-audit'], env: { API_AUDIT_BASE_URL: primaryUrl } },
  { label: `smoke ${secondaryUrl}`, command: 'npm', args: ['run', 'smoke'], env: { SMOKE_BASE_URL: secondaryUrl } },
  { label: `seo ${secondaryUrl}`, command: 'npm', args: ['run', 'seo:audit'], env: { SEO_BASE_URL: secondaryUrl } },
  { label: `api auth ${secondaryUrl}`, command: 'npm', args: ['run', 'api:auth-audit'], env: { API_AUDIT_BASE_URL: secondaryUrl } },
  {
    label: `readiness ${primaryUrl}`,
    command: 'npm',
    args: ['run', 'production:ready'],
    env: {
      PRODUCTION_BASE_URL: primaryUrl,
      EXPECTED_SITE_URL: expectedSiteUrl
    }
  }
];

const failures = [];
for (const check of checks) {
  console.log(`\n=== ${check.label} ===`);
  const result = spawnSync(check.command, check.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...check.env
    }
  });

  if (result.status !== 0) {
    failures.push(check.label);
  }
}

if (failures.length) {
  console.error('\nProduction verification is not complete.');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log('\nProduction verification passed.');
