export function normalizeMigrationText(sql: string): string;
export function verifyMigrationManifest(): {
  migrations: number;
  remoteCheckpoints: number;
};
