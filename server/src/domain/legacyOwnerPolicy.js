const EVIDENCE_TYPES = new Set(['payment_reference', 'signed_receipt', 'support_ticket']);
const clean = (s) => typeof s === 'string' ? s.trim() : '';

export function validateLegacyOwnerLink(data) {
  const userId = data?.userId;
  const evidenceType = clean(data?.evidenceType);
  const evidenceRef = clean(data?.evidenceRef);
  const note = clean(data?.note);
  if (!Number.isSafeInteger(userId) || userId < 1 || userId > 2147483647 || !EVIDENCE_TYPES.has(evidenceType) ||
      evidenceRef.length < 4 || evidenceRef.length > 120 || note.length < 15 || note.length > 500 ||
      data?.confirmed !== true) return null;
  return { userId, evidenceType, evidenceRef, note };
}

