export function normalizeHexMessage(value) {
  const raw = String(value || "").trim();
  const compact = raw.replace(/\s+/g, "");
  if (compact && /^[0-9a-fA-F]+$/.test(compact) && compact.length % 2 === 0) {
    return compact.toUpperCase().match(/.{1,2}/g).join(" ");
  }
  return Array.from(new TextEncoder().encode(raw))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}
