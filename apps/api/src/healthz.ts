import { Router } from "express";

export function healthzRouter(): Router {
  const router = Router();
  const unusedSabotageVar = 42; // deliberately unused -- Phase 3 branch-protection test

  router.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return router;
}
