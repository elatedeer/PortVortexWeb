<script setup>
import { computed } from "vue";
import { Button } from "@/components/ui/button";

defineOptions({ inheritAttrs: false });

const props = defineProps({
  type: { type: String, default: "" },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});

const variant = computed(() => (props.type === "primary" ? "default" : "outline"));
</script>

<template>
  <Button v-bind="$attrs" type="button" :variant="variant" :disabled="disabled || loading" :class="props.class">
    <span v-if="loading" class="mr-1.5 size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" />
    <slot />
  </Button>
</template>
