<template>
  <div :class="['theme min-h-screen bg-background text-foreground transition-colors', darkMode ? 'dark' : '']">
    <aside
      :class="[
        'fixed inset-y-0 left-0 z-30 hidden border-r transition-all duration-300 lg:flex lg:flex-col',
        'border-border bg-sidebar text-sidebar-foreground',
        collapsed ? 'w-20' : 'w-64'
      ]"
    >
      <div class="flex h-16 items-center gap-3 px-4">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">PV</div>
        <div v-if="!collapsed" class="min-w-0">
          <div class="truncate text-sm font-semibold">PortVortex</div>
          <div class="truncate text-xs text-muted-foreground">{{ t.subtitle }}</div>
        </div>
      </div>

      <nav class="flex-1 space-y-1 px-3 py-3">
        <button
          v-for="item in sideNav"
          :key="item.key"
          :title="collapsed ? item.label : undefined"
          :aria-label="item.label"
          class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition"
          :class="[
            currentPage === item.key
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            collapsed ? 'justify-center' : 'justify-start'
          ]"
          @click="currentPage = item.key"
        >
          <el-icon><component :is="item.icon" /></el-icon>
          <span v-if="!collapsed">{{ item.label }}</span>
        </button>
      </nav>

      <div class="space-y-2 px-3 pb-4">
        <button
          :title="collapsed ? t.helpDocs : undefined"
          :aria-label="t.helpDocs"
          class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          @click="openHelp"
        >
          <el-icon><QuestionFilled /></el-icon>
          <span v-if="!collapsed">{{ t.helpDocs }}</span>
        </button>
        <button
          :title="collapsed ? t.darkMode : undefined"
          :aria-label="t.darkMode"
          class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          @click="darkMode = !darkMode"
        >
          <el-icon><Moon /></el-icon>
          <span v-if="!collapsed">{{ t.darkMode }}</span>
        </button>
        <button
          :title="collapsed ? t.collapse : undefined"
          :aria-label="t.collapse"
          class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          @click="collapsed = !collapsed"
        >
          <el-icon><component :is="collapsed ? Expand : Fold" /></el-icon>
          <span v-if="!collapsed">{{ t.collapse }}</span>
        </button>
      </div>
    </aside>

    <main :class="['transition-all duration-300', collapsed ? 'lg:pl-20' : 'lg:pl-64']">
      <header class="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur-xl">
        <div class="flex min-h-16 items-center justify-between gap-4 px-4 md:px-8">
          <div>
            <h1 class="text-xl font-semibold tracking-tight">{{ pageTitle }}</h1>
            <p class="mt-0.5 text-xs text-muted-foreground">{{ t.headerHint }}</p>
          </div>
          <div class="flex items-center gap-3">
            <el-segmented v-model="lang" :options="languageOptions" />
            <button
              :class="['flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm shadow-sm transition hover:-translate-y-0.5', darkMode ? 'border-slate-800 bg-slate-900 text-slate-100' : 'border-slate-200 bg-white text-slate-700']"
              @click="toggleTheme"
            >
              <el-icon>
                <component :is="darkMode ? Sunny : Moon" />
              </el-icon>
              <span class="hidden sm:block">{{ darkMode ? t.lightMode : t.darkMode }}</span>
            </button>
            <el-dropdown trigger="click" @command="onUserCommand">
              <button :class="['flex items-center gap-3 rounded-2xl border px-3 py-2 shadow-sm transition hover:-translate-y-0.5', darkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white']">
                <span class="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white">PV</span>
                <span class="hidden text-left sm:block">
                  <span class="block text-sm font-medium">{{ user.name }}</span>
                  <span class="block text-xs text-slate-500">{{ user.role }}</span>
                </span>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">{{ t.profile }}</el-dropdown-item>
                  <el-dropdown-item command="help">{{ t.helpDocs }}</el-dropdown-item>
                  <el-dropdown-item divided command="logout">{{ t.logout }}</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </div>
      </header>

      <div class="space-y-5 p-4 md:p-8">
        <template v-if="currentPage === 'download'">
          <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <article v-for="card in infoCards" :key="card.label" class="float-card">
              <div class="absolute inset-x-0 top-0 h-1.5" :class="card.bar"></div>
              <div class="flex items-start justify-between gap-4">
                <div>
                  <div class="text-xs text-slate-500">{{ card.label }}</div>
                  <div class="mt-2 text-2xl font-semibold tracking-tight">{{ card.value }}</div>
                  <div class="mt-1 text-xs text-slate-400">{{ card.hint }}</div>
                </div>
                <div class="rounded-2xl bg-slate-50 p-3 text-slate-500">
                  <el-icon size="22"><component :is="card.icon" /></el-icon>
                </div>
              </div>
              <div v-if="card.badge" class="mt-4 inline-flex rounded-full px-3 py-1 text-xs font-medium" :class="card.badgeClass">
                {{ card.badge }}
              </div>
            </article>
          </section>

          <section class="space-y-5">
            <div class="space-y-5">
              <el-card class="control-card" shadow="never">
                <template #header>
                  <div class="flex items-center justify-between gap-4">
                    <div>
                      <div class="text-base font-semibold">{{ t.downloadSetup }}</div>
                      <div class="text-xs text-slate-500">{{ t.downloadSetupHint }}</div>
                    </div>
                    <div class="flex items-center gap-3">
                      <el-tag type="info" effect="light">{{ t.formatAuto }}</el-tag>
                      <el-button type="primary" :loading="flashing" @click="submitFlash">
                        {{ t.start }}
                      </el-button>
                    </div>
                  </div>
                </template>
                <div class="grid gap-4 lg:grid-cols-2">
                  <div class="field-block lg:col-span-2">
                    <div class="field-label">{{ t.downloadMode }}</div>
                    <el-segmented v-model="flash.flashMode" :options="downloadModes" />
                  </div>
                  <div class="field-block">
                    <div class="field-label">{{ t.deviceToken }}</div>
                    <el-input v-model="flash.deviceToken" placeholder="6bf3418a09725d07">
                      <template #append>
                        <el-tooltip :content="t.deviceTokenHelp" placement="top" effect="light">
                          <button class="token-help-button" type="button" aria-label="Device token help">?</button>
                        </el-tooltip>
                      </template>
                    </el-input>
                  </div>
                  <div class="field-block lg:col-span-2">
                    <div class="field-label">{{ t.firmware }}</div>
                    <input class="file-input" type="file" accept=".bin,.hex,application/octet-stream,text/plain" @change="onFirmwareChange">
                  </div>
                </div>
              </el-card>
              <div class="grid gap-5 lg:grid-cols-2">
                <el-card class="control-card" shadow="never">
                  <template #header><span class="text-base font-semibold">{{ t.target }}</span></template>
                  <div class="grid gap-3">
                    <div class="field-block">
                      <div class="field-label">{{ t.targetModel }}</div>
                      <el-autocomplete
                        v-model="flash.target"
                        :fetch-suggestions="queryTargets"
                        clearable
                        placeholder="stm32f4"
                        @select="applyTargetConfig($event.value)"
                      />
                    </div>
                    <div class="field-block">
                      <div class="field-label">{{ t.baseAddr }}</div>
                      <el-input v-model="flash.baseAddr" />
                    </div>
                    <div class="field-block">
                      <div class="field-label">{{ t.swdErase }}</div>
                      <el-select v-model="flash.erase">
                        <el-option label="sector" value="sector" />
                        <el-option label="full" value="full" />
                      </el-select>
                    </div>
                    <div class="field-block">
                      <div class="field-label">{{ t.attach }}</div>
                      <el-select v-model="flash.attach" clearable :placeholder="t.default">
                        <el-option label="normal" value="normal" />
                        <el-option label="under_reset" value="under_reset" />
                        <el-option label="normal_then_under_reset" value="normal_then_under_reset" />
                        <el-option label="auto" value="auto" />
                      </el-select>
                    </div>
                  </div>
                </el-card>

                <el-card class="control-card" shadow="never">
                  <template #header><span class="text-base font-semibold">{{ t.runtime }}</span></template>
                  <div class="space-y-4">
                    <el-checkbox v-model="flash.noResetAfterProgram">{{ t.noReset }}</el-checkbox>
                    <el-checkbox v-model="flash.singlePacket" :disabled="flash.storeOnly">{{ t.singlePacket }}</el-checkbox>
                    <el-checkbox v-model="flash.storeOnly">{{ t.storeOnly }}</el-checkbox>
                    <el-checkbox v-model="flash.offlineAutoDownload">{{ t.offlineAutoDownload }}</el-checkbox>
                    <el-checkbox v-model="flash.offlineVersionCheck">{{ t.offlineVersionCheck }}</el-checkbox>
                    <div v-if="flash.storeOnly" class="grid gap-3 md:grid-cols-2">
                      <div class="field-block">
                        <div class="field-label">{{ t.offlineVersion }}</div>
                        <el-input v-model="flash.version" :placeholder="t.offlineVersionPlaceholder" />
                      </div>
                      <div class="field-block">
                        <div class="field-label">{{ t.offlineVersionAddr }}</div>
                        <el-input v-model="flash.versionAddr" />
                      </div>
                    </div>
                    <div class="text-xs text-slate-500">{{ flash.storeOnly ? t.storeOnlyHint : t.runtimeHint }}</div>
                    <el-button :loading="offlineSettingsSaving" @click="applyOfflineSettings">
                      {{ t.applyOfflineSettings }}
                    </el-button>
                    <div class="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div>
                        <div class="text-sm font-medium">{{ t.expertMode }}</div>
                        <div class="text-xs text-slate-500">{{ t.expertHint }}</div>
                      </div>
                      <el-switch v-model="expert" />
                    </div>
                  </div>
                </el-card>
              </div>

              <transition name="fade-up">
                <el-card v-if="expert" class="control-card" shadow="never">
                  <template #header>
                    <div class="flex items-center justify-between">
                      <span class="text-base font-semibold">{{ t.expertMode }}</span>
                      <el-tag type="warning" effect="light">{{ t.forAdvanced }}</el-tag>
                    </div>
                  </template>
                  <el-tabs>
                    <el-tab-pane :label="t.transfer">
                      <div class="grid gap-4 md:grid-cols-2">
                        <div class="field-block"><div class="field-label">{{ t.chunkSize }}</div><el-input-number v-model="flash.chunkSize" :min="1" :max="2048" class="w-full" /></div>
                        <div class="field-block"><div class="field-label">{{ t.chunkDelay }}</div><el-input-number v-model="flash.chunkDelay" :min="0" :step="0.01" class="w-full" /></div>
                        <div class="field-block"><div class="field-label">{{ t.ackTimeout }}</div><el-input-number v-model="flash.ackTimeout" :min="0.1" :step="0.1" class="w-full" /></div>
                        <div class="field-block"><div class="field-label">{{ t.window }}</div><el-input-number v-model="flash.window" :min="1" :max="6" class="w-full" /></div>
                      </div>
                    </el-tab-pane>
                    <el-tab-pane :label="t.uartBootloader">
                      <div class="grid gap-4 md:grid-cols-3">
                        <div v-for="field in uartFields" :key="field.key" class="field-block">
                          <div class="field-label">{{ field.label }}</div>
                          <el-input v-model="flash[field.key]" />
                        </div>
                      </div>
                    </el-tab-pane>
                    <el-tab-pane :label="t.customAlgo">
                      <p class="mb-4 text-sm text-slate-600">{{ t.algoBlobHelp }}</p>
                      <div class="grid gap-4 md:grid-cols-3">
                        <div class="field-block">
                          <div class="field-label">{{ t.algoBlob }}</div>
                          <input class="file-input" type="file" @change="onAlgoBlobChange">
                        </div>
                        <div class="field-block md:col-span-2">
                          <div class="field-label">{{ t.flmFile }}</div>
                          <div class="flex flex-col gap-2 sm:flex-row">
                            <input class="file-input flex-1" type="file" accept=".flm,.FLM,.pack,.PACK,application/octet-stream,application/zip" @change="onFlmFileChange">
                            <el-button :loading="parsingFlm" :disabled="!flmFile" @click="parseFlmFile">
                              {{ t.parseFlm }}
                            </el-button>
                          </div>
                        </div>
                        <div v-if="packDevices.length" class="field-block md:col-span-3">
                          <div class="field-label">PACK Device</div>
                          <el-select v-model="selectedPackDevice" filterable clearable placeholder="Select supported chip" class="w-full" @change="parseFlmFile">
                            <el-option
                              v-for="device in packDevices"
                              :key="device.name"
                              :label="`${device.name} | ${device.algorithm} | ${device.start}`"
                              :value="device.name"
                            />
                          </el-select>
                        </div>
                        <div class="field-block"><div class="field-label">Algo</div><el-input v-model="flash.algo" placeholder="cmsis_flm or custom_sram_algo" /></div>
                        <div class="field-block"><div class="field-label">Flash Base</div><el-input v-model="flash.flashBase" /></div>
                        <div class="field-block"><div class="field-label">Erase Size</div><el-input v-model="flash.eraseSize" /></div>
                        <div v-for="field in customFields" :key="field.key" class="field-block">
                          <div class="field-label">{{ field.label }}</div>
                          <el-input v-model="flash[field.key]" />
                        </div>
                      </div>
                    </el-tab-pane>
                    <el-tab-pane :label="t.chipConfigImport">
                      <div class="space-y-4">
                        <div class="flex items-center justify-between gap-4">
                          <div>
                            <div class="text-base font-semibold">{{ t.chipConfigImport }}</div>
                            <div class="text-xs text-slate-500">{{ t.chipConfigImportHint }}</div>
                          </div>
                          <el-button :loading="importingChipConfig" type="primary" @click="importChipConfig">
                            {{ t.import }}
                          </el-button>
                        </div>
                        <el-input
                          v-model="chipConfigInput"
                          type="textarea"
                          :rows="7"
                          placeholder='{"id":"stm32g0","defaults":{"baseAddr":"0x08000000"},"swd":{"profile":"model=stm32g0;flash_base=0x08000000;erase=sector"}}'
                        />
                      </div>
                    </el-tab-pane>
                  </el-tabs>
                </el-card>
              </transition>

              <el-card class="control-card" shadow="never">
                <template #header>
                  <div class="flex items-center justify-between gap-4">
                    <span class="text-base font-semibold">{{ t.downloadLog }}</span>
                    <el-progress class="w-56" :percentage="progress" :stroke-width="8" />
                  </div>
                </template>
                <pre class="log-view">{{ logText }}</pre>
              </el-card>
            </div>
          </section>
        </template>

        <template v-else-if="currentPage === 'chat'">
          <section class="space-y-5">
            <el-card class="control-card" shadow="never">
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-base font-semibold">{{ t.liveChat }}</div>
                    <div class="text-xs text-slate-500">{{ t.chatHint }}</div>
                  </div>
                  <el-tag :type="deviceOnline ? 'success' : 'info'" effect="light">{{ onlineBadgeText }}</el-tag>
                </div>
              </template>
              <div class="field-block mb-4">
                <div class="field-label">{{ t.deviceToken }}</div>
                <el-input v-model="chatDeviceToken" :disabled="channels.general.connected || channels.rs485.connected" placeholder="6bf3418a09725d07">
                  <template #append>
                    <el-tooltip :content="t.deviceTokenHelp" placement="top" effect="light">
                      <button class="token-help-button" type="button" aria-label="Device token help">?</button>
                    </el-tooltip>
                  </template>
                </el-input>
              </div>
            </el-card>
            <section class="grid gap-5 xl:grid-cols-2">
              <el-card class="control-card" shadow="never">
                <template #header><span class="text-base font-semibold">{{ t.generalChat }}</span></template>
                <chat-channel :channel="channels.general" :labels="t" @connect="connectChannel('general')" @close="closeChannel('general')" @send="sendChannel('general')" @clear="clearChannel('general')" @format-change="persistChatFormat('general')" @timer-change="syncTimedSend('general')" />
              </el-card>
              <el-card class="control-card" shadow="never">
                <template #header><span class="text-base font-semibold">{{ t.rs485Chat }}</span></template>
                <chat-channel :channel="channels.rs485" :labels="t" @connect="connectChannel('rs485')" @close="closeChannel('rs485')" @send="sendChannel('rs485')" @clear="clearChannel('rs485')" @format-change="persistChatFormat('rs485')" @timer-change="syncTimedSend('rs485')" />
              </el-card>
            </section>
          </section>
        </template>

        <template v-else-if="currentPage === 'feedback'">
          <section class="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <el-card class="control-card" shadow="never">
              <template #header>
                <span class="text-base font-semibold">{{ t.feedback }}</span>
              </template>
              <div class="grid gap-4 md:grid-cols-2">
                <div class="field-block md:col-span-2">
                  <div class="field-label">{{ t.feedbackTitle }}</div>
                  <el-input v-model="feedbackForm.title" />
                </div>
                <div class="field-block">
                  <div class="field-label">{{ t.feedbackType }}</div>
                  <el-select v-model="feedbackForm.type">
                    <el-option :label="t.feedbackBug" value="bug" />
                    <el-option :label="t.feedbackImprove" value="improve" />
                    <el-option :label="t.feedbackOther" value="other" />
                  </el-select>
                </div>
                <div class="field-block">
                  <div class="field-label">{{ t.contactWay }}</div>
                  <el-input v-model="feedbackForm.contact" />
                </div>
                <div class="field-block md:col-span-2">
                  <div class="field-label">{{ t.feedbackContent }}</div>
                  <el-input v-model="feedbackForm.content" type="textarea" :rows="7" />
                </div>
              </div>
              <div class="mt-5 flex gap-3">
                <el-button type="primary" @click="submitFeedback">{{ t.submitFeedback }}</el-button>
                <el-button @click="resetFeedback">{{ t.clearFeedback }}</el-button>
              </div>
            </el-card>
            <el-card class="control-card" shadow="never">
              <template #header><span class="text-base font-semibold">{{ t.authorContact }}</span></template>
              <div class="space-y-3 text-sm">
                <div><span class="text-slate-500">author:</span> elated_deer</div>
                <div><span class="text-slate-500">email:</span> 1791286695@qq.com</div>
                <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-600">{{ t.feedbackHint }}</div>
              </div>
            </el-card>
          </section>
        </template>

        <template v-else-if="currentPage === 'logs'">
          <section class="grid gap-5 xl:grid-cols-2">
            <el-card class="control-card" shadow="never">
              <template #header>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-base font-semibold">{{ t.downloadLog }}</span>
                  <el-progress class="w-56" :percentage="progress" :stroke-width="8" />
                </div>
              </template>
              <pre class="log-view">{{ logText }}</pre>
            </el-card>
            <el-card class="control-card" shadow="never">
              <template #header><span class="text-base font-semibold">{{ t.liveChat }}</span></template>
              <div class="space-y-4">
                <div v-for="item in chatLogItems" :key="item.id" class="text-sm text-slate-700">
                  <span class="text-slate-500">{{ item.at }}</span>
                  <span class="mx-2 text-slate-400">|</span>
                  <span class="font-medium">{{ item.channel }}</span>
                  <span class="mx-2 text-slate-400">|</span>
                  <span>{{ item.text }}</span>
                </div>
                <div v-if="!chatLogItems.length" class="text-sm text-slate-500">{{ t.waiting }}</div>
              </div>
            </el-card>
          </section>
        </template>

        <template v-else-if="currentPage === 'profile'">
          <section class="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
            <el-card class="profile-card" shadow="never">
              <div class="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-cyan-950 p-6 text-white">
                <div class="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl"></div>
                <div class="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10 text-2xl font-semibold">PV</div>
                <div class="mt-5 text-2xl font-semibold">{{ user.name }}</div>
                <div class="mt-1 text-sm text-slate-300">{{ user.role }}</div>
                <div class="mt-5 rounded-2xl bg-white/10 p-4 text-sm">
                  <div>{{ user.team }}</div>
                  <div class="mt-1 text-slate-300">{{ user.email }}</div>
                </div>
              </div>
            </el-card>

            <div class="space-y-5">
              <el-card class="control-card" shadow="never">
                <template #header><span class="text-base font-semibold">{{ t.profile }}</span></template>
                <div class="grid gap-4 md:grid-cols-2">
                  <div class="field-block"><div class="field-label">{{ t.name }}</div><el-input v-model="user.name" /></div>
                  <div class="field-block"><div class="field-label">{{ t.role }}</div><el-input v-model="user.role" /></div>
                  <div class="field-block"><div class="field-label">{{ t.team }}</div><el-input v-model="user.team" /></div>
                  <div class="field-block"><div class="field-label">Email</div><el-input v-model="user.email" /></div>
                </div>
              </el-card>

              <el-card class="control-card" shadow="never">
                <template #header><span class="text-base font-semibold">{{ t.accountSecurity }}</span></template>
                <div class="grid gap-4 md:grid-cols-3">
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div class="text-xs text-slate-500">{{ t.loginStatus }}</div>
                    <div class="mt-2 font-semibold text-emerald-600">{{ user.status }}</div>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div class="text-xs text-slate-500">{{ t.language }}</div>
                    <div class="mt-2 font-semibold">{{ lang === 'zh' ? '中文' : 'English' }}</div>
                  </div>
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div class="text-xs text-slate-500">{{ t.darkMode }}</div>
                    <div class="mt-2 font-semibold">{{ darkMode ? 'On' : 'Off' }}</div>
                  </div>
                </div>
              </el-card>
            </div>
          </section>
        </template>

        <template v-else-if="currentPage === 'logs'">
          <section class="grid gap-5 xl:grid-cols-2">
            <el-card class="control-card" shadow="never">
              <template #header>
                <div class="flex items-center justify-between gap-4">
                  <span class="text-base font-semibold">{{ t.downloadLog }}</span>
                  <el-progress class="w-56" :percentage="progress" :stroke-width="8" />
                </div>
              </template>
              <pre class="log-view">{{ logText }}</pre>
            </el-card>
            <el-card class="control-card" shadow="never">
              <template #header><span class="text-base font-semibold">{{ t.liveChat }}</span></template>
              <div class="space-y-4">
                <div v-for="item in chatLogItems" :key="item.id" class="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div class="flex items-center justify-between gap-3">
                    <span class="font-medium">{{ item.channel }}</span>
                    <span class="text-xs text-slate-500">{{ item.at }}</span>
                  </div>
                  <div class="mt-1 text-slate-600">{{ item.text }}</div>
                </div>
                <div v-if="!chatLogItems.length" class="text-sm text-slate-500">{{ t.waiting }}</div>
              </div>
            </el-card>
          </section>
        </template>
      </div>
    </main>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { ElMessage } from "element-plus";
import ChatChannel from "./components/ChatChannel.vue";
import ElAutocomplete from "./components/shadcn-compat/ElAutocomplete.vue";
import ElButton from "./components/shadcn-compat/ElButton.vue";
import ElCard from "./components/shadcn-compat/ElCard.vue";
import ElCheckbox from "./components/shadcn-compat/ElCheckbox.vue";
import ElDropdown from "./components/shadcn-compat/ElDropdown.vue";
import ElDropdownItem from "./components/shadcn-compat/ElDropdownItem.vue";
import ElDropdownMenu from "./components/shadcn-compat/ElDropdownMenu.vue";
import ElIcon from "./components/shadcn-compat/ElIcon.vue";
import ElInput from "./components/shadcn-compat/ElInput.vue";
import ElInputNumber from "./components/shadcn-compat/ElInputNumber.vue";
import ElOption from "./components/shadcn-compat/ElOption.vue";
import ElProgress from "./components/shadcn-compat/ElProgress.vue";
import ElSegmented from "./components/shadcn-compat/ElSegmented.vue";
import ElSelect from "./components/shadcn-compat/ElSelect.vue";
import ElSwitch from "./components/shadcn-compat/ElSwitch.vue";
import ElTabPane from "./components/shadcn-compat/ElTabPane.vue";
import ElTabs from "./components/shadcn-compat/ElTabs.vue";
import ElTag from "./components/shadcn-compat/ElTag.vue";
import ElTooltip from "./components/shadcn-compat/ElTooltip.vue";
import { DEFAULT_DEVICE_TOKEN, FORMAT_OPTIONS, QUICK_PHRASES } from "./constants";
import { normalizeHexMessage } from "./utils/messageFormat";
import { formatChatTime } from "./utils/time";
import {
  ChatDotRound,
  Connection,
  Document,
  Download,
  Expand,
  Fold,
  Moon,
  Monitor,
  Promotion,
  QuestionFilled,
  Sunny,
  SwitchButton,
  UserFilled
} from "@element-plus/icons-vue";

const lang = ref("zh");
const darkMode = ref(false);
const collapsed = ref(false);
const currentPage = ref("download");
const expert = ref(false);
const flashing = ref(false);
const progress = ref(0);
const logs = ref([]);
const firmwareFile = ref(null);
const algoBlobFile = ref(null);
const flmFile = ref(null);
const packDevices = ref([]);
const selectedPackDevice = ref("");
const targetOptions = ref(["stm32f1", "stm32f4", "gd32f1", "ch32f2"]);
const chipConfigs = ref([]);
const chipConfigInput = ref("");
const importingChipConfig = ref(false);
const parsingFlm = ref(false);
const offlineSettingsSaving = ref(false);
const meta = reactive({ firmwareVersion: "v1.0.0", onlineEngineerCount: 1, deviceOnline: false });
let chatMessageSeq = 0;
const CHAT_QUICK_PHRASES_STORAGE_PREFIX = "portvortex.chat.quickPhrases.";
const feedbackForm = reactive({ title: "", type: "bug", contact: "", content: "" });

const user = reactive({
  name: "陈工",
  role: "Senior Engineer",
  team: "PortVortex Lab",
  email: "engineer@portvortex.local",
  status: "Online"
});

const languageOptions = [
  { label: "中文", value: "zh" },
  { label: "EN", value: "en" }
];

const copy = {
  zh: {
    subtitle: "固件下载与实时对话",
    title: "设备控制台",
    headerHint: "输入设备 Token 后，系统自动补全 MQTT 连接与主题。",
    profile: "个人资料",
    helpDocs: "帮助文档",
    darkMode: "深色模式",
    lightMode: "浅色模式",
    collapse: "收起",
    logout: "退出",
    start: "开始下载",
    downloadSetup: "下载设置",
    downloadSetupHint: "选择下载方式并上传 BIN 或 HEX 文件。",
    formatAuto: "格式：自动",
    downloadMode: "下载方式",
    deviceToken: "设备 Token",
    deviceTokenHelp: "设备 Token 可从设备标签、设备出厂信息或设备管理后台中获取；通常是 productid 后面的那段字符。",
    firmware: "固件文件",
    target: "目标配置",
    targetModel: "目标型号",
    baseAddr: "起始地址",
    swdErase: "SWD 擦除",
    attach: "连接方式",
    default: "默认",
    runtime: "运行选项",
    noReset: "烧录后不复位",
    singlePacket: "SWD BIN/HEX 单包发送",
    mqttHidden: "MQTT broker、账号、密码、QoS 和主题前缀均由设备 Token 自动生成。",
    expertMode: "专家模式",
    expertHint: "传输、串口协议模板和自定义算法参数。",
    forAdvanced: "Advanced",
    chipConfigImport: "芯片配置导入",
    chipConfigImportHint: "粘贴 LLM 输出的 JSON，用于新增目标型号并自动填充下载参数。",
    import: "导入",
    transfer: "传输",
    chunkSize: "分块大小",
    chunkDelay: "分块延迟",
    ackTimeout: "ACK 超时",
    window: "窗口",
    uartBootloader: "UART Bootloader",
    customAlgo: "Custom SRAM Algo",
    algoBlob: "Algo blob",
    algoBlobHelp: "Algo blob 是 custom_sram_algo 使用的目标 SRAM 烧录算法二进制；也可以选择 CMSIS FLM 或 PACK 文件自动解析 cmsis_flm 参数。",
    flmFile: "FLM/PACK 文件",
    parseFlm: "解析算法",
    flmParsed: "算法已解析",
    downloadLog: "下载日志",
    liveChat: "实时对话",
    chatHint: "普通主题与 RS485 主题分开连接。",
    generalChat: "串口1",
    rs485Chat: "RS485",
    logs: "日志",
    chat: "实时对话",
    feedback: "问题反馈",
    clientId: "MQTT ClientID",
    clientIdAuto: "留空自动随机生成",
    showTimestamp: "显示时间戳",
    sendFormat: "发送格式",
    receiveFormat: "接收格式",
    autoScroll: "自动滚屏",
    timedSend: "定时发送",
    milliseconds: "毫秒",
    seconds: "秒",
    appendSuffix: "自动发送附加位",
    appendValue: "附加位",
    quickInsert: "快捷词条",
    quickPhrases: QUICK_PHRASES,
    formatOptions: FORMAT_OPTIONS,
    toolVersion: "V1.0",
    toolVersionCard: "在线工具版本",
    chatBridgeHint: "可在此通过虚拟串口或转发桥接与服务器通信。",
    bridgeStatus: "桥接模式",
    bridgeHint: "下载软件可连接到本机转发服务，再将串口数据转给服务器。",
    feedbackTitle: "标题",
    feedbackType: "类型",
    feedbackContent: "问题描述",
    contactWay: "联系方式",
    feedbackBug: "问题",
    feedbackImprove: "建议",
    feedbackOther: "其他",
    submitFeedback: "提交反馈",
    clearFeedback: "清空",
    clearContent: "清空内容",
    authorContact: "作者联系方式",
    feedbackHint: "留下联系方式，便于后续定位和回复。",
    connect: "连接",
    close: "关闭",
    send: "发送",
    connected: "已连接",
    connectedSuccess: "连接成功",
    topicManaged: "主题由系统自动管理",
    message: "消息",
    waiting: "等待中...",
    disconnected: "未连接。",
    selectFirmware: "请选择固件文件。",
    online: "在线",
    offline: "离线",
    modelCard: "型号",
    versionCard: "固件版本",
    engineerCard: "在线工程师",
    statusCard: "设备在线状态",
    deviceOnline: "设备在线",
    deviceOffline: "设备离线",
    name: "姓名",
    role: "角色",
    team: "团队",
    accountSecurity: "账户与安全",
    loginStatus: "登录状态",
    language: "语言"
  },
  en: {
    subtitle: "Firmware download and live chat",
    title: "Device Console",
    headerHint: "Enter the device token; MQTT connection and topics are generated automatically.",
    profile: "Profile",
    helpDocs: "Help Docs",
    darkMode: "Dark Mode",
    lightMode: "Light Mode",
    collapse: "Collapse",
    logout: "Logout",
    start: "Start Download",
    downloadSetup: "Download Setup",
    downloadSetupHint: "Choose a download mode and upload BIN or HEX firmware.",
    formatAuto: "Format: Auto",
    downloadMode: "Download Mode",
    deviceToken: "Device Token",
    deviceTokenHelp: "Find the device token on the device label, factory information, or device management backend. It is usually the value after productid.",
    firmware: "Firmware",
    target: "Target",
    targetModel: "Target Model",
    baseAddr: "Base Addr",
    swdErase: "SWD Erase",
    attach: "Attach",
    default: "Default",
    runtime: "Runtime",
    noReset: "No reset after program",
    singlePacket: "Single packet for SWD BIN/HEX",
    mqttHidden: "MQTT broker, account, password, QoS, and topic prefix are generated from the device token.",
    expertMode: "Expert Mode",
    expertHint: "Transfer, UART protocol template, and custom algorithm parameters.",
    forAdvanced: "Advanced",
    chipConfigImport: "Chip Config Import",
    chipConfigImportHint: "Paste the LLM JSON output to add a target and auto-fill download parameters.",
    import: "Import",
    transfer: "Transfer",
    chunkSize: "Chunk Size",
    chunkDelay: "Chunk Delay",
    ackTimeout: "ACK Timeout",
    window: "Window",
    uartBootloader: "UART Bootloader",
    customAlgo: "Custom SRAM Algo",
    algoBlob: "Algo blob",
    algoBlobHelp: "Algo blob is a raw SRAM flash algorithm binary. You can also select a CMSIS FLM or PACK file to auto-fill cmsis_flm parameters.",
    flmFile: "FLM/PACK file",
    parseFlm: "Parse algo",
    flmParsed: "Algorithm parsed",
    downloadLog: "Download Log",
    liveChat: "Live Chat",
    chatHint: "General and RS485 channels are connected separately.",
    generalChat: "Serial 1",
    rs485Chat: "RS485",
    logs: "Logs",
    chat: "Live Chat",
    feedback: "Feedback",
    clientId: "MQTT ClientID",
    clientIdAuto: "Blank uses a random ID",
    showTimestamp: "Show timestamp",
    sendFormat: "Send format",
    receiveFormat: "Receive format",
    autoScroll: "Auto scroll",
    timedSend: "Timed send",
    milliseconds: "ms",
    seconds: "s",
    appendSuffix: "Append suffix",
    appendValue: "Suffix",
    quickInsert: "Quick phrases",
    quickPhrases: QUICK_PHRASES,
    formatOptions: FORMAT_OPTIONS,
    toolVersion: "V1.0",
    toolVersionCard: "Online Tool Version",
    chatBridgeHint: "You can bridge to the server through a virtual serial port or relay.",
    bridgeStatus: "Bridge mode",
    bridgeHint: "The download tool can connect to a local relay, which forwards serial data to the server.",
    feedbackTitle: "Title",
    feedbackType: "Type",
    feedbackContent: "Details",
    contactWay: "Contact",
    feedbackBug: "Issue",
    feedbackImprove: "Suggestion",
    feedbackOther: "Other",
    submitFeedback: "Submit",
    clearFeedback: "Clear",
    clearContent: "Clear content",
    authorContact: "Author Contact",
    feedbackHint: "Leave a way to reach you so the issue can be traced and replied to.",
    connect: "Connect",
    close: "Close",
    send: "Send",
    connected: "Connected",
    connectedSuccess: "Connected",
    topicManaged: "Topics are managed by the system",
    message: "Message",
    waiting: "Waiting...",
    disconnected: "Disconnected.",
    selectFirmware: "Please select firmware.",
    online: "Online",
    offline: "Offline",
    modelCard: "Model",
    versionCard: "Firmware Version",
    engineerCard: "Online Engineers",
    statusCard: "Device Status",
    deviceOnline: "Device online",
    deviceOffline: "Device offline",
    name: "Name",
    role: "Role",
    team: "Team",
    accountSecurity: "Account & Security",
    loginStatus: "Login Status",
    language: "Language"
  }
};

Object.assign(copy.zh, {
  storeOnly: "仅存储到离线固件库",
  storeOnlyHint: "上传后只存到 ESP32 的离线固件库，不立即烧录；单包模式会自动禁用。",
  runtimeHint: "默认立即烧录到目标芯片。",
  offlineVersion: "离线固件版本",
  offlineVersionPlaceholder: "例如 1.0.3",
  offlineVersionAddr: "版本地址"
});

Object.assign(copy.en, {
  storeOnly: "Store offline only",
  storeOnlyHint: "Upload only into the ESP32 offline firmware store and do not program immediately. Single packet mode is disabled.",
  runtimeHint: "The default flow programs the target immediately after upload.",
  offlineVersion: "Offline firmware version",
  offlineVersionPlaceholder: "For example 1.0.3",
  offlineVersionAddr: "Version address"
});

Object.assign(copy.zh, {
  offlineAutoDownload: "离线模式自动下载",
  offlineVersionCheck: "自动下载前检查版本",
  applyOfflineSettings: "应用离线设置",
  offlineSettingsSaved: "离线设置已应用"
});

Object.assign(copy.en, {
  offlineAutoDownload: "Auto download in offline mode",
  offlineVersionCheck: "Check version before auto download",
  applyOfflineSettings: "Apply offline settings",
  offlineSettingsSaved: "Offline settings applied"
});

const t = computed(() => copy[lang.value]);
const pageTitle = computed(() => {
  if (currentPage.value === "profile") return t.value.profile;
  if (currentPage.value === "chat") return t.value.chat;
  if (currentPage.value === "feedback") return t.value.feedback;
  if (currentPage.value === "logs") return t.value.logs;
  return t.value.title;
});
const downloadModes = computed(() => [
  { label: "SWD", value: "swd" },
  { label: lang.value === "zh" ? "串口" : "Serial", value: "uart" },
  { label: "485", value: "rs485" }
]);

const customFields = [
  ["algoLoadAddr", "Load Addr"], ["algoInitPc", "Init PC"], ["algoErasePc", "Erase PC"],
  ["algoFullErasePc", "Full Erase PC"], ["algoProgramPc", "Program PC"], ["algoUninitPc", "Uninit PC"],
  ["algoDoneAddr", "Done Addr"], ["algoDoneMagic", "Done Magic"], ["algoStack", "Stack"],
  ["algoBufferAddr", "Buffer Addr"], ["algoBufferSize", "Buffer Size"], ["algoTimeoutMs", "Timeout ms"],
  ["algoInitTimeoutMs", "Init Timeout"], ["algoEraseTimeoutMs", "Erase Timeout"], ["algoProgramTimeoutMs", "Program Timeout"],
  ["algoInitR0", "Init R0"], ["algoInitR1", "Init R1"], ["algoInitR2", "Init R2"]
].map(([key, label]) => ({ key, label }));

const uartFields = [
  ["baud", "Baud"], ["pageSize", "Page Size"], ["uartFlashChunkSize", "UART Chunk"],
  ["timeoutMs", "Timeout ms"], ["eraseTimeoutMs", "Erase Timeout"], ["extendedErase", "Extended Erase"],
  ["uartErase", "UART Erase"], ["ackByte", "ACK Byte"], ["syncHex", "sync_hex"],
  ["getIdCmdHex", "get_id_cmd"], ["writeCmdHex", "write_cmd"], ["goCmdHex", "go_cmd"],
  ["eraseCmdHex", "erase_cmd"], ["extEraseCmdHex", "ext_erase_cmd"], ["fullEraseFrameHex", "full_erase_frame"],
  ["extFullEraseFrameHex", "ext_full_erase"], ["addrFormat", "addr_format"], ["eraseFormat", "erase_format"]
].map(([key, label]) => ({ key, label }));

const flash = reactive({
  flashMode: "swd",
  deviceToken: DEFAULT_DEVICE_TOKEN,
  target: "stm32f4",
  baseAddr: "0x08000000",
  erase: "sector",
  attach: "",
  singlePacket: false,
  storeOnly: false,
  offlineAutoDownload: false,
  offlineVersionCheck: false,
  version: "",
  versionAddr: "0x0800FFF0",
  noResetAfterProgram: false,
  chunkSize: 2048,
  chunkDelay: 0,
  ackTimeout: 300,
  window: 3,
  baud: 115200,
  pageSize: "",
  uartFlashChunkSize: "",
  timeoutMs: "",
  eraseTimeoutMs: 30000,
  extendedErase: "",
  uartErase: "page",
  ackByte: "",
  syncHex: "",
  getIdCmdHex: "",
  writeCmdHex: "",
  goCmdHex: "",
  eraseCmdHex: "",
  extEraseCmdHex: "",
  fullEraseFrameHex: "",
  extFullEraseFrameHex: "",
  addrFormat: "",
  eraseFormat: "",
  algo: "",
  flashBase: "",
  eraseSize: ""
});

for (const field of customFields) flash[field.key] = "";

const chatDeviceToken = ref(DEFAULT_DEVICE_TOKEN);

const channels = reactive({
  general: createChannelState("general", "/qos1", "/qos0"),
  rs485: createChannelState("rs485", "/rs485/qos1", "/rs485/qos0")
});

const sideNav = computed(() => [
  { key: "download", label: t.value.downloadSetup, icon: Download },
  { key: "chat", label: t.value.chat, icon: ChatDotRound },
  { key: "feedback", label: t.value.feedback, icon: Promotion },
  { key: "logs", label: t.value.logs, icon: Document },
  { key: "profile", label: t.value.profile, icon: UserFilled }
]);

const deviceOnline = computed(() => meta.deviceOnline || flashing.value || channels.general.connected || channels.rs485.connected);
const onlineBadgeText = computed(() => deviceOnline.value ? t.value.deviceOnline : t.value.deviceOffline);
const infoCards = computed(() => [
  { label: t.value.modelCard, value: "WifiLinker", hint: t.value.targetModel, icon: Monitor, bar: "bg-gradient-to-r from-sky-500 to-cyan-400" },
  { label: t.value.versionCard, value: meta.firmwareVersion || "-", hint: t.value.formatAuto, icon: Document, bar: "bg-gradient-to-r from-violet-500 to-fuchsia-400" },
  { label: t.value.engineerCard, value: String(meta.onlineEngineerCount || 1), hint: user.name, icon: UserFilled, bar: "bg-gradient-to-r from-amber-500 to-orange-400" },
  {
    label: t.value.toolVersionCard,
    value: t.value.toolVersion,
    hint: t.value.toolVersionCard,
    icon: Connection,
    bar: "bg-gradient-to-r from-emerald-500 to-lime-400"
  }
]);

const logText = computed(() => logs.value.length ? logs.value.join("\n") : t.value.waiting);
const chatLogItems = computed(() => Object.entries(channels)
  .flatMap(([key, channel]) => channel.messages.map((item) => ({
    id: `${key}-${item.id}`,
    channel: key === "general" ? t.value.generalChat : t.value.rs485Chat,
    at: item.at,
    text: `${item.direction || item.status}: ${item.message}`
  })))
  .sort((a, b) => a.id.localeCompare(b.id)));

onMounted(async () => {
  try {
    const response = await fetch("/api/meta");
    const payload = await response.json();
    syncMetaPayload(payload);
    applyTargetConfig(flash.target);
  } catch (_) {
    // Metadata is optional for the UI.
  }
});

onBeforeUnmount(() => {
  Object.values(channels).forEach((channel) => {
    if (channel.timedTimer) clearInterval(channel.timedTimer);
  });
});

function loadQuickPhrases(key) {
  if (typeof window === "undefined") return [...QUICK_PHRASES];
  try {
    const raw = window.localStorage.getItem(`${CHAT_QUICK_PHRASES_STORAGE_PREFIX}${key}`);
    if (!raw) return [...QUICK_PHRASES];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...QUICK_PHRASES];
    const phrases = [...new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean))];
    return phrases.length ? phrases : [];
  } catch (_) {
    return [...QUICK_PHRASES];
  }
}

function saveQuickPhrases(key, phrases) {
  if (typeof window === "undefined") return;
  const cleaned = [...new Set((phrases || []).map((item) => String(item || "").trim()).filter(Boolean))];
  window.localStorage.setItem(`${CHAT_QUICK_PHRASES_STORAGE_PREFIX}${key}`, JSON.stringify(cleaned));
}

function createChannelState(key, subscribeTopic, publishTopic) {
  return reactive({
    id: "",
    connected: false,
    log: "",
    message: "",
    subscribeTopic,
    publishTopic,
    clientId: "",
    showTimestamp: true,
    autoScroll: true,
    sendFormat: "ascii",
    receiveFormat: "ascii",
    timedEnabled: false,
    timedValue: 1000,
    timedUnit: "ms",
    timedTimer: null,
    appendEnabled: false,
    appendValue: "",
    quickPhrases: loadQuickPhrases(key),
    newPhrase: "",
    messages: [],
    events: null
  });
}

function syncChatTopics() {
  const token = String(chatDeviceToken.value || "").trim() || DEFAULT_DEVICE_TOKEN;
  channels.general.subscribeTopic = `/topic/productid${token}/qos1`;
  channels.general.publishTopic = `/topic/productid${token}/qos0`;
  channels.rs485.subscribeTopic = `/topic/productid${token}/rs485/qos1`;
  channels.rs485.publishTopic = `/topic/productid${token}/rs485/qos0`;
}

syncChatTopics();

watch(() => channels.general.quickPhrases, (phrases) => saveQuickPhrases("general", phrases), { deep: true });
watch(() => channels.rs485.quickPhrases, (phrases) => saveQuickPhrases("rs485", phrases), { deep: true });

function syncMetaPayload(payload) {
  targetOptions.value = payload.targets || targetOptions.value;
  chipConfigs.value = payload.chipConfigs || chipConfigs.value;
  Object.assign(user, payload.user || {});
  meta.firmwareVersion = payload.firmwareVersion || meta.firmwareVersion;
  meta.onlineEngineerCount = payload.onlineEngineerCount || meta.onlineEngineerCount;
  meta.deviceOnline = Boolean(payload.deviceOnline);
}

function queryTargets(query, callback) {
  const items = targetOptions.value
    .filter((item) => item.toLowerCase().includes(String(query || "").toLowerCase()))
    .map((value) => ({ value }));
  callback(items);
}

function normalizeTarget(value) {
  return String(value || "").trim().toLowerCase();
}

function findTargetConfig(target) {
  const normalized = normalizeTarget(target);
  if (!normalized) return null;
  return chipConfigs.value.find((config) => {
    const aliases = Array.isArray(config.aliases) ? config.aliases : [];
    return normalizeTarget(config.id) === normalized || aliases.some((alias) => normalizeTarget(alias) === normalized);
  }) || null;
}

function applyFlashValues(values = {}) {
  for (const [key, value] of Object.entries(values)) {
    if (key in flash && value !== undefined && value !== null) flash[key] = value;
  }
}

function applyTargetConfig(target) {
  const config = findTargetConfig(target);
  if (!config) return;
  const requestedTarget = flash.target || target || config.id;
  const mode = flash.flashMode === "rs485" ? "rs485" : flash.flashMode === "uart" ? "uart" : "swd";
  applyFlashValues(config.defaults);
  applyFlashValues(config[mode]);
  flash.target = requestedTarget;
}

function extractChipConfigJson(text) {
  const content = String(text || "").trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(content);
  if (fenced) return fenced[1].trim();
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start >= 0 && end > start) return content.slice(start, end + 1);
  return content;
}

async function importChipConfig() {
  let config;
  try {
    config = JSON.parse(extractChipConfigJson(chipConfigInput.value));
  } catch (err) {
    ElMessage.error(`Invalid JSON: ${err.message}`);
    return;
  }
  importingChipConfig.value = true;
  try {
    const response = await fetch("/api/chip-configs/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config)
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "chip config import failed");
    syncMetaPayload(payload.meta || {});
    flash.target = payload.config.id;
    applyTargetConfig(payload.config.id);
    chipConfigInput.value = "";
    ElMessage.success(`Imported ${payload.config.id}`);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    importingChipConfig.value = false;
  }
}

function onFirmwareChange(event) {
  firmwareFile.value = event.target.files[0] || null;
}

function onAlgoBlobChange(event) {
  algoBlobFile.value = event.target.files[0] || null;
}

function onFlmFileChange(event) {
  flmFile.value = event.target.files[0] || null;
  packDevices.value = [];
  selectedPackDevice.value = "";
}

async function parseFlmFile() {
  if (!flmFile.value) return;
  parsingFlm.value = true;
  try {
    const data = new FormData();
    data.set("flmFile", flmFile.value);
    appendFormValue(data, "algoLoadAddr", flash.algoLoadAddr);
    appendFormValue(data, "target", flash.target);
    appendFormValue(data, "packDevice", selectedPackDevice.value);
    const response = await fetch("/api/flm/parse", { method: "POST", body: data });
    const payload = await readJsonResponse(response, "FLM/PACK parse failed");
    if (!response.ok) throw new Error(payload.error || "FLM parse failed");
    packDevices.value = payload.pack?.devices || [];
    if (selectedPackDevice.value) flash.target = selectedPackDevice.value;
    applyFlashValues(payload.params || {});
    expert.value = true;
    const name = payload.flashDevice?.name ? ` (${payload.flashDevice.name})` : "";
    ElMessage.success(`${t.value.flmParsed}${name}`);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    parsingFlm.value = false;
  }
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    throw new Error(`${fallbackMessage}: HTTP ${response.status} ${text.slice(0, 120)}`);
  }
}

function toggleTheme() {
  darkMode.value = !darkMode.value;
}

async function persistChatFormat(key) {
  const channel = channels[key];
  if (channel.connected && channel.id) {
    try {
      const response = await fetch(`/api/chat/${channel.id}/format`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiveFormat: channel.receiveFormat })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "format update failed");
    } catch (err) {
      pushChannelMessage(channel, { status: "error", message: err.message });
      return;
    }
  }
  channel.messages.push({
    id: ++chatMessageSeq,
    at: formatChatTime(new Date()),
    status: "format",
    message: `${key}:${channel.sendFormat}/${channel.receiveFormat}`
  });
}

function submitFeedback() {
  ElMessage.success(t.value.submitFeedback);
}

function resetFeedback() {
  feedbackForm.title = "";
  feedbackForm.type = "bug";
  feedbackForm.contact = "";
  feedbackForm.content = "";
}

function appendFormValue(data, key, value) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value === "boolean") data.set(key, value ? "1" : "0");
  else data.set(key, String(value));
}

async function applyOfflineSettings() {
  offlineSettingsSaving.value = true;
  try {
    const response = await fetch("/api/offline/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceToken: flash.deviceToken,
        flashMode: flash.flashMode,
        offlineAutoDownload: flash.offlineAutoDownload,
        offlineVersionCheck: flash.offlineVersionCheck
      })
    });
    const payload = await readJsonResponse(response, "Apply offline settings failed");
    if (!response.ok) throw new Error(payload.error || "Apply offline settings failed");
    ElMessage.success(`${t.value.offlineSettingsSaved} (${payload.channel})`);
  } catch (err) {
    ElMessage.error(err.message);
  } finally {
    offlineSettingsSaving.value = false;
  }
}

async function submitFlash() {
  if (!firmwareFile.value) {
    ElMessage.error(t.value.selectFirmware);
    return;
  }
  if (flash.storeOnly) flash.singlePacket = false;
  flashing.value = true;
  progress.value = 0;
  logs.value = [];
  const data = new FormData();
  data.set("firmwareFile", firmwareFile.value);
  if (algoBlobFile.value) data.set("algoBlob", algoBlobFile.value);
  if (flmFile.value) data.set("flmFile", flmFile.value);
  for (const [key, value] of Object.entries(flash)) appendFormValue(data, key, value);
  appendFormValue(data, "packDevice", selectedPackDevice.value);
  data.set("singlePacket", flash.singlePacket ? "1" : "0");
  data.set("noResetAfterProgram", flash.noResetAfterProgram ? "1" : "0");
  data.set("algoBlobPresent", algoBlobFile.value || flmFile.value ? "1" : "0");
  try {
    const response = await fetch("/api/flash", { method: "POST", body: data });
    const payload = await readJsonResponse(response, "Create flash job failed");
    if (!response.ok) throw new Error(payload.error || "Failed to create job");
    const events = new EventSource(`/api/jobs/${payload.id}/events`);
    events.onmessage = (message) => {
      const eventData = JSON.parse(message.data);
      if (eventData.type === "log") pushLog(eventData.message);
      if (eventData.type === "progress") {
        progress.value = Number(Math.min(100, eventData.percent).toFixed(1));
        pushLog(`Stored: ${eventData.done}/${eventData.total} bytes (${eventData.percent.toFixed(1)}%)`);
      }
      if (eventData.type === "status") {
        pushLog(eventData.status === "done"
          ? (flash.storeOnly ? "Stored for offline programming." : "Done.")
          : `ERROR: ${eventData.error}`);
        events.close();
        flashing.value = false;
      }
    };
    events.onerror = () => {
      events.close();
      flashing.value = false;
    };
  } catch (err) {
    const message = err.message === "Failed to fetch"
      ? "Failed to fetch /api/flash. Check that the backend on port 3000 is running and reachable from the page."
      : err.message;
    pushLog(`ERROR: ${message}`);
    flashing.value = false;
  }
}

watch(chatDeviceToken, syncChatTopics);
watch(() => flash.target, (target) => applyTargetConfig(target));
watch(() => flash.flashMode, () => applyTargetConfig(flash.target));
watch(() => flash.storeOnly, (enabled) => {
  if (enabled) flash.singlePacket = false;
});

function pushLog(line) {
  logs.value.push(line);
}

function pushChannelLog(channel, line) {
  channel.log += `${line}\n`;
}

function pushChannelMessage(channel, item) {
  const at = item.at ? new Date(item.at) : new Date();
  const message = item.status === "connected"
    ? t.value.connectedSuccess
    : item.message || "";
  channel.messages.push({
    id: ++chatMessageSeq,
    at: formatChatTime(at),
    direction: item.direction || "",
    status: item.status || "",
    topic: item.topic || "",
    message
  });
}

function clearChannel(key) {
  const channel = channels[key];
  channel.messages = [];
  channel.log = "";
  channel.message = "";
}

async function connectChannel(key) {
  const channel = channels[key];
  try {
    pushChannelLog(channel, lang.value === "zh" ? "正在连接..." : "Connecting...");
    pushChannelMessage(channel, { status: "connecting", message: lang.value === "zh" ? "正在连接..." : "Connecting..." });
    const response = await fetch("/api/chat/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceToken: chatDeviceToken.value,
        subscribeTopic: channel.subscribeTopic,
        publishTopic: channel.publishTopic,
        clientId: channel.clientId,
        receiveFormat: channel.receiveFormat,
        chatQos: 0
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Chat connect failed");
    channel.id = payload.id;
    channel.subscribeTopic = payload.subscribeTopic || channel.subscribeTopic;
    channel.publishTopic = payload.publishTopic || channel.publishTopic;
    channel.clientId = payload.clientId || channel.clientId;
    channel.connected = true;
    pushChannelLog(channel, t.value.connected);
    channel.events = new EventSource(`/api/chat/${channel.id}/events`);
    channel.events.onmessage = (message) => {
      const eventData = JSON.parse(message.data);
      if (eventData.type === "message") {
        pushChannelLog(channel, `${eventData.direction === "in" ? "<" : ">"} [${eventData.topic}] ${eventData.message}`);
        pushChannelMessage(channel, eventData);
      }
      if (eventData.type === "status") {
        channel.connected = eventData.status !== "closed" && eventData.status !== "error";
        pushChannelLog(channel, `* ${eventData.message}`);
        pushChannelMessage(channel, eventData);
      }
    };
    channel.events.onerror = () => pushChannelLog(channel, "* stream disconnected");
  } catch (err) {
    pushChannelLog(channel, `ERROR: ${err.message}`);
    pushChannelMessage(channel, { status: "error", message: err.message });
  }
}

async function sendChannel(key) {
  const channel = channels[key];
  if (!channel.connected || !channel.message) return;
  let message = channel.message;
  if (channel.appendEnabled && channel.appendValue) message += channel.appendValue;
  if (channel.sendFormat === "hex") {
    message = normalizeHexMessage(message);
    channel.message = normalizeHexMessage(channel.message);
  }
  const response = await fetch(`/api/chat/${channel.id}/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, format: channel.sendFormat })
  });
  if (!response.ok) {
    pushChannelLog(channel, "ERROR: send failed");
    pushChannelMessage(channel, { status: "error", message: "send failed" });
  }
}

function timedIntervalMs(channel) {
  const value = Math.max(1, Number(channel.timedValue) || 1);
  return channel.timedUnit === "s" ? value * 1000 : value;
}

function syncTimedSend(key) {
  const channel = channels[key];
  if (channel.timedTimer) {
    clearInterval(channel.timedTimer);
    channel.timedTimer = null;
  }
  if (!channel.timedEnabled) return;
  channel.timedTimer = setInterval(() => {
    if (channel.connected && channel.message) sendChannel(key);
  }, timedIntervalMs(channel));
}

async function closeChannel(key) {
  const channel = channels[key];
  if (!channel.id) return;
  channel.timedEnabled = false;
  syncTimedSend(key);
  await fetch(`/api/chat/${channel.id}/close`, { method: "POST" });
  if (channel.events) channel.events.close();
  channel.id = "";
  channel.connected = false;
  pushChannelLog(channel, lang.value === "zh" ? "已关闭。" : "Closed.");
  pushChannelMessage(channel, { status: "closed", message: lang.value === "zh" ? "已关闭。" : "Closed." });
}

function openHelp() {
  ElMessage.info(t.value.helpDocs);
}

function onUserCommand(command) {
  if (command === "profile") currentPage.value = "profile";
  if (command === "help") openHelp();
  if (command === "logout") ElMessage.success(t.value.logout);
}
</script>
