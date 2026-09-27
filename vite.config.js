import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    // Firestore SDK 청크는 랭킹/저장 때만 동적으로 불러오므로 첫 로딩에 포함되지 않는다
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
  },
});
