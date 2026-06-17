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

function bytesToText(bytes) {
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, "0"))
    .join(" ");
}

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(String(value || "").trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function hexToBytes(value) {
  const compact = String(value || "").replace(/\s+/g, "");
  if (!compact) return new Uint8Array();
  if (!/^[0-9a-fA-F]+$/.test(compact) || compact.length % 2 !== 0) {
    return new TextEncoder().encode(String(value || ""));
  }
  return Uint8Array.from(compact.match(/.{1,2}/g), (part) => Number.parseInt(part, 16));
}

export function normalizeBase64Message(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    atob(raw);
    return raw;
  } catch (_) {
    const bytes = new TextEncoder().encode(raw);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
  }
}

export function normalizeUtf16BeMessage(value) {
  const raw = String(value || "");
  const le = new TextEncoder("utf-16le").encode(raw);
  for (let i = 0; i + 1 < le.length; i += 2) {
    const a = le[i];
    le[i] = le[i + 1];
    le[i + 1] = a;
  }
  let binary = "";
  for (const byte of le) binary += String.fromCharCode(byte);
  return binary;
}

export function normalizeMessageForFormat(value, format) {
  if (format === "hex") return normalizeHexMessage(value);
  if (format === "base64") return normalizeBase64Message(value);
  if (format === "utf16be") return normalizeUtf16BeMessage(value);
  return String(value || "");
}

export function convertMessageFormat(value, fromFormat, toFormat) {
  let text = String(value || "");
  try {
    if (fromFormat === "hex") text = bytesToText(hexToBytes(value));
    else if (fromFormat === "base64") text = bytesToText(base64ToBytes(value));
  } catch (_) {
    text = String(value || "");
  }
  return normalizeMessageForFormat(text, toFormat);
}
