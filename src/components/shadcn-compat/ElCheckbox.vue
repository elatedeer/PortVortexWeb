<script setup>
import { Checkbox } from "@/components/ui/checkbox";

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false }
});

const emit = defineEmits(["update:modelValue", "change"]);

function update(value) {
  const checked = value === true;
  emit("update:modelValue", checked);
  emit("change", checked);
}
</script>

<template>
  <label class="inline-flex items-center gap-2 text-sm text-foreground">
    <Checkbox :model-value="modelValue" :disabled="disabled" @update:model-value="update" />
    <span><slot /></span>
  </label>
</template>
