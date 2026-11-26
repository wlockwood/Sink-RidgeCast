<script setup lang="ts">
import type { ApplicationLinkSettings } from '#shared/schemas/application-link'
import { useForm } from '@tanstack/vue-form'
import { toast } from 'vue-sonner'
import { ApplicationAllowedUrlSchema, MAX_APPLICATION_ALLOWED_URLS } from '#shared/schemas/application-link'

const endpoint = '/api/link/application-settings'
const { t } = useI18n()
const loadState = shallowRef<'loading' | 'ready' | 'failed'>('loading')
const revision = shallowRef(0)
const conflict = shallowRef(false)
const form = useForm({
  defaultValues: { allowedUrls: '' },
  onSubmit: async ({ value }) => {
    if (conflict.value)
      return

    try {
      const saved = await useAPI<ApplicationLinkSettings>(endpoint, {
        method: 'PUT',
        body: { allowedUrls: getRules(value.allowedUrls), revision: revision.value },
      })
      revision.value = saved.revision
      toast.success(t('links.application.saved'))
    }
    catch (error) {
      if (typeof error === 'object' && error !== null && 'status' in error && error.status === 409)
        conflict.value = true
      else
        toast.error(t('links.application.save_failed'))
    }
  },
})

function getRules(value: string): string[] {
  return value.split('\n').map(line => line.trim()).filter(Boolean)
}

function validateRules({ value }: { value: string }): string | undefined {
  const invalidLine = value.split('\n').findIndex(line => line.trim() && !ApplicationAllowedUrlSchema.safeParse(line).success)
  if (invalidLine !== -1)
    return t('links.application.invalid_url', { line: invalidLine + 1 })

  if (getRules(value).length > MAX_APPLICATION_ALLOWED_URLS)
    return t('links.application.limit', { count: MAX_APPLICATION_ALLOWED_URLS })
}

async function loadSettings(): Promise<void> {
  loadState.value = 'loading'
  try {
    const settings = await useAPI<ApplicationLinkSettings>(endpoint)
    form.reset({ allowedUrls: settings.allowedUrls.join('\n') })
    revision.value = settings.revision
    conflict.value = false
    loadState.value = 'ready'
  }
  catch {
    loadState.value = 'failed'
  }
}

onMounted(loadSettings)
</script>

<template>
  <p
    v-if="loadState === 'loading'" role="status" class="
      text-sm text-muted-foreground
    "
  >
    {{ $t('links.application.loading') }}
  </p>
  <div v-else-if="loadState === 'failed'" class="space-y-3">
    <Alert variant="destructive">
      <AlertDescription>{{ $t('links.application.load_failed') }}</AlertDescription>
    </Alert>
    <Button type="button" variant="outline" @click="loadSettings">
      {{ $t('common.try_again') }}
    </Button>
  </div>
  <form v-else class="space-y-4" @submit.prevent="form.handleSubmit">
    <Alert v-if="conflict" variant="destructive" role="alert">
      <AlertDescription>{{ $t('links.application.conflict') }}</AlertDescription>
    </Alert>
    <form.Subscribe v-slot="{ isSubmitting }">
      <form.Field v-slot="{ field }" name="allowedUrls" :validators="{ onSubmit: validateRules }">
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel for="allowed-urls">
            {{ $t('links.application.allowed_urls') }}
          </FieldLabel>
          <Textarea
            id="allowed-urls"
            :model-value="field.state.value"
            :disabled="isSubmitting"
            :aria-invalid="getAriaInvalid(field)"
            :aria-describedby="isInvalid(field) ? 'allowed-urls-help allowed-urls-error' : 'allowed-urls-help'"
            class="min-h-32"
            spellcheck="false"
            placeholder="https://maps.example.com/share/"
            @update:model-value="field.handleChange(String($event))"
          />
          <FieldDescription id="allowed-urls-help">
            {{ $t('links.application.help') }}
          </FieldDescription>
          <FieldError v-if="isInvalid(field)" id="allowed-urls-error" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
      <Button v-if="conflict" type="button" variant="outline" @click="loadSettings">
        {{ $t('links.application.reload') }}
      </Button>
      <Button v-else type="submit" :disabled="isSubmitting" :aria-busy="isSubmitting">
        {{ $t('common.save') }}
      </Button>
    </form.Subscribe>
  </form>
</template>
