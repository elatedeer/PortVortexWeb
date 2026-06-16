<script setup>
defineProps({
  label: { type: String, default: "" },
  value: { type: [String, Number], required: true }
});
</script>

<template>
  <option :value="value">
    <slot>{{ label }}</slot>
  </option>
</template>
