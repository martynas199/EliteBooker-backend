import dotenv from "dotenv";
dotenv.config();
import WebSocket from "ws";

const MCP_URL = process.env.MCP_URL || "ws://127.0.0.1:3845/mcp";
const TOKEN = process.env.FIGMA_MCP_TOKEN || process.env.FIGMA_TOKEN || "";
const AUTH_MODES = (process.env.MCP_AUTH_MODES || "authorization,x-figma-token").split(",").map(s=>s.trim());
const SUBPROTOCOLS = (process.env.MCP_WS_PROTOCOLS || "jsonrpc,mcp").split(",").map(s=>s.trim());

function buildHeaders(mode){
  const h = { "X-ModelContext-Protocol-Version": "2024-09-18" };
  if(TOKEN){
    if(mode === "x-figma-token") h["X-Figma-Token"] = TOKEN;
    else h["Authorization"] = `Bearer ${TOKEN}`;
  }
  return h;
}

const mode = AUTH_MODES[0];
const headers = buildHeaders(mode);
const protocols = SUBPROTOCOLS;

console.log(`Connecting to ${MCP_URL} with headers: ${Object.keys(headers).join(", ") || "<none>"} and subprotocols: ${protocols.join(", ")}`);

const ws = new WebSocket(MCP_URL, protocols, { headers });

function send(obj){ ws.send(JSON.stringify(obj)); }

ws.on("open", () => {
  console.log("WS open");
  // initialize
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      clientInfo: { name: "codex-cli", version: "0.1.0" },
      capabilities: {},
      protocolVersion: "2024-09-18",
    },
  });
});

let initialized = false;

ws.on("message", (data) => {
  try{
    const msg = JSON.parse(data.toString());
    console.log("<-", JSON.stringify(msg));
    if(!initialized && (msg.result || msg.error) && msg.id === 1){
      initialized = true;
      // list tools
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    } else if(msg.id === 2) {
      // done
      console.log("Tools listed. Closing.");
      ws.close();
    }
  }catch(e){ console.log("(non-JSON message)", data.toString()); }
});

ws.on("error", (err) => {
  console.error("WS error:", err.message);
});

ws.on("close", (code, reason) => {
  console.log("WS closed", code, reason?.toString());
});
