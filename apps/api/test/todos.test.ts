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
    expect(res.status).toBe(999); // deliberately broken -- Phase 3 branch-protection test
    expect(res.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/todos", () => {
  it("returns an empty list initially", async () => {
    const res = await request(app).get("/api/todos");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("includes priority for every todo", async () => {
    await request(app).post("/api/todos").send({ title: "Has priority" });
    const res = await request(app).get("/api/todos");
    expect(res.status).toBe(200);
    expect(res.body[0]).toHaveProperty("priority");
  });

  it("filters the list by priority when ?priority= is provided", async () => {
    await request(app).post("/api/todos").send({ title: "Low one", priority: "low" });
    await request(app).post("/api/todos").send({ title: "High one", priority: "high" });
    await request(app).post("/api/todos").send({ title: "Another high", priority: "high" });

    const res = await request(app).get("/api/todos?priority=high");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const todo of res.body) {
      expect(todo.priority).toBe("high");
    }
  });

  it("returns the unfiltered list for an unrecognized priority query value", async () => {
    await request(app).post("/api/todos").send({ title: "Low one", priority: "low" });
    await request(app).post("/api/todos").send({ title: "High one", priority: "high" });

    const res = await request(app).get("/api/todos?priority=urgent");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
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

  it("defaults priority to medium when omitted", async () => {
    const res = await request(app)
      .post("/api/todos")
      .send({ title: "No priority given" });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe("medium");
  });

  it("accepts a valid priority value", async () => {
    const res = await request(app)
      .post("/api/todos")
      .send({ title: "High priority task", priority: "high" });
    expect(res.status).toBe(201);
    expect(res.body.priority).toBe("high");
  });

  it("rejects an invalid priority value with 400", async () => {
    const res = await request(app)
      .post("/api/todos")
      .send({ title: "Bad priority task", priority: "urgent" });
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("error");
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

  it("updates priority on an existing todo and reflects it in the response", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Reprioritize me" });
    expect(created.body.priority).toBe("medium");

    const res = await request(app)
      .patch(`/api/todos/${created.body.id}`)
      .send({ priority: "high" });
    expect(res.status).toBe(200);
    expect(res.body.priority).toBe("high");
  });

  it("leaves priority unchanged when patching only done (no regression)", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Done-only patch", priority: "low" });
    expect(created.body.priority).toBe("low");

    const res = await request(app)
      .patch(`/api/todos/${created.body.id}`)
      .send({ done: true });
    expect(res.status).toBe(200);
    expect(res.body.done).toBe(true);
    expect(res.body.priority).toBe("low");
  });

  it("rejects an invalid priority value with 400", async () => {
    const created = await request(app)
      .post("/api/todos")
      .send({ title: "Bad priority patch" });
    const res = await request(app)
      .patch(`/api/todos/${created.body.id}`)
      .send({ priority: "urgent" });
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
