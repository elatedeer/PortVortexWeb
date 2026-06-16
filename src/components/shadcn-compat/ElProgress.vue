<script setup>
import { Progress } from "@/components/ui/progress";

defineProps({
  percentage: { type: Number, default: 0 },
  strokeWidth: { type: Number, default: 8 },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});
</script>

<template>
  <div :class="['flex items-center gap-2', $props.class]">
    <Progress :model-value="percentage" :style="{ height: `${strokeWidth}px` }" class="flex-1" />
    <span class="w-10 text-right text-xs text-muted-foreground">{{ Math.round(percentage) }}%</span>
  </div>
</template>
