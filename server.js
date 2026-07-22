import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ---------------------------------------------------------------
// 這裡先放「假資料」版本的 tools，目的是先確認：
// Kelivo -> 這個 server 的連線、tool 呼叫流程能跑通。
// 之後要接抖音時，把 getCurrentVideo() / scrollNext() 內部邏輯
// 換成真正的 Playwright 操作即可，tool 的介面不用變。
// ---------------------------------------------------------------

function createMcpServer() {
  const server = new McpServer({
    name: "douyin-mcp",
    version: "0.1.0",
  });

  // 假資料：目前畫面上的影片
  let mockIndex = 0;
  const mockFeed = [
    { author: "旅行的貓", title: "京都晚秋的小巷", likes: 12000, tags: ["旅行", "京都"] },
    { author: "煮飯阿姨", title: "10分鐘家常滷肉飯", likes: 34000, tags: ["料理", "家常菜"] },
    { author: "健身狂", title: "在家徒手訓練菜單", likes: 8900, tags: ["健身", "居家運動"] },
  ];

  server.tool(
    "get_current_video",
    "取得目前抖音畫面上正在播放的影片資訊（作者、標題、讚數、標籤）",
    {},
    async () => {
      const video = mockFeed[mockIndex];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(video, null, 2),
          },
        ],
      };
    }
  );

  server.tool(
    "scroll_next",
    "模擬往下滑到下一支抖音影片",
    {},
    async () => {
      mockIndex = (mockIndex + 1) % mockFeed.length;
      const video = mockFeed[mockIndex];
      return {
        content: [
          {
            type: "text",
            text: `已滑到下一支影片:\n${JSON.stringify(video, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "scroll_prev",
    "模擬往上滑回上一支抖音影片",
    {},
    async () => {
      mockIndex = (mockIndex - 1 + mockFeed.length) % mockFeed.length;
      const video = mockFeed[mockIndex];
      return {
        content: [
          {
            type: "text",
            text: `已回到上一支影片:\n${JSON.stringify(video, null, 2)}`,
          },
        ],
      };
    }
  );

  server.tool(
    "like_video",
    "對目前這支影片按讚（假資料版本，之後接真的 Playwright 操作）",
    { confirm: z.boolean().describe("是否確認要按讚") },
    async ({ confirm }) => {
      if (!confirm) {
        return { content: [{ type: "text", text: "未確認，取消按讚" }] };
      }
      const video = mockFeed[mockIndex];
      return {
        content: [
          { type: "text", text: `已幫「${video.title}」按讚 (假資料，尚未接上真實抖音)` },
        ],
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
