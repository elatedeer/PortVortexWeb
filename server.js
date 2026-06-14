"use strict";

const http = require("http");
const net = require("net");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const zlib = require("zlib");

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

const DEVICE_START_TIMEOUT_SECONDS = 10;

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
    ...params
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
  const ack = {};
  for (const part of parts) {
    const index = part.indexOf("=");
    if (index > -1) {
      ack[part.slice(0, index)] = part.slice(index + 1);
    } else if (part && !ack.status) {
      ack.status = part;
    }
  }
  if (!ack.status) ack.status = "";
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

function parseNumber(value, fallback = null) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value).trim();
  const parsed = text.startsWith("0x") || text.startsWith("0X")
    ? Number.parseInt(text, 16)
    : Number.parseInt(text, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function hex32(value) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(8, "0")}`;
}

function readCString(buffer, start, maxLength) {
  const end = Math.min(buffer.length, start + maxLength);
  let cursor = start;
  while (cursor < end && buffer[cursor] !== 0) cursor += 1;
  return buffer.slice(start, cursor).toString("utf8").replace(/[^\x20-\x7e]/g, "");
}

function readElfString(table, offset) {
  if (!table || offset < 0 || offset >= table.length) return "";
  return readCString(table, offset, table.length - offset);
}

function alignUp(value, align) {
  if (!align || align <= 1) return value;
  return Math.ceil(value / align) * align;
}

function findEraseSizeFromSectors(flashDevice) {
  if (!flashDevice?.sectors?.length) return "";
  const flashBase = parseNumber(flashDevice.flashBase, null);
  const flashSize = parseNumber(flashDevice.flashSize, null);
  const flashEnd = flashBase !== null && flashSize !== null ? flashBase + flashSize : null;
  const sectors = flashDevice.sectors
    .map((sector) => ({
      size: parseNumber(sector.size, null),
      address: parseNumber(sector.address, null)
    }))
    .filter((sector) => sector.size && sector.address !== null)
    .sort((a, b) => a.address - b.address);
  if (!sectors.length) return "";
  if (flashBase !== null && sectors.every((sector) => sector.address < flashBase)) {
    for (const sector of sectors) sector.address += flashBase;
  }
  if (flashBase !== null) {
    for (let index = 0; index < sectors.length; index += 1) {
      const sector = sectors[index];
      const nextAddress = sectors[index + 1]?.address ?? flashEnd ?? sector.address + sector.size;
      if (flashBase >= sector.address && flashBase < nextAddress) return hex32(sector.size);
    }
  }
  return hex32(sectors[0].size);
}

function ensureThumbPc(value) {
  return hex32((value | 1) >>> 0);
}

function sectionSymbolOffset(section, symbolValue) {
  const offset = symbolValue - section.addr;
  if (offset < 0 || offset >= section.size) return -1;
  return section.offset + offset;
}

function isZipContainer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}

function decodeZipName(bytes, flags) {
  return bytes.toString((flags & 0x800) ? "utf8" : "latin1").replace(/\\/g, "/");
}

function findZipEndOfCentralDirectory(buffer) {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error("PACK ZIP directory was not found");
}

function readZipEntries(buffer) {
  const eocd = findZipEndOfCentralDirectory(buffer);
  const entryCount = buffer.readUInt16LE(eocd + 10);
  const centralDirOffset = buffer.readUInt32LE(eocd + 16);
  const entries = [];
  let cursor = centralDirOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error("PACK ZIP central directory is truncated");
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const name = decodeZipName(buffer.slice(cursor + 46, cursor + 46 + nameLength), flags);
    entries.push({ name, flags, method, compressedSize, uncompressedSize, localHeaderOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readZipEntryData(buffer, entry) {
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new Error(`PACK ZIP local header is invalid for ${entry.name}`);
  }
  if (entry.flags & 0x1) throw new Error(`PACK entry is encrypted: ${entry.name}`);
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const dataOffset = offset + 30 + nameLength + extraLength;
  const dataEnd = dataOffset + entry.compressedSize;
  if (dataEnd > buffer.length) throw new Error(`PACK entry is truncated: ${entry.name}`);
  const compressed = buffer.slice(dataOffset, dataEnd);
  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`Unsupported PACK ZIP compression method ${entry.method} for ${entry.name}`);
}

function normalizePackName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseXmlAttributes(tag) {
  const attrs = {};
  String(tag || "").replace(/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g, (_, key, value) => {
    attrs[key] = value;
    return "";
  });
  return attrs;
}

function readPackTextEntry(buffer, entry) {
  return readZipEntryData(buffer, entry).toString("utf8");
}

function findPackAlgorithmsInBlock(block) {
  const matches = [...String(block || "").matchAll(/<algorithm\b[^>]*>/gi)];
  return matches.map((match) => parseXmlAttributes(match[0])).filter((algo) => algo.name);
}

function isOptionAlgorithm(algo) {
  return /(opt|otp|option|ob)([_.\-]|$)|quad[_-]?spi|qspi|ospi/i.test(algo.name || "");
}

function findPackAlgorithmInBlock(block) {
  const valid = findPackAlgorithmsInBlock(block);
  return valid.find((algo) =>
    algo.default === "1" &&
    /^0x08000000$/i.test(algo.start || "") &&
    !isOptionAlgorithm(algo)
  ) || valid.find((algo) =>
    algo.default === "1" &&
    /^0x080/i.test(algo.start || "") &&
    !isOptionAlgorithm(algo)
  ) || valid.find((algo) =>
    /^0x080/i.test(algo.start || "") &&
    !isOptionAlgorithm(algo)
  ) || valid.find((algo) =>
    algo.default === "1" &&
    !isOptionAlgorithm(algo)
  ) || valid.find((algo) =>
    !isOptionAlgorithm(algo)
  ) || valid.find((algo) =>
    algo.default === "1"
  ) || valid[0] || null;
}

function collectPackVariants(block) {
  return [...String(block || "").matchAll(/<variant\b[^>]*>/gi)]
    .map((match) => parseXmlAttributes(match[0]).Dvariant)
    .filter(Boolean);
}

function collectPackDevices(pdscText) {
  if (!pdscText) return [];
  const seen = new Set();
  const devices = [];
  for (const match of pdscText.matchAll(/<device\b[^>]*>[\s\S]*?<\/device>/gi)) {
    const block = match[0];
    const attrs = parseXmlAttributes(block.match(/<device\b[^>]*>/i)?.[0] || "");
    const algorithm = findPackAlgorithmInBlock(block);
    if (!attrs.Dname || !algorithm?.name) continue;
    const addDevice = (name, parent = "") => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      devices.push({
        name,
        parent,
        algorithm: algorithm.name,
        start: algorithm.start || "",
        size: algorithm.size || "",
        default: algorithm.default || ""
      });
    };
    addDevice(attrs.Dname);
    for (const variant of collectPackVariants(block)) addDevice(variant, attrs.Dname);
  }
  return devices.sort((a, b) => a.name.localeCompare(b.name));
}

function findMatchingPackAlgorithm(pdscText, target) {
  const normalizedTarget = normalizePackName(target);
  if (!pdscText || !normalizedTarget) return null;
  const deviceBlocks = [...pdscText.matchAll(/<device\b[^>]*>[\s\S]*?<\/device>/gi)];
  for (const match of deviceBlocks) {
    const block = match[0];
    const attrs = parseXmlAttributes(block.match(/<device\b[^>]*>/i)?.[0] || "");
    const names = [attrs.Dname, ...collectPackVariants(block), attrs.Dvendor].map(normalizePackName);
    if (names.some((name) => name && (normalizedTarget.startsWith(name) || name.startsWith(normalizedTarget)))) {
      const algorithm = findPackAlgorithmInBlock(block);
      if (algorithm) return algorithm;
    }
  }

  const subFamilyBlocks = [...pdscText.matchAll(/<subFamily\b[^>]*>[\s\S]*?<\/subFamily>/gi)];
  for (const match of subFamilyBlocks) {
    const block = match[0];
    const attrs = parseXmlAttributes(block.match(/<subFamily\b[^>]*>/i)?.[0] || "");
    const name = normalizePackName(attrs.DsubFamily);
    if (name && (normalizedTarget.startsWith(name) || name.startsWith(normalizedTarget))) {
      const algorithm = findPackAlgorithmInBlock(block);
      if (algorithm) return algorithm;
    }
  }

  return null;
}

function choosePackFlmEntry(entries, options = {}, pdscText = "") {
  const flmEntries = entries.filter((entry) => /\.flm$/i.test(entry.name) && !entry.name.endsWith("/"));
  if (!flmEntries.length) throw new Error("PACK file does not contain any .FLM flash algorithm");
  const explicitName = String(options.packFlm || options.flmName || "").trim().toLowerCase();
  if (explicitName) {
    const explicitEntry = flmEntries.find((entry) =>
      entry.name.toLowerCase() === explicitName ||
      path.basename(entry.name).toLowerCase() === explicitName ||
      entry.name.toLowerCase().includes(explicitName)
    );
    if (explicitEntry) return { entry: explicitEntry, algorithm: null };
  }
  const selectedDevice = String(options.packDevice || "").trim();
  const pdscAlgorithm = findMatchingPackAlgorithm(pdscText, selectedDevice || options.target);
  if (pdscAlgorithm?.name) {
    const algorithmName = pdscAlgorithm.name.toLowerCase();
    const pdscEntry = flmEntries.find((entry) =>
      entry.name.toLowerCase() === algorithmName ||
      path.basename(entry.name).toLowerCase() === path.basename(algorithmName)
    );
    if (pdscEntry) return { entry: pdscEntry, algorithm: pdscAlgorithm };
  }
  const hints = [
    options.packFlm,
    options.flmName,
    options.target,
    options.filename
  ].map((value) => String(value || "").trim().toLowerCase()).filter(Boolean);
  const explicitHint = Boolean(String(options.packFlm || options.flmName || "").trim());
  const score = (entry) => {
    const name = entry.name.toLowerCase();
    const baseName = path.basename(name);
    let value = 0;
    for (const hint of hints) {
      if (name.includes(hint)) value += 100;
    }
    if (name.includes("/flash/")) value += 10;
    if (!explicitHint && /\b(opt|option|options|otp|ob)\b|[_-](opt|option|options|otp|ob)\./i.test(baseName)) value -= 80;
    if (!explicitHint && !/(^|[_-])(opt|option|options|otp|ob)([_.\-]|$)/i.test(baseName)) value += 20;
    if (name.includes("arm")) value += 2;
    return value;
  };
  return { entry: [...flmEntries].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))[0], algorithm: null };
}

function extractPackFlm(buffer, options = {}) {
  const entries = readZipEntries(buffer);
  const pdscEntry = entries.find((entry) => /\.pdsc$/i.test(entry.name));
  const pdscText = pdscEntry ? readPackTextEntry(buffer, pdscEntry) : "";
  const devices = collectPackDevices(pdscText);
  const { entry, algorithm } = choosePackFlmEntry(entries, options, pdscText);
  return {
    filename: entry.name,
    data: readZipEntryData(buffer, entry),
    pack: {
      filename: options.filename || "",
      selectedFlm: entry.name,
      selectedAlgorithm: algorithm || null,
      devices,
      flmCount: entries.filter((item) => /\.flm$/i.test(item.name)).length
    }
  };
}

function parseAlgorithmFile(file, options = {}) {
  if (!file) throw new Error("FLM or PACK file is required");
  const filename = file.filename || options.filename || "";
  const ext = path.extname(filename).toLowerCase();
  const flmFile = ext === ".pack" || isZipContainer(file.data)
    ? extractPackFlm(file.data, { ...options, filename })
    : { filename, data: file.data, pack: null };
  const parsed = parseFlm(flmFile.data, {
    ...options,
    filename: flmFile.filename,
    loadAddr: options.loadAddr,
    algorithm: flmFile.pack?.selectedAlgorithm || null
  });
  return { ...parsed, sourceFile: filename, pack: flmFile.pack };
}

function parseFlm(buffer, options = {}) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 52) throw new Error("FLM file is too small");
  if (buffer[0] !== 0x7f || buffer[1] !== 0x45 || buffer[2] !== 0x4c || buffer[3] !== 0x46) {
    throw new Error("FLM must be an ELF file");
  }
  if (buffer[4] !== 1) throw new Error("Only 32-bit FLM ELF files are supported");
  const littleEndian = buffer[5] === 1;
  if (!littleEndian && buffer[5] !== 2) throw new Error("Unsupported ELF byte order");
  const u16 = (offset) => littleEndian ? buffer.readUInt16LE(offset) : buffer.readUInt16BE(offset);
  const u32 = (offset) => littleEndian ? buffer.readUInt32LE(offset) : buffer.readUInt32BE(offset);
  const machine = u16(18);
  if (machine !== 40) throw new Error(`Unsupported FLM machine type ${machine}; expected ARM ELF`);

  const shoff = u32(32);
  const shentsize = u16(46);
  const shnum = u16(48);
  const shstrndx = u16(50);
  if (!shoff || !shentsize || !shnum) throw new Error("FLM has no section table");
  if (shoff + shentsize * shnum > buffer.length) throw new Error("FLM section table is truncated");

  const sections = [];
  for (let i = 0; i < shnum; i += 1) {
    const offset = shoff + i * shentsize;
    sections.push({
      index: i,
      nameOffset: u32(offset),
      type: u32(offset + 4),
      flags: u32(offset + 8),
      addr: u32(offset + 12),
      offset: u32(offset + 16),
      size: u32(offset + 20),
      link: u32(offset + 24),
      info: u32(offset + 28),
      addralign: u32(offset + 32),
      entsize: u32(offset + 36)
    });
  }

  const shstr = sections[shstrndx] && sections[shstrndx].offset + sections[shstrndx].size <= buffer.length
    ? buffer.slice(sections[shstrndx].offset, sections[shstrndx].offset + sections[shstrndx].size)
    : Buffer.alloc(0);
  for (const section of sections) section.name = readElfString(shstr, section.nameOffset);

  const symbols = new Map();
  for (const section of sections.filter((item) => item.type === 2 || item.type === 11)) {
    const strtab = sections[section.link];
    if (!strtab || strtab.offset + strtab.size > buffer.length) continue;
    const strings = buffer.slice(strtab.offset, strtab.offset + strtab.size);
    const entrySize = section.entsize || 16;
    const count = Math.floor(section.size / entrySize);
    for (let i = 0; i < count; i += 1) {
      const offset = section.offset + i * entrySize;
      if (offset + 16 > buffer.length) break;
      const name = readElfString(strings, u32(offset));
      if (!name) continue;
      symbols.set(name, {
        name,
        value: u32(offset + 4),
        size: u32(offset + 8),
        info: buffer[offset + 12],
        shndx: u16(offset + 14)
      });
    }
  }

  const loadSections = sections
    .filter((section) => (section.flags & 0x2) && section.size > 0 && (section.type === 1 || section.type === 8))
    .sort((a, b) => a.addr - b.addr);
  if (!loadSections.length) throw new Error("FLM has no loadable SRAM sections");
  const imageBase = Math.min(...loadSections.map((section) => section.addr));
  const imageEnd = Math.max(...loadSections.map((section) => section.addr + section.size));
  if (imageEnd <= imageBase || imageEnd - imageBase > MAX_UPLOAD_BYTES) throw new Error("FLM load image is invalid or too large");
  const image = Buffer.alloc(imageEnd - imageBase, 0);
  for (const section of loadSections) {
    if (section.type !== 1) continue;
    if (section.offset + section.size > buffer.length) throw new Error(`FLM section ${section.name || section.index} is truncated`);
    buffer.copy(image, section.addr - imageBase, section.offset, section.offset + section.size);
  }

  const requestedLoadAddr = parseNumber(options.loadAddr, null);
  const algoLoadAddr = requestedLoadAddr !== null
    ? requestedLoadAddr
    : imageBase >= 0x20000000 ? imageBase : 0x20000000;
  const absolute = (value) => (algoLoadAddr + (value - imageBase)) >>> 0;
  const getSymbol = (names, required = true) => {
    const list = Array.isArray(names) ? names : [names];
    const symbol = list.map((name) => symbols.get(name)).find(Boolean);
    if (!symbol && required) throw new Error(`FLM missing required symbol: ${list.join(" or ")}`);
    return symbol || null;
  };

  const init = getSymbol("Init");
  const eraseSector = getSymbol("EraseSector");
  const programPage = getSymbol("ProgramPage");
  const flashDeviceSymbol = getSymbol(["FlashDevice", "FlashDev"], false);
  const uninit = getSymbol("UnInit", false);
  const eraseChip = getSymbol("EraseChip", false);
  const blankCheck = getSymbol("BlankCheck", false);

  let flashDevice = null;
  if (flashDeviceSymbol) {
    const section = sections[flashDeviceSymbol.shndx];
    const offset = section ? sectionSymbolOffset(section, flashDeviceSymbol.value) : -1;
    if (offset >= 0 && offset + 160 <= buffer.length) {
      const read16 = littleEndian ? Buffer.prototype.readUInt16LE : Buffer.prototype.readUInt16BE;
      const read32 = littleEndian ? Buffer.prototype.readUInt32LE : Buffer.prototype.readUInt32BE;
      const sectors = [];
      for (let cursor = offset + 160; cursor + 8 <= buffer.length; cursor += 8) {
        const size = read32.call(buffer, cursor);
        const address = read32.call(buffer, cursor + 4);
        if (size === 0xffffffff || address === 0xffffffff) break;
        if (!size && !address) break;
        sectors.push({ size: hex32(size), address: hex32(address) });
        if (sectors.length >= 64) break;
      }
      flashDevice = {
        version: hex32(read16.call(buffer, offset)).replace("0x0000", "0x"),
        name: readCString(buffer, offset + 2, 128).trim(),
        type: hex32(read16.call(buffer, offset + 130)).replace("0x0000", "0x"),
        flashBase: hex32(read32.call(buffer, offset + 132)),
        flashSize: hex32(read32.call(buffer, offset + 136)),
        pageSize: hex32(read32.call(buffer, offset + 140)),
        erasedValue: hex32(buffer[offset + 148]).replace("0x000000", "0x"),
        programTimeoutMs: String(read32.call(buffer, offset + 152)),
        eraseTimeoutMs: String(read32.call(buffer, offset + 156)),
        sectors
      };
    }
  }

  const bufferSize = flashDevice ? Math.min(Math.max(parseNumber(flashDevice.pageSize, 0) || 0, 256), 4096) : 1024;
  const eraseSize = findEraseSizeFromSectors(flashDevice);
  const algorithmStart = options.algorithm?.start || "";
  const resolvedFlashBase = flashDevice?.flashBase || algorithmStart || DEFAULTS.baseAddr;
  const stackSize = 1024;
  const alignedImageSize = alignUp(image.length, 8);
  const algoBufferAddr = alignUp(algoLoadAddr + alignedImageSize, 8);
  const algoDoneAddr = alignUp(algoBufferAddr + bufferSize, 4);
  const algoStack = alignUp(algoDoneAddr + 4 + stackSize, 8);

  return {
    filename: options.filename || "",
    algoBlob: image,
    algoBlobHex: image.toString("hex"),
    imageBase: hex32(imageBase),
    imageSize: image.length,
    symbols: Object.fromEntries([...symbols.entries()].map(([name, symbol]) => [name, hex32(symbol.value)])),
    flashDevice,
    params: {
      algo: "cmsis_flm",
      baseAddr: resolvedFlashBase,
      flashBase: resolvedFlashBase,
      eraseSize,
      algoLoadAddr: hex32(algoLoadAddr),
      algoInitPc: ensureThumbPc(absolute(init.value)),
      algoErasePc: ensureThumbPc(absolute(eraseSector.value)),
      algoFullErasePc: eraseChip ? ensureThumbPc(absolute(eraseChip.value)) : "",
      algoProgramPc: ensureThumbPc(absolute(programPage.value)),
      algoUninitPc: uninit ? ensureThumbPc(absolute(uninit.value)) : "",
      algoDoneAddr: hex32(algoDoneAddr),
      algoDoneMagic: "",
      algoStack: hex32(algoStack),
      algoBufferAddr: hex32(algoBufferAddr),
      algoBufferSize: String(bufferSize),
      algoTimeoutMs: "",
      algoInitTimeoutMs: "",
      algoEraseTimeoutMs: flashDevice?.eraseTimeoutMs || "",
      algoProgramTimeoutMs: flashDevice?.programTimeoutMs || "",
      algoInitR0: resolvedFlashBase,
      algoInitR1: "168000000",
      algoInitR2: ""
    },
    capabilities: {
      init: Boolean(init),
      uninit: Boolean(uninit),
      eraseChip: Boolean(eraseChip),
      eraseSector: Boolean(eraseSector),
      programPage: Boolean(programPage),
      blankCheck: Boolean(blankCheck)
    }
  };
}

function applyFlmParams(params, flmFile) {
  if (!flmFile) return { params, algoBlob: null, flm: null };
  const flm = parseAlgorithmFile(flmFile, {
    filename: flmFile.filename,
    loadAddr: params.algoLoadAddr,
    packFlm: params.packFlm,
    flmName: params.flmName,
    packDevice: params.packDevice,
    target: params.target
  });
  const mergedParams = { ...params, algo: "cmsis_flm" };
  for (const [key, value] of Object.entries(flm.params)) {
    if (mergedParams[key] === undefined || mergedParams[key] === null || String(mergedParams[key]) === "") {
      mergedParams[key] = value;
    }
  }
  return {
    params: mergedParams,
    algoBlob: { filename: flm.filename || flmFile.filename, data: flm.algoBlob },
    flm
  };
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

function boolFlag(value) {
  return value === true || value === "1" || value === "true" || value === "on" ? "1" : "0";
}

function offlineAutoPayload(params) {
  const mode = params.flashMode === "swd" ? "swd" : "uart";
  const autoKey = mode === "swd" ? "auto_swd" : "auto_uart";
  return [
    "target=offline",
    `${autoKey}=${boolFlag(params.offlineAutoDownload)}`,
    `check_version=${boolFlag(params.offlineVersionCheck)}`
  ].join(";");
}

async function publishSetAndWait(params, payload) {
  const mqtt = mqttConfigFromParams(params);
  const setTopic = topicWithDevicePrefix("/set", mqtt.topicPrefix);
  const ackTopic = topicWithDevicePrefix("/set/ack", mqtt.topicPrefix);
  const nonce = crypto.randomBytes(2).toString("hex");
  const client = new MqttClient(
    mqtt.broker,
    mqtt.port,
    `web-offline-set-${nonce}`,
    mqtt.username,
    mqtt.password
  );

  try {
    await client.connect();
    await client.subscribe(ackTopic, 0);
    await client.publish(setTopic, Buffer.from(payload, "utf8"), 1);
    const ack = parseAck(await client.waitForMessage(ackTopic, Number(params.ackTimeout || DEFAULTS.ackTimeout)));
    if (ack.status !== "set" && ack.status !== "status") {
      throw new Error(`unexpected /set ACK: ${JSON.stringify(ack)}`);
    }
    return ack;
  } finally {
    client.disconnect();
  }
}

async function applyOfflineSettings(params) {
  const channel = params.flashMode === "swd" ? "SWD" : "UART";
  const payload = offlineAutoPayload(params);
  const ack = await publishSetAndWait(params, payload);
  return { channel, payload, ack };
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
  if (params.algo === "custom_sram_algo" || params.algo === "cmsis_flm") {
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
    if (missing.length) throw new Error(`${params.algo} missing required arguments: ${missing.join(", ")}`);

    const parts = [
      `model=${params.target || DEFAULTS.target}`,
      `algo=${params.algo}`,
      `flash_base=${params.baseAddr || DEFAULTS.baseAddr}`
    ];
    appendProfileArg(parts, "erase_size", params.eraseSize);
    parts.push("algo_blob_ref=last");
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
    appendProfileArg(parts, "attach", params.attach);
    parts.push(`erase=${params.erase || DEFAULTS.erase}`);
    parts.push(`reset_after_program=${params.noResetAfterProgram === "1" ? 0 : 1}`);
    return parts.map((part) => String(part).replace(/^;+|;+$/g, "")).filter(Boolean).join(";");
  }

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
  appendProfileArg(parts, "flash_base", params.flashBase || (usesUploadedAlgoBlob(params) ? params.baseAddr || DEFAULTS.baseAddr : ""));
  appendProfileArg(parts, "erase_size", params.eraseSize);
  appendProfileArg(parts, "attach", params.attach);
  if (!profileBase || !profileBase.includes("erase=")) parts.push(`erase=${params.erase || DEFAULTS.erase}`);
  parts.push(`reset_after_program=${params.noResetAfterProgram === "1" ? 0 : 1}`);

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

function appendOfflineStartArgs(baseText, params) {
  let text = baseText;
  if (params.storeOnly === "1") {
    text += ";offline=1";
    if (params.version) {
      text += `;version=${params.version};version_addr=${params.versionAddr || "0x0800FFF0"}`;
    }
  }
  return text;
}

function usesUploadedAlgoBlob(params) {
  return params.algo === "custom_sram_algo" || params.algo === "cmsis_flm";
}

function summarizeMqttPayload(payload) {
  return String(payload || "").replace(
    /algo_blob_hex=([0-9a-fA-F]{64})[0-9a-fA-F]*/g,
    "algo_blob_hex=$1..."
  );
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function uploadAlgoBlob(client, job, transfer, algoBlob, options) {
  const log = (message) => addLog(job, message);
  const data = algoBlob.data;
  const chunkSize = options.chunkSize;
  const ackTimeout = options.ackTimeout;
  const qos = options.qos;
  const checksum = crc32(data).toString(16).padStart(8, "0");
  const startText = `size=${data.length};crc32=0x${checksum}`;

  log(`Uploading target algorithm blob to ${transfer.topics.algoStart}: ${startText}`);
  await client.publish(transfer.topics.algoStart, Buffer.from(startText, "utf8"), qos);

  for (let offset = 0; offset < data.length; offset += chunkSize) {
    const chunk = data.slice(offset, offset + chunkSize);
    await client.publish(transfer.topics.algoChunk, Buffer.concat([uint32(offset), chunk]), qos);
  }

  await client.publish(transfer.topics.algoEnd, Buffer.alloc(0), qos);
  log(`Waiting for ESP32 algorithm upload ACK on ${transfer.topics.algoAck} ...`);
  while (true) {
    const ack = parseAck(await client.waitForMessage(transfer.topics.algoAck, Math.max(ackTimeout, 30)));
    log(`ESP32 algo: ${JSON.stringify(ack)}`);
    if (ack.status === "done") break;
    if (ack.status.startsWith("error_")) throw new Error(`ESP32 algorithm upload failed: ${JSON.stringify(ack)}`);
  }
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
  if (params.storeOnly === "1" && params.singlePacket === "1") {
    throw new Error("store-only requires chunked transfer; disable single packet mode");
  }
  if (params.algoBlobPresent === "1" && !usesUploadedAlgoBlob(params)) {
    throw new Error("algo blob requires algo custom_sram_algo or cmsis_flm");
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
    if (transfer.topics.algoAck) await newClient.subscribe(transfer.topics.algoAck, 0);
    return newClient;
  };

  const reconnectAndQueryStatus = async () => {
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
            await sleep(2000);
          }
        }
      } catch (err) {
        await sleep(1000);
      }
    }
    throw new Error("connection failed");
  };

  try {
    try {
      client = await connectClient();
      log("连接成功");
    } catch (err) {
      log("连接失败");
      throw err;
    }
    if (usesUploadedAlgoBlob(params)) {
      await uploadAlgoBlob(client, job, transfer, algoBlob, { chunkSize, ackTimeout, qos });
    }

    log(`Publishing target profile to ${transfer.topics.target}: ${summarizeMqttPayload(transfer.profile)}`);
    await client.publish(transfer.topics.target, Buffer.from(transfer.profile, "utf8"), qos);
    if (usesUploadedAlgoBlob(params)) {
      const delayMs = Number(params.targetApplyDelayMs || 500);
      log(`Waiting ${delayMs}ms for ESP32 to queue target profile before firmware transfer ...`);
      await sleep(delayMs);
    } else {
      await sleep(200);
    }

    const useSinglePacket = params.singlePacket === "1" && transfer.singleTopic && !usesUploadedAlgoBlob(params);
    if (params.singlePacket === "1" && transfer.singleTopic && usesUploadedAlgoBlob(params)) {
      log(`Single packet mode is disabled for ${params.algo}; using /bin/start, /bin/chunk and /bin/end.`);
    }

    if (useSinglePacket) {
      log(`Publishing ${transfer.label} in one packet: ${firmware.filename}`);
      log(`Size: ${firmware.data.length} bytes`);
      await client.publish(transfer.singleTopic, firmware.data, qos);
    } else {
      const startPayload = Buffer.from(transfer.startText, "utf8");
      log(`Starting ${transfer.label} transfer: ${firmware.filename}`);
      log(`Format: ${firmwareFormat}, size: ${firmware.data.length} bytes, chunk: ${chunkSize}, window: ${windowSize}`);
      log(`Publishing start to ${transfer.topics.start}: ${transfer.startText}`);
      await client.publish(transfer.topics.start, startPayload, qos);
      let startAck;
      try {
        startAck = parseAck(await client.waitForMessage(transfer.topics.ack, DEVICE_START_TIMEOUT_SECONDS));
      } catch (err) {
        throw new Error("设备超时或离线");
      }
      if (startAck.status !== "start") throw new Error(`Unexpected start ACK: ${JSON.stringify(startAck)}`);

      let sent = 0;
      let acked = 0;
      let inFlight = 0;
      log(`Publishing firmware chunks to ${transfer.topics.chunk} ...`);
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
          client.disconnect();
          const result = await reconnectAndQueryStatus();
          client = result[0];
          const received = result[1];
          if (received === 0) {
            await client.publish(transfer.topics.start, startPayload, qos);
            let restartAck;
            try {
              restartAck = parseAck(await client.waitForMessage(transfer.topics.ack, DEVICE_START_TIMEOUT_SECONDS));
            } catch (err) {
              throw new Error("设备超时或离线");
            }
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

      log(`Publishing end to ${transfer.topics.end}: ${transfer.endCommand}`);
      await client.publish(transfer.topics.end, Buffer.from(transfer.endCommand), qos);
      log(transfer.waitingMessage);
      while (true) {
        const ack = parseAck(await client.waitForMessage(transfer.topics.ack, Math.max(ackTimeout, transfer.programTimeout)));
        log(`ESP32: ${JSON.stringify(ack)}`);
        if (ack.status === transfer.finalAckStatus) break;
        if (ack.status.startsWith("error_")) throw new Error(`ESP32 ${transfer.failureLabel} failed: ${JSON.stringify(ack)}`);
      }
    }
    if (transfer.successMessage) log(transfer.successMessage);
    setProgress(job, firmware.data.length, firmware.data.length);
    completeJob(job, "done");
  } finally {
    if (client) client.disconnect();
  }
}

function buildTransferConfig(mode, params, firmware, algoBlob, topicPrefix, firmwareFormat) {
  const isOffline = params.storeOnly === "1";
  if (mode === "uart" || mode === "rs485") {
    const profile = buildUartProfile(params, firmwareFormat);
    return {
      label: mode === "rs485" ? "RS485 UART flash" : "UART flash",
      profile,
      programTimeout: 180,
      singleTopic: null,
      startText: appendOfflineStartArgs(`size=${firmware.data.length};${profile}`, params),
      endCommand: isOffline ? "store" : "program",
      finalAckStatus: isOffline ? "stored" : "done",
      waitingMessage: isOffline ? "Waiting for ESP32 to store UART firmware ..." : "Waiting for ESP32 UART bootloader programming ...",
      failureLabel: isOffline ? "UART store" : "UART programming",
      successMessage: isOffline ? "Stored for offline programming." : "Done. Watch the ESP32 UART log for programming progress.",
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
  const forceProgram = usesUploadedAlgoBlob(params) && !isOffline;
  const startProfile = usesUploadedAlgoBlob(params) ? "" : profile;
  if (firmwareFormat === "hex") {
    const startText = startProfile ? `size=${firmware.data.length};${startProfile}` : `size=${firmware.data.length}`;
    return {
      label: "SWD HEX",
      profile,
      programTimeout: 120,
      singleTopic: `${topicPrefix}/hex`,
      startText: forceProgram ? startText : appendOfflineStartArgs(startText, params),
      endCommand: forceProgram || !isOffline ? "program" : "store",
      finalAckStatus: forceProgram || !isOffline ? "done" : "stored",
      waitingMessage: forceProgram || !isOffline ? "Waiting for ESP32 to program STM32 from HEX ..." : "Waiting for ESP32 to store HEX ...",
      failureLabel: forceProgram || !isOffline ? "HEX programming" : "HEX store",
      successMessage: forceProgram || !isOffline ? "Done. Watch the ESP32 serial log for SWD programming progress." : "Stored for offline programming.",
      topics: {
        target: `${topicPrefix}/target`,
        algoStart: `${topicPrefix}/algo/start`,
        algoChunk: `${topicPrefix}/algo/chunk`,
        algoEnd: `${topicPrefix}/algo/end`,
        algoAck: `${topicPrefix}/algo/ack`,
        start: `${topicPrefix}/hex/start`,
        chunk: `${topicPrefix}/hex/chunk`,
        end: `${topicPrefix}/hex/end`,
        ack: `${topicPrefix}/hex/ack`,
        status: `${topicPrefix}/hex/status`
      }
    };
  }

  const binStartText = startProfile
    ? `size=${firmware.data.length};${startProfile};base_addr=${params.baseAddr || DEFAULTS.baseAddr}`
    : `size=${firmware.data.length};base_addr=${params.baseAddr || DEFAULTS.baseAddr}`;
  return {
    label: "SWD BIN",
    profile,
    programTimeout: 120,
    singleTopic: `${topicPrefix}/bin`,
    startText: forceProgram ? binStartText : appendOfflineStartArgs(binStartText, params),
    endCommand: forceProgram || !isOffline ? "program" : "store",
    finalAckStatus: forceProgram || !isOffline ? "done" : "stored",
    waitingMessage: forceProgram || !isOffline ? "Waiting for ESP32 to program target ..." : "Waiting for ESP32 to store firmware ...",
    failureLabel: forceProgram || !isOffline ? "programming" : "store",
    successMessage: forceProgram || !isOffline ? "Done. Watch the ESP32 serial log for SWD programming progress." : "Stored for offline programming.",
    topics: {
      target: `${topicPrefix}/target`,
      algoStart: `${topicPrefix}/algo/start`,
      algoChunk: `${topicPrefix}/algo/chunk`,
      algoEnd: `${topicPrefix}/algo/end`,
      algoAck: `${topicPrefix}/algo/ack`,
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
  pushChat(chat, { type: "status", status: "connected", message: "connected" });
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
          pushChat(chat, { type: "status", status: "connected", message: "connected" });
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
    if (req.method === "POST" && url.pathname === "/api/offline/settings") {
      const body = await readJson(req);
      const result = await applyOfflineSettings(body);
      return send(res, 200, JSON.stringify({ ok: true, ...result }), "application/json");
    }
    if (req.method === "POST" && url.pathname === "/api/flm/parse") {
      const { fields, files } = await parseMultipart(req);
      const flmFile = files.flmFile || files.packFile || files.algoFlm || files.algoBlob;
      if (!flmFile) return send(res, 400, JSON.stringify({ error: "FLM or PACK file is required" }), "application/json");
      const parsed = parseAlgorithmFile(flmFile, {
        filename: flmFile.filename,
        loadAddr: fields.algoLoadAddr,
        packFlm: fields.packFlm,
        flmName: fields.flmName,
        packDevice: fields.packDevice,
        target: fields.target
      });
      return send(res, 200, JSON.stringify({
        ok: true,
        filename: parsed.filename,
        sourceFile: parsed.sourceFile,
        pack: parsed.pack,
        imageBase: parsed.imageBase,
        imageSize: parsed.imageSize,
        params: parsed.params,
        flashDevice: parsed.flashDevice,
        capabilities: parsed.capabilities
      }), "application/json");
    }
    if (req.method === "POST" && url.pathname === "/api/flash") {
      const { fields, files } = await parseMultipart(req);
      const firmware = files.firmwareFile || files.binFile;
      if (!firmware) return send(res, 400, JSON.stringify({ error: "firmware file is required" }), "application/json");
      const id = crypto.randomUUID();
      const job = { id, status: "running", logs: [], clients: new Set(), progress: { done: 0, total: firmware.data.length, percent: 0 } };
      jobs.set(id, job);
      setImmediate(() => {
        try {
          const mergedParams = mergeChipParams(fields);
          const flmFile = files.flmFile || files.packFile || files.algoFlm;
          const flmApplied = applyFlmParams(mergedParams, flmFile);
          const algoBlob = flmApplied.algoBlob || files.algoBlob;
          if (flmApplied.flm) {
            const packInfo = flmApplied.flm.pack ? ` from PACK ${flmApplied.flm.pack.selectedFlm}` : "";
            addLog(job, `Parsed FLM ${flmApplied.flm.filename || flmFile.filename}${packInfo}: ${flmApplied.flm.imageSize} bytes`);
          }
          runFlashJob(job, flmApplied.params, firmware, algoBlob).catch((err) => completeJob(job, "error", err.message));
        } catch (err) {
          completeJob(job, "error", err.message);
        }
      });
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
