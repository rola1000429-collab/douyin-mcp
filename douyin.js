import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

// -----------------------------------------------------------------
// 這個模組負責：
// 1. 啟動一個「持久化」瀏覽器 context（cookie/登入狀態會存在硬碟上）
// 2. 打開抖音網頁版
// 3. 提供讀取「目前畫面上影片」、上下滑動、按讚等操作
//
// 重要提醒：因為開發時無法即時連線到真正的抖音網頁版做對照，
// 下面讀取影片資訊的選擇器（selector）是「盡力猜測」的版本，
// 部署後如果讀不到正確資訊，用 getPageDebug() 這個除錯工具
// 把畫面文字內容印出來，再回頭調整 extractVideoInfo() 裡的邏輯。
// -----------------------------------------------------------------

const PROFILE_DIR = path.join(process.cwd(), "data", "browser-profile");
const DOUYIN_URL = "https://www.douyin.com";

let context = null;
let page = null;

async function ensureBrowser() {
  if (context && page && !page.isClosed()) return;

  fs.mkdirSync(PROFILE_DIR, { recursive: true });

  context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  });

  page = context.pages()[0] || (await context.newPage());
  await page.goto(DOUYIN_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
}

/** 判斷目前是否已登入。用「有沒有出現登入/掃碼相關文字」粗略判斷，
 *  之後如果誤判，可以用 getPageDebug() 觀察實際畫面文字再調整關鍵字。 */
export async function getLoginStatus() {
  await ensureBrowser();
  const bodyText = await page.innerText("body").catch(() => "");
  const looksLoggedOut = /扫码登录|手机号登录|登录抖音|扫码登陆/.test(bodyText);
  return {
    loggedIn: !looksLoggedOut,
    url: page.url(),
  };
}

/** 截圖目前畫面（通常用來讓使用者掃 QR code 登入），回傳 base64 PNG */
export async function getLoginQrScreenshot() {
  await ensureBrowser();
  const buffer = await page.screenshot({ type: "png" });
  return buffer.toString("base64");
}

/** 嘗試從畫面上擷取目前影片的資訊。
 *  這裡先抓「畫面可見範圍內」的文字內容，回傳一段精簡過的摘要，
 *  等實際部署後看抓到的內容準不準，再改成更精確的 DOM selector。 */
export async function getCurrentVideo() {
  await ensureBrowser();

  const info = await page.evaluate(() => {
    function firstVisibleText(selectors) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText && el.innerText.trim()) {
          return el.innerText.trim();
        }
      }
      return null;
    }

    // 這些 class/selector 是常見命名的猜測，之後要對照真實畫面調整
    const author = firstVisibleText([
      '[data-e2e="video-author-name"]',
      ".author-name",
      "a[href*='/user/']",
    ]);
    const title = firstVisibleText([
      '[data-e2e="video-desc"]',
      ".video-desc",
      ".desc",
    ]);
    const likes = firstVisibleText([
      '[data-e2e="like-count"]',
      ".like-count",
    ]);

    return { author, title, likes, pageTitle: document.title };
  });

  return info;
}

/** 往下滑到下一支影片：抖音網頁版通常支援方向鍵 */
export async function scrollNext() {
  await ensureBrowser();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(1200);
  return getCurrentVideo();
}

export async function scrollPrev() {
  await ensureBrowser();
  await page.keyboard.press("ArrowUp");
  await page.waitForTimeout(1200);
  return getCurrentVideo();
}

/** 除錯用：把目前畫面的文字內容印出一部分，方便對照調整 selector */
export async function getPageDebug() {
  await ensureBrowser();
  const text = await page.innerText("body").catch((e) => `讀取失敗: ${e.message}`);
  return {
    url: page.url(),
    title: await page.title(),
    bodyTextPreview: text.slice(0, 1500),
  };
}
