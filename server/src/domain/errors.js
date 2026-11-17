/** Domain failures are mapped to HTTP by the application boundary. */
export class DomainError extends Error {
  constructor(code, status = 400, details = {}) {
    super(code); this.code = code; this.status = status; this.domainError = true;
    this.details = details;
  }
}
export const fail = (code, status = 400) => { throw new DomainError(code, status); };
export function positiveId(value, code = 'invalid') {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) fail(code);
  return id;
}
export const isEmail = value => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export function requireRole(user, role) { if (user?.role !== role) fail('forbidden', 403); }
