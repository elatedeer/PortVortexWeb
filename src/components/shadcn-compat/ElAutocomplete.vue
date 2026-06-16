<script setup>
import { computed } from "vue";
import { Input } from "@/components/ui/input";

const props = defineProps({
  modelValue: { type: String, default: "" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const emit = defineEmits(["update:modelValue", "select"]);
const value = computed({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", next)
});
</script>

<template>
  <Input
    v-model="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :class="props.class"
    @change="emit('select', { value })"
  />
</template>
