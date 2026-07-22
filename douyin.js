import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";

// -----------------------------------------------------------------
// 這個模組負責：
// 1. 啟動一個「持久化」瀏覽器 context（cookie/登入狀態會存在硬碟上）
// 2. 打開抖音網頁版
// 3. 提供讀取「目前畫面上影片」、上下滑動、按讚等操作
//
// v2.1 更新：
// 根據實際部署後 get_page_debug 抓到的畫面文字（douyin.com/jingxuan
// 精選頁）發現，這個頁面是「卡片列表」而不是單支影片全螢幕播放，
// 而且沒有原本猜測的 data-e2e 屬性或 class（.author-name 等都不存在），
// 所以原本用 DOM selector 抓 author/title/likes 的方式一律抓到 null。
//
// 實際畫面的純文字內容（page.innerText("body")）是這樣排列的，
// 每一支影片卡片對應五行、循環出現：
//   {時長 mm:ss}
//   {讚數，如 12.0万 或 2665}
//   {影片描述文字，通常帶 #hashtag}
//   @{作者}
//   ·{日期，如 4月28日 / 2天前}
// 下一支影片的「時長」緊接著上一支的「日期」出現。
//
// 所以改用文字規則（regex）去解析，而不是找不存在的 DOM selector。
// 抓到的第一個符合規則的區塊，視為「目前使用者所在的影片」。
// -----------------------------------------------------------------

const PROFILE_DIR = path.join(process.cwd(), "data", "browser-profile");
const DOUYIN_URL = "https://www.douyin.com";

// 一支影片卡片的文字規則：時長 \n 讚數 \n 描述 \n @作者 \n ·日期
// - 時長: 1~2 位數:2 位數，例如 03:37 / 14:38
// - 讚數: 數字，可能帶小數與「万」，例如 12.0万 / 2665
// - 描述: 該行不會是空行，且不會以 @ 開頭（避免誤吃到作者那行）
// - 作者: @ 後面到換行前的內容
// - 日期: · 後面（中間可能有/沒有空白）到換行前的內容
const VIDEO_BLOCK_RE =
  /(\d{1,2}:\d{2})\n([\d.]+万|\d+)\n([^\n@][^\n]*)\n@([^\n]+)\n·\s*([^\n]+)/;

/** 從整段畫面文字裡，解析出「第一支」影片卡片的資訊。
 *  抓不到就回傳 null，呼叫端會補上 null 欄位，
 *  之後如果這個規則又對不上新的畫面結構，
 *  用 getPageDebug() 印出的內容重新調整上面這個 regex 即可，
 *  外部的 get_current_video / scroll_next / scroll_prev 介面都不用變。 */
function extractVideoInfo(bodyText) {
  if (!bodyText) return null;

  const match = bodyText.match(VIDEO_BLOCK_RE);
  if (!match) return null;

  const [, duration, likes, title, author, date] = match;
  return {
    author: author.trim(),
    title: title.trim(),
    likes: likes.trim(),
    duration: duration.trim(),
    date: date.trim(),
  };
}

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

/** 讀取目前畫面上第一支影片卡片的資訊（作者、描述、讚數、時長、日期）。
 *  改用整頁文字 + regex 解析，不再依賴不存在的 DOM selector。 */
export async function getCurrentVideo() {
  await ensureBrowser();

  const bodyText = await page.innerText("body").catch(() => "");
  const video = extractVideoInfo(bodyText);

  return {
    author: video?.author ?? null,
    title: video?.title ?? null,
    likes: video?.likes ?? null,
    duration: video?.duration ?? null,
    date: video?.date ?? null,
    pageTitle: await page.title(),
  };
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

/** 除錯用：把目前畫面的文字內容印出一部分，方便對照調整 regex */
export async function getPageDebug() {
  await ensureBrowser();
  const text = await page.innerText("body").catch((e) => `讀取失敗: ${e.message}`);
  return {
    url: page.url(),
    title: await page.title(),
    bodyTextPreview: text.slice(0, 1500),
  };
}
