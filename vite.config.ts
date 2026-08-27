import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'MediaLog',
        short_name: 'MediaLog',
        description: 'Schnell Fortschritt in Serien, Filmen, Anime und Büchern tracken.',
        lang: 'de',
        theme_color: '#0b0b0f',
        background_color: '#0b0b0f',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        share_target: {
          action: '/add',
          method: 'GET',
          params: { title: 'title', text: 'text', url: 'url' },
        },
        shortcuts: [
          {
            name: 'Nächste Folge loggen',
            short_name: '+1 Folge',
            url: '/quicklog',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'Diese Woche',
            url: '/upcoming',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'Hinzufügen',
            url: '/add',
            icons: [{ src: 'pwa-192.png', sizes: '192x192' }],
          },
        ],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname === 'image.tmdb.org',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tmdb-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) => url.hostname.endsWith('media-amazon.com') || url.hostname === 's4.anilist.co',
            handler: 'CacheFirst',
            options: {
              cacheName: 'anilist-images',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
})
