<script setup>
import { computed } from "vue";
import { Input } from "@/components/ui/input";

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  min: { type: Number, default: undefined },
  max: { type: Number, default: undefined },
  step: { type: Number, default: 1 },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const emit = defineEmits(["update:modelValue"]);
const value = computed({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", Number(next))
});
</script>

<template>
  <Input
    v-model="value"
    type="number"
    :min="min"
    :max="max"
    :step="step"
    :class="props.class"
  />
</template>
