import WebSocket from "ws";
import type { ClientAPI } from "./pterodactyl.js";

// ── Types ───────────────────────────────────────────────────────────

export interface ConsoleEntry {
  timestamp: number;
  type: "output" | "install" | "status" | "stats" | "daemon";
  line: string;
}

export interface ConnectionInfo {
  serverId: string;
  serverStatus: string;
  connectedAt: number;
  lastActivity: number;
  historySize: number;
  tokenExpiresApprox: number;
}

interface WSMessage {
  event: string;
  args?: string[];
}

// ── WebSocket Connection ────────────────────────────────────────────

class ServerWebSocket {
  private ws: WebSocket | null = null;
  private history: ConsoleEntry[] = [];
  private maxHistory: number;
  private status = "unknown";
  private connectedAt = 0;
  private lastActivity = 0;
  private tokenRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnecting = false;

  constructor(
    private serverId: string,
    private clientApi: ClientAPI,
    private panelOrigin: string,
    maxHistory = 2000,
  ) {
    this.maxHistory = maxHistory;
  }

  async connect(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      throw new Error(`Already connected to server ${this.serverId}`);
    }

    const creds = await this.clientApi.getWebSocket(this.serverId);
    // Handle both fractal format { attributes: { token, socket } }
    // and raw data format { data: { token, socket } }
    const attrs = creds.attributes ?? (creds as any).data ?? creds;
    const { token, socket } = attrs;

    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(socket, {
        origin: this.panelOrigin,
      });
      let authed = false;

      const timeout = setTimeout(() => {
        if (!authed) {
          ws.close();
          reject(new Error("WebSocket auth timeout (10s)"));
        }
      }, 10_000);

      ws.on("open", () => {
        ws.send(JSON.stringify({ event: "auth", args: [token] }));
      });

      ws.on("message", (raw) => {
        let msg: WSMessage;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          return;
        }

        this.lastActivity = Date.now();

        switch (msg.event) {
          case "auth success":
            if (!authed) {
              authed = true;
              clearTimeout(timeout);
              this.ws = ws;
              this.connectedAt = Date.now();
              // Request log and stats streams from Wings
              ws.send(JSON.stringify({ event: "send logs", args: [null] }));
              ws.send(JSON.stringify({ event: "send stats", args: [null] }));
              this.scheduleTokenRefresh();
              resolve();
            }
            break;

          case "console output":
            this.push("output", msg.args?.[0] ?? "");
            break;

          case "install output":
            this.push("install", msg.args?.[0] ?? "");
            break;

          case "status":
            this.status = msg.args?.[0] ?? "unknown";
            this.push("status", this.status);
            break;

          case "stats":
            this.push("stats", msg.args?.[0] ?? "");
            break;

          case "daemon message":
            this.push("daemon", msg.args?.[0] ?? "");
            break;

          case "token expiring":
            this.refreshToken();
            break;

          case "jwt error":
            this.refreshToken();
            break;
        }
      });

      ws.on("error", (err) => {
        if (!authed) {
          clearTimeout(timeout);
          reject(err);
        }
      });

      ws.on("close", () => {
        this.cleanup();
      });
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
  }

  private cleanup(): void {
    this.ws = null;
    if (this.tokenRefreshTimer) {
      clearTimeout(this.tokenRefreshTimer);
      this.tokenRefreshTimer = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  getInfo(): ConnectionInfo {
    return {
      serverId: this.serverId,
      serverStatus: this.status,
      connectedAt: this.connectedAt,
      lastActivity: this.lastActivity,
      historySize: this.history.length,
      tokenExpiresApprox: this.connectedAt + 10 * 60 * 1000,
    };
  }

  getHistory(opts?: {
    lines?: number;
    since?: number;
    type?: ConsoleEntry["type"];
  }): ConsoleEntry[] {
    let entries = this.history;

    if (opts?.type) {
      entries = entries.filter((e) => e.type === opts.type);
    }
    if (opts?.since) {
      const since = opts.since;
      entries = entries.filter((e) => e.timestamp >= since);
    }
    if (opts?.lines) {
      entries = entries.slice(-opts.lines);
    }

    return entries;
  }

  clearHistory(): number {
    const count = this.history.length;
    this.history = [];
    return count;
  }

  sendCommand(command: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Not connected to server ${this.serverId}`);
    }
    this.ws.send(JSON.stringify({ event: "send command", args: [command] }));
  }

  sendPower(signal: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Not connected to server ${this.serverId}`);
    }
    this.ws.send(JSON.stringify({ event: "set state", args: [signal] }));
  }

  private push(type: ConsoleEntry["type"], line: string): void {
    this.history.push({ timestamp: Date.now(), type, line });
    if (this.history.length > this.maxHistory) {
      this.history.splice(0, this.history.length - this.maxHistory);
    }
  }

  private scheduleTokenRefresh(): void {
    // Refresh at 8 minutes to stay ahead of the 10-minute expiry
    this.tokenRefreshTimer = setTimeout(() => this.refreshToken(), 8 * 60 * 1000);
  }

  private async refreshToken(): Promise<void> {
    if (this.reconnecting || !this.ws) return;
    this.reconnecting = true;

    try {
      const creds = await this.clientApi.getWebSocket(this.serverId);
      const attrs = creds.attributes ?? (creds as any).data ?? creds;
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(
          JSON.stringify({ event: "auth", args: [attrs.token] }),
        );
        if (this.tokenRefreshTimer) clearTimeout(this.tokenRefreshTimer);
        this.scheduleTokenRefresh();
      }
    } catch {
      // If refresh fails, the connection will eventually close via jwt error
    } finally {
      this.reconnecting = false;
    }
  }
}

// ── WebSocket Manager ───────────────────────────────────────────────

export class WebSocketManager {
  private connections = new Map<string, ServerWebSocket>();

  constructor(
    private clientApi: ClientAPI,
    private panelOrigin: string,
  ) {}

  async connect(serverId: string, maxHistory = 2000): Promise<void> {
    if (this.connections.has(serverId)) {
      const existing = this.connections.get(serverId)!;
      if (existing.isConnected()) {
        throw new Error(`Already connected to server ${serverId}`);
      }
      // Stale connection — remove it
      existing.disconnect();
      this.connections.delete(serverId);
    }

    const conn = new ServerWebSocket(serverId, this.clientApi, this.panelOrigin, maxHistory);
    await conn.connect();
    this.connections.set(serverId, conn);
  }

  disconnect(serverId: string): void {
    const conn = this.connections.get(serverId);
    if (!conn) {
      throw new Error(`No connection to server ${serverId}`);
    }
    conn.disconnect();
    this.connections.delete(serverId);
  }

  disconnectAll(): number {
    let count = 0;
    for (const [id, conn] of this.connections) {
      conn.disconnect();
      this.connections.delete(id);
      count++;
    }
    return count;
  }

  getConnection(serverId: string): ServerWebSocket {
    const conn = this.connections.get(serverId);
    if (!conn || !conn.isConnected()) {
      throw new Error(
        `No active WebSocket connection to server ${serverId}. Use websocket_connect first.`,
      );
    }
    return conn;
  }

  listConnections(): ConnectionInfo[] {
    const result: ConnectionInfo[] = [];
    for (const conn of this.connections.values()) {
      if (conn.isConnected()) {
        result.push(conn.getInfo());
      }
    }
    return result;
  }
}
