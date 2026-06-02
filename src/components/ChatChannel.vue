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
      <label class="flex items-end gap-2 text-sm text-slate-600">
        <input v-model="channel.showTimestamp" type="checkbox">
        <span>{{ labels.showTimestamp }}</span>
      </label>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="field-block">
        <div class="field-label">{{ labels.sendFormat }}</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in labels.formatOptions"
            :key="option.value"
            :class="['format-pill', channel.sendFormat === option.value ? 'active' : '']"
            @click="channel.sendFormat = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>
      <div class="field-block">
        <div class="field-label">{{ labels.receiveFormat }}</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="option in labels.formatOptions"
            :key="option.value"
            :class="['format-pill', channel.receiveFormat === option.value ? 'active' : '']"
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

    <div class="chat-view">
      <template v-if="channel.messages.length">
        <div
          v-for="item in channel.messages"
          :key="item.id"
          :class="['chat-row', item.direction === 'out' ? 'out' : item.direction === 'in' ? 'in' : 'status']"
        >
          <div class="chat-line">
            <span v-if="channel.showTimestamp" class="chat-time">{{ item.at }}</span>
            <span v-if="item.topic && item.direction !== 'status'" class="chat-topic">[{{ item.topic }}]</span>
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
  </div>
</template>

<script setup>
import { Delete, MoreFilled, Plus } from "@element-plus/icons-vue";

const props = defineProps({
  channel: { type: Object, required: true },
  labels: { type: Object, required: true }
});

const emit = defineEmits(["connect", "close", "send", "format-change"]);

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
</script>
