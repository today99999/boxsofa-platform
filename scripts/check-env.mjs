import fs from 'fs';

const envPath = '.env.local';
const fileEnv = {};
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const index = trimmed.indexOf('=');
    if (index === -1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    fileEnv[key] = value;
  }
}

function getEnv(name) {
  return process.env[name] || fileEnv[name] || '';
}

const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_SITE_URL',
];

const recommendedBeforeLaunch = [
  'EMAIL_PROVIDER',
  'EMAIL_FROM',
  'EMAIL_API_KEY',
];

const missingRequired = required.filter((name) => !getEnv(name));
const missingRecommended = recommendedBeforeLaunch.filter((name) => !getEnv(name));

if (missingRequired.length) {
  console.error('Missing required environment variable names: ' + missingRequired.join(', '));
  process.exit(1);
}

console.log('Required environment variables are present: ' + required.join(', '));
if (missingRecommended.length) {
  console.warn('Recommended before launch, currently missing: ' + missingRecommended.join(', '));
} else {
  console.log('Email provider environment variables are present.');
}

const siteUrl = getEnv('NEXT_PUBLIC_SITE_URL');
if (!/^https?:\/\//.test(siteUrl)) {
  console.error('NEXT_PUBLIC_SITE_URL must start with http:// or https://');
  process.exit(1);
}

console.log('Environment check passed without printing secret values.');
