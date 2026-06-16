<script setup>
import { computed } from "vue";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const props = defineProps({
  modelValue: { type: [String, Number], default: "" },
  placeholder: { type: String, default: "" },
  disabled: { type: Boolean, default: false },
  type: { type: String, default: "text" },
  rows: { type: [String, Number], default: 3 },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const emit = defineEmits(["update:modelValue"]);
const value = computed({
  get: () => props.modelValue,
  set: (next) => emit("update:modelValue", next)
});
</script>

<template>
  <div v-if="$slots.append" class="flex w-full overflow-hidden rounded-lg border border-input bg-background focus-within:ring-3 focus-within:ring-ring/50">
    <Input
      v-model="value"
      :placeholder="placeholder"
      :disabled="disabled"
      :type="type"
      :class="['h-9 rounded-none border-0 focus-visible:ring-0', props.class]"
    />
    <div class="flex items-center border-l border-input bg-muted px-2">
      <slot name="append" />
    </div>
  </div>
  <Textarea
    v-else-if="type === 'textarea'"
    v-model="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :rows="Number(rows)"
    :class="props.class"
  />
  <Input
    v-else
    v-model="value"
    :placeholder="placeholder"
    :disabled="disabled"
    :type="type"
    :class="props.class"
  />
</template>
