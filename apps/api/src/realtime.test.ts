import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { env } from "./config/env.js";
import { signToken } from "./lib/token.js";
import {
  attachRealtime,
  closeRealtime,
  emitConversationChanged,
  parseCookies,
} from "./realtime.js";

const cookieFor = (shopId: string) =>
  `token=${signToken({ userId: "user-1", shopId, role: "OWNER" })}`;

let url = "";
const sockets: Socket[] = [];

function connectAs(options: { cookie?: string; origin?: string } = {}): Socket {
  const socket = connect(url, {
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
    extraHeaders: {
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
    },
  });
  sockets.push(socket);
  return socket;
}

function waitFor(socket: Socket, event: string, timeoutMs = 2000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}"`)),
      timeoutMs,
    );
    socket.once(event, (payload: unknown) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function expectSilence(socket: Socket, event: string, durationMs = 250): Promise<void> {
  return new Promise((resolve, reject) => {
    const handler = () => reject(new Error(`Unexpected "${event}" event`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, durationMs);
  });
}

beforeAll(async () => {
  const httpServer = createServer();
  attachRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  url = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const socket of sockets.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await closeRealtime();
});

describe("parseCookies", () => {
  it("parses several cookies and decodes values", () => {
    expect(parseCookies("a=1; token=abc.def; b=hello%20world")).toEqual({
      a: "1",
      token: "abc.def",
      b: "hello world",
    });
  });

  it("returns an empty object for a missing header", () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies("")).toEqual({});
  });

  it("keeps the raw value when decoding fails and ignores parts without a value", () => {
    expect(parseCookies("bad=%E0%A4%A; novalue; =x")).toEqual({ bad: "%E0%A4%A" });
  });

  it("keeps equal signs inside the value", () => {
    expect(parseCookies("t=a=b")).toEqual({ t: "a=b" });
  });
});

describe("connection rules", () => {
  it("accepts a client with a valid login cookie", async () => {
    const socket = connectAs({ cookie: cookieFor("shop-1") });
    await waitFor(socket, "connect");
    expect(socket.connected).toBe(true);
  });

  it("accepts the dashboard origin", async () => {
    const socket = connectAs({ cookie: cookieFor("shop-1"), origin: env.CORS_ORIGIN });
    await waitFor(socket, "connect");
    expect(socket.connected).toBe(true);
  });

  it("rejects a client without a cookie", async () => {
    const socket = connectAs();
    await waitFor(socket, "connect_error");
    expect(socket.connected).toBe(false);
  });

  it("rejects a client with an invalid token", async () => {
    const socket = connectAs({ cookie: "token=not-a-real-token" });
    await waitFor(socket, "connect_error");
    expect(socket.connected).toBe(false);
  });

  it("rejects a foreign origin even with a valid cookie", async () => {
    const socket = connectAs({
      cookie: cookieFor("shop-1"),
      origin: "https://evil.example.com",
    });
    await waitFor(socket, "connect_error");
    expect(socket.connected).toBe(false);
  });
});

describe("shop isolation", () => {
  it("delivers an event to clients of the same shop only", async () => {
    const inShop1 = connectAs({ cookie: cookieFor("shop-1") });
    const inShop2 = connectAs({ cookie: cookieFor("shop-2") });
    await Promise.all([waitFor(inShop1, "connect"), waitFor(inShop2, "connect")]);

    const received = waitFor(inShop1, "conversation:changed");
    const silent = expectSilence(inShop2, "conversation:changed");

    emitConversationChanged("shop-1", "cv1");

    expect(await received).toEqual({ conversationId: "cv1" });
    await silent;
  });

  it("cannot be talked into another shop's room by the client", async () => {
    const socket = connectAs({ cookie: cookieFor("shop-1") });
    await waitFor(socket, "connect");

    socket.emit("join", "shop:shop-2");
    socket.emit("join", { room: "shop:shop-2" });
    const silent = expectSilence(socket, "conversation:changed");

    emitConversationChanged("shop-2", "cv9");

    await silent;
  });

  it("only sends the conversation id, never message content", async () => {
    const socket = connectAs({ cookie: cookieFor("shop-1") });
    await waitFor(socket, "connect");

    const received = waitFor(socket, "conversation:changed");
    emitConversationChanged("shop-1", "cv1");

    expect(Object.keys((await received) as object)).toEqual(["conversationId"]);
  });
});

describe("without a running server", () => {
  it("emitting is a harmless no-op", async () => {
    vi.resetModules();
    const fresh = await import("./realtime.js");
    expect(() => fresh.emitConversationChanged("shop-1", "cv1")).not.toThrow();
  });
});
