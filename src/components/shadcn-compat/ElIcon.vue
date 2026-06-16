<script setup>
defineProps({
  size: { type: [String, Number], default: "" },
  class: {
    type: [Boolean, null, String, Object, Array],
    required: false,
    skipCheck: true
  }
});
</script>

<template>
  <span
    :class="['inline-flex items-center justify-center align-middle [&>svg]:shrink-0', $props.class]"
    :style="size ? { fontSize: `${size}px`, width: `${size}px`, height: `${size}px` } : undefined"
  >
    <slot />
  </span>
</template>
