import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  modules: ['@ui-sdk/vue', '@nuxtjs/i18n'],
  css: ['~/assets/css/main.css', '~/assets/css/reader.css'],
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { include: ['@ai-sdk/vue', '@lucide/vue', '@ui-sdk/core', 'ai'] },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'fr' },
      title: 'Folio',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'description', content: 'Folio turns your AI agents’ daily work into a book you read.' },
        { name: 'theme-color', content: '#f5f5f2' },
      ],
      link: [{ rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' }],
    },
  },
  i18n: {
    defaultLocale: 'fr',
    strategy: 'no_prefix',
    locales: [
      { code: 'fr', language: 'fr-FR', name: 'Français', file: 'fr.json' },
      { code: 'en', language: 'en-US', name: 'English', file: 'en.json' },
    ],
    detectBrowserLanguage: { useCookie: true, cookieKey: 'folio_locale', redirectOn: 'root', fallbackLocale: 'fr' },
  },
  runtimeConfig: { public: { version: '1.0.0' } },
  nitro: {
    serverAssets: [{ baseName: 'migrations', dir: './server/db/migrations' }],
    externals: { inline: [] },
    experimental: { tasks: false },
  },
  typescript: { strict: true },
})
