import { Router } from "express";

export function healthzRouter(): Router {
  const router = Router();

  router.get("/healthz", (_req, res) => {
    // Escape hatch for the Phase 4 rollback drill: setting this env var on a
    // single deployed instance (never committed to render.yaml) lets us
    // fail that instance's health check on demand, without touching the
    // default 200 response this test suite asserts on. Remove once the
    // drill is done -- see DECISIONS.md.
    if (process.env.SIMULATE_HEALTH_FAILURE === "true") {
      res.status(500).json({ status: "unhealthy (drill)" });
      return;
    }
    res.status(200).json({ status: "ok" });
  });

  return router;
}
