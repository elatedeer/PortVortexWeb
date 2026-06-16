<script setup>
import { inject, onMounted, watch } from "vue";
import { SelectItem } from "@/components/ui/select";

const props = defineProps({
  label: { type: String, default: "" },
  value: { type: [String, Number], required: true }
});

const labels = inject("elSelectLabels", null);

function syncLabel() {
  if (labels?.value) labels.value[props.value] = props.label || String(props.value);
}

onMounted(syncLabel);
watch(() => [props.label, props.value], syncLabel);
</script>

<template>
  <SelectItem :value="value">
    <slot>{{ label }}</slot>
  </SelectItem>
</template>
