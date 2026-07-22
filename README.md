# douyin-mcp（v2：接上真的抖音網頁版）

## 新增的 tools

- `get_login_status`：檢查是否已登入
- `get_login_qr`：截圖目前畫面（含登入用 QR code），回傳圖片給你掃
- `get_current_video`：讀取目前畫面上的影片資訊
- `scroll_next` / `scroll_prev`：上下滑動並回傳新影片資訊
- `get_page_debug`：除錯用，印出畫面文字內容，抓不準時用這個回報調整

## 第一次使用流程

1. 部署更新後，在 Kelivo 跟 AI 說「幫我看抖音登入了沒」
   → AI 會呼叫 `get_login_status`
2. 如果顯示未登入，跟 AI 說「給我看登入畫面」
   → AI 會呼叫 `get_login_qr`，你會在對話裡看到一張截圖
3. 用手機抖音 App 掃描截圖裡的 QR code 完成登入
4. 再問一次「幫我看抖音在滑什麼」，這時應該就會呼叫 `get_current_video`

## 已知限制

- **Render 免費方案硬碟是暫時性的**：如果服務長時間閒置被喚醒重啟，登入的 session
  可能會不見，需要重新掃碼登入一次。
- **免費方案記憶體只有 512MB**：headless Chromium + Node 一起跑可能會偏緊，
  如果常常沒回應或當掉，可能需要升級 Render 方案，或改用資源更多的平台。
- **讀取影片資訊的邏輯是「先猜測」版本**：因為開發時無法即時連線抖音網頁版
  對照畫面結構，`get_current_video` 抓到的內容如果是空的或不準，
  請呼叫 `get_page_debug`，把回傳的內容截圖/複製給開發者，
  再調整 `douyin.js` 裡 `extractVideoInfo` 的邏輯即可，介面不用變。

## 更新部署步驟

1. 到 GitHub 這個 repo，把 `server.js`、`douyin.js`、`package.json`、`Dockerfile`
   四個檔案上傳（`douyin.js` 是新檔案，其他三個是取代舊的）
2. Render 會偵測到 repo 有更新，自動重新建置部署
   （這次因為要多裝 Chromium，建置時間會明顯變長，可能 5-10 分鐘）
3. 建置完成後流程同上面「第一次使用流程」
