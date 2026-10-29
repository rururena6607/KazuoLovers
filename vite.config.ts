/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    // PWA（要件定義書 10 章「スマホへのインストール」）。
    // 新しい版は自動で切り替えず、「更新があります」を出してから再読み込みする（UpdatePrompt）
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'サーブレシーブ記録',
        short_name: 'サーブ記録',
        lang: 'ja',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0A0E2E',
        background_color: '#0A0E2E',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
