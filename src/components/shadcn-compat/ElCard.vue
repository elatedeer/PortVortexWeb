<script setup>
import { Card, CardContent, CardHeader } from "@/components/ui/card";

defineProps({
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  },
  shadow: { type: String, default: "" }
});
</script>

<template>
  <Card :class="$props.class">
    <CardHeader v-if="$slots.header" class="border-b">
      <slot name="header" />
    </CardHeader>
    <CardContent>
      <slot />
    </CardContent>
  </Card>
</template>
