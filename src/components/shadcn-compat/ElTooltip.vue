<script setup>
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";

defineProps({
  content: { type: String, default: "" },
  placement: { type: String, default: "top" },
  effect: { type: String, default: "" }
});
</script>

<template>
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger as-child>
        <slot />
      </TooltipTrigger>
      <TooltipContent>
        {{ content }}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
