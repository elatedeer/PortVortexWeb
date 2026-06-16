<script setup>
import { computed } from "vue";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(["update:modelValue", "change"]);
const checked = computed({
  get: () => props.modelValue,
  set: (next) => {
    emit("update:modelValue", next);
    emit("change", next);
  }
});
</script>

<template>
  <label class="inline-flex items-center gap-2 text-sm text-foreground">
    <input
      v-model="checked"
      type="checkbox"
      :disabled="disabled"
      class="size-4 rounded border border-input accent-primary shadow-sm focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50"
    >
    <span><slot /></span>
  </label>
</template>
