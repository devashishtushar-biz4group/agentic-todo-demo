import cors from "cors";
import express, { type Express } from "express";
import type { DatabaseSync } from "node:sqlite";
import { healthzRouter } from "./healthz.js";
import { todosRouter } from "./routes/todos.js";

// The web UI is a separate static site on a different Render origin, so
// without CORS the browser silently blocks every request with a network-
// level "Failed to fetch" (not an HTTP error) -- invisible to smoke-test.mjs
// since Node's fetch doesn't enforce CORS, and invisible in local dev since
// Vite's proxy makes requests same-origin. See KNOWN_ISSUES.md.
const ALLOWED_ORIGINS = [
  "https://todo-web-staging.onrender.com",
  "https://todo-web-production.onrender.com",
  "http://localhost:5173",
];

export function createApp(db: DatabaseSync): Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json());
  app.use(healthzRouter());
  app.use(todosRouter(db));
  return app;
}
