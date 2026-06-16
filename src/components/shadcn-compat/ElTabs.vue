<script setup>
import { provide, ref } from "vue";
import { Tabs, TabsList } from "@/components/ui/tabs";

const current = ref("");
const panes = ref([]);

provide("elTabsState", { current, panes });
</script>

<template>
  <Tabs v-model="current" :default-value="panes[0]?.value" class="w-full">
    <TabsList class="mb-4 flex h-auto flex-wrap">
      <button
        v-for="pane in panes"
        :key="pane.value"
        type="button"
        :class="[
          'h-8 rounded-md px-3 text-sm font-medium transition-colors',
          current === pane.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
        ]"
        @click="current = pane.value"
      >
        {{ pane.label }}
      </button>
    </TabsList>
    <slot />
  </Tabs>
</template>
