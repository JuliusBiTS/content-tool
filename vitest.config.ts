import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const stub = (name: string) => fileURLToPath(new URL(`./src/test/stubs/${name}`, import.meta.url))

export default defineConfig({
  resolve: {
    // the Supabase edge function uses Deno-style specifiers; point them at fakes
    alias: [
      { find: 'jsr:@supabase/supabase-js@2', replacement: stub('supabase.ts') },
      { find: 'npm:web-push@3.6.7', replacement: stub('webpush.ts') },
    ],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
