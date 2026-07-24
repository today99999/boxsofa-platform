import { spawnSync } from 'child_process';

const npmCliPath = process.env.npm_execpath;
const npmCommand = npmCliPath ? process.execPath : process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmArgs = (script) => (npmCliPath ? [npmCliPath, 'run', script] : ['run', script]);
const primaryUrl = process.env.PRODUCTION_BASE_URL || 'https://boxsofa.eu';
const secondaryUrl = process.env.PRODUCTION_WWW_BASE_URL || 'https://www.boxsofa.eu';
const expectedSiteUrl = process.env.EXPECTED_SITE_URL || 'https://boxsofa.eu';
const releaseMode = process.argv.includes('--release') || !process.argv.includes('--local');

if (releaseMode && process.env.EXPECT_PAYMENT_ENABLED !== 'true') {
  console.error('Release verification requires EXPECT_PAYMENT_ENABLED=true.');
  process.exit(1);
}

function withoutRemoteMigrationSecrets(env = process.env) {
  const sanitized = { ...env };
  delete sanitized.SUPABASE_ACCESS_TOKEN;
  delete sanitized.SUPABASE_SERVICE_ROLE_KEY;
  return sanitized;
}

function remoteMigrationVerifierEnv() {
  const sanitized = withoutRemoteMigrationSecrets();
  if (process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      ...sanitized,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
    };
  }
  if (process.env.SUPABASE_PROJECT_REF && process.env.SUPABASE_ACCESS_TOKEN) {
    return {
      ...sanitized,
      SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF,
      SUPABASE_ACCESS_TOKEN: process.env.SUPABASE_ACCESS_TOKEN
    };
  }
  return sanitized;
}

const checks = [
  ...(releaseMode ? [{
    label: 'remote Supabase migration history',
    command: npmCommand,
    args: npmArgs('db:migrations:verify-remote'),
    env: remoteMigrationVerifierEnv(),
    failFast: true
  }] : []),
  { label: `smoke ${primaryUrl}`, command: npmCommand, args: npmArgs('smoke'), env: { SMOKE_BASE_URL: primaryUrl } },
  { label: `seo ${primaryUrl}`, command: npmCommand, args: npmArgs('seo:audit'), env: { SEO_BASE_URL: primaryUrl } },
  { label: `api auth ${primaryUrl}`, command: npmCommand, args: npmArgs('api:auth-audit'), env: { API_AUDIT_BASE_URL: primaryUrl } },
  { label: `smoke ${secondaryUrl}`, command: npmCommand, args: npmArgs('smoke'), env: { SMOKE_BASE_URL: secondaryUrl } },
  { label: `seo ${secondaryUrl}`, command: npmCommand, args: npmArgs('seo:audit'), env: { SEO_BASE_URL: secondaryUrl } },
  { label: `api auth ${secondaryUrl}`, command: npmCommand, args: npmArgs('api:auth-audit'), env: { API_AUDIT_BASE_URL: secondaryUrl } },
  {
    label: `readiness ${primaryUrl}`,
    command: npmCommand,
    args: npmArgs('production:ready'),
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
    shell: process.platform === 'win32' && !npmCliPath,
    env: {
      ...withoutRemoteMigrationSecrets(),
      ...check.env
    }
  });

  if (result.error) {
    console.error(result.error.message);
  }

  if (result.status !== 0) {
    failures.push(check.label);
    if (check.failFast) {
      console.error('\nProduction verification stopped: required release gate failed.');
      process.exit(1);
    }
  }
}

if (failures.length) {
  console.error('\nProduction verification is not complete.');
  for (const failure of failures) console.error('- ' + failure);
  process.exit(1);
}

console.log(releaseMode ? '\nRelease production verification passed.' : '\nLocal-compatible production verification passed.');
