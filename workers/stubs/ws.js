// WebSocket server is not started by the Worker bridge.
export class WebSocketServer {
  constructor() {
    this.clients = new Set()
  }

  on() {}
}