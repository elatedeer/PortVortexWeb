<script setup>
import { computed, ref } from "vue";
import ElButton from "@/components/shadcn-compat/ElButton.vue";
import ElCard from "@/components/shadcn-compat/ElCard.vue";
import ElInput from "@/components/shadcn-compat/ElInput.vue";
import ElOption from "@/components/shadcn-compat/ElOption.vue";
import ElSelect from "@/components/shadcn-compat/ElSelect.vue";

const props = defineProps({
  labels: { type: Object, required: true }
});

const deviceGroups = ref([
  { id: "default", name: "Default", version: "" }
]);
const selectedGroupId = ref("default");
const newGroupName = ref("");
const tokenImportText = ref("");
const authImportText = ref("");
const authImporting = ref(false);
const authImportMessage = ref("");
const groupDevices = ref([]);
const batchFirmwareFile = ref(null);
const batchFlashMode = ref("swd");
const batchUpgrading = ref(false);
const batchResults = ref([]);

const selectedGroup = computed(() => deviceGroups.value.find((group) => group.id === selectedGroupId.value) || deviceGroups.value[0]);
const selectedGroupDevices = computed(() => devicesInGroup(selectedGroupId.value));

function devicesInGroup(groupId) {
  return groupDevices.value.filter((device) => device.groupId === groupId);
}

function findGroupByName(name) {
  const text = String(name || "").trim();
  return deviceGroups.value.find((group) => group.name === text) || null;
}

function ensureGroup(name, version = "") {
  const text = String(name || "").trim();
  if (!text) return selectedGroupId.value;
  const existing = findGroupByName(text);
  if (existing) {
    if (version && !existing.version) existing.version = version;
    return existing.id;
  }
  const id = `group-${Date.now()}-${deviceGroups.value.length}`;
  deviceGroups.value.push({ id, name: text, version: String(version || "") });
  return id;
}

function normalizeToken(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const topicMatch = text.match(/^\/topic\/([A-Za-z0-9_-]+)(?:\/.*)?$/);
  const token = topicMatch ? topicMatch[1] : text.replace(/^productid/, "");
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : "";
}

function upsertDevice({ token, name, groupName, groupVersion, groupId }) {
  const normalized = normalizeToken(token);
  if (!normalized) return false;
  const targetGroupId = groupId || ensureGroup(groupName, groupVersion);
  const existing = groupDevices.value.find((device) => device.token === normalized);
  if (existing) {
    existing.name = name || existing.name;
    existing.groupId = targetGroupId;
    return true;
  }
  groupDevices.value.push({
    id: `dev-${Date.now()}-${groupDevices.value.length}`,
    name: name || `${props.labels.device || "Device"} ${groupDevices.value.length + 1}`,
    token: normalized,
    groupId: targetGroupId
  });
  return true;
}

function createGroup() {
  const name = String(newGroupName.value || "").trim();
  if (!name) return;
  const id = ensureGroup(name);
  selectedGroupId.value = id;
  newGroupName.value = "";
}

function importTokens() {
  const lines = String(tokenImportText.value || "")
    .split(/\r?\n|,|;/)
    .map((line) => line.trim())
    .filter(Boolean);
  for (const line of lines) {
    upsertDevice({ token: line, groupId: selectedGroupId.value });
  }
  tokenImportText.value = "";
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return { error: text };
  }
}

async function submitDeviceAuthImport(overwrite = false) {
  authImporting.value = true;
  authImportMessage.value = "";
  try {
    const response = await fetch("/api/device-auth/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: authImportText.value, overwrite })
    });
    const payload = await readJsonResponse(response);
    if (response.status === 409 && payload.duplicates?.length) {
      const ok = window.confirm(`${props.labels.deviceAuthDuplicateConfirm}: ${payload.duplicates.join(", ")}`);
      if (ok) return submitDeviceAuthImport(true);
      authImportMessage.value = props.labels.deviceAuthDuplicateCanceled;
      return null;
    }
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    authImportMessage.value = `${props.labels.deviceAuthImported}: ${payload.imported || 0}`;
    authImportText.value = "";
    return payload;
  } catch (err) {
    authImportMessage.value = err.message;
    return null;
  } finally {
    authImporting.value = false;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function groupNameById(groupId) {
  return deviceGroups.value.find((group) => group.id === groupId)?.name || "";
}

function groupVersionById(groupId) {
  return deviceGroups.value.find((group) => group.id === groupId)?.version || "";
}

function exportDevicesExcel() {
  const rows = groupDevices.value.map((device) => ({
    name: device.name,
    device_id: device.token,
    group: groupNameById(device.groupId),
    version: groupVersionById(device.groupId)
  }));
  const body = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.device_id)}</td>
      <td>${escapeHtml(row.group)}</td>
      <td>${escapeHtml(row.version)}</td>
    </tr>`).join("");
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<table>
  <thead><tr><th>name</th><th>device_id</th><th>group</th><th>version</th></tr></thead>
  <tbody>${body}</tbody>
</table>
</body>
</html>`;
  const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `portvortex-devices-${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function importRows(rows) {
  for (const row of rows) {
    const [name, token, group, version] = row;
    upsertDevice({ name, token, groupName: group, groupVersion: version });
  }
}

function importHtmlTable(text) {
  const documentModel = new DOMParser().parseFromString(text, "text/html");
  const rows = [...documentModel.querySelectorAll("tbody tr, table tr")]
    .map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent.trim()))
    .filter((cells) => cells.length >= 2);
  importRows(rows);
}

function importCsv(text) {
  const rows = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseCsvLine)
    .filter((cells) => cells.length >= 2 && !["token", "device_id"].includes(String(cells[1] || "").toLowerCase()));
  importRows(rows);
}

async function importExcelFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  const text = await file.text();
  if (/<table[\s>]/i.test(text)) importHtmlTable(text);
  else importCsv(text);
}

function onBatchFirmwareChange(event) {
  batchFirmwareFile.value = event.target.files?.[0] || null;
}

async function createFlashJob(device) {
  const data = new FormData();
  data.set("firmwareFile", batchFirmwareFile.value);
  data.set("deviceToken", device.token);
  data.set("flashMode", batchFlashMode.value);
  data.set("target", "stm32f4");
  data.set("baseAddr", "0x08000000");
  data.set("erase", "sector");
  data.set("version", selectedGroup.value.version || "");
  data.set("versionAddr", "0x0800FFF0");
  data.set("singlePacket", "0");
  data.set("noResetAfterProgram", "0");
  data.set("algoBlobPresent", "0");
  const response = await fetch("/api/flash", { method: "POST", body: data });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
}

async function batchUpgradeGroup() {
  if (!batchFirmwareFile.value || !selectedGroupDevices.value.length) return;
  batchUpgrading.value = true;
  batchResults.value = [];
  for (const device of selectedGroupDevices.value) {
    const row = { token: device.token, status: "running", message: "" };
    batchResults.value.push(row);
    try {
      const payload = await createFlashJob(device);
      row.status = "submitted";
      row.message = payload.id || "";
    } catch (err) {
      row.status = "failed";
      row.message = err.message;
    }
  }
  batchUpgrading.value = false;
}
</script>

<template>
  <section class="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
    <el-card class="control-card" shadow="never">
      <template #header><span class="text-base font-semibold">{{ labels.deviceGroups }}</span></template>
      <div class="space-y-3">
        <button
          v-for="group in deviceGroups"
          :key="group.id"
          type="button"
          :class="['group-item', selectedGroupId === group.id ? 'active' : '']"
          @click="selectedGroupId = group.id"
        >
          <span class="min-w-0">
            <span class="block truncate font-medium">{{ group.name }}</span>
            <span class="block truncate text-xs text-muted-foreground">{{ labels.groupVersion }}: {{ group.version || "-" }}</span>
          </span>
          <span class="text-xs text-muted-foreground">{{ devicesInGroup(group.id).length }} {{ labels.devices }}</span>
        </button>
        <div class="space-y-2 border-t border-border pt-3">
          <el-input v-model="newGroupName" :placeholder="labels.newGroupName" />
          <el-button type="primary" @click="createGroup">{{ labels.createGroup }}</el-button>
        </div>
      </div>
    </el-card>

    <div class="space-y-5">
      <el-card class="control-card" shadow="never">
        <template #header>
          <div class="flex items-center justify-between gap-4">
            <span class="text-base font-semibold">{{ labels.importByToken }}</span>
            <div class="flex gap-2">
              <el-button :disabled="!groupDevices.length" @click="exportDevicesExcel">{{ labels.exportExcel }}</el-button>
              <label class="inline-flex h-8 cursor-pointer items-center rounded-lg border border-input px-3 text-sm hover:bg-accent">
                {{ labels.importExcel }}
                <input class="hidden" type="file" accept=".xls,.html,.htm,.csv,text/html,text/csv" @change="importExcelFile">
              </label>
            </div>
          </div>
        </template>
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
          <el-input v-model="tokenImportText" type="textarea" :placeholder="labels.tokenImportPlaceholder" />
          <el-button type="primary" @click="importTokens">{{ labels.import }}</el-button>
        </div>
      </el-card>

      <el-card class="control-card" shadow="never">
        <template #header><span class="text-base font-semibold">{{ labels.deviceAuthImport }}</span></template>
        <div class="space-y-3">
          <div class="text-xs text-muted-foreground">{{ labels.deviceAuthImportHint }}</div>
          <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px]">
            <el-input v-model="authImportText" type="textarea" :placeholder="labels.deviceAuthImportPlaceholder" />
            <el-button type="primary" :loading="authImporting" @click="submitDeviceAuthImport(false)">{{ labels.import }}</el-button>
          </div>
          <div v-if="authImportMessage" class="text-sm text-muted-foreground">{{ authImportMessage }}</div>
        </div>
      </el-card>

      <el-card class="control-card" shadow="never">
        <template #header><span class="text-base font-semibold">{{ labels.groupUpgrade }}</span></template>
        <div class="grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_160px]">
          <el-input v-model="selectedGroup.version" :placeholder="labels.groupVersion" />
          <input class="file-input" type="file" accept=".bin,.hex,application/octet-stream,text/plain" @change="onBatchFirmwareChange">
          <el-button
            type="primary"
            :loading="batchUpgrading"
            :disabled="!batchFirmwareFile || !selectedGroupDevices.length"
            @click="batchUpgradeGroup"
          >
            {{ labels.batchUpgrade }}
          </el-button>
        </div>
        <div class="mt-3 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)]">
          <el-select v-model="batchFlashMode">
            <el-option label="SWD" value="swd" />
            <el-option label="UART" value="uart" />
            <el-option label="RS485" value="rs485" />
          </el-select>
          <div class="text-xs text-muted-foreground">{{ labels.groupUpgradeHint }}</div>
        </div>
        <div v-if="batchResults.length" class="mt-4 space-y-2 text-sm">
          <div v-for="item in batchResults" :key="item.token" class="rounded-lg border border-border p-2">
            <span class="font-mono">{{ item.token }}</span>
            <span class="mx-2 text-muted-foreground">{{ item.status }}</span>
            <span class="text-muted-foreground">{{ item.message }}</span>
          </div>
        </div>
      </el-card>

      <el-card class="control-card" shadow="never">
        <template #header><span class="text-base font-semibold">{{ labels.groupDevices }}</span></template>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div v-for="device in selectedGroupDevices" :key="device.id" class="device-card">
            <div class="font-medium">{{ device.name }}</div>
            <div class="mt-2 break-all font-mono text-xs">{{ device.token }}</div>
            <el-select v-model="device.groupId" class="mt-3">
              <el-option v-for="group in deviceGroups" :key="group.id" :label="group.name" :value="group.id" />
            </el-select>
          </div>
          <div v-if="!selectedGroupDevices.length" class="text-sm text-muted-foreground">{{ labels.waiting }}</div>
        </div>
      </el-card>
    </div>
  </section>
</template>
