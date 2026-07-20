import { Router } from "express";
import type { DatabaseSync } from "node:sqlite";

type Priority = "low" | "medium" | "high";

function isPriority(value: unknown): value is Priority {
  return value === "low" || value === "medium" || value === "high";
}

interface TodoRow {
  id: number;
  title: string;
  done: number;
  created_at: string;
  priority: string;
}

function serialize(row: TodoRow) {
  return {
    id: row.id,
    title: row.title,
    done: Boolean(row.done),
    createdAt: row.created_at,
    priority: row.priority as Priority,
  };
}

const SELECT_COLUMNS = "id, title, done, created_at, priority";

function buildPatchUpdate(
  db: DatabaseSync,
  id: number,
  fields: { done?: boolean; priority?: Priority },
): void {
  if (fields.done !== undefined) {
    db.prepare("UPDATE todos SET done = ? WHERE id = ?").run(
      fields.done ? 1 : 0,
      id,
    );
  }
  if (fields.priority !== undefined) {
    db.prepare("UPDATE todos SET priority = ? WHERE id = ?").run(
      fields.priority,
      id,
    );
  }
}

export function todosRouter(db: DatabaseSync): Router {
  const router = Router();

  router.get("/api/todos", (req, res) => {
    const { priority } = req.query;
    const rows =
      typeof priority === "string" && isPriority(priority)
        ? (db
            .prepare(
              `SELECT ${SELECT_COLUMNS} FROM todos WHERE priority = ? ORDER BY id ASC`,
            )
            .all(priority) as unknown as TodoRow[])
        : (db
            .prepare(`SELECT ${SELECT_COLUMNS} FROM todos ORDER BY id ASC`)
            .all() as unknown as TodoRow[]);
    res.json(rows.map(serialize));
  });

  router.post("/api/todos", (req, res) => {
    const { title, priority } = req.body as {
      title?: unknown;
      priority?: unknown;
    };
    if (typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "title must be a non-empty string" });
      return;
    }

    let resolvedPriority: Priority = "medium";
    if (priority !== undefined) {
      if (!isPriority(priority)) {
        res
          .status(400)
          .json({ error: "priority must be one of low, medium, high" });
        return;
      }
      resolvedPriority = priority;
    }

    const result = db
      .prepare("INSERT INTO todos (title, priority) VALUES (?, ?)")
      .run(title.trim(), resolvedPriority);
    const row = db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM todos WHERE id = ?`)
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
      .prepare(`SELECT ${SELECT_COLUMNS} FROM todos WHERE id = ?`)
      .get(id) as unknown as TodoRow | undefined;
    if (!existing) {
      res.status(404).json({ error: "todo not found" });
      return;
    }

    const { done, priority } = req.body as {
      done?: unknown;
      priority?: unknown;
    };
    if (done === undefined && priority === undefined) {
      res
        .status(400)
        .json({ error: "at least one of done or priority must be present" });
      return;
    }

    if (done !== undefined && typeof done !== "boolean") {
      res.status(400).json({ error: "done must be a boolean" });
      return;
    }

    if (priority !== undefined && !isPriority(priority)) {
      res
        .status(400)
        .json({ error: "priority must be one of low, medium, high" });
      return;
    }

    buildPatchUpdate(db, id, {
      done: done as boolean | undefined,
      priority: priority as Priority | undefined,
    });
    const updated = db
      .prepare(`SELECT ${SELECT_COLUMNS} FROM todos WHERE id = ?`)
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
