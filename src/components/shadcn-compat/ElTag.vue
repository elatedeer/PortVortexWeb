<script setup>
import { computed } from "vue";
import { Badge } from "@/components/ui/badge";

const props = defineProps({
  type: { type: String, default: "" },
  effect: { type: String, default: "" },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const variant = computed(() => (props.type === "warning" || props.type === "info" ? "outline" : "secondary"));
</script>

<template>
  <Badge :variant="variant" :class="props.class">
    <slot />
  </Badge>
</template>
