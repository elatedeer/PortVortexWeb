<script setup>
import { Switch } from "@/components/ui/switch";

defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(["update:modelValue", "change"]);

function update(value) {
  emit("update:modelValue", value);
  emit("change", value);
}
</script>

<template>
  <Switch :model-value="modelValue" :disabled="disabled" @update:model-value="update" />
</template>
