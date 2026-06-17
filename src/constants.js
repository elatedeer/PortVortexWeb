export const DEFAULT_DEVICE_TOKEN = "6bf3418a09725d07";

export const QUICK_PHRASES = ["ping", "status?", "hello", "reset", "help"];

export const COMMON_FORMAT_OPTIONS = [
  { label: "ASCII", value: "ascii" },
  { label: "UTF-8", value: "utf8" },
  { label: "HEX", value: "hex" }
];

export const MORE_FORMAT_OPTIONS = [
  { label: "Unicode / UTF-16LE", value: "utf16le" },
  { label: "Unicode / UTF-16BE", value: "utf16be" },
  { label: "Unicode", value: "unicode" },
  { label: "GBK", value: "gbk" },
  { label: "GB18030", value: "gb18030" },
  { label: "Base64", value: "base64" }
];

export const FORMAT_OPTIONS = [...COMMON_FORMAT_OPTIONS, ...MORE_FORMAT_OPTIONS];
