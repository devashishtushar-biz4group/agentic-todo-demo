#!/usr/bin/env node
// Triggers a Render deploy for a service, or rolls back to the last
// known-good deploy. Requires RENDER_API_KEY in the environment.
//
// Usage:
//   node scripts/render-deploy.mjs <service-id>              deploy latest commit on the connected branch
//   node scripts/render-deploy.mjs <service-id> --rollback    redeploy the last deploy with status "live" before the current one

const RENDER_API = "https://api.render.com/v1";
const apiKey = process.env.RENDER_API_KEY;
if (!apiKey) {
  console.error("RENDER_API_KEY is required");
  process.exit(1);
}

const serviceId = process.argv[2];
const rollback = process.argv[3] === "--rollback";
if (!serviceId) {
  console.error("Usage: node scripts/render-deploy.mjs <service-id> [--rollback]");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  "Content-Type": "application/json",
};

async function renderFetch(path, options = {}) {
  const res = await fetch(`${RENDER_API}${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Render API ${path} -> ${res.status}: ${body}`);
  }
  return res.status === 204 ? null : res.json();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pollDeploy(deployId) {
  const MAX_ATTEMPTS = 40; // ~10 min at 15s intervals -- free-tier builds can be slow
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const deploy = await renderFetch(`/services/${serviceId}/deploys/${deployId}`);
    console.log(`deploy ${deployId}: ${deploy.status} (attempt ${attempt})`);
    if (deploy.status === "live") return deploy;
    if (["build_failed", "update_failed", "canceled", "deactivated"].includes(deploy.status)) {
      throw new Error(`deploy ${deployId} ended in status "${deploy.status}"`);
    }
    await sleep(15000);
  }
  throw new Error(`deploy ${deployId} did not reach "live" after ${MAX_ATTEMPTS} attempts`);
}

async function deployLatest() {
  console.log(`Triggering deploy for service ${serviceId} (latest commit on connected branch)`);
  const deploy = await renderFetch(`/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  console.log(`Deploy triggered: ${deploy.id}`);
  return pollDeploy(deploy.id);
}

async function rollbackToLastGood() {
  console.log(`Looking up deploy history for service ${serviceId}`);
  const deploys = await renderFetch(`/services/${serviceId}/deploys?limit=20`);
  const history = deploys.map((entry) => entry.deploy ?? entry);
  const currentlyLiveIndex = history.findIndex((d) => d.status === "live");
  const priorGood = history.slice(currentlyLiveIndex + 1).find((d) => d.status === "live");
  if (!priorGood) {
    throw new Error("no prior successful ('live') deploy found to roll back to");
  }
  console.log(`Rolling back to deploy ${priorGood.id} (commit ${priorGood.commit?.id ?? "unknown"})`);
  // NOT YET VERIFIED against a real Render account: this assumes the
  // deploy-trigger endpoint accepts a commitId to redeploy a specific
  // historical commit, rather than always deploying the branch's current
  // HEAD. If this doesn't behave as expected the first time it's exercised
  // for real, check Render's current API docs -- a dedicated rollback
  // endpoint may exist instead. Flag this explicitly rather than silently
  // trusting an untested assumption.
  const redeploy = await renderFetch(`/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ commitId: priorGood.commit?.id }),
  });
  console.log(`Rollback deploy triggered: ${redeploy.id}`);
  return pollDeploy(redeploy.id);
}

try {
  const result = rollback ? await rollbackToLastGood() : await deployLatest();
  console.log(`Deploy ${result.id} is live (commit ${result.commit?.id ?? "unknown"})`);
} catch (err) {
  console.error("DEPLOY FAILED:", err.message);
  process.exit(1);
}
