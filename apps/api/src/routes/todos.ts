import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";

interface TodoRow {
  id: number;
  title: string;
  done: number;
  created_at: string;
}

function serialize(row: TodoRow) {
  return {
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
    createdAt: row.created_at,
  };
}

export function todosRouter(db: DatabaseSync): Router {
  const router = Router();

  router.get("/api/todos", (_req, res) => {
    const rows = db
      .prepare("SELECT id, title, done, created_at FROM todos ORDER BY id ASC")
      .all() as unknown as TodoRow[];
    res.json(rows.map(serialize));
  });

  router.post("/api/todos", (req, res) => {
    const { title } = req.body as { title?: unknown };
    if (typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "title must be a non-empty string" });
      return;
    }

    const result = db
      .prepare("INSERT INTO todos (title) VALUES (?)")
      .run(title.trim());
    const row = db
      .prepare("SELECT id, title, done, created_at FROM todos WHERE id = ?")
      .get(result.lastInsertRowid) as unknown as TodoRow;
    res.status(201).json(serialize(row));
  });

  router.patch("/api/todos/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "id must be an integer" });
      return;
    }

    const existing = db
      .prepare("SELECT id, title, done, created_at FROM todos WHERE id = ?")
      .get(id) as unknown as TodoRow | undefined;
    if (!existing) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    const { done } = req.body as { done?: unknown };
    if (typeof done !== "boolean") {
      res.status(400).json({ error: "done must be a boolean" });
      return;
    }

    db.prepare("UPDATE todos SET done = ? WHERE id = ?").run(done ? 1 : 0, id);
    const updated = db
      .prepare("SELECT id, title, done, created_at FROM todos WHERE id = ?")
      .get(id) as unknown as TodoRow;
    res.json(serialize(updated));
  });

  router.delete("/api/todos/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "id must be an integer" });
      return;
    }

    const result = db.prepare("DELETE FROM todos WHERE id = ?").run(id);
    if (result.changes === 0) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    res.status(204).send();
  });

  return router;
}
