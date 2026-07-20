import { Router } from "express";

export function healthzRouter(): Router {
  const router = Router();
  const bootTime = Date.now();

  router.get("/healthz", (_req, res) => {
    // Escape hatch for the Phase 4 rollback drill: setting this env var on a
    // single deployed instance (never committed to render.yaml) lets us
    // fail that instance's health check on demand, without touching the
    // default 200 response this test suite asserts on. The failure is
    // delayed past SIMULATE_HEALTH_FAILURE_DELAY_MS (default 90s) so
    // Render's own deploy-time health check still passes and promotes the
    // deploy -- this simulates a deploy that looks fine at rollout and
    // degrades shortly after, which is what an external post-deploy health
    // check (not Render's own gate) is actually for. Remove once the drill
    // is done -- see DECISIONS.md.
    if (process.env.SIMULATE_HEALTH_FAILURE === "true") {
      const delayMs = Number(process.env.SIMULATE_HEALTH_FAILURE_DELAY_MS ?? 90000);
      if (Date.now() - bootTime > delayMs) {
        res.status(500).json({ status: "unhealthy (drill)" });
        return;
      }
    }
    res.status(200).json({ status: "ok" });
  });

  return router;
}
