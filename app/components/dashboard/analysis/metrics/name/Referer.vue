<script setup lang="ts">
import { isHttpLinkUrl } from '#shared/utils/link-url'

const props = defineProps<{
  name?: string
}>()

const href = computed(() => {
  if (!props.name)
    return undefined

  const address = `http://${props.name}`
  if (!isHttpLinkUrl(address))
    return undefined

  const url = new URL(address)
  return url.host === props.name.toLowerCase() ? url.href : undefined
})
</script>

<template>
  <component
    :is="href ? 'a' : 'span'"
    :href="href"
    :target="href ? '_blank' : undefined"
    :rel="href ? 'noopener noreferrer' : undefined"
    class="flex w-full min-w-0 items-start gap-1"
  >
    <Avatar
      class="size-5 shrink-0 p-0.5"
    >
      <AvatarFallback>
        <img
          src="/icon.png"
          :alt="name"
          loading="lazy"
          width="20"
          height="20"
        >
      </AvatarFallback>
    </Avatar>
    <span class="min-w-0 break-all">{{ name }}</span>
  </component>
</template>
