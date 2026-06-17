<script setup>
import ElButton from "@/components/shadcn-compat/ElButton.vue";
import ElCard from "@/components/shadcn-compat/ElCard.vue";

const props = defineProps({
  history: { type: Array, default: () => [] },
  labels: { type: Object, required: true },
  lang: { type: String, default: "zh" }
});

const emit = defineEmits(["apply", "remove", "clear"]);

function formatTokenTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function tokenSourceLabel(source) {
  const value = String(source || "manual");
  const zh = props.lang === "zh";
  const labels = {
    manual: zh ? "手动输入" : "Manual",
    select: zh ? "下拉选择" : "Selection",
    history: zh ? "历史页" : "History",
    download: zh ? "下载" : "Download",
    chat: zh ? "实时通信" : "Live chat",
    can: "CAN",
    offline: zh ? "离线设置" : "Offline"
  };
  return labels[value] || value;
}
</script>

<template>
  <section class="space-y-5">
    <el-card class="control-card" shadow="never">
      <template #header>
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-base font-semibold">{{ labels.tokenHistory }}</div>
            <div class="text-xs text-slate-500">{{ labels.tokenHistoryHint }}</div>
          </div>
          <el-button :disabled="!history.length" @click="emit('clear')">{{ labels.clear }}</el-button>
        </div>
      </template>
      <div class="space-y-3">
        <div
          v-for="item in history"
          :key="item.token"
          class="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 md:flex-row md:items-center md:justify-between"
        >
          <div class="min-w-0">
            <div class="break-all font-mono text-sm font-semibold">{{ item.token }}</div>
            <div class="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>{{ labels.lastUsed }}: {{ formatTokenTime(item.lastUsedAt) }}</span>
              <span>{{ labels.usedCount }}: {{ item.count || 1 }}</span>
              <span>{{ labels.source }}: {{ tokenSourceLabel(item.source) }}</span>
            </div>
          </div>
          <div class="flex shrink-0 gap-2">
            <el-button @click="emit('apply', item.token)">{{ labels.useToken }}</el-button>
            <el-button @click="emit('remove', item.token)">{{ labels.delete }}</el-button>
          </div>
        </div>
        <div v-if="!history.length" class="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {{ labels.noTokenHistory }}
        </div>
      </div>
    </el-card>
  </section>
</template>
