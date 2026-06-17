import { ref } from "vue";

const DEVICE_TOKEN_HISTORY_STORAGE_KEY = "portvortex.deviceTokenHistory";

function normalizeDeviceTokenHistory(items) {
  const seen = new Map();
  for (const item of items || []) {
    const token = String(typeof item === "string" ? item : item?.token || item?.value || "").trim();
    if (!token) continue;
    const existing = seen.get(token) || {};
    seen.set(token, {
      token,
      lastUsedAt: item?.lastUsedAt || existing.lastUsedAt || "",
      source: item?.source || existing.source || "",
      count: Math.max(Number(item?.count) || 1, Number(existing.count) || 1)
    });
  }
  return [...seen.values()]
    .sort((a, b) => String(b.lastUsedAt || "").localeCompare(String(a.lastUsedAt || "")))
    .slice(0, 50);
}

function loadDeviceTokenHistory() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(DEVICE_TOKEN_HISTORY_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return normalizeDeviceTokenHistory(parsed);
  } catch (_) {
    return [];
  }
}

export function useDeviceTokenHistory() {
  const deviceTokenHistory = ref(loadDeviceTokenHistory());

  function persistDeviceTokenHistory(records = deviceTokenHistory.value) {
    if (typeof window === "undefined") return;
    deviceTokenHistory.value = normalizeDeviceTokenHistory(records);
    window.localStorage.setItem(DEVICE_TOKEN_HISTORY_STORAGE_KEY, JSON.stringify(deviceTokenHistory.value));
  }

  function saveDeviceTokenHistory(token, source = "manual") {
    const next = String(token || "").trim();
    if (!next || typeof window === "undefined") return;
    const existing = deviceTokenHistory.value.find((item) => item.token === next);
    const record = {
      token: next,
      lastUsedAt: new Date().toISOString(),
      source,
      count: (Number(existing?.count) || 0) + 1
    };
    persistDeviceTokenHistory([record, ...deviceTokenHistory.value.filter((item) => item.token !== next)]);
  }

  function queryDeviceTokens(query, cb) {
    const keyword = String(query || "").trim().toLowerCase();
    cb(deviceTokenHistory.value
      .filter((item) => !keyword || item.token.toLowerCase().includes(keyword))
      .map((item) => ({ value: item.token, ...item })));
  }

  function onDeviceTokenSelect(item) {
    const token = typeof item === "string" ? item : item?.value;
    if (token) saveDeviceTokenHistory(token, "select");
  }

  function removeDeviceTokenHistory(token) {
    const next = String(token || "").trim();
    persistDeviceTokenHistory(deviceTokenHistory.value.filter((item) => item.token !== next));
  }

  function clearDeviceTokenHistory() {
    persistDeviceTokenHistory([]);
  }

  return {
    deviceTokenHistory,
    saveDeviceTokenHistory,
    queryDeviceTokens,
    onDeviceTokenSelect,
    removeDeviceTokenHistory,
    clearDeviceTokenHistory
  };
}
