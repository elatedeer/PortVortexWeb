# MQTT 安全协议说明

本文档说明 PortVortex Web 与固件端当前使用的 MQTT 安全签名机制。

## 1. 安全目标

固件端对危险 MQTT 命令增加安全校验，防止未授权客户端直接向设备发送继电器控制、Modbus 配置、固件升级等高风险命令。

核心机制：

- 每台设备预置一个 `device_id` 和一个 32 字节 `device_secret`
- Web 浏览器不保存 `device_secret`
- Web 后端在发布危险 MQTT 命令前追加 `nonce` 和 `sig`
- 固件端使用同一份 `device_secret` 验证签名

## 2. 设备密钥

固件端需要先写入认证信息：

```text
'AT+AUTH=device_id=<id>;secret=<64_hex_secret>
```

其中：

- `device_id`：设备身份标识
- `device_secret`：32 字节密钥，用 64 位十六进制字符串表示

固件端 `AT+AUTH?` 只返回配置状态、`device_id` 和序列号状态，不会返回密钥。

## 3. Web 端密钥来源

当前 Web 后端从以下位置读取设备密钥：

1. 环境变量

```text
DEVICE_SECRET_HEX=<64_hex_secret>
DEVICE_AUTH_TOKEN=<device_id>
```

如果未设置 `DEVICE_AUTH_TOKEN`，会尝试使用 `DEVICE_ID`，再退回 `default`。

2. 本地 `device-auth.json`

支持数组格式：

```json
{
  "devices": [
    {
      "token": "pv_c6a3ac6182728982",
      "secret": "64位十六进制密钥"
    }
  ]
}
```

也支持映射格式：

```json
{
  "6bf3418a09725d07": {
    "secret": "64位十六进制密钥"
  },
  "default": {
    "secret": "64位十六进制密钥"
  }
}
```

Web 后端查找密钥时会依次尝试：

```text
<device_id>
default
```

只有匹配到合法的 64 位十六进制密钥时，Web 后端才会追加签名字段。

## 4. 需要签名的 MQTT Topic

当前需要签名的 topic 后缀如下：

```text
/set
/modbus/set
/target
/uartflash/target
/job
/algo/start
/hex/start
/bin/start
/uartflash/start
```

完整 topic 形如：

```text
/topic/<device_id>/<suffix>
```

例如：

```text
/topic/pv_c6a3ac6182728982/set
```

签名时只使用 topic 后缀，例如 `/set`，不使用完整 topic。

## 5. 签名字段

危险命令 payload 末尾追加两个字段：

```text
nonce=<random>;sig=<hmac_sha256_hex>
```

示例：

```text
target=relay;state=1;nonce=6a7b8c...;sig=9f0e...
```

`sig` 必须是 payload 的最后一个字段。

## 6. 签名输入

签名输入格式：

```text
topic_suffix + "\n" + seq_if_present + "\n" + nonce + "\n" + payload_without_sig
```

当前 Web 实现不使用 `seq`，因此第二行为空。

实际输入等价于：

```text
<topic_suffix>

<nonce>
<payload_without_sig>
```

例如 topic 为 `/set`，原始 payload 为：

```text
target=relay;state=1
```

随机 nonce 为：

```text
0123456789abcdef01234567
```

则 HMAC 输入为：

```text
/set

0123456789abcdef01234567
target=relay;state=1
```

## 7. 签名算法

签名算法：

```text
HMAC-SHA256
```

密钥：

```text
device_secret 的 32 字节二进制值
```

输出：

```text
小写十六进制字符串
```

Web 端 Node.js 实现逻辑等价于：

```js
const sig = crypto
  .createHmac("sha256", Buffer.from(secret, "hex"))
  .update(input)
  .digest("hex");
```

## 8. nonce 与 seq

### nonce

当前 Web 端每次签名都会生成新的随机 nonce：

```text
12 字节随机数，转为 24 位十六进制字符串
```

固件端会维护最近 nonce 窗口，用于防止短时间内重放同一条命令。

### seq

`seq` 是可选字段。

当前 Web 端不使用 `seq`，原因是多用户同时控制同一设备时，如果多个客户端维护各自的序列号，容易互相阻塞。

如果未来所有命令都统一经过一个服务端，可改为由服务端维护单调递增的 per-device `seq`，这样可以增强设备重启后的防重放能力。

## 9. 固件升级 SHA256 校验

固件流式升级的 start payload 会追加：

```text
sha256=<firmware_sha256>
```

适用 topic：

```text
/bin/start
/hex/start
/uartflash/start
```

固件端在 `/bin/end`、`/hex/end` 或 `/uartflash/end` 后校验完整固件 SHA256。

如果校验失败，固件端返回：

```text
error_sha256
```

注意：固件数据 chunk 不逐包签名，安全性依赖 start 命令签名和最终整包 SHA256 校验。

## 10. 当前 Web API 与签名关系

以下 Web API 最终会发布到需要签名的 MQTT topic：

| Web API | MQTT topic | 是否签名 |
| --- | --- | --- |
| `POST /api/relay` | `<prefix>/set` | 是 |
| `POST /api/relay2` | `<prefix>/set` | 是 |
| `POST /api/offline/settings` | `<prefix>/set` | 是 |
| `POST /api/modbus` | `<prefix>/modbus/set` | 是 |
| `POST /api/modbus/poll` | `<prefix>/modbus/set` | 是 |
| `POST /api/flash` | `<prefix>/target`、`/bin/start`、`/hex/start`、`/uartflash/start` 等 | 是 |

以下查询类接口不属于危险签名 topic：

| Web API | MQTT topic | 说明 |
| --- | --- | --- |
| `GET /api/adc` | `<prefix>/get` | 查询 ADC，结果从 `/set/ack` 返回 |
| `GET /api/modbus` | `<prefix>/modbus/get` | 查询 Modbus 状态，结果从 `/modbus/ack` 返回 |

## 11. 只读 topic 规则

Web 端不应向设备上报或 ACK topic 发布命令。

当前视为只读的 topic 包括：

```text
/qos1
/set/ack
/algo/ack
/hex/ack
/bin/ack
/uartflash/ack
/modbus/ack
/rs485/qos1
/can/qos1
```

实时对话发送时，如果目标 topic 是只读 topic，Web 后端会拒绝发布。

## 12. 安全注意事项

1. 浏览器端不得保存 `device_secret`

   密钥只能放在 Web 后端、数据库或受控配置文件中。

2. 设备启用 auth 后，危险 topic 必须带 `nonce` 和 `sig`

   否则固件端应拒绝执行。

3. `device-auth.json` 中的 secret 应妥善保护

   如果部署到公网服务器，建议改为数据库加密存储或密钥管理服务。

4. 当前 Web 端不使用 `seq`

   这有利于多用户并发控制，但设备重启后的重放防护弱于带 `seq` 的方案。

5. MQTT broker 账号密码不等于设备级授权

   MQTT 账号只能控制 broker 连接权限，不能替代 per-device 签名校验。

## 13. 示例

### Relay1 控制

原始 payload：

```text
target=relay;state=1
```

发布 topic：

```text
<prefix>/set
```

签名后 payload：

```text
target=relay;state=1;nonce=<random>;sig=<hmac_sha256_hex>
```

### Modbus 模式配置

原始 payload：

```text
mode=modbus_slave;addr=1
```

发布 topic：

```text
<prefix>/modbus/set
```

签名后 payload：

```text
mode=modbus_slave;addr=1;nonce=<random>;sig=<hmac_sha256_hex>
```

### BIN 固件升级开始

原始 payload：

```text
size=<bytes>;sha256=<firmware_sha256>
```

发布 topic：

```text
<prefix>/bin/start
```

签名后 payload：

```text
size=<bytes>;sha256=<firmware_sha256>;nonce=<random>;sig=<hmac_sha256_hex>
```
