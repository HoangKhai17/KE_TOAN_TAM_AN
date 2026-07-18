import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // Dùng regex neo vào 'node_modules/<tên gói>/' — KHÔNG dùng includes('/react/')
            // vì sẽ khớp nhầm cả '@xyflow/react', kéo thư viện vẽ sơ đồ vào chunk vendor
            // (vendor tải ngay từ đầu) → mất tác dụng lazy load.
            if (/node_modules\/(react|react-dom)\//.test(id)) return 'vendor'
            if (/node_modules\/react-router-dom\//.test(id)) return 'router'
            if (/node_modules\/@tanstack\/react-query\//.test(id)) return 'query'
            if (/node_modules\/recharts\//.test(id)) return 'charts'
            // @xyflow/react cố tình KHÔNG gán chunk → Rollup tự gộp vào chunk
            // động của ProcessFlowEditor, chỉ tải khi mở tab Quy trình.
          }
        },
      },
    },
  },
})
