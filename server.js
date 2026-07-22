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

// ---------------------------------------------------------------
// v2：接上真正的抖音網頁版（Playwright），不再是假資料。
// 第一次使用流程：
// 1. 呼叫 get_login_status 確認是否已登入
// 2. 若未登入，呼叫 get_login_qr 取得 QR code 截圖，用手機抖音 App 掃碼
// 3. 登入後再呼叫 get_login_status 確認，之後就能用 get_current_video 等工具
//
// 如果 get_current_video 抓到的內容看起來不準，呼叫 get_page_debug
// 把畫面文字內容印出來，回報給開發者調整讀取邏輯。
// ---------------------------------------------------------------

function createMcpServer() {
  const server = new McpServer({
    name: "douyin-mcp",
    version: "0.2.0",
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

  return server;
}

const app = express();
app.use(express.json());

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
});
