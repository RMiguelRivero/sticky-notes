/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Vitest replaces CSS with an empty string by default; the contrast test needs the real tokens.
    css: { include: [/tokens\.css/] },
    coverage: {
      provider: 'v8',
      // Every source file counts, including the untested React layer, so the total is honest.
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/main.tsx'],
      reporter: ['text', 'html'],
    },
  },
})
