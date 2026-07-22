# douyin-mcp（骨架版）

這是一個 MCP server 骨架，目前 tool 回傳的是**假資料**，
目的是先確認「Kelivo -> 這台 server」的連線流程能跑通，
之後再把假資料換成真正的 Playwright + 抖音操作。

## 目前提供的 tools

- `get_current_video`：回傳目前「畫面上」影片資訊（假資料）
- `scroll_next` / `scroll_prev`：切換到下一支/上一支（假資料）
- `like_video`：模擬按讚（假資料，需要 confirm=true）

## 用手機部署（不需要電腦）

1. 到 GitHub，用手機瀏覽器建立一個新 repo（例如 `douyin-mcp`）。
2. 把這個資料夾裡的 4 個檔案（package.json / server.js / Dockerfile / README.md）
   透過 GitHub 網頁的「Add file → Upload files」上傳上去。
3. 到 [Railway](https://railway.app) 或 [Render](https://render.com)，
   用 GitHub 帳號登入，選 "New Project / New Web Service" -> 連接剛剛那個 repo。
   兩者都會自動偵測到 Dockerfile 並建置部署。
4. 部署完成後，平台會給你一個網址，例如：
   `https://douyin-mcp-production.up.railway.app`
5. 這個 server 的 MCP endpoint 是：
   `https://你的網址/mcp`

## 在 Kelivo 設定

1. 打開 Kelivo -> 設定 -> MCP（工具）
2. 新增一個 MCP Server
3. 類型選 HTTP / Streamable HTTP
4. URL 填：`https://你的網址/mcp`
5. 儲存後，跟 AI 對話時應該就能看到 `get_current_video` 等 4 個工具可以被呼叫

## 之後要接真的抖音時

把 `server.js` 裡 `createMcpServer()` 內的假資料邏輯，
換成 Playwright 操作抖音網頁版的邏輯即可，
四個 tool 的名稱、輸入輸出格式都不用改，Kelivo 那邊也不用重新設定。
這部分需要額外加 Playwright 依賴，並且在 Dockerfile 裡加裝瀏覽器套件
（`npx playwright install --with-deps chromium`），Docker image 會變大很多，
之後我可以幫你補上這個版本。
