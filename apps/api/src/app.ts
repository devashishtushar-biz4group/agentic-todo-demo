import express, { type Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { healthzRouter } from "./healthz.js";
import { todosRouter } from "./routes/todos.js";

export function createApp(db: DatabaseSync): Express {
  const app = express();
  app.use(express.json());
  app.use(healthzRouter());
  app.use(todosRouter(db));
  return app;
}
