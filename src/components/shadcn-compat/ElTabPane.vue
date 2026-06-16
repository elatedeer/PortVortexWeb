<script setup>
import { computed, inject, onMounted } from "vue";

const props = defineProps({
  label: { type: String, required: true },
  name: { type: String, default: "" }
});

const state = inject("elTabsState");
const value = computed(() => props.name || props.label);

onMounted(() => {
  if (!state) return;
  if (!state.panes.value.some((pane) => pane.value === value.value)) {
    state.panes.value.push({ label: props.label, value: value.value });
  }
  if (!state.current.value) state.current.value = value.value;
});
</script>

<template>
  <div v-show="!state || state.current.value === value" class="outline-none">
    <slot />
  </div>
</template>
