import { Router } from "express";

export function healthzRouter(): Router {
  const router = Router();
  // deliberately broken -- Phase 3 round 2 branch-protection test (type error only)
  const sabotageTypeError: number = "not a number";
  if (sabotageTypeError === 0) {
    console.log(sabotageTypeError);
  }

  router.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  return router;
}
