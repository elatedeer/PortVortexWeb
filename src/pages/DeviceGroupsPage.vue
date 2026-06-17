<script setup>
import { ref } from "vue";
import ElButton from "@/components/shadcn-compat/ElButton.vue";
import ElCard from "@/components/shadcn-compat/ElCard.vue";
import ElInput from "@/components/shadcn-compat/ElInput.vue";
import ElOption from "@/components/shadcn-compat/ElOption.vue";
import ElSelect from "@/components/shadcn-compat/ElSelect.vue";

defineProps({
  labels: { type: Object, required: true }
});

const deviceGroups = ref([
  { id: "default", name: "Default" }
]);
const selectedGroupId = ref("default");
const newGroupName = ref("");
const groupDevices = ref([
  { id: "dev-1", name: "Device A", type: "UART1", groupId: "default" },
  { id: "dev-2", name: "Device B", type: "RS485", groupId: "default" },
  { id: "dev-3", name: "Device C", type: "CAN", groupId: "default" }
]);

function devicesInGroup(groupId) {
  return groupDevices.value.filter((device) => device.groupId === groupId);
}

function createGroup() {
  const name = String(newGroupName.value || "").trim();
  if (!name) return;
  const id = `group-${Date.now()}`;
  deviceGroups.value.push({ id, name });
  selectedGroupId.value = id;
  newGroupName.value = "";
}
</script>

<template>
  <section class="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
    <el-card class="control-card" shadow="never">
      <template #header><span class="text-base font-semibold">{{ labels.deviceGroups }}</span></template>
      <div class="space-y-3">
        <button
          v-for="group in deviceGroups"
          :key="group.id"
          type="button"
          :class="['group-item', selectedGroupId === group.id ? 'active' : '']"
          @click="selectedGroupId = group.id"
        >
          <span class="font-medium">{{ group.name }}</span>
          <span class="text-xs text-muted-foreground">{{ devicesInGroup(group.id).length }} {{ labels.devices }}</span>
        </button>
        <div class="space-y-2 border-t border-border pt-3">
          <el-input v-model="newGroupName" :placeholder="labels.newGroupName" />
          <el-button type="primary" @click="createGroup">{{ labels.createGroup }}</el-button>
        </div>
      </div>
    </el-card>
    <el-card class="control-card" shadow="never">
      <template #header><span class="text-base font-semibold">{{ labels.groupDevices }}</span></template>
      <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <div v-for="device in devicesInGroup(selectedGroupId)" :key="device.id" class="device-card">
          <div class="font-medium">{{ device.name }}</div>
          <div class="mt-1 text-xs text-muted-foreground">{{ device.type }}</div>
          <el-select v-model="device.groupId" class="mt-3">
            <el-option v-for="group in deviceGroups" :key="group.id" :label="group.name" :value="group.id" />
          </el-select>
        </div>
        <div v-if="!devicesInGroup(selectedGroupId).length" class="text-sm text-muted-foreground">{{ labels.waiting }}</div>
      </div>
    </el-card>
  </section>
</template>
