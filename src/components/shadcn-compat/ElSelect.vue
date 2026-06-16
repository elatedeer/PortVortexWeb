<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const emit = defineEmits(["update:modelValue", "change"]);
const value = computed({
  get: () => props.modelValue,
  set: (next) => {
    emit("update:modelValue", next);
    emit("change", next);
  }
});
</script>

<template>
  <select
    v-model="value"
    data-slot="select-trigger"
    :disabled="disabled"
    :class="[
      'h-9 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground shadow-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
      props.class
    ]"
  >
    <option v-if="placeholder" disabled value="">{{ placeholder }}</option>
    <slot />
  </select>
</template>
