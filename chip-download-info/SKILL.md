---
name: chip-download-info
description: Collect all evidence-backed data needed to add firmware download/flashing support for a chip from only a chip model name. Use when the user gives an MCU/chip model and wants SWD, UART bootloader, RS485 bootloader, or custom SRAM flash-algorithm integration parameters, including flash map, memory map, erase/program rules, bootloader protocol, algorithm entry points, and a sourced checklist of missing user-provided items.
---

# Chip Download Info

## Overview

Use this skill to turn a chip model name into a complete, sourced download-support dossier. The output must distinguish confirmed facts from assumptions and must list exactly what the user still needs to provide before engineering can add the chip.

## Inputs

Accept a single chip model as the minimum input, for example `STM32F103C8T6`, `GD32F303RCT6`, `CH32V203C8T6`, or `AT32F403A`.

If the user provides board details, preferred transport, firmware format, or known boot pins, use them. Do not require them before beginning research.

## Evidence Rules

Browse or otherwise verify current primary sources before answering. Prefer:

- Manufacturer datasheet.
- Manufacturer reference manual or user manual.
- Manufacturer Flash programming manual.
- Manufacturer bootloader protocol/manual/application note.
- Manufacturer pack files, CMSIS-Pack, OpenOCD target files, or pyOCD target definitions when official manuals do not expose algorithm details.

Use community sources only as secondary evidence. Label them clearly as secondary and do not use them as the sole source for destructive operations such as erase/program algorithms.

Never invent algorithm entry points, page sizes, bootloader commands, option-byte behavior, or voltage/debug limitations. If a value is not found, mark it `unknown` and add it to "User/engineering must provide".

## Workflow

1. Normalize the chip model.
   - Identify vendor, family, exact part, package suffix, flash/RAM density suffix, and likely aliases.
   - Confirm whether the part is ARM Cortex-M, RISC-V, 8051-like, or another architecture.

2. Collect official documents.
   - Find datasheet, reference/user manual, flash programming manual, and bootloader manual.
   - Record document title, vendor, revision/date if available, and URL.

3. Determine supported download paths.
   - SWD/JTAG/CJTAG/debug-probe flashing.
   - UART bootloader flashing.
   - RS485 or protocol-wrapped UART flashing if applicable.
   - Custom SRAM flash algorithm flashing.

4. Extract memory and Flash facts.
   - Flash base address and total size.
   - SRAM base address and size.
   - Sector/page layout, erase granularity, alignment, write granularity, blank value, and protected regions.
   - Vector table/reset address rules and firmware image base address.
   - Endianness and instruction set.

5. Extract transport/protocol facts.
   - Debug interface pins, reset behavior, connect-under-reset requirements, supported SWD/JTAG speed limitations.
   - Search for UART/USART bootloader facts instead of asking the user first: bootloader entry conditions, boot pins/option bytes, default serial settings, command framing, ACK/NACK values, erase/write/read/jump commands, checksum/CRC rules, maximum packet size, timeout and retry behavior.
   - Search for RS485 facts when the chip/vendor bootloader or target product uses protocol-wrapped UART over RS485: direction-control, addressing, framing, turnaround timing, and retry behavior.
   - Ask the user only for board-specific information that cannot be inferred from chip documentation, such as actual BOOT/RESET/UART/RS485 transceiver wiring, GPIO-controlled DE/RE timing, or custom protocol wrappers implemented by their firmware.

6. Decide whether an existing target profile can be reused.
   - Compare against existing families by architecture, flash controller, page/sector layout, and bootloader protocol.
   - If compatible, propose `model=<profile>` and any overrides such as `flash_base`, `erase_size`, `attach`, or `baseAddr`.
   - If not compatible, specify the missing implementation work.

7. For `custom_sram_algo`, identify required algorithm package.
   - Look for a manufacturer/CMSIS/OpenOCD/pyOCD flash algorithm.
   - If a raw SRAM algorithm binary is available, record or request it.
   - Extract required entry points only from reliable algorithm metadata or disassembly by engineering review.

## Output Template

Return the answer in Chinese unless the user asks otherwise. Always put the web-import JSON first so the user can paste it directly into the PortVortex page.

First output exactly one JSON object in a fenced `json` block. The object must match the PortVortex chip config schema:

```json
{
  "id": "lowercase-chip-id",
  "label": "Human readable chip name",
  "aliases": ["optional-alias"],
  "description": "Short evidence-backed summary.",
  "defaults": {
    "target": "lowercase-chip-id",
    "baseAddr": "0x08000000",
    "flashBase": "0x08000000",
    "eraseSize": "",
    "erase": "sector",
    "attach": "",
    "chunkSize": 2048,
    "chunkDelay": 0,
    "ackTimeout": 300,
    "window": 3,
    "baud": 115200,
    "pageSize": "",
    "uartFlashChunkSize": "",
    "timeoutMs": "",
    "eraseTimeoutMs": "30000",
    "uartErase": "page",
    "extendedErase": "",
    "ackByte": "",
    "syncHex": "",
    "getIdCmdHex": "",
    "writeCmdHex": "",
    "goCmdHex": "",
    "eraseCmdHex": "",
    "extEraseCmdHex": "",
    "fullEraseFrameHex": "",
    "extFullEraseFrameHex": "",
    "addrFormat": "",
    "eraseFormat": "",
    "algo": "",
    "algoLoadAddr": "",
    "algoInitPc": "",
    "algoErasePc": "",
    "algoFullErasePc": "",
    "algoProgramPc": "",
    "algoUninitPc": "",
    "algoDoneAddr": "",
    "algoDoneMagic": "",
    "algoStack": "",
    "algoBufferAddr": "",
    "algoBufferSize": "",
    "algoTimeoutMs": "",
    "algoInitTimeoutMs": "",
    "algoEraseTimeoutMs": "",
    "algoProgramTimeoutMs": "",
    "algoInitR0": "",
    "algoInitR1": "",
    "algoInitR2": ""
  },
  "swd": {
    "profile": "model=lowercase-chip-id;flash_base=0x08000000;erase=sector"
  },
  "uart": {},
  "rs485": {},
  "sources": [
    {
      "title": "Document title",
      "url": "https://example.com/manual.pdf",
      "evidence": "Short note naming the values taken from this source."
    }
  ],
  "notes": "Unknown or board-specific items that could not be safely inferred."
}
```

Rules for the JSON:

- Use only keys the PortVortex page understands in `defaults`, `swd`, `uart`, and `rs485`.
- Put shared values in `defaults`; put mode-specific overrides in `swd`, `uart`, or `rs485`.
- Leave unavailable values as empty strings instead of inventing them.
- Use hex strings for command bytes and addresses, for example `7F`, `31CE`, `0x08000000`.
- For STM32-compatible UART bootloaders, typical field names are `syncHex`, `ackByte`, `getIdCmdHex`, `writeCmdHex`, `goCmdHex`, `eraseCmdHex`, `extEraseCmdHex`, `fullEraseFrameHex`, `extFullEraseFrameHex`, `addrFormat`, and `eraseFormat`.
- If no reliable UART/RS485 protocol is found, leave `uart`/`rs485` empty and explain the gap in `notes`.

After the JSON block, provide the human-readable dossier below.

Use this structure:

```markdown
**芯片下载支持资料表**

芯片型号：
厂商/系列：
资料可信度：完整 / 部分 / 不足
建议支持方式：SWD / UART Bootloader / RS485 UART / custom_sram_algo / 待确认

**已确认资料**
- 官方文档：
- 二级资料：

**基础参数**
- CPU/架构：
- Flash 起始地址：
- Flash 容量：
- Flash 页/扇区布局：
- 擦除粒度：
- 写入粒度/对齐：
- SRAM 起始地址：
- SRAM 容量：
- 固件默认下载地址：

**SWD/JTAG 下载**
- 是否支持：
- 连接引脚：
- 复位/连接策略：
- 可复用 profile：
- 需要新增的底层实现：

**UART/RS485 Bootloader 下载**
- 是否支持：
- 进入 bootloader 条件：
- 串口参数：
- 协议命令：
- 包大小/校验/ACK：
- 需要新增的底层实现：

**custom_sram_algo 需求**
- 是否需要：
- algo blob 来源：
- flash_base：
- erase_size：
- algo_load_addr：
- algo_init_pc：
- algo_erase_pc：
- algo_full_erase_pc：
- algo_program_pc：
- algo_uninit_pc：
- algo_done_addr：
- algo_done_magic：
- algo_stack：
- algo_buffer_addr：
- algo_buffer_size：
- timeout 参数：
- init r0/r1/r2：

**用户仍需提供**
- 

**工程接入建议**
- 前端目标型号：
- 服务端 profile 参数：
- 设备端需要新增/修改：
- 最小验证固件：

**风险与未知项**
- 
```

## Missing Data Policy

Start from the chip model and try to obtain every download parameter from public/official sources. Do not ask the user for UART/RS485 protocol parameters until after searching official manuals, application notes, vendor tools, SDK examples, CMSIS packs, OpenOCD/pyOCD definitions, and credible secondary implementations.

The final "用户仍需提供" section should contain only items that remain unavailable, contradictory, or board-specific after research. Typical remaining items are:

- Full chip marking when the user supplied only a family name and density/package affects Flash/RAM size.
- Board schematic or wiring for SWD/UART/BOOT/RESET/RS485 transceiver pins.
- Board-specific boot entry timing if reset/boot pins are controlled by external logic.
- Custom RS485 framing or addressing if it is implemented by the user's existing firmware rather than the chip vendor bootloader.
- A verification firmware file (`.bin` or `.hex`) and expected success behavior.
- For `custom_sram_algo`: ask for the SRAM algorithm binary and entry-point metadata only if no reliable public/vendor algorithm package can be found.
- Official PDFs or links only when public search cannot locate a trustworthy datasheet, reference manual, Flash programming manual, or bootloader protocol manual.

## PortVortex Profile Mapping

When mapping to PortVortex-style download parameters, use these names:

- Normal target: `model`, `flash_base`, `erase_size`, `baseAddr`, `erase`, `attach`.
- UART/RS485 bootloader fields: `baud`, `pageSize`, `uartFlashChunkSize`, `timeoutMs`, `eraseTimeoutMs`, `extendedErase`, `uartErase`, `ackByte`, `syncHex`, `getIdCmdHex`, `writeCmdHex`, `goCmdHex`, `eraseCmdHex`, `extEraseCmdHex`, `fullEraseFrameHex`, `extFullEraseFrameHex`, `addrFormat`, `eraseFormat`.
- Custom SRAM algorithm: `algo=custom_sram_algo`, `algo_blob_hex`, `algo_load_addr`, `algo_init_pc`, `algo_erase_pc`, `algo_full_erase_pc`, `algo_program_pc`, `algo_uninit_pc`, `algo_done_addr`, `algo_done_magic`, `algo_stack`, `algo_buffer_addr`, `algo_buffer_size`, `algo_timeout_ms`, `algo_init_timeout_ms`, `algo_erase_timeout_ms`, `algo_program_timeout_ms`, `algo_init_r0`, `algo_init_r1`, `algo_init_r2`.

Only mark a chip "ready to integrate" when all required fields for at least one download path are known and sourced.
