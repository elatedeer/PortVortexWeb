<template>
  <div class="space-y-4">
    <div class="channel-summary">
      <span :class="channel.connected ? 'status-dot online' : 'status-dot'"></span>
      <div class="min-w-0">
        <div class="text-sm font-medium">{{ channel.connected ? labels.connected : labels.disconnected }}</div>
        <div class="truncate text-xs text-muted-foreground">{{ channel.clientId || labels.clientIdAuto }}</div>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="field-block">
        <div class="field-label">{{ labels.clientId }}</div>
        <Input v-model="channel.clientId" :disabled="channel.connected" :placeholder="labels.clientIdAuto" />
      </div>
      <div class="chat-check-row">
        <label class="chat-check">
          <CheckboxCompat v-model="channel.showTimestamp" />
          <span>{{ labels.showTimestamp }}</span>
        </label>
        <label class="chat-check">
          <CheckboxCompat v-model="channel.autoScroll" />
          <span>{{ labels.autoScroll || "鑷姩婊氬睆" }}</span>
        </label>
      </div>
    </div>

    <div class="grid gap-3 md:grid-cols-2">
      <div class="field-block">
        <div class="field-label">{{ labels.sendFormat }}</div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="format-switch format-switch-inline" role="group" :aria-label="labels.sendFormat">
            <button
              v-for="option in labels.commonFormatOptions"
              :key="option.value"
              type="button"
              :class="['format-option', channel.sendFormat === option.value ? 'active' : '']"
              @click="changeSendFormat(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <el-dropdown trigger="click" placement="bottom-end" :hide-on-click="false" popper-class="quick-menu-popper">
            <button class="quick-menu-button" type="button" :title="labels.moreFormats">
              <el-icon><MoreHorizontal /></el-icon>
            </button>
            <template #dropdown>
              <div class="quick-menu">
                <button
                  v-for="option in labels.moreFormatOptions"
                  :key="option.value"
                  class="quick-menu-item"
                  type="button"
                  @click="changeSendFormat(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <span v-if="channel.sendFormat === option.value" class="text-xs text-emerald-600">{{ labels.selected }}</span>
                </button>
              </div>
            </template>
          </el-dropdown>
        </div>
      </div>
      <div class="field-block">
        <div class="field-label">{{ labels.receiveFormat }}</div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="format-switch format-switch-inline" role="group" :aria-label="labels.receiveFormat">
            <button
              v-for="option in labels.commonFormatOptions"
              :key="option.value"
              type="button"
              :class="['format-option', channel.receiveFormat === option.value ? 'active' : '']"
              @click="changeReceiveFormat(option.value)"
            >
              {{ option.label }}
            </button>
          </div>
          <el-dropdown trigger="click" placement="bottom-end" :hide-on-click="false" popper-class="quick-menu-popper">
            <button class="quick-menu-button" type="button" :title="labels.moreFormats">
              <el-icon><MoreHorizontal /></el-icon>
            </button>
            <template #dropdown>
              <div class="quick-menu">
                <button
                  v-for="option in labels.moreFormatOptions"
                  :key="option.value"
                  class="quick-menu-item"
                  type="button"
                  @click="changeReceiveFormat(option.value)"
                >
                  <span>{{ option.label }}</span>
                  <span v-if="channel.receiveFormat === option.value" class="text-xs text-emerald-600">{{ labels.selected }}</span>
                </button>
              </div>
            </template>
          </el-dropdown>
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2">
      <Button :disabled="channel.connected" @click="$emit('connect')">
        {{ labels.connect }}
      </Button>
      <Button variant="outline" :disabled="!channel.connected" @click="$emit('close')">
        {{ labels.close }}
      </Button>
      <Button variant="outline" :disabled="!channel.messages.length && !channel.message" @click="$emit('clear')">
        {{ labels.clearContent || labels.clearFeedback || "Clear" }}
      </Button>
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
      <div v-else class="text-sm text-muted-foreground">{{ labels.waiting }}</div>
    </div>

    <div class="file-send-row">
      <input class="file-input flex-1" type="file" @change="onFileChange">
      <Button variant="outline" :disabled="!channel.connected || !channel.selectedFile" @click="$emit('file-send')">
        <el-icon><Upload /></el-icon>
        {{ labels.sendFile || "Send File" }}
      </Button>
      <span class="text-xs text-muted-foreground">{{ labels.fileSizeLimit || "Max 64KB" }}</span>
    </div>

    <div class="message-input-row">
      <Input
        v-model="channel.message"
        class="message-input"
        :placeholder="labels.message"
        @keydown.enter="$emit('send')"
      />
      <el-dropdown trigger="click" placement="top-end" :hide-on-click="false" popper-class="quick-menu-popper">
        <button class="quick-menu-button" type="button" :title="labels.quickInsert">
          <el-icon><MoreHorizontal /></el-icon>
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
              <el-icon class="quick-delete" @click.stop="removePhrase(phrase)"><Trash2 /></el-icon>
            </button>
            <div class="quick-add-row">
              <Input v-model="channel.newPhrase" class="quick-add-input" :placeholder="labels.quickInsert" @keydown.enter.stop="addPhrase" />
              <button class="quick-add-button" type="button" :title="labels.addPhrase || labels.quickInsert" @click="addPhrase">
                <el-icon><Plus /></el-icon>
              </button>
            </div>
          </div>
        </template>
      </el-dropdown>
      <Button :disabled="!channel.connected" @click="$emit('send')">
        {{ labels.send }}
      </Button>
    </div>

    <div class="send-options">
      <label class="chat-check">
        <CheckboxCompat v-model="channel.timedEnabled" @change="emitTimerChange" />
        <span>{{ labels.timedSend || "瀹氭椂鍙戦€?" }}</span>
      </label>
      <Input
        v-model.number="channel.timedValue"
        class="send-option-input"
        type="number"
        min="1"
        @input="emitTimerChange"
      />
      <select v-model="channel.timedUnit" class="send-option-select" @change="emitTimerChange">
          <SelectItem value="ms">{{ labels.milliseconds || "姣" }}</SelectItem>
          <SelectItem value="s">{{ labels.seconds || "绉?" }}</SelectItem>
      </select>
      <label class="chat-check">
        <CheckboxCompat v-model="channel.appendEnabled" />
        <span>{{ labels.appendSuffix || "鑷姩鍙戦€侀檮鍔犱綅" }}</span>
      </label>
      <Input
        v-model="channel.appendValue"
        class="send-option-input append-input"
        :placeholder="labels.appendValue || '闄勫姞浣?'"
      />
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, ref, watch } from "vue";
import { MoreHorizontal, Plus, Trash2, Upload } from "@lucide/vue";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import CheckboxCompat from "./shadcn-compat/ElCheckbox.vue";
import SelectItem from "./shadcn-compat/ElOption.vue";
import ElDropdown from "./shadcn-compat/ElDropdown.vue";
import ElIcon from "./shadcn-compat/ElIcon.vue";
import { normalizeMessageForFormat } from "../utils/messageFormat";

const props = defineProps({
  channel: { type: Object, required: true },
  labels: { type: Object, required: true }
});

const emit = defineEmits(["connect", "close", "send", "clear", "format-change", "timer-change", "file-send"]);
const chatViewRef = ref(null);

function onFileChange(event) {
  props.channel.selectedFile = event.target.files?.[0] || null;
}

function changeSendFormat(value) {
  if (props.channel.sendFormat === value) return;
  props.channel.sendFormat = value;
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
