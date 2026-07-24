import type { WsMessage } from '../types';

type MessageHandler = (msg: WsMessage) => void;
type ConnectionState = 'disconnected' | 'connecting' | 'connected';

const WS_URL = import.meta.env.VITE_WS_URL || `ws://${window.location.hostname}:8001/ws`;
const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000, 30000];

class WsClient {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<MessageHandler>>();
  private state: ConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stateListeners = new Set<(s: ConnectionState) => void>();

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.setState('connecting');
    try {
      this.ws = new WebSocket(WS_URL);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws.onopen = () => {
      this.setState('connected');
      this.reconnectAttempt = 0;
    };
    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        this.dispatch(msg);
      } catch { /* 忽略解析失败 */ }
    };
    this.ws.onclose = () => {
      this.setState('disconnected');
      this.ws = null;
      this.scheduleReconnect();
    };
    this.ws.onerror = () => { /* onclose 会紧随 */ };
  }

  disconnect() {
    this.cancelReconnect();
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
    this.setState('disconnected');
  }

  send(msg: WsMessage) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] 未连接，无法发送:', msg.type);
    }
  }

  on(type: string, handler: MessageHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => { this.handlers.get(type)?.delete(handler); };
  }

  onStateChange(listener: (s: ConnectionState) => void): () => void {
    this.stateListeners.add(listener);
    listener(this.state);
    return () => { this.stateListeners.delete(listener); };
  }

  getState(): ConnectionState { return this.state; }

  private setState(s: ConnectionState) {
    if (this.state === s) return;
    this.state = s;
    this.stateListeners.forEach(fn => fn(s));
  }

  private dispatch(msg: WsMessage) {
    this.handlers.get(msg.type)?.forEach(fn => fn(msg));
    this.handlers.get('*')?.forEach(fn => fn(msg));
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)];
    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => { this.reconnectTimer = null; this.connect(); }, delay);
  }

  private cancelReconnect() {
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
  }
}

export const wsClient = new WsClient();
