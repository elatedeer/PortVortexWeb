<script setup>
import { ref } from "vue";
import ElButton from "@/components/shadcn-compat/ElButton.vue";
import ElCard from "@/components/shadcn-compat/ElCard.vue";
import ElInput from "@/components/shadcn-compat/ElInput.vue";
import ElOption from "@/components/shadcn-compat/ElOption.vue";
import ElSelect from "@/components/shadcn-compat/ElSelect.vue";

const props = defineProps({
  labels: { type: Object, required: true }
});

const deviceGroups = ref([
  { id: "default", name: "Default" }
]);
const selectedGroupId = ref("default");
const newGroupName = ref("");
const tokenImportText = ref("");
const importDeviceType = ref("UART1");
const groupDevices = ref([]);

function devicesInGroup(groupId) {
  return groupDevices.value.filter((device) => device.groupId === groupId);
}

function findGroupByName(name) {
  const text = String(name || "").trim();
  return deviceGroups.value.find((group) => group.name === text) || null;
}

function ensureGroup(name) {
  const text = String(name || "").trim();
  if (!text) return selectedGroupId.value;
  const existing = findGroupByName(text);
  if (existing) return existing.id;
  const id = `group-${Date.now()}-${deviceGroups.value.length}`;
  deviceGroups.value.push({ id, name: text });
  return id;
}

function normalizeToken(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const productMatch = text.match(/productid([A-Za-z0-9_-]+)$/);
  const token = productMatch ? productMatch[1] : text.replace(/^\/topic\/productid/, "");
  return /^[A-Za-z0-9_-]+$/.test(token) ? token : "";
}

function upsertDevice({ token, name, type, groupName, groupId }) {
  const normalized = normalizeToken(token);
  if (!normalized) return false;
  const targetGroupId = groupId || ensureGroup(groupName);
  const existing = groupDevices.value.find((device) => device.token === normalized);
  if (existing) {
    existing.name = name || existing.name;
    existing.type = type || existing.type;
    existing.groupId = targetGroupId;
    return true;
  }
  groupDevices.value.push({
    id: `dev-${Date.now()}-${groupDevices.value.length}`,
    name: name || `${props.labels.device || "Device"} ${groupDevices.value.length + 1}`,
    token: normalized,
    type: type || importDeviceType.value,
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
    upsertDevice({ token: line, type: importDeviceType.value, groupId: selectedGroupId.value });
  }
  tokenImportText.value = "";
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

function exportDevicesExcel() {
  const rows = groupDevices.value.map((device) => ({
    name: device.name,
    token: device.token,
    type: device.type,
    group: groupNameById(device.groupId)
  }));
  const body = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.name)}</td>
      <td>${escapeHtml(row.token)}</td>
      <td>${escapeHtml(row.type)}</td>
      <td>${escapeHtml(row.group)}</td>
    </tr>`).join("");
  const html = `<!doctype html>
<html>
<head><meta charset="utf-8"></head>
<body>
<table>
  <thead><tr><th>name</th><th>token</th><th>type</th><th>group</th></tr></thead>
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
    const [name, token, type, group] = row;
    upsertDevice({ name, token, type, groupName: group });
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
    .filter((cells) => cells.length >= 2 && cells[1] !== "token");
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
          <span class="font-medium">{{ group.name }}</span>
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
        <div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_120px]">
          <el-input v-model="tokenImportText" type="textarea" :placeholder="labels.tokenImportPlaceholder" />
          <el-select v-model="importDeviceType">
            <el-option label="UART1" value="UART1" />
            <el-option label="RS485" value="RS485" />
            <el-option label="CAN" value="CAN" />
          </el-select>
          <el-button type="primary" @click="importTokens">{{ labels.import }}</el-button>
        </div>
      </el-card>

      <el-card class="control-card" shadow="never">
        <template #header><span class="text-base font-semibold">{{ labels.groupDevices }}</span></template>
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div v-for="device in devicesInGroup(selectedGroupId)" :key="device.id" class="device-card">
            <div class="font-medium">{{ device.name }}</div>
            <div class="mt-1 text-xs text-muted-foreground">{{ device.type }}</div>
            <div class="mt-2 break-all font-mono text-xs">{{ device.token }}</div>
            <el-select v-model="device.groupId" class="mt-3">
              <el-option v-for="group in deviceGroups" :key="group.id" :label="group.name" :value="group.id" />
            </el-select>
          </div>
          <div v-if="!devicesInGroup(selectedGroupId).length" class="text-sm text-muted-foreground">{{ labels.waiting }}</div>
        </div>
      </el-card>
    </div>
  </section>
</template>
