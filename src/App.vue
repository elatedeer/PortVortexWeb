<template>
  <div class="min-h-screen bg-[#f4f7fb] text-slate-900">
    <aside class="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-800 bg-[#111827] text-white lg:flex lg:flex-col">
      <div class="px-6 py-6">
        <div class="text-lg font-semibold">PortVortex</div>
        <div class="mt-1 text-xs text-slate-400">{{ t.subtitle }}</div>
      </div>
      <nav class="flex-1 space-y-1 px-3">
        <div class="rounded-md bg-white/10 px-3 py-2 text-sm font-medium">{{ t.navDownload }}</div>
        <div class="rounded-md px-3 py-2 text-sm text-slate-400">{{ t.navChat }}</div>
        <div class="rounded-md px-3 py-2 text-sm text-slate-400">{{ t.navExpert }}</div>
      </nav>
      <div class="m-4 rounded-lg border border-white/10 bg-white/5 p-4 text-xs text-slate-300">
        <div class="mb-2 font-medium text-white">{{ t.deviceTopic }}</div>
        <div class="break-all text-slate-400">/topic/productid{{ flash.deviceToken || "..." }}</div>
      </div>
    </aside>

    <main class="lg:pl-64">
      <header class="sticky top-0 z-10 border-b border-slate-200/80 bg-white/85 backdrop-blur">
        <div class="flex min-h-16 items-center justify-between gap-3 px-4 md:px-8">
          <div>
            <h1 class="text-xl font-semibold tracking-normal">{{ t.title }}</h1>
            <p class="text-xs text-slate-500">{{ t.headerHint }}</p>
          </div>
          <div class="flex items-center gap-2">
            <el-segmented v-model="lang" :options="languageOptions" />
            <el-button type="primary" :loading="flashing" @click="submitFlash">{{ t.start }}</el-button>
          </div>
        </div>
      </header>

      <div class="space-y-5 p-4 md:p-8">
        <section class="grid gap-4 md:grid-cols-4">
          <div v-for="card in summaryCards" :key="card.label" class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div class="text-xs text-slate-500">{{ card.label }}</div>
            <div class="mt-2 text-2xl font-semibold">{{ card.value }}</div>
            <div class="mt-1 text-xs text-slate-400">{{ card.hint }}</div>
          </div>
        </section>

        <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_410px]">
          <div class="space-y-5">
            <el-card shadow="never" class="control-card">
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <div class="font-semibold">{{ t.downloadSetup }}</div>
                    <div class="text-xs text-slate-500">{{ t.downloadSetupHint }}</div>
                  </div>
                  <el-tag type="info">{{ t.formatAuto }}</el-tag>
                </div>
              </template>

              <div class="grid gap-4 lg:grid-cols-2">
                <el-form-item :label="t.downloadMode">
                  <el-segmented v-model="flash.flashMode" :options="downloadModes" />
                </el-form-item>
                <el-form-item :label="t.deviceToken">
                  <el-input v-model="flash.deviceToken" placeholder="6bf3418a09725d07" />
                </el-form-item>
                <el-form-item :label="t.firmware" class="lg:col-span-2">
                  <input class="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" type="file" accept=".bin,.hex,application/octet-stream,text/plain" @change="onFirmwareChange">
                </el-form-item>
              </div>
            </el-card>

            <div class="grid gap-5 lg:grid-cols-2">
              <el-card shadow="never" class="control-card">
                <template #header><span class="font-semibold">{{ t.target }}</span></template>
                <div class="grid gap-3">
                  <el-form-item :label="t.targetModel"><el-input v-model="flash.target" /></el-form-item>
                  <el-form-item :label="t.baseAddr"><el-input v-model="flash.baseAddr" /></el-form-item>
                  <el-form-item :label="t.swdErase">
                    <el-select v-model="flash.erase">
                      <el-option label="sector" value="sector" />
                      <el-option label="full" value="full" />
                    </el-select>
                  </el-form-item>
                  <el-form-item :label="t.attach">
                    <el-select v-model="flash.attach" clearable :placeholder="t.default">
                      <el-option label="normal" value="normal" />
                      <el-option label="under_reset" value="under_reset" />
                      <el-option label="normal_then_under_reset" value="normal_then_under_reset" />
                      <el-option label="auto" value="auto" />
                    </el-select>
                  </el-form-item>
                </div>
              </el-card>

              <el-card shadow="never" class="control-card">
                <template #header><span class="font-semibold">{{ t.runtime }}</span></template>
                <div class="space-y-4">
                  <el-checkbox v-model="flash.noResetAfterProgram">{{ t.noReset }}</el-checkbox>
                  <el-checkbox v-model="flash.singlePacket">{{ t.singlePacket }}</el-checkbox>
                  <div class="rounded-md border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-800">
                    {{ t.mqttHidden }}
                  </div>
                  <div class="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div>
                      <div class="text-sm font-medium">{{ t.expertMode }}</div>
                      <div class="text-xs text-slate-500">{{ t.expertHint }}</div>
                    </div>
                    <el-switch v-model="expert" />
                  </div>
                </div>
              </el-card>
            </div>

            <el-card v-if="expert" shadow="never" class="control-card">
              <template #header><span class="font-semibold">{{ t.expertMode }}</span></template>
              <el-tabs>
                <el-tab-pane :label="t.transfer">
                  <div class="grid gap-4 md:grid-cols-2">
                    <el-form-item :label="t.chunkSize"><el-input-number v-model="flash.chunkSize" :min="1" :max="2048" /></el-form-item>
                    <el-form-item :label="t.chunkDelay"><el-input-number v-model="flash.chunkDelay" :min="0" :step="0.01" /></el-form-item>
                    <el-form-item :label="t.ackTimeout"><el-input-number v-model="flash.ackTimeout" :min="0.1" :step="0.1" /></el-form-item>
                    <el-form-item :label="t.window"><el-input-number v-model="flash.window" :min="1" :max="6" /></el-form-item>
                  </div>
                </el-tab-pane>
                <el-tab-pane :label="t.uartBootloader">
                  <div class="grid gap-4 md:grid-cols-3">
                    <el-form-item label="Baud"><el-input-number v-model="flash.baud" :min="1" /></el-form-item>
                    <el-form-item label="Page Size"><el-input v-model="flash.pageSize" /></el-form-item>
                    <el-form-item label="UART Chunk"><el-input-number v-model="flash.uartFlashChunkSize" :min="1" :max="256" /></el-form-item>
                    <el-form-item label="Timeout ms"><el-input-number v-model="flash.timeoutMs" :min="0" /></el-form-item>
                    <el-form-item label="Erase Timeout"><el-input-number v-model="flash.eraseTimeoutMs" :min="0" /></el-form-item>
                    <el-form-item label="Extended Erase"><el-select v-model="flash.extendedErase" clearable><el-option label="1" value="1" /><el-option label="0" value="0" /></el-select></el-form-item>
                    <el-form-item label="UART Erase"><el-select v-model="flash.uartErase"><el-option label="page" value="page" /><el-option label="sector" value="sector" /><el-option label="full" value="full" /></el-select></el-form-item>
                    <el-form-item label="ACK Byte"><el-input v-model="flash.ackByte" placeholder="0x79" /></el-form-item>
                    <el-form-item label="sync_hex"><el-input v-model="flash.syncHex" placeholder="7f" /></el-form-item>
                    <el-form-item label="get_id_cmd"><el-input v-model="flash.getIdCmdHex" placeholder="02fd" /></el-form-item>
                    <el-form-item label="write_cmd"><el-input v-model="flash.writeCmdHex" placeholder="31ce" /></el-form-item>
                    <el-form-item label="go_cmd"><el-input v-model="flash.goCmdHex" placeholder="21de" /></el-form-item>
                    <el-form-item label="erase_cmd"><el-input v-model="flash.eraseCmdHex" placeholder="43bc" /></el-form-item>
                    <el-form-item label="ext_erase_cmd"><el-input v-model="flash.extEraseCmdHex" placeholder="44bb" /></el-form-item>
                    <el-form-item label="full_erase_frame"><el-input v-model="flash.fullEraseFrameHex" placeholder="ff00" /></el-form-item>
                    <el-form-item label="ext_full_erase"><el-input v-model="flash.extFullEraseFrameHex" placeholder="ffff00" /></el-form-item>
                    <el-form-item label="addr_format"><el-select v-model="flash.addrFormat" clearable><el-option label="be32_xor" value="be32_xor" /><el-option label="le32_xor" value="le32_xor" /></el-select></el-form-item>
                    <el-form-item label="erase_format"><el-select v-model="flash.eraseFormat" clearable><el-option label="stm32" value="stm32" /><el-option label="stm32_ext" value="stm32_ext" /></el-select></el-form-item>
                  </div>
                </el-tab-pane>
                <el-tab-pane :label="t.customAlgo">
                  <p class="mb-4 text-sm text-slate-600">{{ t.algoBlobHelp }}</p>
                  <div class="grid gap-4 md:grid-cols-3">
                    <el-form-item :label="t.algoBlob"><input class="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" type="file" @change="onAlgoBlobChange"></el-form-item>
                    <el-form-item label="Algo"><el-input v-model="flash.algo" placeholder="custom_sram_algo" /></el-form-item>
                    <el-form-item label="Flash Base"><el-input v-model="flash.flashBase" /></el-form-item>
                    <el-form-item label="Erase Size"><el-input v-model="flash.eraseSize" /></el-form-item>
                    <el-form-item v-for="field in customFields" :key="field.key" :label="field.label">
                      <el-input v-model="flash[field.key]" />
                    </el-form-item>
                  </div>
                </el-tab-pane>
              </el-tabs>
            </el-card>

            <el-card shadow="never" class="control-card">
              <template #header>
                <div class="flex items-center justify-between">
                  <span class="font-semibold">{{ t.downloadLog }}</span>
                  <el-progress class="w-52" :percentage="progress" :stroke-width="8" />
                </div>
              </template>
              <pre class="log-view">{{ logText }}</pre>
            </el-card>
          </div>

          <aside class="space-y-5">
            <el-card shadow="never" class="control-card">
              <template #header><span class="font-semibold">{{ t.liveChat }}</span></template>
              <div class="mb-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                {{ t.subscribe }}: /qos1<br>{{ t.publish }}: /qos0
              </div>
              <div class="mb-3 flex gap-2">
                <el-button type="primary" :disabled="chat.connected" @click="connectChat">{{ t.connect }}</el-button>
                <el-button :disabled="!chat.connected" @click="closeChat">{{ t.close }}</el-button>
              </div>
              <pre class="log-view chat-view">{{ chat.log }}</pre>
              <div class="mt-3 flex gap-2">
                <el-input v-model="chat.message" :placeholder="t.message" @keydown.enter="sendChat" />
                <el-button type="primary" :disabled="!chat.connected" @click="sendChat">{{ t.send }}</el-button>
              </div>
            </el-card>
          </aside>
        </section>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from "vue";
import { ElMessage } from "element-plus";

const lang = ref("zh");
const languageOptions = [
  { label: "中文", value: "zh" },
  { label: "EN", value: "en" }
];

const copy = {
  zh: {
    title: "设备烧录控制台",
    subtitle: "固件下载与 MQTT 实时对话",
    headerHint: "输入设备 Token 后，系统自动补全 MQTT 连接与主题。",
    navDownload: "固件下载",
    navChat: "实时对话",
    navExpert: "专家参数",
    deviceTopic: "设备主题",
    start: "开始下载",
    downloadSetup: "下载设置",
    downloadSetupHint: "选择下载方式并上传 BIN 或 HEX 文件。",
    formatAuto: "格式：自动",
    downloadMode: "Download Mode",
    deviceToken: "设备 Token",
    firmware: "固件文件",
    target: "目标配置",
    targetModel: "目标型号",
    baseAddr: "起始地址",
    swdErase: "SWD 擦除",
    attach: "连接方式",
    default: "默认",
    runtime: "运行选项",
    noReset: "烧录后不复位",
    singlePacket: "SWD BIN/HEX 单包发送",
    mqttHidden: "MQTT broker、账号、密码、QoS 和主题前缀均由设备 Token 自动生成。",
    expertMode: "专家模式",
    expertHint: "传输、串口协议模板和自定义算法参数。",
    transfer: "传输",
    chunkSize: "分块大小",
    chunkDelay: "分块延迟",
    ackTimeout: "ACK 超时",
    window: "窗口",
    uartBootloader: "UART Bootloader",
    customAlgo: "Custom SRAM Algo",
    algoBlob: "Algo blob",
    algoBlobHelp: "Algo blob 是 custom_sram_algo 使用的目标 SRAM 烧录算法二进制，普通烧录不需要选择。",
    downloadLog: "下载日志",
    liveChat: "MQTT 实时对话",
    subscribe: "订阅",
    publish: "发布",
    connect: "连接",
    close: "关闭",
    send: "发送",
    message: "消息",
    waiting: "等待中...",
    disconnected: "未连接。",
    selectFirmware: "请选择固件文件。"
  },
  en: {
    title: "Device Download Console",
    subtitle: "Firmware download and live MQTT chat",
    headerHint: "Enter the device token; MQTT connection and topics are generated automatically.",
    navDownload: "Download",
    navChat: "Live Chat",
    navExpert: "Expert",
    deviceTopic: "Device Topic",
    start: "Start Download",
    downloadSetup: "Download Setup",
    downloadSetupHint: "Choose a download mode and upload BIN or HEX firmware.",
    formatAuto: "Format: Auto",
    downloadMode: "Download Mode",
    deviceToken: "Device Token",
    firmware: "Firmware",
    target: "Target",
    targetModel: "Target",
    baseAddr: "Base Addr",
    swdErase: "SWD Erase",
    attach: "Attach",
    default: "Default",
    runtime: "Runtime",
    noReset: "No reset after program",
    singlePacket: "Single packet for SWD BIN/HEX",
    mqttHidden: "MQTT broker, account, password, QoS, and topic prefix are generated from the device token.",
    expertMode: "Expert Mode",
    expertHint: "Transfer, UART protocol template, and custom algorithm parameters.",
    transfer: "Transfer",
    chunkSize: "Chunk Size",
    chunkDelay: "Chunk Delay",
    ackTimeout: "ACK Timeout",
    window: "Window",
    uartBootloader: "UART Bootloader",
    customAlgo: "Custom SRAM Algo",
    algoBlob: "Algo blob",
    algoBlobHelp: "Algo blob is a raw SRAM flash algorithm binary used only with custom_sram_algo targets.",
    downloadLog: "Download Log",
    liveChat: "MQTT Live Chat",
    subscribe: "Subscribe",
    publish: "Publish",
    connect: "Connect",
    close: "Close",
    send: "Send",
    message: "Message",
    waiting: "Waiting...",
    disconnected: "Disconnected.",
    selectFirmware: "Please select firmware."
  }
};

const t = computed(() => copy[lang.value]);
const downloadModes = computed(() => [
  { label: "SWD", value: "swd" },
  { label: lang.value === "zh" ? "串口" : "Serial", value: "uart" },
  { label: "485", value: "rs485" }
]);

const customFields = [
  ["algoLoadAddr", "Load Addr"],
  ["algoInitPc", "Init PC"],
  ["algoErasePc", "Erase PC"],
  ["algoFullErasePc", "Full Erase PC"],
  ["algoProgramPc", "Program PC"],
  ["algoUninitPc", "Uninit PC"],
  ["algoDoneAddr", "Done Addr"],
  ["algoDoneMagic", "Done Magic"],
  ["algoStack", "Stack"],
  ["algoBufferAddr", "Buffer Addr"],
  ["algoBufferSize", "Buffer Size"],
  ["algoTimeoutMs", "Timeout ms"],
  ["algoInitTimeoutMs", "Init Timeout"],
  ["algoEraseTimeoutMs", "Erase Timeout"],
  ["algoProgramTimeoutMs", "Program Timeout"],
  ["algoInitR0", "Init R0"],
  ["algoInitR1", "Init R1"],
  ["algoInitR2", "Init R2"]
].map(([key, label]) => ({ key, label }));

const expert = ref(false);
const flashing = ref(false);
const progress = ref(0);
const logs = ref([]);
const firmwareFile = ref(null);
const algoBlobFile = ref(null);

const flash = reactive({
  flashMode: "swd",
  deviceToken: "6bf3418a09725d07",
  target: "stm32f4",
  baseAddr: "0x08000000",
  erase: "sector",
  attach: "",
  singlePacket: false,
  noResetAfterProgram: false,
  chunkSize: 2048,
  chunkDelay: 0,
  ackTimeout: 300,
  window: 3,
  baud: 115200,
  pageSize: "",
  uartFlashChunkSize: undefined,
  timeoutMs: undefined,
  eraseTimeoutMs: 30000,
  extendedErase: "",
  uartErase: "page",
  ackByte: "",
  syncHex: "",
  getIdCmdHex: "",
  writeCmdHex: "",
  goCmdHex: "",
  eraseCmdHex: "",
  extEraseCmdHex: "",
  fullEraseFrameHex: "",
  extFullEraseFrameHex: "",
  addrFormat: "",
  eraseFormat: "",
  algo: "",
  flashBase: "",
  eraseSize: ""
});

for (const field of customFields) flash[field.key] = "";

const chat = reactive({
  id: "",
  connected: false,
  log: "",
  message: "",
  events: null
});

const logText = computed(() => logs.value.length ? logs.value.join("\n") : t.value.waiting);
const summaryCards = computed(() => [
  { label: t.value.downloadMode, value: flash.flashMode.toUpperCase(), hint: t.value.formatAuto },
  { label: t.value.deviceToken, value: flash.deviceToken || "-", hint: t.value.deviceTopic },
  { label: t.value.firmware, value: firmwareFile.value ? firmwareFile.value.name : "-", hint: "BIN / HEX" },
  { label: t.value.liveChat, value: chat.connected ? t.value.connect : t.value.close, hint: "/qos1 -> /qos0" }
]);

function pushLog(line) {
  logs.value.push(line);
}

function pushChat(line) {
  if (!chat.log) chat.log = "";
  chat.log += `${line}\n`;
}

function onFirmwareChange(event) {
  firmwareFile.value = event.target.files[0] || null;
}

function onAlgoBlobChange(event) {
  algoBlobFile.value = event.target.files[0] || null;
}

function appendFormValue(data, key, value) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "boolean") data.set(key, value ? "1" : "0");
  else data.set(key, String(value));
}

async function submitFlash() {
  if (!firmwareFile.value) {
    ElMessage.error(t.value.selectFirmware);
    return;
  }
  flashing.value = true;
  progress.value = 0;
  logs.value = [];
  const data = new FormData();
  data.set("firmwareFile", firmwareFile.value);
  if (algoBlobFile.value) data.set("algoBlob", algoBlobFile.value);
  for (const [key, value] of Object.entries(flash)) appendFormValue(data, key, value);
  data.set("singlePacket", flash.singlePacket ? "1" : "0");
  data.set("noResetAfterProgram", flash.noResetAfterProgram ? "1" : "0");
  data.set("algoBlobPresent", algoBlobFile.value ? "1" : "0");

  try {
    pushLog(lang.value === "zh" ? "正在提交下载任务..." : "Submitting download job...");
    const response = await fetch("/api/flash", { method: "POST", body: data });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Failed to create job");
    pushLog(`Job ID: ${payload.id}`);

    const events = new EventSource(`/api/jobs/${payload.id}/events`);
    events.onmessage = (message) => {
      const eventData = JSON.parse(message.data);
      if (eventData.type === "log") pushLog(eventData.message);
      if (eventData.type === "progress") {
        progress.value = Number(Math.min(100, eventData.percent).toFixed(1));
        pushLog(`Stored: ${eventData.done}/${eventData.total} bytes (${eventData.percent.toFixed(1)}%)`);
      }
      if (eventData.type === "status") {
        pushLog(eventData.status === "done" ? "Done." : `ERROR: ${eventData.error}`);
        events.close();
        flashing.value = false;
      }
    };
    events.onerror = () => {
      pushLog("Log stream disconnected.");
      events.close();
      flashing.value = false;
    };
  } catch (err) {
    pushLog(`ERROR: ${err.message}`);
    flashing.value = false;
  }
}

async function connectChat() {
  try {
    pushChat(lang.value === "zh" ? "正在连接 MQTT 对话..." : "Connecting MQTT chat...");
    const response = await fetch("/api/chat/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceToken: flash.deviceToken })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Chat connect failed");
    chat.id = payload.id;
    chat.connected = true;
    pushChat(`Connected. Sub: ${payload.subscribeTopic}`);
    pushChat(`Publish: ${payload.publishTopic}`);
    chat.events = new EventSource(`/api/chat/${chat.id}/events`);
    chat.events.onmessage = (message) => {
      const eventData = JSON.parse(message.data);
      if (eventData.type === "message") {
        pushChat(`${eventData.direction === "in" ? "<" : ">"} [${eventData.topic}] ${eventData.message}`);
      }
      if (eventData.type === "status") pushChat(`* ${eventData.message}`);
    };
    chat.events.onerror = () => pushChat("* chat event stream disconnected");
  } catch (err) {
    pushChat(`ERROR: ${err.message}`);
  }
}

async function sendChat() {
  if (!chat.connected || !chat.message) return;
  const message = chat.message;
  chat.message = "";
  const response = await fetch(`/api/chat/${chat.id}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message })
  });
  if (!response.ok) pushChat("ERROR: send failed");
}

async function closeChat() {
  if (!chat.id) return;
  await fetch(`/api/chat/${chat.id}/close`, { method: "POST" });
  if (chat.events) chat.events.close();
  chat.id = "";
  chat.connected = false;
}
</script>
