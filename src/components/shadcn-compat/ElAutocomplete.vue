<script setup>
import { ref } from "vue";
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

const emit = defineEmits(["update:modelValue", "select", "blur", "change"]);
const open = ref(false);
const suggestions = ref([]);

function loadSuggestions(query = props.modelValue) {
  if (typeof props.fetchSuggestions !== "function") {
    suggestions.value = [];
    open.value = false;
    return;
  }
  props.fetchSuggestions(query, (items) => {
    suggestions.value = Array.isArray(items) ? items : [];
    open.value = suggestions.value.length > 0;
  });
}

function updateValue(next) {
  emit("update:modelValue", next);
  if (open.value || String(next || "")) loadSuggestions(next);
}

function selectItem(item) {
  const next = String(item?.value || "");
  emit("update:modelValue", next);
  emit("select", { ...item, value: next });
  emit("change", next);
  open.value = false;
}

function clearValue() {
  emit("update:modelValue", "");
  emit("change", "");
  suggestions.value = [];
  open.value = false;
}

function onFocus() {
  loadSuggestions(props.modelValue);
}

function onBlur(event) {
  emit("blur", event);
  window.setTimeout(() => {
    open.value = false;
  }, 120);
}

function onChange() {
  emit("change", props.modelValue);
}
</script>

<template>
  <div class="relative w-full">
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
    <div
      v-if="open"
      class="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-border bg-popover p-1 text-sm shadow-lg"
    >
      <button
        v-for="item in suggestions"
        :key="item.value"
        class="block w-full rounded-md px-2 py-1.5 text-left font-mono hover:bg-accent"
        type="button"
        @mousedown.prevent
        @click="selectItem(item)"
      >
        {{ item.value }}
      </button>
    </div>
  </div>
</template>
