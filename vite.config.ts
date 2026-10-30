import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: {
    exclude: ['@decartai/sdk'],
    include: ['@decartai/sdk > p-retry'],
  },
});
