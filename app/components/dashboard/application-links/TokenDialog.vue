<script setup lang="ts">
import type { IssuedApplicationLinkToken } from '#shared/schemas/application-link-token'
import { toast } from 'vue-sonner'

const props = defineProps<{ issued: IssuedApplicationLinkToken | null }>()

const emit = defineEmits<{
  issued: [issued: IssuedApplicationLinkToken]
  closeAutoFocus: [event: Event]
}>()

const open = defineModel<boolean>('open', { default: false })
const saving = shallowRef(false)
const copied = shallowRef(false)
const { t } = useI18n()

watch(() => props.issued, () => {
  copied.value = false
})

async function copySecret() {
  if (!props.issued)
    return
  try {
    await navigator.clipboard.writeText(props.issued.secret)
    copied.value = Boolean(props.issued)
  }
  catch {
    toast.error(t('links.application.tokens.copy_failed'))
  }
}
</script>

<template>
  <ResponsiveModal
    v-model:open="open"
    :title="issued ? $t('links.application.tokens.secret_title', { name: issued.token.name }) : $t('links.application.tokens.create')"
    :description="issued ? $t('links.application.tokens.secret_help') : $t('links.application.tokens.create_help')"
    :prevent-close="saving"
    @close-auto-focus="emit('closeAutoFocus', $event)"
  >
    <div v-if="issued" class="w-full space-y-4">
      <code class="block wrap-anywhere select-all">{{ issued.secret }}</code>
      <Button type="button" variant="outline" @click="copySecret">
        {{ copied ? $t('links.application.tokens.copied') : $t('links.application.tokens.copy') }}
      </Button>
    </div>
    <DashboardApplicationLinksCreateTokenForm v-else @issued="emit('issued', $event)" @saving="saving = $event" />
  </ResponsiveModal>
</template>
