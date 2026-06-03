<template>
  <div class="space-y-4">
    <div class="channel-summary">
      <span :class="channel.connected ? 'status-dot online' : 'status-dot'"></span>
      <div class="min-w-0">
        <div class="text-sm font-medium">{{ channel.connected ? labels.connected : labels.disconnected }}</div>
        <div class="truncate text-xs text-slate-500">{{ channel.clientId || labels.clientIdAuto }}</div>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="field-block">
        <div class="field-label">{{ labels.clientId }}</div>
        <input
          v-model="channel.clientId"
          class="rounded-xl border border-slate-300 px-3 py-2 text-sm"
          :disabled="channel.connected"
          :placeholder="labels.clientIdAuto"
        >
      </div>
      <div class="chat-check-row">
        <label class="chat-check">
          <input v-model="channel.showTimestamp" type="checkbox">
          <span>{{ labels.showTimestamp }}</span>
        </label>
        <label class="chat-check">
          <input v-model="channel.autoScroll" type="checkbox">
          <span>{{ labels.autoScroll || "自动滚屏" }}</span>
        </label>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="field-block">
        <div class="field-label">{{ labels.sendFormat }}</div>
        <div class="format-switch" role="group" :aria-label="labels.sendFormat">
          <button
            v-for="option in labels.formatOptions"
            :key="option.value"
            :class="['format-option', channel.sendFormat === option.value ? 'active' : '']"
            @click="changeSendFormat(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="field-block">
        <div class="field-label">{{ labels.receiveFormat }}</div>
        <div class="format-switch" role="group" :aria-label="labels.receiveFormat">
          <button
            v-for="option in labels.formatOptions"
            :key="option.value"
            :class="['format-option', channel.receiveFormat === option.value ? 'active' : '']"
            @click="changeReceiveFormat(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="flex gap-2">
      <button class="el-button el-button--primary" :disabled="channel.connected" @click="$emit('connect')">
        {{ labels.connect }}
      </button>
      <button class="el-button" :disabled="!channel.connected" @click="$emit('close')">
        {{ labels.close }}
      </button>
    </div>

    <div ref="chatViewRef" class="chat-view">
      <template v-if="channel.messages.length">
        <div
          v-for="item in channel.messages"
          :key="item.id"
          :class="['chat-row', item.direction === 'out' ? 'out' : item.direction === 'peer' ? 'peer' : item.direction === 'in' ? 'in' : 'status']"
        >
          <div class="chat-line">
            <span v-if="channel.showTimestamp" class="chat-time">{{ item.at }}</span>
            <span class="chat-text">{{ item.message || item.status || "" }}</span>
          </div>
        </div>
      </template>
      <div v-else class="text-sm text-slate-500">{{ labels.waiting }}</div>
    </div>

    <div class="message-input-row">
      <input
        v-model="channel.message"
        class="message-input"
        :placeholder="labels.message"
        @keydown.enter="$emit('send')"
      >
      <el-dropdown trigger="click" placement="top-end" :hide-on-click="false" popper-class="quick-menu-popper">
        <button class="quick-menu-button" type="button" :title="labels.quickInsert">
          <el-icon><MoreFilled /></el-icon>
        </button>
        <template #dropdown>
          <div class="quick-menu">
            <button
              v-for="phrase in channel.quickPhrases"
              :key="phrase"
              class="quick-menu-item"
              type="button"
              @click="channel.message = phrase"
            >
              <span>{{ phrase }}</span>
              <el-icon class="quick-delete" @click.stop="removePhrase(phrase)"><Delete /></el-icon>
            </button>
            <div class="quick-add-row">
              <input v-model="channel.newPhrase" class="quick-add-input" :placeholder="labels.quickInsert" @keydown.enter.stop="addPhrase">
              <button class="quick-add-button" type="button" :title="labels.addPhrase || labels.quickInsert" @click="addPhrase">
                <el-icon><Plus /></el-icon>
              </button>
            </div>
          </div>
        </template>
      </el-dropdown>
      <button class="el-button el-button--primary" :disabled="!channel.connected" @click="$emit('send')">
        {{ labels.send }}
      </button>
    </div>

    <div class="send-options">
      <label class="chat-check">
        <input v-model="channel.timedEnabled" type="checkbox" @change="emitTimerChange">
        <span>{{ labels.timedSend || "定时发送" }}</span>
      </label>
      <input
        v-model.number="channel.timedValue"
        class="send-option-input"
        type="number"
        min="1"
        @input="emitTimerChange"
      >
      <select v-model="channel.timedUnit" class="send-option-select" @change="emitTimerChange">
        <option value="ms">{{ labels.milliseconds || "毫秒" }}</option>
        <option value="s">{{ labels.seconds || "秒" }}</option>
      </select>
      <label class="chat-check">
        <input v-model="channel.appendEnabled" type="checkbox">
        <span>{{ labels.appendSuffix || "自动发送附加位" }}</span>
      </label>
      <input
        v-model="channel.appendValue"
        class="send-option-input append-input"
        :placeholder="labels.appendValue || '附加位'"
      >
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from "vue";
import { Delete, MoreFilled, Plus } from "@element-plus/icons-vue";
import { normalizeHexMessage } from "../utils/messageFormat";

const props = defineProps({
  channel: { type: Object, required: true },
  labels: { type: Object, required: true }
});

const emit = defineEmits(["connect", "close", "send", "format-change", "timer-change"]);
const chatViewRef = ref(null);

function changeSendFormat(value) {
  if (props.channel.sendFormat === value) return;
  props.channel.sendFormat = value;
  if (value === "hex") props.channel.message = normalizeHexMessage(props.channel.message);
}

function changeReceiveFormat(value) {
  props.channel.receiveFormat = value;
  emit("format-change");
}

function addPhrase() {
  const phrase = String(props.channel.newPhrase || "").trim();
  if (!phrase) return;
  if (!props.channel.quickPhrases.includes(phrase)) props.channel.quickPhrases.push(phrase);
  props.channel.message = phrase;
  props.channel.newPhrase = "";
}

function removePhrase(phrase) {
  props.channel.quickPhrases = props.channel.quickPhrases.filter((item) => item !== phrase);
}

function emitTimerChange() {
  emit("timer-change");
}

watch(
  () => props.channel.messages.length,
  async () => {
    if (!props.channel.autoScroll) return;
    await nextTick();
    const target = chatViewRef.value;
    if (target) target.scrollTop = target.scrollHeight;
  }
);
</script>
