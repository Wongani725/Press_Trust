/**
 * Canonical resource/action permission keys used by the Roles & Permissions matrix.
 * Route-level access is still enforced via UserRole enums in `authorize()`, but
 * these keys are the documented shape for `Role.permissions` and for the frontend
 * access matrix. `bank_accounts.unmask` is also checked by the bank-account
 * /reveal endpoint.
 */
export const PERMISSION_CATALOG: Record<string, string[]> = {
  programs: ['read', 'create', 'update'],
  beneficiaries: ['read', 'create', 'update'],
  onboarding: ['read', 'update'],
  awards: ['read', 'create', 'update'],
  schools: ['read', 'create', 'update'],
  bank_accounts: ['read', 'unmask'],
  disbursements: ['read', 'create', 'approve'],
  reconciliation: ['read', 'update'],
  me: ['read', 'create'],
  reports: ['read'],
  admin_settings: ['read', 'update'],
  users: ['read', 'create', 'update'],
  roles: ['read', 'update'],
};

export const DEFAULT_ROLE_PERMISSIONS: Record<string, Record<string, string[]>> = {
  SuperAdmin: {
    programs: ['read', 'create', 'update'],
    beneficiaries: ['read', 'create', 'update'],
    onboarding: ['read', 'update'],
    awards: ['read', 'create', 'update'],
    schools: ['read', 'create', 'update'],
    bank_accounts: ['read', 'unmask'],
    disbursements: ['read', 'create', 'approve'],
    reconciliation: ['read', 'update'],
    me: ['read', 'create'],
    reports: ['read'],
    admin_settings: ['read', 'update'],
    users: ['read', 'create', 'update'],
    roles: ['read', 'update'],
  },
  Operations: {
    programs: ['read', 'create', 'update'],
    beneficiaries: ['read', 'create', 'update'],
    onboarding: ['read', 'update'],
    awards: ['read', 'create', 'update'],
    schools: ['read', 'create', 'update'],
    bank_accounts: ['read'],
    disbursements: ['read'],
    me: ['read', 'create'],
    reports: ['read'],
  },
  Finance: {
    beneficiaries: ['read'],
    awards: ['read'],
    schools: ['read'],
    bank_accounts: ['read', 'unmask'],
    disbursements: ['read', 'create', 'approve'],
    reconciliation: ['read', 'update'],
    reports: ['read'],
  },
  ME: {
    beneficiaries: ['read'],
    awards: ['read'],
    schools: ['read'],
    me: ['read', 'create'],
    reports: ['read'],
  },
  Auditor: {
    programs: ['read'],
    beneficiaries: ['read'],
    awards: ['read'],
    schools: ['read'],
    bank_accounts: ['read'],
    disbursements: ['read'],
    reconciliation: ['read'],
    me: ['read'],
    reports: ['read'],
  },
  Sponsor: {
    programs: ['read'],
    reports: ['read'],
  },
};

export function roleHasPermission(permissions: unknown, resource: string, action: string): boolean {
  if (!permissions || typeof permissions !== 'object') return false;
  const map = permissions as Record<string, unknown>;
  const actions = map[resource];
  return Array.isArray(actions) && actions.includes(action);
}
