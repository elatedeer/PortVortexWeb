"use strict";

const http = require("http");
const net = require("net");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");

const PORT = Number(process.env.PORT || 3000);
const DIST_DIR = path.join(__dirname, "dist");
const PUBLIC_DIR = fs.existsSync(DIST_DIR) ? DIST_DIR : path.join(__dirname, "public");
const MAX_UPLOAD_BYTES = 64 * 1024 * 1024;
const CHIP_CONFIG_DIR = path.join(__dirname, "chip-configs");

const DEFAULTS = {
  broker: "gsaimqtt.jnxiangchen.com",
  port: 21882,
  mqttUsername: "admin",
  mqttPassword: "gsx_20260521",
  deviceToken: "6bf3418a09725d07",
  target: "stm32f4",
  baseAddr: "0x08000000",
  chunkSize: 2048,
  chunkDelay: 0,
  ackTimeout: 300,
  window: 3,
  erase: "sector",
  qos: 1
};

const FIXED_HARDWARE = {
  portKind: "uart",
  uartPort: "1",
  uartTxGpio: "4",
  uartRxGpio: "5",
  rs485UartPort: "2",
  rs485TxGpio: "17",
  rs485RxGpio: "16",
  rs485RtsGpio: "22",
  rstGpio: "21",
  boot0Gpio: "23",
  useRst: "1",
  useBoot0: "1"
};

const jobs = new Map();
const chats = new Map();

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function normalizeTargetName(value) {
  return String(value || "").trim().toLowerCase();
}

function safeChipConfigId(value) {
  const id = normalizeTargetName(value);
  if (!/^[a-z0-9][a-z0-9_-]{1,63}$/.test(id)) {
    throw new Error("chip config id must be 2-64 chars: lowercase letters, numbers, underscore, or dash");
  }
  return id;
}

function loadChipConfigs() {
  if (!fs.existsSync(CHIP_CONFIG_DIR)) return [];
  return fs.readdirSync(CHIP_CONFIG_DIR)
    .filter((name) => name.toLowerCase().endsWith(".json"))
    .map((name) => {
      const config = readJsonFile(path.join(CHIP_CONFIG_DIR, name));
      const id = normalizeTargetName(config.id || path.basename(name, ".json"));
      return {
        ...config,
        id,
        label: config.label || id,
        aliases: Array.isArray(config.aliases) ? config.aliases.map(normalizeTargetName) : []
      };
    })
    .filter((config) => config.id)
    .sort((a, b) => a.id.localeCompare(b.id));
}

function getChipConfigs() {
  try {
    return loadChipConfigs();
  } catch (err) {
    console.error(`Failed to load chip configs: ${err.message}`);
    return [];
  }
}

function getTargetOptions() {
  const configs = getChipConfigs();
  return configs.length ? configs.map((config) => config.id) : ["stm32f1", "stm32f4", "gd32f1", "ch32f2"];
}

function findChipConfig(target) {
  const normalized = normalizeTargetName(target);
  return getChipConfigs().find((config) => config.id === normalized || config.aliases.includes(normalized)) || null;
}

function buildClientChipConfig(config) {
  const out = {
    id: config.id,
    label: config.label,
    aliases: config.aliases,
    description: config.description || "",
    defaults: config.defaults || {},
    swd: config.swd || {},
    uart: config.uart || {},
    rs485: config.rs485 || {}
  };
  return out;
}

function normalizeObject(value, name) {
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value;
}

function normalizeChipConfig(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("chip config must be a JSON object");
  const id = safeChipConfigId(input.id || input.target || input.model);
  const aliases = Array.isArray(input.aliases)
    ? [...new Set(input.aliases.map(normalizeTargetName).filter(Boolean))]
    : [];
  const config = {
    id,
    label: String(input.label || input.name || id),
    aliases,
    description: String(input.description || ""),
    defaults: normalizeObject(input.defaults, "defaults"),
    swd: normalizeObject(input.swd, "swd"),
    uart: normalizeObject(input.uart, "uart"),
    rs485: normalizeObject(input.rs485, "rs485")
  };
  if (input.sources !== undefined) config.sources = Array.isArray(input.sources) ? input.sources : [];
  if (input.notes !== undefined) config.notes = String(input.notes || "");
  return config;
}

function saveChipConfig(input) {
  const config = normalizeChipConfig(input);
  fs.mkdirSync(CHIP_CONFIG_DIR, { recursive: true });
  const filePath = path.join(CHIP_CONFIG_DIR, `${config.id}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return config;
}

function mergeChipParams(params) {
  const config = findChipConfig(params.target);
  if (!config) return params;
  const mode = params.flashMode === "rs485" ? "rs485" : params.flashMode === "uart" ? "uart" : "swd";
  return {
    ...(config.defaults || {}),
    ...(config[mode] || {}),
    ...params,
    target: config.id
  };
}

function encodeRemainingLength(length) {
  const out = [];
  do {
    let digit = length % 128;
    length = Math.floor(length / 128);
    if (length) digit |= 0x80;
    out.push(digit);
  } while (length);
  return Buffer.from(out);
}

function mqttString(text) {
  const data = Buffer.from(String(text), "utf8");
  if (data.length > 0xffff) throw new Error("MQTT string too long");
  const len = Buffer.alloc(2);
  len.writeUInt16BE(data.length, 0);
  return Buffer.concat([len, data]);
}

function parseAck(payload) {
  const parts = payload.toString("utf8").split(";");
  const ack = { status: parts[0] || "" };
  for (const part of parts.slice(1)) {
    const index = part.indexOf("=");
    if (index > -1) ack[part.slice(0, index)] = part.slice(index + 1);
  }
  return ack;
}

class MqttClient {
  constructor(host, port, clientId, username, password, timeoutMs = 10000) {
    this.host = host;
    this.port = port;
    this.clientId = clientId;
    this.username = username || null;
    this.password = password || null;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.packetId = 1;
    this.buffer = Buffer.alloc(0);
    this.incoming = [];
    this.pendingPackets = [];
    this.packetWaiters = [];
  }

  async connect() {
    this.socket = net.createConnection({ host: this.host, port: this.port });
    this.socket.on("data", (chunk) => this._onData(chunk));
    this.socket.on("error", (err) => this._failWaiters(err));
    this.socket.on("close", () => this._failWaiters(new Error("MQTT connection closed")));

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MQTT connect timeout")), this.timeoutMs);
      this.socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once("error", reject);
    });

    let flags = 0x02;
    let payload = mqttString(this.clientId);
    if (this.username !== null) {
      flags |= 0x80;
      payload = Buffer.concat([payload, mqttString(this.username)]);
    }
    if (this.password !== null) {
      flags |= 0x40;
      payload = Buffer.concat([payload, mqttString(this.password)]);
    }

    const header = Buffer.concat([mqttString("MQTT"), Buffer.from([4, flags, 0, 60])]);
    this._sendPacket(0x10, Buffer.concat([header, payload]));
    const [packetType, body] = await this._readPacket();
    if (packetType !== 0x20 || !body.equals(Buffer.from([0, 0]))) {
      throw new Error(`MQTT connect failed: 0x${packetType.toString(16)} ${body.toString("hex")}`);
    }
  }

  async subscribe(topic, qos = 0) {
    const packetId = this._nextPacketId();
    const body = Buffer.concat([uint16(packetId), mqttString(topic), Buffer.from([qos])]);
    this._sendPacket(0x82, body);
    while (true) {
      const [type, packetBody] = await this._readPacket();
      if (type === 0x90) {
        const ackId = packetBody.readUInt16BE(0);
        if (ackId !== packetId) throw new Error(`SUBACK id mismatch: ${ackId} != ${packetId}`);
        if (packetBody[2] === 0x80) throw new Error(`Subscribe rejected: ${topic}`);
        return;
      }
      this._handleAsyncPacket(type, packetBody);
    }
  }

  async publish(topic, payload, qos = 1) {
    if (![0, 1].includes(qos)) throw new Error("Only QoS 0 and QoS 1 are supported");
    let packetId = Buffer.alloc(0);
    let expectedPacketId = null;
    if (qos === 1) {
      expectedPacketId = this._nextPacketId();
      packetId = uint16(expectedPacketId);
    }
    this._sendPacket(0x30 | (qos << 1), Buffer.concat([mqttString(topic), packetId, payload]));
    if (qos !== 1) return;
    while (true) {
      const [type, body] = await this._readPacket();
      if (type === 0x40) {
        const ackId = body.readUInt16BE(0);
        if (ackId !== expectedPacketId) throw new Error(`PUBACK id mismatch: ${ackId} != ${expectedPacketId}`);
        return;
      }
      this._handleAsyncPacket(type, body);
    }
  }

  async waitForMessage(topic, timeoutSeconds) {
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (true) {
      const index = this.incoming.findIndex((msg) => msg.topic === topic);
      if (index >= 0) return this.incoming.splice(index, 1)[0].payload;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Timeout waiting for MQTT topic: ${topic}`);
      const [type, body] = await this._readPacket(remaining);
      this._handleAsyncPacket(type, body);
    }
  }

  async waitForAnyMessage(topics, timeoutSeconds) {
    const topicSet = new Set((topics || []).filter(Boolean));
    const deadline = Date.now() + timeoutSeconds * 1000;
    while (true) {
      const index = this.incoming.findIndex((msg) => topicSet.has(msg.topic));
      if (index >= 0) return this.incoming.splice(index, 1)[0];
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error(`Timeout waiting for MQTT topics: ${Array.from(topicSet).join(", ")}`);
      const [type, body] = await this._readPacket(remaining);
      this._handleAsyncPacket(type, body);
    }
  }

  disconnect() {
    if (!this.socket) return;
    try {
      this._sendPacket(0xe0, Buffer.alloc(0));
      this.socket.end();
    } catch (_) {
      this.socket.destroy();
    }
    this.socket = null;
  }

  _sendPacket(type, body) {
    if (!this.socket) throw new Error("MQTT socket is not connected");
    this.socket.write(Buffer.concat([Buffer.from([type]), encodeRemainingLength(body.length), body]));
  }

  _nextPacketId() {
    const id = this.packetId;
    this.packetId = id === 0xffff ? 1 : id + 1;
    return id;
  }

  _readPacket(timeoutMs = this.timeoutMs) {
    if (this.pendingPackets.length) return Promise.resolve(this.pendingPackets.shift());
    return new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: null };
      waiter.timer = setTimeout(() => {
        this.packetWaiters = this.packetWaiters.filter((item) => item !== waiter);
        reject(new Error("MQTT packet timeout"));
      }, timeoutMs);
      this.packetWaiters.push(waiter);
    });
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      let multiplier = 1;
      let remainingLength = 0;
      let offset = 1;
      while (true) {
        if (offset >= this.buffer.length) return;
        const digit = this.buffer[offset++];
        remainingLength += (digit & 127) * multiplier;
        if ((digit & 128) === 0) break;
        multiplier *= 128;
        if (multiplier > 128 * 128 * 128) throw new Error("Malformed MQTT remaining length");
      }
      if (this.buffer.length < offset + remainingLength) return;
      const packet = [this.buffer[0], this.buffer.slice(offset, offset + remainingLength)];
      this.buffer = this.buffer.slice(offset + remainingLength);
      const waiter = this.packetWaiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        waiter.resolve(packet);
      } else {
        this.pendingPackets.push(packet);
      }
    }
  }

  _handleAsyncPacket(packetType, body) {
    const type = packetType & 0xf0;
    if (type === 0x30) {
      const topicLen = body.readUInt16BE(0);
      const topic = body.slice(2, 2 + topicLen).toString("utf8");
      const qos = (packetType >> 1) & 0x03;
      let payloadOffset = 2 + topicLen;
      let publishPacketId = null;
      if (qos > 0) {
        publishPacketId = body.readUInt16BE(payloadOffset);
        payloadOffset += 2;
      }
      this.incoming.push({ topic, payload: body.slice(payloadOffset) });
      if (qos === 1 && publishPacketId !== null) {
        this._sendPacket(0x40, uint16(publishPacketId));
      }
      return;
    }
    if (type === 0xd0) return;
    throw new Error(`Unexpected MQTT packet type: 0x${packetType.toString(16)}`);
  }

  _failWaiters(err) {
    for (const waiter of this.packetWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(err);
    }
  }
}

function uint16(value) {
  const out = Buffer.alloc(2);
  out.writeUInt16BE(value, 0);
  return out;
}

function appendProfileArg(parts, key, value) {
  if (value !== undefined && value !== null && String(value) !== "") parts.push(`${key}=${value}`);
}

function replaceProfileToken(profile, key, value) {
  const pattern = new RegExp(`(^|;)${key}=[^;]*`);
  return pattern.test(profile)
    ? profile.replace(pattern, `$1${key}=${value}`)
    : `${profile.replace(/;$/, "")};${key}=${value}`;
}

function normalizeDeviceToken(value) {
  const text = String(value || DEFAULTS.deviceToken).trim();
  const match = text.match(/productid([A-Za-z0-9_-]+)$/);
  const token = match ? match[1] : text.replace(/^\/topic\/productid/, "");
  if (!/^[A-Za-z0-9_-]+$/.test(token)) {
    throw new Error("device token can only contain letters, numbers, underscore, or dash");
  }
  return token;
}

function mqttConfigFromParams(params) {
  const deviceToken = normalizeDeviceToken(params.deviceToken);
  return {
    broker: DEFAULTS.broker,
    port: DEFAULTS.port,
    username: DEFAULTS.mqttUsername,
    password: DEFAULTS.mqttPassword,
    topicPrefix: `/topic/productid${deviceToken}`
  };
}

function topicWithDevicePrefix(topic, topicPrefix) {
  const suffix = String(topic || "").trim() || "/";
  if (suffix === topicPrefix || suffix.startsWith(`${topicPrefix}/`)) return suffix;
  return `${topicPrefix}/${suffix.replace(/^\/+/, "")}`;
}

function normalizeMqttClientId(value) {
  const text = String(value || "").trim();
  if (!text) return `web-chat-${crypto.randomBytes(4).toString("hex")}`;
  if (!/^[A-Za-z0-9_-]+$/.test(text)) {
    throw new Error("MQTT ClientID can only contain letters, numbers, underscore, or dash");
  }
  return text;
}

function normalizeMessageFormat(value) {
  const format = String(value || "ascii").toLowerCase();
  if (!["ascii", "hex"].includes(format)) throw new Error("message format must be ascii or hex");
  return format;
}

function bufferFromMessage(message, format) {
  if (format === "ascii") return Buffer.from(String(message || ""), "utf8");
  const text = String(message || "").replace(/\s+/g, "");
  if (!text) return Buffer.alloc(0);
  if (!/^[0-9a-fA-F]+$/.test(text) || text.length % 2 !== 0) {
    throw new Error("hex message must contain complete hexadecimal bytes");
  }
  return Buffer.from(text, "hex");
}

function messageFromBuffer(payload, format) {
  if (format === "hex") return payload.toString("hex").toUpperCase().replace(/(..)/g, "$1 ").trim();
  return payload.toString("utf8");
}

function payloadFingerprint(payload) {
  return Buffer.from(payload || Buffer.alloc(0)).toString("hex");
}

function getMetaSnapshot() {
  const chipConfigs = getChipConfigs().map(buildClientChipConfig);
  return {
    targets: chipConfigs.length ? chipConfigs.map((config) => config.id) : getTargetOptions(),
    chipConfigs,
    user: {
      name: "陈工",
      role: "Senior Engineer",
      team: "PortVortex Lab",
      status: "Online"
    },
    firmwareVersion: "v1.0.0",
    onlineEngineerCount: Math.max(1, chats.size + 1),
    deviceOnline: jobs.size > 0 || chats.size > 0
  };
}

function stripProfileTokens(profile, keys) {
  let result = String(profile || "");
  for (const key of keys) {
    result = result
      .split(";")
      .filter((part) => !part.trim().startsWith(`${key}=`))
      .join(";");
  }
  return result.replace(/^;+|;+$/g, "");
}

function buildProfile(params, algoBlob) {
  let profileBase = stripProfileTokens(params.profile, [
    "swdio_gpio",
    "swclk_gpio",
    "nrst_gpio",
    "use_nrst"
  ]);
  if (profileBase && params.eraseExplicit === "1") {
    profileBase = replaceProfileToken(profileBase, "erase", params.erase);
  }
  const parts = profileBase ? [profileBase] : [`model=${params.target || DEFAULTS.target}`];
  appendProfileArg(parts, "algo", params.algo);
  appendProfileArg(parts, "flash_base", params.flashBase);
  appendProfileArg(parts, "erase_size", params.eraseSize);
  appendProfileArg(parts, "attach", params.attach);
  if (!profileBase || !profileBase.includes("erase=")) parts.push(`erase=${params.erase || DEFAULTS.erase}`);
  parts.push(`reset_after_program=${params.noResetAfterProgram === "1" ? 0 : 1}`);

  if (params.algo === "custom_sram_algo") {
    const required = [
      ["algo blob file", algoBlob],
      ["algo-load-addr", params.algoLoadAddr],
      ["algo-erase-pc", params.algoErasePc],
      ["algo-program-pc", params.algoProgramPc],
      ["algo-done-addr", params.algoDoneAddr],
      ["algo-stack", params.algoStack],
      ["algo-buffer-addr", params.algoBufferAddr],
      ["algo-buffer-size", params.algoBufferSize]
    ];
    const missing = required.filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) throw new Error(`custom_sram_algo missing required arguments: ${missing.join(", ")}`);
    parts.push(`algo_blob_hex=${algoBlob.data.toString("hex")}`);
    appendProfileArg(parts, "algo_load_addr", params.algoLoadAddr);
    appendProfileArg(parts, "algo_init_pc", params.algoInitPc);
    appendProfileArg(parts, "algo_erase_pc", params.algoErasePc);
    appendProfileArg(parts, "algo_full_erase_pc", params.algoFullErasePc);
    appendProfileArg(parts, "algo_program_pc", params.algoProgramPc);
    appendProfileArg(parts, "algo_uninit_pc", params.algoUninitPc);
    appendProfileArg(parts, "algo_done_addr", params.algoDoneAddr);
    appendProfileArg(parts, "algo_done_magic", params.algoDoneMagic);
    appendProfileArg(parts, "algo_stack", params.algoStack);
    appendProfileArg(parts, "algo_buffer_addr", params.algoBufferAddr);
    appendProfileArg(parts, "algo_buffer_size", params.algoBufferSize);
    appendProfileArg(parts, "algo_timeout_ms", params.algoTimeoutMs);
    appendProfileArg(parts, "algo_init_timeout_ms", params.algoInitTimeoutMs);
    appendProfileArg(parts, "algo_erase_timeout_ms", params.algoEraseTimeoutMs);
    appendProfileArg(parts, "algo_program_timeout_ms", params.algoProgramTimeoutMs);
    appendProfileArg(parts, "algo_init_r0", params.algoInitR0);
    appendProfileArg(parts, "algo_init_r1", params.algoInitR1);
    appendProfileArg(parts, "algo_init_r2", params.algoInitR2);
  }
  return parts.map((part) => String(part).replace(/^;+|;+$/g, "")).filter(Boolean).join(";");
}

function detectFirmwareFormat(params, firmware) {
  const ext = path.extname(firmware.filename || "").toLowerCase();
  return ext === ".hex" ? "hex" : "bin";
}

function buildUartProfile(params, firmwareFormat) {
  const portKind = params.flashMode === "rs485" ? "rs485" : FIXED_HARDWARE.portKind;
  const uartPort = portKind === "rs485" ? FIXED_HARDWARE.rs485UartPort : FIXED_HARDWARE.uartPort;
  const uartTxGpio = portKind === "rs485" ? FIXED_HARDWARE.rs485TxGpio : FIXED_HARDWARE.uartTxGpio;
  const uartRxGpio = portKind === "rs485" ? FIXED_HARDWARE.rs485RxGpio : FIXED_HARDWARE.uartRxGpio;

  let profile = stripProfileTokens(params.uartProfile || params.profile, [
    "physical",
    "port_kind",
    "uart_port",
    "uart_tx_gpio",
    "uart_rx_gpio",
    "rs485_rts_gpio",
    "rst_gpio",
    "boot0_gpio",
    "use_rst",
    "use_boot0"
  ]);
  if (!profile) {
    const parts = [
      `model=${params.target || "stm32f4"}`,
      `format=${firmwareFormat}`,
      `physical=${portKind}`,
      `uart_port=${uartPort}`,
      `uart_tx_gpio=${uartTxGpio}`,
      `uart_rx_gpio=${uartRxGpio}`,
      `rs485_rts_gpio=${FIXED_HARDWARE.rs485RtsGpio}`,
      `rst_gpio=${FIXED_HARDWARE.rstGpio}`,
      `boot0_gpio=${FIXED_HARDWARE.boot0Gpio}`,
      `use_rst=${FIXED_HARDWARE.useRst}`,
      `use_boot0=${FIXED_HARDWARE.useBoot0}`,
      `baud=${params.baud || "115200"}`,
      `flash_base=${params.baseAddr || DEFAULTS.baseAddr}`,
      `erase=${params.uartErase || params.erase || "page"}`,
      `reset_after_program=${params.noResetAfterProgram === "1" ? 0 : 1}`
    ];
    appendProfileArg(parts, "page_size", params.pageSize);
    appendProfileArg(parts, "uart_chunk_size", params.uartFlashChunkSize);
    appendProfileArg(parts, "timeout_ms", params.timeoutMs);
    appendProfileArg(parts, "erase_timeout_ms", params.eraseTimeoutMs || "30000");
    appendProfileArg(parts, "extended_erase", params.extendedErase);
    appendProfileArg(parts, "ack", params.ackByte);
    appendProfileArg(parts, "sync_hex", params.syncHex);
    appendProfileArg(parts, "get_id_cmd_hex", params.getIdCmdHex);
    appendProfileArg(parts, "write_cmd_hex", params.writeCmdHex);
    appendProfileArg(parts, "go_cmd_hex", params.goCmdHex);
    appendProfileArg(parts, "erase_cmd_hex", params.eraseCmdHex);
    appendProfileArg(parts, "ext_erase_cmd_hex", params.extEraseCmdHex);
    appendProfileArg(parts, "full_erase_frame_hex", params.fullEraseFrameHex);
    appendProfileArg(parts, "ext_full_erase_frame_hex", params.extFullEraseFrameHex);
    appendProfileArg(parts, "addr_format", params.addrFormat);
    appendProfileArg(parts, "erase_format", params.eraseFormat);
    appendProfileArg(parts, "profile_extra", "");
    profile = parts.filter(Boolean).join(";");
  }
  profile = replaceProfileToken(profile, "format", firmwareFormat);
  profile = replaceProfileToken(profile, "base_addr", params.baseAddr || DEFAULTS.baseAddr);
  if (!profile.includes("physical=") && !profile.includes("port_kind=")) {
    profile = replaceProfileToken(profile, "physical", portKind);
  }
  return profile;
}

async function runFlashJob(job, params, firmware, algoBlob) {
  const log = (message) => addLog(job, message);
  const mqtt = mqttConfigFromParams(params);
  const broker = mqtt.broker;
  const mqttPort = mqtt.port;
  const topicPrefix = mqtt.topicPrefix;
  const chunkSize = Number(params.chunkSize || DEFAULTS.chunkSize);
  const chunkDelay = Number(params.chunkDelay || 0);
  const ackTimeout = Number(params.ackTimeout || DEFAULTS.ackTimeout);
  const windowSize = Number(params.window || DEFAULTS.window);
  const qos = Number(params.qos || DEFAULTS.qos);
  const mode = params.flashMode || "swd";
  const firmwareFormat = detectFirmwareFormat(params, firmware);
  const isHex = firmwareFormat === "hex";

  if (!firmware || !firmware.data.length) throw new Error("firmware file is empty");
  if (isHex && !firmware.data.includes(0x3a)) throw new Error("HEX firmware does not look like Intel HEX");
  if (chunkSize <= 0 || chunkSize > 2048) throw new Error("chunk-size must be in range 1..2048");
  if (chunkDelay < 0) throw new Error("chunk-delay must be >= 0");
  if (ackTimeout <= 0) throw new Error("ack-timeout must be > 0");
  if (windowSize <= 0 || windowSize > 6) throw new Error("window must be in range 1..6");
  if (![0, 1].includes(qos)) throw new Error("qos must be 0 or 1");
  if (params.algoBlobPresent === "1" && params.algo !== "custom_sram_algo") {
    throw new Error("algo blob requires algo custom_sram_algo");
  }

  const transfer = buildTransferConfig(mode, params, firmware, algoBlob, topicPrefix, firmwareFormat);
  const clientId = `web-${mode}-flasher-${Date.now()}`;
  let client = null;

  const connectClient = async () => {
    const newClient = new MqttClient(
      broker,
      mqttPort,
      `${clientId}-${Date.now()}`,
      mqtt.username,
      mqtt.password
    );
    await newClient.connect();
    await newClient.subscribe(transfer.topics.ack, 0);
    return newClient;
  };

  const reconnectAndQueryStatus = async () => {
    log("MQTT link lost, reconnecting and querying ESP32 progress ...");
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      try {
        const nextClient = await connectClient();
        for (let probe = 1; probe <= 15; probe += 1) {
          try {
            await nextClient.publish(transfer.topics.status, Buffer.from("?"), 0);
            const ack = parseAck(await nextClient.waitForMessage(transfer.topics.ack, 5));
            if (ack.status === "status") {
              const received = Number.parseInt(ack.received || "0", 0);
              log(`Resuming from ESP32 stored offset: ${received}`);
              return [nextClient, received];
            }
            if (ack.status === "status_inactive") {
              log("ESP32 has no active transfer; restarting from 0");
              return [nextClient, 0];
            }
            throw new Error(`Unexpected status ACK: ${JSON.stringify(ack)}`);
          } catch (err) {
            log(`Waiting for ESP32 reconnect/status... (${probe}/15) ${err.message}`);
            await sleep(2000);
          }
        }
      } catch (err) {
        log(`Reconnect attempt ${attempt} failed: ${err.message}`);
        await sleep(1000);
      }
    }
    throw new Error("Unable to reconnect to ESP32 over MQTT");
  };

  try {
    log(`Connecting MQTT broker ${broker}:${mqttPort} ...`);
    client = await connectClient();
    log(`Setting profile on ${transfer.topics.target}: ${transfer.profile}`);
    await client.publish(transfer.topics.target, Buffer.from(transfer.profile, "utf8"), qos);
    await sleep(200);

    if (params.singlePacket === "1" && transfer.singleTopic) {
      log(`Publishing ${transfer.label} in one packet: ${firmware.filename}`);
      log(`Size: ${firmware.data.length} bytes -> ${transfer.singleTopic}`);
      await client.publish(transfer.singleTopic, firmware.data, qos);
    } else {
      const startPayload = Buffer.from(transfer.startText, "utf8");
      log(`Starting ${transfer.label} transfer: ${firmware.filename}`);
      log(`Format: ${firmwareFormat}, size: ${firmware.data.length} bytes, chunk: ${chunkSize}, window: ${windowSize}`);
      await client.publish(transfer.topics.start, startPayload, qos);
      const startAck = parseAck(await client.waitForMessage(transfer.topics.ack, ackTimeout));
      if (startAck.status !== "start") throw new Error(`Unexpected start ACK: ${JSON.stringify(startAck)}`);

      let sent = 0;
      let acked = 0;
      let inFlight = 0;
      while (acked < firmware.data.length) {
        while (inFlight < windowSize && sent < firmware.data.length) {
          const chunk = firmware.data.slice(sent, sent + chunkSize);
          await client.publish(transfer.topics.chunk, Buffer.concat([uint32(sent), chunk]), qos);
          sent += chunk.length;
          inFlight += 1;
          if (chunkDelay > 0) await sleep(chunkDelay * 1000);
        }

        let ack;
        try {
          ack = parseAck(await client.waitForMessage(transfer.topics.ack, ackTimeout));
        } catch (err) {
          log(`ACK wait failed: ${err.message}`);
          client.disconnect();
          const result = await reconnectAndQueryStatus();
          client = result[0];
          const received = result[1];
          if (received === 0) {
            await client.publish(transfer.topics.start, startPayload, qos);
            const restartAck = parseAck(await client.waitForMessage(transfer.topics.ack, ackTimeout));
            if (restartAck.status !== "start") throw new Error(`Unexpected restart ACK: ${JSON.stringify(restartAck)}`);
          }
          acked = received;
          sent = received;
          inFlight = 0;
          continue;
        }

        if (ack.status.startsWith("error_")) throw new Error(`ESP32 rejected transfer: ${JSON.stringify(ack)}`);
        if (ack.status !== "chunk") continue;
        const received = Number.parseInt(ack.received || "0", 0);
        if (received <= acked) throw new Error(`Non-progressing chunk ACK: ${JSON.stringify(ack)}`);
        acked = received;
        inFlight = Math.max(0, inFlight - 1);
        setProgress(job, acked, firmware.data.length);
      }

      await client.publish(transfer.topics.end, Buffer.from("program"), qos);
      log("Waiting for ESP32 to program target ...");
      while (true) {
        const ack = parseAck(await client.waitForMessage(transfer.topics.ack, Math.max(ackTimeout, transfer.programTimeout)));
        log(`ESP32: ${JSON.stringify(ack)}`);
        if (ack.status === "done") break;
        if (ack.status.startsWith("error_")) throw new Error(`ESP32 programming failed: ${JSON.stringify(ack)}`);
      }
    }
    setProgress(job, firmware.data.length, firmware.data.length);
    completeJob(job, "done");
  } finally {
    if (client) client.disconnect();
  }
}

function buildTransferConfig(mode, params, firmware, algoBlob, topicPrefix, firmwareFormat) {
  if (mode === "uart" || mode === "rs485") {
    const profile = buildUartProfile(params, firmwareFormat);
    return {
      label: mode === "rs485" ? "RS485 UART flash" : "UART flash",
      profile,
      programTimeout: 180,
      singleTopic: null,
      startText: `size=${firmware.data.length};${profile}`,
      topics: {
        target: `${topicPrefix}/uartflash/target`,
        start: `${topicPrefix}/uartflash/start`,
        chunk: `${topicPrefix}/uartflash/chunk`,
        end: `${topicPrefix}/uartflash/end`,
        ack: `${topicPrefix}/uartflash/ack`,
        status: `${topicPrefix}/uartflash/status`
      }
    };
  }

  const profile = buildProfile(params, algoBlob);
  const startProfile = params.algo === "custom_sram_algo" ? "" : profile;
  if (firmwareFormat === "hex") {
    return {
      label: "SWD HEX",
      profile,
      programTimeout: 120,
      singleTopic: `${topicPrefix}/hex`,
      startText: startProfile ? `size=${firmware.data.length};${startProfile}` : `size=${firmware.data.length}`,
      topics: {
        target: `${topicPrefix}/target`,
        start: `${topicPrefix}/hex/start`,
        chunk: `${topicPrefix}/hex/chunk`,
        end: `${topicPrefix}/hex/end`,
        ack: `${topicPrefix}/hex/ack`,
        status: `${topicPrefix}/hex/status`
      }
    };
  }

  return {
    label: "SWD BIN",
    profile,
    programTimeout: 120,
    singleTopic: `${topicPrefix}/bin`,
    startText: startProfile
      ? `size=${firmware.data.length};${startProfile};base_addr=${params.baseAddr || DEFAULTS.baseAddr}`
      : `size=${firmware.data.length};base_addr=${params.baseAddr || DEFAULTS.baseAddr}`,
    topics: {
      target: `${topicPrefix}/target`,
      start: `${topicPrefix}/bin/start`,
      chunk: `${topicPrefix}/bin/chunk`,
      end: `${topicPrefix}/bin/end`,
      ack: `${topicPrefix}/bin/ack`,
      status: `${topicPrefix}/bin/status`
    }
  };
}

function uint32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value, 0);
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function addLog(job, message) {
  job.logs.push({ type: "log", message, at: new Date().toISOString() });
  notify(job);
}

function setProgress(job, done, total) {
  job.progress = { done, total, percent: total ? (done * 100) / total : 0 };
  job.logs.push({ type: "progress", ...job.progress, at: new Date().toISOString() });
  notify(job);
}

function completeJob(job, status, error = "") {
  job.status = status;
  job.error = error;
  job.logs.push({ type: "status", status, error, at: new Date().toISOString() });
  notify(job);
  for (const client of job.clients) client.end();
  setTimeout(() => jobs.delete(job.id), 10 * 60 * 1000);
}

function notify(job) {
  const event = job.logs[job.logs.length - 1];
  for (const res of job.clients) res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function pushChat(chat, event) {
  chat.events.push({ ...event, at: new Date().toISOString() });
  const payload = `data: ${JSON.stringify(chat.events[chat.events.length - 1])}\n\n`;
  for (const res of chat.clients) res.write(payload);
}

async function startChatSession(params) {
  const mqtt = mqttConfigFromParams(params);
  const broker = mqtt.broker;
  const mqttPort = mqtt.port;
  const subscribeTopic = topicWithDevicePrefix(params.subscribeTopic || "qos1", mqtt.topicPrefix);
  const publishTopic = topicWithDevicePrefix(params.publishTopic || "qos0", mqtt.topicPrefix);
  const clientId = normalizeMqttClientId(params.clientId);
  const receiveFormat = normalizeMessageFormat(params.receiveFormat);
  const qos = Number(params.chatQos || 0);
  if (![0, 1].includes(qos)) throw new Error("chat publish qos must be 0 or 1");

  const id = crypto.randomUUID();
  const chat = {
    id,
    status: "connecting",
    broker,
    mqttPort,
    subscribeTopic,
    publishTopic,
    listenTopics: Array.from(new Set([subscribeTopic, publishTopic].filter(Boolean))),
    clientId,
    receiveFormat,
    qos,
    mqtt,
    client: null,
    publishClient: null,
    selfMessages: [],
    clients: new Set(),
    events: []
  };
  chats.set(id, chat);

  await connectChatClients(chat);
  chat.status = "connected";
  pushChat(chat, { type: "status", status: "connected", message: `Subscribed ${subscribeTopic}, publishing ${publishTopic}` });
  listenForChat(chat);
  return chat;
}

async function connectChatClients(chat) {
  const nonce = crypto.randomBytes(2).toString("hex");
  const client = new MqttClient(
    chat.broker,
    chat.mqttPort,
    `${chat.clientId}-sub-${nonce}`,
    chat.mqtt.username,
    chat.mqtt.password
  );
  const publishClient = new MqttClient(
    chat.broker,
    chat.mqttPort,
    `${chat.clientId}-pub-${nonce}`,
    chat.mqtt.username,
    chat.mqtt.password
  );
  chat.client = client;
  chat.publishClient = publishClient;
  await client.connect();
  await publishClient.connect();
  for (const topic of chat.listenTopics) {
    await client.subscribe(topic, 1);
  }
}

function disconnectChatClients(chat) {
  if (chat.client) chat.client.disconnect();
  if (chat.publishClient) chat.publishClient.disconnect();
  chat.client = null;
  chat.publishClient = null;
}

async function listenForChat(chat) {
  while (chat.status !== "closed") {
    try {
      chat.status = "connected";
      const packet = await chat.client.waitForAnyMessage(chat.listenTopics, 60 * 60);
      const fingerprint = payloadFingerprint(packet.payload);
      const selfIndex = chat.selfMessages.findIndex((item) => item.fingerprint === fingerprint);
      if (selfIndex >= 0) {
        chat.selfMessages.splice(selfIndex, 1);
        continue;
      }
      pushChat(chat, {
        type: "message",
        direction: packet.topic === chat.publishTopic ? "peer" : "in",
        topic: packet.topic,
        message: messageFromBuffer(packet.payload, chat.receiveFormat)
      });
    } catch (err) {
      if (chat.status === "closed") return;
      if (err.message.startsWith("Timeout waiting for MQTT topic")) continue;
      chat.status = "reconnecting";
      pushChat(chat, { type: "status", status: "reconnecting", message: `MQTT reconnecting: ${err.message}` });
      disconnectChatClients(chat);
      while (chat.status !== "closed") {
        try {
          await wait(1500);
          await connectChatClients(chat);
          chat.status = "connected";
          pushChat(chat, { type: "status", status: "connected", message: `Reconnected ${chat.subscribeTopic}` });
          break;
        } catch (reconnectErr) {
          pushChat(chat, { type: "status", status: "reconnecting", message: `Reconnect failed: ${reconnectErr.message}` });
          disconnectChatClients(chat);
        }
      }
    }
  }
}

async function sendChatMessage(chat, message, format = "ascii") {
  if (!chat.publishClient || chat.status !== "connected") throw new Error("chat session is not connected");
  const sendFormat = normalizeMessageFormat(format);
  const payload = bufferFromMessage(message, sendFormat);
  chat.selfMessages.push({ fingerprint: payloadFingerprint(payload), at: Date.now() });
  await chat.publishClient.publish(chat.publishTopic, payload, chat.qos);
  pushChat(chat, {
    type: "message",
    direction: "out",
    topic: chat.publishTopic,
    message: messageFromBuffer(payload, sendFormat)
  });
}

function closeChat(chat) {
  chat.status = "closed";
  disconnectChatClients(chat);
  pushChat(chat, { type: "status", status: "closed", message: "Chat session closed" });
  for (const client of chat.clients) client.end();
  chats.delete(chat.id);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error("Expected multipart/form-data");
  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_UPLOAD_BYTES) throw new Error("Upload is too large");
    chunks.push(chunk);
  }
  const body = Buffer.concat(chunks);
  const fields = {};
  const files = {};
  let cursor = body.indexOf(boundary) + boundary.length + 2;
  while (cursor > boundary.length) {
    const next = body.indexOf(boundary, cursor);
    if (next < 0) break;
    const part = body.slice(cursor, next - 2);
    cursor = next + boundary.length + 2;
    const headerEnd = part.indexOf(Buffer.from("\r\n\r\n"));
    if (headerEnd < 0) continue;
    const rawHeaders = part.slice(0, headerEnd).toString("latin1");
    const data = part.slice(headerEnd + 4);
    const name = /name="([^"]+)"/.exec(rawHeaders)?.[1];
    const filename = /filename="([^"]*)"/.exec(rawHeaders)?.[1];
    if (!name) continue;
    if (filename !== undefined && filename !== "") {
      files[name] = { filename, data };
    } else if (filename === undefined) {
      fields[name] = data.toString("utf8");
    }
  }
  return { fields, files };
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  const relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, "Forbidden");
  fs.readFile(filePath, (err, data) => {
    if (err) return send(res, 404, "Not found");
    const ext = path.extname(filePath);
    const type = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript" }[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
    res.end(data);
  });
}

function send(res, status, body, type = "text/plain") {
  res.writeHead(status, { "Content-Type": `${type}; charset=utf-8` });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("JSON body is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/api/meta") {
      return send(res, 200, JSON.stringify(getMetaSnapshot()), "application/json");
    }
    if (req.method === "POST" && url.pathname === "/api/chip-configs/import") {
      const body = await readJson(req);
      const config = saveChipConfig(body);
      return send(res, 200, JSON.stringify({
        ok: true,
        config: buildClientChipConfig(config),
        meta: getMetaSnapshot()
      }), "application/json");
    }
    if (req.method === "POST" && url.pathname === "/api/flash") {
      const { fields, files } = await parseMultipart(req);
      const firmware = files.firmwareFile || files.binFile;
      if (!firmware) return send(res, 400, JSON.stringify({ error: "firmware file is required" }), "application/json");
      const id = crypto.randomUUID();
      const job = { id, status: "running", logs: [], clients: new Set(), progress: { done: 0, total: firmware.data.length, percent: 0 } };
      jobs.set(id, job);
      runFlashJob(job, mergeChipParams(fields), firmware, files.algoBlob).catch((err) => completeJob(job, "error", err.message));
      return send(res, 200, JSON.stringify({ id }), "application/json");
    }
    if (req.method === "POST" && url.pathname === "/api/chat/connect") {
      const body = await readJson(req);
      const chat = await startChatSession(body);
      return send(res, 200, JSON.stringify({
        id: chat.id,
        clientId: chat.clientId,
        subscribeTopic: chat.subscribeTopic,
        publishTopic: chat.publishTopic
      }), "application/json");
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/chat/") && url.pathname.endsWith("/send")) {
      const id = url.pathname.split("/")[3];
      const chat = chats.get(id);
      if (!chat) return send(res, 404, JSON.stringify({ error: "chat session not found" }), "application/json");
      const body = await readJson(req);
      await sendChatMessage(chat, String(body.message || ""), body.format || "ascii");
      return send(res, 200, JSON.stringify({ ok: true }), "application/json");
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/chat/") && url.pathname.endsWith("/format")) {
      const id = url.pathname.split("/")[3];
      const chat = chats.get(id);
      if (!chat) return send(res, 404, JSON.stringify({ error: "chat session not found" }), "application/json");
      const body = await readJson(req);
      chat.receiveFormat = normalizeMessageFormat(body.receiveFormat || chat.receiveFormat);
      return send(res, 200, JSON.stringify({ ok: true, receiveFormat: chat.receiveFormat }), "application/json");
    }
    if (req.method === "POST" && url.pathname.startsWith("/api/chat/") && url.pathname.endsWith("/close")) {
      const id = url.pathname.split("/")[3];
      const chat = chats.get(id);
      if (!chat) return send(res, 404, JSON.stringify({ error: "chat session not found" }), "application/json");
      closeChat(chat);
      return send(res, 200, JSON.stringify({ ok: true }), "application/json");
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/chat/") && url.pathname.endsWith("/events")) {
      const id = url.pathname.split("/")[3];
      const chat = chats.get(id);
      if (!chat) return send(res, 404, "Chat session not found");
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      chat.clients.add(res);
      for (const event of chat.events) res.write(`data: ${JSON.stringify(event)}\n\n`);
      req.on("close", () => chat.clients.delete(res));
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/jobs/") && url.pathname.endsWith("/events")) {
      const id = url.pathname.split("/")[3];
      const job = jobs.get(id);
      if (!job) return send(res, 404, "Job not found");
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive"
      });
      job.clients.add(res);
      for (const event of job.logs) res.write(`data: ${JSON.stringify(event)}\n\n`);
      req.on("close", () => job.clients.delete(res));
      return;
    }
    serveStatic(req, res);
  } catch (err) {
    send(res, 500, JSON.stringify({ error: err.message }), "application/json");
  }
});

server.listen(PORT, () => {
  console.log(`PortVortex flasher UI: http://localhost:${PORT}`);
});
