export type PublicRelationRow = {
  relname: string;
  relkind: string;
  relrowsecurity: boolean;
  reloptions: string | null;
};

export type PublicRelationExpectation = {
  relname: string;
  relkind: string;
  requiresRls: boolean;
  securityInvoker: boolean;
};

export type PolicyExpectation = {
  table: string;
  name: string;
  command: string;
  roles: string;
  qual: string | null;
  withCheck: string | null;
};

export type PublicPolicyRow = {
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
  searchPath?: string;
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
export const publicRelationExpectations: PublicRelationExpectation[];
export const publicPolicyExpectations: PolicyExpectation[];
export const criticalFunctions: CriticalFunction[];
export function validateBootstrapCatalog(catalog: {
  publicRelations: PublicRelationRow[];
  publicPolicies: PublicPolicyRow[];
  securityDefinerFunctions: SecurityDefinerFunctionRow[];
  relationExpectations?: PublicRelationExpectation[];
}): void;
export function executeBootstrapWithPGlite(): Promise<{
  coreTables: number;
  coreFunctions: number;
  ownerPolicies: number;
  rlsTables: number;
  criticalFunctions: number;
}>;
