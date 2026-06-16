<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(["update:modelValue", "change"]);

function toggle() {
  if (props.disabled) return;
  const next = !props.modelValue;
  emit("update:modelValue", next);
  emit("change", next);
}
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :disabled="disabled"
    :class="[
      'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input transition-colors focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
      modelValue ? 'bg-primary' : 'bg-muted'
    ]"
    @click="toggle"
  >
    <span
      :class="[
        'inline-block size-5 rounded-full bg-background shadow transition-transform',
        modelValue ? 'translate-x-5' : 'translate-x-0.5'
      ]"
    />
  </button>
</template>
