export function formatChatTime(value) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  const millis = String(date.getMilliseconds()).padStart(3, "0");
  return `${part("hour")}:${part("minute")}:${part("second")}.${millis}`;
}
