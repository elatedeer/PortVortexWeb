<script setup>
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { provide } from "vue";

defineProps({
  trigger: { type: String, default: "click" },
  placement: { type: String, default: "" },
  hideOnClick: { type: Boolean, default: true },
  popperClass: { type: String, default: "" }
});

const emit = defineEmits(["command"]);
provide("elDropdownCommand", (command) => emit("command", command));
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <slot />
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-40">
      <slot name="dropdown" />
    </DropdownMenuContent>
  </DropdownMenu>
</template>
