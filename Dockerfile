# 用官方 Playwright image，已經內建 Chromium + 所有系統依賴，
# 比在 node:slim 上手動裝瀏覽器穩定很多。
FROM mcr.microsoft.com/playwright:v1.47.0-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js douyin.js ./

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
