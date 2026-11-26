<script setup lang="ts">
definePageMeta({
  layout: 'dashboard',
})
</script>

<template>
  <section aria-labelledby="application-links-title" class="max-w-3xl space-y-4">
    <Card>
      <CardHeader>
        <CardTitle>
          <h1 id="application-links-title">
            {{ $t('links.application.title') }}
          </h1>
        </CardTitle>
        <CardDescription>{{ $t('links.application.description') }}</CardDescription>
      </CardHeader>
      <CardContent>
        <DashboardApplicationLinksSettingsForm />
      </CardContent>
    </Card>
    <DashboardApplicationLinksTokenManager />
  </section>
</template>
