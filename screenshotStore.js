import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------
// 改进版：保存「图片」而不是文字
// 接收来自手机的截图 base64 → 保存到磁盘
// AI 用 MCP tool 读取时，直接返回图片给 Claude 识图
// ---------------------------------------------------------------

const STORE_DIR = path.join(process.cwd(), "data", "screenshots");
const METADATA_FILE = path.join(STORE_DIR, "latest.json");

function ensureDir() {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

/** 手机端上传图片的 base64 后调用这个，保存图片 */
export function saveScreenshot(imageBase64) {
  ensureDir();
  
  // 用时间戳作为文件名
  const timestamp = Date.now();
  const filename = `screenshot-${timestamp}.png`;
  const filepath = path.join(STORE_DIR, filename);
  
  // 把 base64 转成 Buffer 保存为 PNG 文件
  const buffer = Buffer.from(imageBase64, "base64");
  fs.writeFileSync(filepath, buffer);
  
  // 保存元数据（方便查询最新一张）
  const record = {
    filename,
    filepath: `/data/screenshots/${filename}`,
    base64: imageBase64, // 也保存 base64 以便直接返回给 AI
    receivedAt: new Date().toISOString(),
    timestamp,
  };
  
  fs.writeFileSync(METADATA_FILE, JSON.stringify(record, null, 2), "utf-8");
  
  return record;
}

/** AI 调用 MCP tool 时读这个，返回最新一张图片的 base64 */
export function getLatestScreenshot() {
  try {
    const raw = fs.readFileSync(METADATA_FILE, "utf-8");
    const record = JSON.parse(raw);
    return record; // 返回 {filename, base64, receivedAt, ...}
  } catch {
    return null; // 还没有上传过
  }
}

/** 获取所有截图文件列表（可选，用来查看历史） */
export function listScreenshots() {
  try {
    ensureDir();
    const files = fs.readdirSync(STORE_DIR).filter(f => f.startsWith("screenshot-"));
    return files.sort().reverse(); // 最新的在前
  } catch {
    return [];
  }
}
