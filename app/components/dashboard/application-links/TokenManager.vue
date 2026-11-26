<script setup lang="ts">
import type { ApplicationLinkToken, ApplicationLinkTokenList, IssuedApplicationLinkToken } from '#shared/schemas/application-link-token'
import { toast } from 'vue-sonner'
import { ENVIRONMENT_APPLICATION_TOKEN_ID } from '#shared/schemas/application-link-token'

const endpoint = '/api/link/application-tokens'
const { t, locale } = useI18n()
const previewMode = useRuntimeConfig().public.previewMode
const list = shallowRef<ApplicationLinkTokenList>()
const loading = shallowRef(true)
const loadFailed = shallowRef(false)
const working = shallowRef(false)
const tokenDialogOpen = shallowRef(false)
const actionDialogOpen = shallowRef(false)
const issued = shallowRef<IssuedApplicationLinkToken | null>(null)
const selected = shallowRef<{ token: ApplicationLinkToken, action: 'rotate' | 'revoke' }>()
const heading = useTemplateRef<HTMLHeadingElement>('heading')
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium', timeStyle: 'short' }))
const numberFormat = computed(() => new Intl.NumberFormat(locale.value))
let dialogTrigger: HTMLButtonElement | null = null

function tokenStatus(token: ApplicationLinkToken): 'revoked' | 'inactive' | 'active' {
  if (token.revokedAt !== null)
    return 'revoked'
  if (token.id === ENVIRONMENT_APPLICATION_TOKEN_ID && !list.value?.environmentActive)
    return 'inactive'
  return 'active'
}

async function refreshTokens() {
  loading.value = true
  loadFailed.value = false
  try {
    list.value = await useAPI<ApplicationLinkTokenList>(endpoint)
  }
  catch {
    loadFailed.value = true
  }
  finally {
    loading.value = false
  }
}

function openCreate(event: MouseEvent) {
  dialogTrigger = event.currentTarget as HTMLButtonElement
  tokenDialogOpen.value = true
}

function openAction(token: ApplicationLinkToken, action: 'rotate' | 'revoke', event: MouseEvent) {
  dialogTrigger = event.currentTarget as HTMLButtonElement
  selected.value = { token, action }
  actionDialogOpen.value = true
}

function restoreFocus(event: Event) {
  event.preventDefault()
  if (tokenDialogOpen.value || actionDialogOpen.value)
    return
  if (dialogTrigger?.isConnected && !dialogTrigger.disabled)
    dialogTrigger.focus()
  else
    heading.value?.focus()
}

function showSecret(result: IssuedApplicationLinkToken) {
  issued.value = result
  tokenDialogOpen.value = true
  void refreshTokens()
}

function updateTokenDialog(open: boolean) {
  tokenDialogOpen.value = open
  if (!open)
    issued.value = null
}

async function applyAction() {
  if (!selected.value || working.value)
    return

  const { token, action } = selected.value
  const tokenPath = `${endpoint}/${encodeURIComponent(token.id)}`
  working.value = true
  try {
    if (action === 'rotate') {
      showSecret(await useAPI<IssuedApplicationLinkToken>(`${tokenPath}/rotate`, {
        method: 'POST',
        body: { version: token.version },
      }))
    }
    else {
      await useAPI(tokenPath, { method: 'DELETE' })
      toast.success(t('links.application.tokens.revoked_notice'))
      await refreshTokens()
    }
  }
  catch {
    toast.error(t('links.application.tokens.action_failed'))
    await refreshTokens()
  }
  finally {
    working.value = false
  }
}

onMounted(refreshTokens)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 ref="heading" tabindex="-1">
          {{ $t('links.application.tokens.title') }}
        </h2>
      </CardTitle>
      <CardDescription>{{ $t('links.application.tokens.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="space-y-4">
      <div class="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" :disabled="loading || working" @click="refreshTokens">
          {{ $t('links.application.tokens.refresh') }}
        </Button>
        <Button v-if="!previewMode" type="button" size="sm" :disabled="working" @click="openCreate">
          {{ $t('links.application.tokens.create') }}
        </Button>
      </div>
      <Alert v-if="loadFailed" variant="destructive" role="alert">
        <AlertDescription>{{ $t('links.application.tokens.load_failed') }}</AlertDescription>
      </Alert>
      <p
        v-else-if="loading && !list" role="status" class="
          text-sm text-muted-foreground
        "
      >
        {{ $t('links.application.tokens.loading') }}
      </p>
      <p v-else-if="!list?.tokens.length" class="text-sm text-muted-foreground">
        {{ $t('links.application.tokens.empty') }}
      </p>
      <ul v-else :aria-busy="loading" class="divide-y">
        <li
          v-for="token in list.tokens" :key="token.id" class="
            flex flex-wrap items-center justify-between gap-3 py-3
            first:pt-0
            last:pb-0
          "
        >
          <div class="min-w-0 space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-medium wrap-anywhere">
                {{ token.name }}
              </h3>
              <Badge :variant="tokenStatus(token) === 'revoked' ? 'secondary' : 'outline'">
                {{ $t(`links.application.tokens.${tokenStatus(token)}`) }}
              </Badge>
            </div>
            <p class="text-sm text-muted-foreground">
              {{ $t('links.application.tokens.usage', { count: numberFormat.format(token.linksCreated) }) }}
              <span v-if="token.lastUsedAt !== null">
                · {{ $t('links.application.tokens.last_used', { date: dateFormat.format(token.lastUsedAt) }) }}
              </span>
            </p>
          </div>
          <div
            v-if="!previewMode && token.revokedAt === null" class="
              flex flex-wrap gap-2
            "
          >
            <Button
              v-if="token.id !== ENVIRONMENT_APPLICATION_TOKEN_ID"
              type="button" size="sm" variant="outline" :disabled="working || loading"
              :aria-label="$t('links.application.tokens.rotate_title', { name: token.name })"
              @click="openAction(token, 'rotate', $event)"
            >
              {{ $t('links.application.tokens.rotate') }}
            </Button>
            <Button
              type="button" size="sm" variant="outline" :disabled="working || loading"
              :aria-label="$t('links.application.tokens.revoke_title', { name: token.name })"
              @click="openAction(token, 'revoke', $event)"
            >
              {{ $t('links.application.tokens.revoke') }}
            </Button>
          </div>
        </li>
      </ul>
    </CardContent>
  </Card>
  <DashboardApplicationLinksTokenDialog
    :open="tokenDialogOpen" :issued="issued"
    @update:open="updateTokenDialog" @issued="showSecret" @close-auto-focus="restoreFocus"
  />
  <DashboardApplicationLinksTokenActionDialog
    v-if="selected" v-model:open="actionDialogOpen"
    :action="selected.action" :name="selected.token.name" @confirm="applyAction" @close-auto-focus="restoreFocus"
  />
</template>
