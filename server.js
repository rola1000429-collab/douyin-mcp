import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import {
  getLoginStatus,
  getLoginQrScreenshot,
  getCurrentVideo,
  scrollNext,
  scrollPrev,
  getPageDebug,
} from "./douyin.js";
import { saveScreenshot, getLatestScreenshot } from "./screenshotStore.js";

// ---------------------------------------------------------------
// v3：改为接收「图片」而不是文字
// 手机端：截图 → base64 → POST 图片
// 后端：保存图片 → MCP tool 返回图片给 Claude
// Claude：直接看图片识图，不需要先 OCR
// ---------------------------------------------------------------

const INGEST_TOKEN = process.env.INGEST_TOKEN || "";

function createMcpServer() {
  const server = new McpServer({
    name: "douyin-mcp",
    version: "0.3.0",
  });

  server.tool(
    "get_login_status",
    "檢查目前抖音網頁版是否已登入",
    {},
    async () => {
      const status = await getLoginStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
      };
    }
  );

  server.tool(
    "get_login_qr",
    "取得目前畫面截圖（通常畫面上會有登入用的 QR code），用手機抖音 App 掃描即可登入",
    {},
    async () => {
      const base64 = await getLoginQrScreenshot();
      return {
        content: [
          { type: "image", data: base64, mimeType: "image/png" },
          { type: "text", text: "請用手機抖音 App 掃描這張截圖裡的 QR code 完成登入" },
        ],
      };
    }
  );

  server.tool(
    "get_current_video",
    "取得目前抖音網頁版畫面上正在播放的影片資訊（作者、標題、讚數）",
    {},
    async () => {
      const video = await getCurrentVideo();
      return {
        content: [{ type: "text", text: JSON.stringify(video, null, 2) }],
      };
    }
  );

  server.tool(
    "scroll_next",
    "往下滑到下一支抖音影片，並回傳新影片資訊",
    {},
    async () => {
      const video = await scrollNext();
      return {
        content: [{ type: "text", text: JSON.stringify(video, null, 2) }],
      };
    }
  );

  server.tool(
    "scroll_prev",
    "往上滑回上一支抖音影片，並回傳新影片資訊",
    {},
    async () => {
      const video = await scrollPrev();
      return {
        content: [{ type: "text", text: JSON.stringify(video, null, 2) }],
      };
    }
  );

  server.tool(
    "get_page_debug",
    "除錯用：印出目前頁面網址、標題、畫面文字內容片段，用來確認讀取邏輯抓得準不準",
    {},
    async () => {
      const debug = await getPageDebug();
      return {
        content: [{ type: "text", text: JSON.stringify(debug, null, 2) }],
      };
    }
  );

  server.tool(
    "get_latest_screenshot",
    "取得使用者手機上最近一次截圖上傳的「圖片」（可以直接看，不是文字）。" +
      "回傳的是圖片本身，Claude 會直接進行視覺識別、分析你在看什麼影片。" +
      "如果從來沒有上傳過會回傳 null，代表使用者還沒用手機截圖過。",
    {},
    async () => {
      const record = getLatestScreenshot();
      
      if (!record) {
        return {
          content: [{ type: "text", text: "還沒有上傳過任何截圖" }],
        };
      }
      
      // 直接回傳圖片給 Claude（base64 格式），Claude 會做視覺識別
      return {
        content: [
          { 
            type: "image", 
            data: record.base64, 
            mimeType: "image/png" 
          },
          { 
            type: "text", 
            text: `上傳時間：${record.receivedAt}` 
          },
        ],
      };
    }
  );

  return server;
}

const app = express();
app.use(express.json({ limit: "50mb" })); // 允許大的 base64 圖片

// 手機端 iOS 捷徑：螢幕截圖 → base64 → POST 這裡
// 改為接收「image」字段（base64），而不是「text」
app.post("/ingest/screenshot", (req, res) => {
  console.log("[ingest] 收到 POST 請求");
  console.log("[ingest] headers:", {
    contentType: req.headers["content-type"],
    hasToken: !!req.headers["x-ingest-token"],
  });

  if (INGEST_TOKEN && req.headers["x-ingest-token"] !== INGEST_TOKEN) {
    console.log("[ingest] ❌ token 驗證失敗", {
      expected: INGEST_TOKEN,
      received: req.headers["x-ingest-token"],
    });
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const { image } = req.body || {};
  if (!image || typeof image !== "string") {
    console.log("[ingest] ❌ image 缺失或格式錯誤", {
      imageType: typeof image,
      imageLength: image?.length,
    });
    res.status(400).json({ error: "missing image (base64 string)" });
    return;
  }

  try {
    const record = saveScreenshot(image);
    console.log("[ingest] ✅ 成功保存圖片", {
      filename: record.filename,
      size: image.length,
      receivedAt: record.receivedAt,
    });
    res.json({ 
      ok: true, 
      filename: record.filename,
      receivedAt: record.receivedAt 
    });
  } catch (err) {
    console.error("[ingest] ❌ 保存圖片失敗:", err.message);
    res.status(500).json({ error: "failed to save image" });
  }
});

// 用 session id 對應每個 client 連線自己的 transport / server 實例
const transports = {};

app.post("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  let transport;

  if (sessionId && transports[sessionId]) {
    transport = transports[sessionId];
  } else if (!sessionId && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (newSessionId) => {
        transports[newSessionId] = transport;
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) delete transports[transport.sessionId];
    };

    const server = createMcpServer();
    await server.connect(transport);
  } else {
    console.warn(
      `[mcp] 收到無效 session 請求 (sessionId=${sessionId ?? "none"})，` +
        `可能是 server 剛重啟、Kelivo 那邊還在用舊的連線，請在 Kelivo 開新對話再試一次`
    );
    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: no valid session" },
      id: null,
    });
    return;
  }

  await transport.handleRequest(req, res, req.body);
});

// GET/DELETE 用來處理 server-push 通知與關閉 session
const handleSessionRequest = async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  if (!sessionId || !transports[sessionId]) {
    res.status(400).send("Invalid or missing session ID");
    return;
  }
  await transports[sessionId].handleRequest(req, res);
};

app.get("/mcp", handleSessionRequest);
app.delete("/mcp", handleSessionRequest);

app.get("/", (req, res) => {
  res.send("douyin-mcp server is running. MCP endpoint: POST /mcp");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`douyin-mcp listening on port ${PORT}`);
  console.log(`INGEST_TOKEN 設定: ${INGEST_TOKEN ? "✅ 有設定" : "⚠️ 未設定"}`);
  console.log(`支持图片上传: ✅ POST /ingest/screenshot`);
});
