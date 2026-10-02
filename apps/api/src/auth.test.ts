import bcrypt from "bcryptjs";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./lib/prisma.js", () => ({
  prisma: { user: { create: vi.fn(), findUnique: vi.fn() } },
}));

import { createApp } from "./app.js";
import { prisma } from "./lib/prisma.js";

const app = createApp();
const userCreate = vi.mocked(prisma.user.create);
const userFind = vi.mocked(prisma.user.findUnique);

const fakeUser = {
  id: "user-1",
  shopId: "shop-1",
  name: "Lan",
  email: "lan@example.com",
  passwordHash: bcrypt.hashSync("password123", 4),
  role: "OWNER",
  shop: { id: "shop-1", name: "Shop Lan" },
};

const validRegister = {
  shopName: "Shop Lan",
  name: "Lan",
  email: "lan@example.com",
  password: "password123",
};

function cookieHeader(res: request.Response): string {
  return ((res.headers["set-cookie"] as unknown as string[] | undefined) ?? []).join(";");
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /auth/register", () => {
  it("rejects invalid input with 400", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ ...validRegister, password: "123" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("creates the account and sets an httpOnly cookie", async () => {
    userCreate.mockResolvedValue(fakeUser as never);
    const res = await request(app).post("/auth/register").send(validRegister);
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ id: "user-1", role: "OWNER", shopName: "Shop Lan" });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(cookieHeader(res)).toContain("HttpOnly");
  });

  it("returns 409 when the email is already used", async () => {
    userCreate.mockRejectedValue({ code: "P2002" });
    const res = await request(app).post("/auth/register").send(validRegister);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });
});

describe("POST /auth/login", () => {
  it("logs in with correct credentials", async () => {
    userFind.mockResolvedValue(fakeUser as never);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "lan@example.com", password: "password123" });
    expect(res.status).toBe(200);
    expect(cookieHeader(res)).toContain("token=");
  });

  it("returns 401 for a wrong password", async () => {
    userFind.mockResolvedValue(fakeUser as never);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "lan@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("returns the same 401 for an unknown email", async () => {
    userFind.mockResolvedValue(null);
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody@example.com", password: "password123" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /auth/me and POST /auth/logout", () => {
  it("returns 401 without a cookie", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("returns the current user after login, and 401 after logout", async () => {
    userFind.mockResolvedValue(fakeUser as never);
    const agent = request.agent(app);

    await agent.post("/auth/login").send({ email: "lan@example.com", password: "password123" });

    const me = await agent.get("/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("lan@example.com");

    const out = await agent.post("/auth/logout");
    expect(out.status).toBe(204);

    const after = await agent.get("/auth/me");
    expect(after.status).toBe(401);
  });
});
