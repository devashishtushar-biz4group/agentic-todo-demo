// tsc only compiles .ts files -- it never copies the .sql migration files
// into dist/, so a production build (build && start, exactly what CI and
// Render both do) silently ships an app that crashes on boot with
// ENOENT scanning dist/db/migrations. Copy them explicitly as a build step.
import { cpSync } from "node:fs";

cpSync("src/db/migrations", "dist/db/migrations", { recursive: true });
