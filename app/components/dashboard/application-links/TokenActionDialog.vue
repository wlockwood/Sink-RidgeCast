<script setup lang="ts">
const props = defineProps<{
  action: 'rotate' | 'revoke'
  name: string
}>()

const emit = defineEmits<{
  confirm: []
  closeAutoFocus: [event: Event]
}>()
const open = defineModel<boolean>('open', { default: false })
const { t } = useI18n()
const title = computed(() => props.action === 'rotate'
  ? t('links.application.tokens.rotate_title', { name: props.name })
  : t('links.application.tokens.revoke_title', { name: props.name }))
const description = computed(() => props.action === 'rotate'
  ? t('links.application.tokens.rotate_help')
  : t('links.application.tokens.revoke_help'))
</script>

<template>
  <AlertDialog v-model:open="open">
    <AlertDialogContent @close-auto-focus="emit('closeAutoFocus', $event)">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>{{ description }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="emit('confirm')">
          {{ action === 'rotate' ? $t('links.application.tokens.rotate') : $t('links.application.tokens.revoke') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
