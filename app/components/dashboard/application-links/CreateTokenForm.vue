<script setup lang="ts">
import type { IssuedApplicationLinkToken } from '#shared/schemas/application-link-token'
import { useForm } from '@tanstack/vue-form'
import { ApplicationTokenNameSchema, MAX_APPLICATION_TOKEN_NAME_LENGTH } from '#shared/schemas/application-link-token'

const emit = defineEmits<{
  issued: [issued: IssuedApplicationLinkToken]
  saving: [saving: boolean]
}>()

const { t } = useI18n()
const failed = shallowRef(false)
const nameId = useId()
const form = useForm({
  defaultValues: { name: '' },
  onSubmit: async ({ value }) => {
    failed.value = false
    emit('saving', true)
    try {
      const issued = await useAPI<IssuedApplicationLinkToken>('/api/link/application-tokens', {
        method: 'POST',
        body: { name: value.name.trim() },
      })
      emit('issued', issued)
    }
    catch {
      failed.value = true
    }
    finally {
      emit('saving', false)
    }
  },
})

function validateName({ value }: { value: string }) {
  if (!ApplicationTokenNameSchema.safeParse(value).success)
    return t('links.application.tokens.invalid_name', { count: MAX_APPLICATION_TOKEN_NAME_LENGTH })
}
</script>

<template>
  <form class="w-full space-y-4" @submit.prevent="form.handleSubmit">
    <Alert v-if="failed" variant="destructive" role="alert">
      <AlertDescription>{{ $t('links.application.tokens.create_failed') }}</AlertDescription>
    </Alert>
    <form.Subscribe v-slot="{ isSubmitting }">
      <form.Field v-slot="{ field }" name="name" :validators="{ onSubmit: validateName }">
        <Field :data-invalid="isInvalid(field)">
          <FieldLabel :for="nameId">
            {{ $t('links.application.tokens.name') }}
          </FieldLabel>
          <Input
            :id="nameId"
            :model-value="field.state.value"
            :disabled="isSubmitting"
            :maxlength="MAX_APPLICATION_TOKEN_NAME_LENGTH"
            :aria-invalid="getAriaInvalid(field)"
            :aria-describedby="isInvalid(field) ? `${nameId}-error` : undefined"
            @update:model-value="field.handleChange(String($event))"
          />
          <FieldError v-if="isInvalid(field)" :id="`${nameId}-error`" :errors="field.state.meta.errors" />
        </Field>
      </form.Field>
      <Button type="submit" :disabled="isSubmitting" :aria-busy="isSubmitting">
        {{ $t('links.application.tokens.create') }}
      </Button>
    </form.Subscribe>
  </form>
</template>
