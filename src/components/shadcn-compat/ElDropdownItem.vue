<script setup>
import { inject } from "vue";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

defineProps({
  command: { type: String, default: "" },
  divided: { type: Boolean, default: false }
});

const emit = defineEmits(["click"]);
const commandHandler = inject("elDropdownCommand", null);

function select() {
  emit("click", command);
  if (commandHandler) commandHandler(command);
}
</script>

<template>
  <DropdownMenuSeparator v-if="divided" />
  <DropdownMenuItem @select="select">
    <slot />
  </DropdownMenuItem>
</template>
