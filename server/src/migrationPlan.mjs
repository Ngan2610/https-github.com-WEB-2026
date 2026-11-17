// Canonical, ordered migrations for fresh and existing SQL Server databases.
// Historic numbers 003/005 were unsafe password routines; 006/008/009 were reports/seeds.
// They are deliberately NOT schema migrations. Never insert fake PASS ledger rows.
export const MIGRATIONS = Object.freeze([
  '001_preflight.sql',
  '002_core.sql',
  '004_workflows.sql',
  '007_admin_workflows.sql',
  '010_ownership.sql',
  '011_payment_source.sql',
  '012_entitlements.sql',
  '013_legacy_ownership_audit.sql',
  '014_pricing.sql',
  '015_financial_integrity.sql',
  '016_foreign_keys.sql',
  '017_operational_tables.sql',
  '018_revenue_views.sql',
  '019_database_policies.sql',
  '020_admin_report_views.sql',
  '021_actor_identity.sql',
  '022_integrity_guards.sql',
]);
export const versionFor = name => Number(name.slice(0, 3));
export const splitBatches = s => s.replace(/^\s*USE\s+\[?DubchefDB\]?\s*;?\s*$/gim, '')
  .split(/^\s*GO(?:\s+\d+)?\s*(?:--[^\n]*)?$/gim).filter(x => x.trim());

// These releases differ only in line endings or SQL batch boundaries. A known
// historical checksum is accepted only for the specific equivalent revision.
const previousBatchChecksums = Object.freeze({
  '1b5864f31c78710bf942d379e5e90779293b4ced3d63ed1c1a8e752f7573400b':
    '62eeaaf795a3dc82835f0ad4b24854f853b6317cdd8cf46487b82c2cd39a7575',
  '8764ec33743e263a11fd7f5178e16c45ed637d14b1b0cea63769a51047e20d10':
    '9c60f20942f62d6a6df01d4c22b51938c7197dc0b757fbf65f48e2a58334f20c',
  '9f495892f3fb0b2757f776c91ca49cd85c16b8ad16bb932025c9fe45f1d36ae2':
    'cf5cbeff15c394fb5c648c817f12c3fa0526a8cf60895580ea17df5d9c1ff499',
  'e74758f3a2a7d100088a6f899637b78e1cd81d77180e74449399e84c30b43b8f':
    '2e5b7c85b5c7422d76c4bf0d3c8b54b62bb19aed6827e65e3c19836111c4c34c',
});

export function migrationChecksums(checksum) {
  const previous = previousBatchChecksums[checksum];
  return previous ? [checksum, previous] : [checksum];
}
