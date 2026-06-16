<script setup>
const props = defineProps({
  modelValue: { type: [String, Number, Boolean], default: "" },
  options: { type: Array, default: () => [] },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const emit = defineEmits(["update:modelValue"]);
</script>

<template>
  <div :class="['inline-flex h-9 items-center rounded-lg bg-muted p-1 text-muted-foreground', props.class]">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :class="[
        'inline-flex h-7 min-w-10 items-center justify-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors',
        modelValue === option.value ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
      ]"
      @click="emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>
