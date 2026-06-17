const timers = new Map();

function stopTimer(key) {
  const timer = timers.get(key);
  if (timer) clearInterval(timer);
  timers.delete(key);
}

self.onmessage = (event) => {
  const message = event.data || {};
  if (message.type === "start") {
    stopTimer(message.key);
    const intervalMs = Math.max(1, Number(message.intervalMs) || 1);
    const timer = setInterval(() => {
      self.postMessage({ type: "tick", key: message.key });
    }, intervalMs);
    timers.set(message.key, timer);
  }
  if (message.type === "stop") {
    stopTimer(message.key);
  }
  if (message.type === "stopAll") {
    for (const key of timers.keys()) stopTimer(key);
  }
};
