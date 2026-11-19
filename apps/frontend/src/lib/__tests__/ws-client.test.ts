import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WsClient } from "../ws-client";
class FakeSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeSocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  sent: string[] = [];
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  send(value: string): void {
    this.sent.push(value);
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.();
  }
  receive(value: unknown): void {
    this.onmessage?.({ data: JSON.stringify(value) });
  }
}
beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const socket = (): FakeSocket => FakeSocket.instances.at(-1)!;
describe("WebSocket lifecycle", () => {
  it("avoids duplicate sockets while connecting", () => {
    const client = new WsClient({ url: "ws://localhost/ws" });
    client.connect();
    client.connect();
    expect(FakeSocket.instances).toHaveLength(1);
    client.close();
  });
  it("correlates replies and ignores unrelated ids", async () => {
    const client = new WsClient({ url: "ws://localhost/ws" });
    client.connect();
    socket().open();
    const response = client.execute("pwd");
    const sent = JSON.parse(socket().sent[0]!);
    socket().receive({
      type: "cmd_response",
      id: "wrong",
      payload: { output: "wrong", cwd: "/", exitCode: 0 },
    });
    socket().receive({
      type: "cmd_response",
      id: sent.id,
      payload: { output: "/home/guest", cwd: "/home/guest", exitCode: 0 },
    });
    await expect(response).resolves.toMatchObject({ output: "/home/guest" });
    client.close();
  });
  it("rejects pending commands on disconnect without replaying them", async () => {
    const client = new WsClient({ url: "ws://localhost/ws" });
    client.connect();
    socket().open();
    const response = expect(client.execute("pwd")).rejects.toThrow(
      "no se reenvió",
    );
    socket().close();
    await response;
    vi.advanceTimersByTime(1000);
    socket().open();
    expect(socket().sent).toEqual([]);
    client.close();
  });
  it("cancels reconnect timers and late callbacks after manual close", () => {
    const client = new WsClient({ url: "ws://localhost/ws" });
    client.connect();
    const lateOpen = socket().onopen;
    socket().close();
    client.close();
    lateOpen?.();
    vi.advanceTimersByTime(60_000);
    expect(client.getStatus()).toBe("closed");
    expect(FakeSocket.instances).toHaveLength(1);
  });
  it("rejects commands when offline", async () => {
    const client = new WsClient({ url: "ws://localhost/ws" });
    await expect(client.execute("pwd")).rejects.toThrow("sin conexión");
    expect(client.send("ping", null)).toBe(false);
  });
  it("times out a lost response", async () => {
    const client = new WsClient({ url: "ws://localhost/ws" });
    client.connect();
    socket().open();
    const response = expect(client.execute("pwd")).rejects.toThrow(
      "tiempo de espera",
    );
    await vi.advanceTimersByTimeAsync(10_000);
    await response;
    client.close();
  });
  it("reports invalid remote messages without throwing", () => {
    const client = new WsClient({ url: "ws://localhost/ws" });
    const error = vi.fn();
    client.on("error", error);
    client.connect();
    socket().open();
    socket().receive(null);
    expect(error).toHaveBeenCalledTimes(1);
    client.close();
  });
});
