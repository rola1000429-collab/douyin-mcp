import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------
// 簡單的持久化儲存：存放「手機那端截圖 → OCR → 上傳」的最新一筆文字。
// 用一個 JSON 檔存在磁碟上（跟 douyin.js 的 browser-profile 同一個
// data 目錄邏輯），Render 免費方案硬碟是暫時性的，服務重啟後可能會
// 不見，但這個功能本來就只需要「最新一筆」，重啟後空的也沒關係，
// 手機那邊下次截圖又會補上新的一筆。
// ---------------------------------------------------------------

const STORE_FILE = path.join(process.cwd(), "data", "latest-screenshot.json");

function ensureDir() {
  fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
}

/** 手機捷徑 OCR 完文字後呼叫這個，存起來 */
export function saveScreenshotText(text) {
  ensureDir();
  const record = {
    text,
    receivedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STORE_FILE, JSON.stringify(record, null, 2), "utf-8");
  return record;
}

/** AI 呼叫 MCP tool 時讀這個，拿最新一筆。還沒有任何上傳紀錄就回傳 null */
export function getLatestScreenshot() {
  try {
    const raw = fs.readFileSync(STORE_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
