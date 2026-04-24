import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,

    // ── DB 연동 시 개발 환경 프록시 설정 ─────────────────────────────────────
    // 프론트엔드(3000)에서 /api/* 요청을 백엔드 서버(4000)로 전달합니다.
    // 프로덕션 배포 시에는 Nginx 등 웹서버의 리버스 프록시로 대체하세요.
    //
    // Nginx 설정 예시:
    //   location /api/ {
    //     proxy_pass         http://127.0.0.1:4000/api/;
    //     proxy_http_version 1.1;
    //     proxy_set_header   Host $host;
    //   }
    //   location / {
    //     root /var/www/resort-app/dist;
    //     try_files $uri /index.html;
    //   }
    proxy: {
      '/api': {
        target:       'http://localhost:4000',  // 백엔드 API 서버 주소
        changeOrigin: true,
        // DB 연동 전에는 아래 주석 처리 유지 — proxy 설정만으로는 영향 없음
      },
    },
  },
})
