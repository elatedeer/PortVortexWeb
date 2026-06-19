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

function textToUtf16LeBytes(value) {
  const text = String(value || "");
  const out = new Uint8Array(text.length * 2);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    out[index * 2] = code & 0xff;
    out[index * 2 + 1] = (code >> 8) & 0xff;
  }
  return out;
}

function utf16LeBytesToText(bytes) {
  let text = "";
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    text += String.fromCharCode(bytes[index] | (bytes[index + 1] << 8));
  }
  return text;
}

function swapPairs(bytes) {
  const out = Uint8Array.from(bytes);
  for (let index = 0; index + 1 < out.length; index += 2) {
    const value = out[index];
    out[index] = out[index + 1];
    out[index + 1] = value;
  }
  return out;
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
  const le = textToUtf16LeBytes(raw);
  const be = swapPairs(le);
  return bytesToHex(be);
}

export function normalizeMessageForFormat(value, format) {
  if (format === "hex") return normalizeHexMessage(value);
  if (format === "base64") return normalizeBase64Message(value);
  if (format === "unicode" || format === "utf16le") return bytesToHex(textToUtf16LeBytes(value));
  if (format === "utf16be") return normalizeUtf16BeMessage(value);
  return String(value || "");
}

export function convertMessageFormat(value, fromFormat, toFormat) {
  let text = String(value || "");
  try {
    if (fromFormat === "hex") text = bytesToText(hexToBytes(value));
    else if (fromFormat === "base64") text = bytesToText(base64ToBytes(value));
    else if (fromFormat === "unicode" || fromFormat === "utf16le") text = utf16LeBytesToText(hexToBytes(value));
    else if (fromFormat === "utf16be") text = utf16LeBytesToText(swapPairs(hexToBytes(value)));
  } catch (_) {
    text = String(value || "");
  }
  return normalizeMessageForFormat(text, toFormat);
}
