export type PublicTableRow = {
  relname: string;
  relrowsecurity: boolean;
};

export type PolicyExpectation = {
  table: string;
  name: string;
  command: string;
  roles: string;
  qual: string | null;
  withCheck: string | null;
};

export type SensitivePolicyRow = {
  tablename: string;
  policyname: string;
  cmd: string;
  roles: string;
  qual: string | null;
  with_check: string | null;
};

export type CriticalFunction = {
  name: string;
  identity: string;
  authenticated: boolean;
  serviceRole?: boolean;
};

export type SecurityDefinerFunctionRow = {
  proname: string;
  identity_arguments: string;
  prosecdef: boolean;
  proconfig: string | null;
  public_execute: boolean;
  anon_execute: boolean;
  authenticated_execute: boolean;
  service_role_execute: boolean;
  postgres_execute: boolean;
};

export const publicBaseTables: string[];
export const sensitivePolicyTables: string[];
export const sensitivePolicyExpectations: PolicyExpectation[];
export const criticalFunctions: CriticalFunction[];
export function validateBootstrapCatalog(catalog: {
  publicTables: PublicTableRow[];
  sensitivePolicies: SensitivePolicyRow[];
  securityDefinerFunctions: SecurityDefinerFunctionRow[];
}): void;
export function executeBootstrapWithPGlite(): Promise<{
  coreTables: number;
  coreFunctions: number;
  ownerPolicies: number;
  rlsTables: number;
  criticalFunctions: number;
}>;
