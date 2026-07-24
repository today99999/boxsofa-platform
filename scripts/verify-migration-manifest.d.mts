export function normalizeMigrationText(sql: string): string;
export function normalizeRepositoryMigrationText(sql: string): string;
export function verifyMigrationManifest(): {
  migrations: number;
  remoteCheckpoints: number;
};
