import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal Vite + React. The published Synfin packages are plain ESM and bundle
// with no special config; @synfin/wallet-partylayer ships its runtime bundled.
export default defineConfig({
  plugins: [react()],
  server: { port: 5178, allowedHosts: true },
});
