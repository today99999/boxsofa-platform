const watched = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "POSTGRES_PASSWORD"
];

console.log(JSON.stringify({
  phase: process.argv[2],
  values: Object.fromEntries(watched.map((name) => [name, process.env[name] ?? null]))
}));
