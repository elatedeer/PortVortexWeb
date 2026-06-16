<script setup>
import { provide, ref } from "vue";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";

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
const labels = ref({});

provide("elSelectLabels", labels);

function update(value) {
  emit("update:modelValue", value);
  emit("change", value);
}
</script>

<template>
  <Select :model-value="modelValue" :disabled="disabled" @update:model-value="update">
    <SelectTrigger :class="['w-full', props.class]">
      <SelectValue :placeholder="placeholder || labels[modelValue] || modelValue" />
    </SelectTrigger>
    <SelectContent>
      <slot />
    </SelectContent>
  </Select>
</template>
