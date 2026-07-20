import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { createApp } from "../src/app.js";
import { createDb } from "../src/db/client.js";

let app: Express;

beforeEach(() => {
  const db = createDb(":memory:");
  app = createApp(db);
});

describe("GET /healthz", () => {
  it("returns 200 ok", async () => {
    const res = await request(app).get("/healthz");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/todos", () => {
  it("returns an empty list initially", async () => {
    const res = await request(app).get("/api/todos");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe("POST /api/todos", () => {
  it("creates a todo and returns it", async () => {
    const res = await request(app)
      .post("/api/todos")
      .send({ title: "Write the report" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ title: "Write the report", done: false });
    expect(typeof res.body.id).toBe("number");
  });

  it("rejects an empty title with 400", async () => {
    const res = await request(app).post("/api/todos").send({ title: "   " });
    expect(res.status).toBe(400);
  });

  it("rejects a missing title with 400", async () => {
    const res = await request(app).post("/api/todos").send({});
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/todos/:id", () => {
  it("toggles done to true", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Toggle me" });
    const res = await request(app)
      .patch(`/api/todos/${created.body.id}`)
      .send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
  });

  it("returns 404 for a nonexistent id", async () => {
    const res = await request(app).patch("/api/todos/999999").send({ done: true });
    expect(res.status).toBe(404);
  });

  it("rejects a non-boolean done with 400", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Bad patch" });
    const res = await request(app)
      .patch(`/api/todos/${created.body.id}`)
      .send({ done: "yes" });
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/todos/:id", () => {
  it("deletes an existing todo", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Delete me" });
    const res = await request(app).delete(`/api/todos/${created.body.id}`);
    expect(res.status).toBe(204);

    const list = await request(app).get("/api/todos");
    expect(list.body).toEqual([]);
  });

  it("returns 404 for a nonexistent id", async () => {
    const res = await request(app).delete("/api/todos/999999");
    expect(res.status).toBe(404);
  });
});
