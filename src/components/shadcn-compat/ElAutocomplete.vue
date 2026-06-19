<script setup>
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { Input } from "@/components/ui/input";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  fetchSuggestions: { type: Function, default: null },
  clearable: { type: Boolean, default: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const emit = defineEmits(["update:modelValue", "select", "blur", "change", "action"]);
const rootRef = ref(null);
const open = ref(false);
const suggestions = ref([]);
const dropdownStyle = ref({});
const scrollTop = ref(0);
const VIRTUAL_ROW_HEIGHT = 32;
const VIRTUAL_VIEWPORT_HEIGHT = 224;
const VIRTUAL_OVERSCAN = 8;

const virtualStart = computed(() => Math.max(0, Math.floor(scrollTop.value / VIRTUAL_ROW_HEIGHT) - VIRTUAL_OVERSCAN));
const virtualEnd = computed(() => Math.min(
  suggestions.value.length,
  Math.ceil((scrollTop.value + VIRTUAL_VIEWPORT_HEIGHT) / VIRTUAL_ROW_HEIGHT) + VIRTUAL_OVERSCAN
));
const visibleSuggestions = computed(() => suggestions.value.slice(virtualStart.value, virtualEnd.value));
const virtualTotalHeight = computed(() => suggestions.value.length * VIRTUAL_ROW_HEIGHT);
const virtualOffset = computed(() => virtualStart.value * VIRTUAL_ROW_HEIGHT);

function updateDropdownPosition() {
  const root = rootRef.value;
  if (!root) return;
  const rect = root.getBoundingClientRect();
  dropdownStyle.value = {
    position: "fixed",
    left: `${rect.left}px`,
    top: `${rect.bottom + 4}px`,
    width: `${rect.width}px`
  };
}

function setOpen(next) {
  open.value = next;
  if (next) {
    nextTick(updateDropdownPosition);
    window.addEventListener("resize", updateDropdownPosition);
    window.addEventListener("scroll", updateDropdownPosition, true);
  } else {
    window.removeEventListener("resize", updateDropdownPosition);
    window.removeEventListener("scroll", updateDropdownPosition, true);
  }
}

function loadSuggestions(query = props.modelValue) {
  if (typeof props.fetchSuggestions !== "function") {
    suggestions.value = [];
    open.value = false;
    return;
  }
  props.fetchSuggestions(query, (items) => {
    suggestions.value = Array.isArray(items) ? items : [];
    scrollTop.value = 0;
    setOpen(suggestions.value.length > 0);
  });
}

function updateValue(next) {
  emit("update:modelValue", next);
  loadSuggestions(next);
}

function selectItem(item) {
  if (item?.action) {
    emit("action", item);
    nextTick(() => loadSuggestions(props.modelValue));
    return;
  }
  const next = String(item?.value || "");
  emit("update:modelValue", next);
  emit("select", { ...item, value: next });
  emit("change", next);
  setOpen(false);
}

function clearValue() {
  emit("update:modelValue", "");
  emit("change", "");
  suggestions.value = [];
  setOpen(false);
}

function onFocus() {
  loadSuggestions(props.modelValue);
}

function onBlur(event) {
  emit("blur", event);
  window.setTimeout(() => {
    setOpen(false);
  }, 180);
}

function onChange() {
  emit("change", props.modelValue);
}

function onDropdownScroll(event) {
  scrollTop.value = event.target?.scrollTop || 0;
}

onBeforeUnmount(() => {
  setOpen(false);
});
</script>

<template>
  <div ref="rootRef" class="relative w-full">
    <div class="flex w-full">
      <Input
        :model-value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :class="[props.class, $slots.append ? 'rounded-r-none' : '']"
        @update:model-value="updateValue"
        @focus="onFocus"
        @blur="onBlur"
        @change="onChange"
      />
      <div v-if="$slots.append" class="flex h-8 shrink-0 items-center rounded-r-lg border border-l-0 border-input bg-muted px-2">
        <slot name="append" />
      </div>
      <button
        v-if="clearable && modelValue"
        :class="['absolute top-1/2 -translate-y-1/2 text-xs text-muted-foreground', $slots.append ? 'right-10' : 'right-2']"
        type="button"
        @mousedown.prevent
        @click="clearValue"
      >
        x
      </button>
    </div>
    <Teleport to="body">
      <div
        v-if="open"
        class="z-[9999] overflow-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg"
        :style="dropdownStyle"
        style="max-height: 14rem;"
        @scroll="onDropdownScroll"
      >
        <div class="relative" :style="{ height: `${virtualTotalHeight}px` }">
          <div class="absolute left-0 right-0 top-0" :style="{ transform: `translateY(${virtualOffset}px)` }">
            <button
              v-for="item in visibleSuggestions"
              :key="`${item.value}-${item.label || ''}`"
              :class="item.header ? 'block h-8 w-full px-2 text-left text-[11px] font-semibold uppercase leading-8 tracking-normal text-muted-foreground' : item.action ? 'block h-8 w-full rounded-md px-2 text-left text-xs font-semibold leading-8 text-primary hover:bg-accent' : 'block h-8 w-full rounded-md px-2 text-left font-mono leading-8 hover:bg-accent'"
              type="button"
              :disabled="item.header"
              @mousedown.prevent
              @click="item.header ? null : selectItem(item)"
            >
              {{ item.label || item.value }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
