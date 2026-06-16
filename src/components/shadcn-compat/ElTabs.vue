<script setup>
import { provide, ref } from "vue";

const current = ref("");
const panes = ref([]);

function setCurrent(value) {
  current.value = value;
}

provide("elTabsState", { current, panes, setCurrent });
</script>

<template>
  <div data-slot="tabs" class="w-full">
    <div data-slot="tabs-list" class="mb-4 inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1 text-muted-foreground">
      <button
        v-for="pane in panes"
        :key="pane.value"
        type="button"
        :class="[
          'h-8 rounded-md px-3 text-sm font-medium transition-colors',
          current === pane.value ? 'bg-background text-foreground shadow-sm' : 'hover:text-foreground'
        ]"
        @click="setCurrent(pane.value)"
      >
        {{ pane.label }}
      </button>
    </div>
    <slot />
  </div>
</template>
