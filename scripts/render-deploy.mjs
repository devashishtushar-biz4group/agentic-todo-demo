#!/usr/bin/env node
// Waits for Render's own auto-deploy of a specific commit to go live, or
// explicitly rolls back to the last known-good deploy. Requires
// RENDER_API_KEY in the environment.
//
// Usage:
//   node scripts/render-deploy.mjs <service-id> <commit-sha>   wait for Render's auto-deploy of this commit to reach "live"
//   node scripts/render-deploy.mjs <service-id> --rollback     explicitly redeploy the last deploy with status "live" before the current one
//
// Why this doesn't POST a new deploy for the forward path: this repo's
// Render services are Blueprint-linked with autoDeploy enabled, so Render
// already starts a deploy the moment it sees the push -- discovered when a
// manual POST /deploys call here raced Render's own auto-triggered deploy
// for the same commit and got back an unexpected empty response
// ("Unexpected end of JSON input"). See DECISIONS.md. Rollback is different:
// redeploying an *older* commit is not something auto-deploy-on-push would
// ever do by itself, so that path still explicitly triggers a deploy.

const RENDER_API = "https://api.render.com/v1";
const apiKey = process.env.RENDER_API_KEY;
if (!apiKey) {
  console.error("RENDER_API_KEY is required");
  process.exit(1);
}

const serviceId = process.argv[2];
const arg3 = process.argv[3];
const rollback = arg3 === "--rollback";
if (!serviceId || !arg3) {
  console.error("Usage: node scripts/render-deploy.mjs <service-id> <commit-sha>|--rollback");
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

const TERMINAL_FAILURE_STATUSES = ["build_failed", "update_failed", "canceled", "deactivated"];

async function pollDeploy(deployId) {
  const MAX_ATTEMPTS = 40; // ~10 min at 15s intervals -- free-tier builds can be slow
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const deploy = await renderFetch(`/services/${serviceId}/deploys/${deployId}`);
    console.log(`deploy ${deployId}: ${deploy.status} (attempt ${attempt})`);
    if (deploy.status === "live") return deploy;
    if (TERMINAL_FAILURE_STATUSES.includes(deploy.status)) {
      throw new Error(`deploy ${deployId} ended in status "${deploy.status}"`);
    }
    await sleep(15000);
  }
  throw new Error(`deploy ${deployId} did not reach "live" after ${MAX_ATTEMPTS} attempts`);
}

async function waitForCommitLive(commitSha) {
  const MAX_ATTEMPTS = 40; // ~10 min at 15s intervals
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const deploys = await renderFetch(`/services/${serviceId}/deploys?limit=10`);
    const history = deploys.map((entry) => entry.deploy ?? entry);
    const match = history.find((d) => d.commit?.id === commitSha);
    if (match) {
      console.log(`deploy for commit ${commitSha}: ${match.status} (attempt ${attempt})`);
      if (match.status === "live") return match;
      if (TERMINAL_FAILURE_STATUSES.includes(match.status)) {
        throw new Error(`deploy for commit ${commitSha} ended in status "${match.status}"`);
      }
    } else {
      console.log(`no deploy found yet for commit ${commitSha} (attempt ${attempt})`);
    }
    await sleep(15000);
  }
  throw new Error(`no deploy for commit ${commitSha} reached "live" after ${MAX_ATTEMPTS} attempts`);
}

// Render only ever marks the *current* deploy "live" -- every deploy it
// once superseded normally becomes "deactivated", not "live". A deploy that
// never actually served traffic ends in a different terminal status
// (build_failed, update_failed, canceled). So "the last deploy that was
// genuinely good" is the next "deactivated" entry after the current one,
// not another "live" one -- there is never a second "live" entry to find.
const CLEANLY_SUPERSEDED_STATUSES = ["live", "deactivated"];

async function rollbackToLastGood() {
  console.log(`Looking up deploy history for service ${serviceId}`);
  const deploys = await renderFetch(`/services/${serviceId}/deploys?limit=20`);
  const history = deploys.map((entry) => entry.deploy ?? entry);
  const currentlyLiveIndex = history.findIndex((d) => d.status === "live");
  const priorGood = history
    .slice(currentlyLiveIndex + 1)
    .find((d) => CLEANLY_SUPERSEDED_STATUSES.includes(d.status));
  if (!priorGood) {
    throw new Error("no prior successful deploy found to roll back to");
  }
  console.log(`Rolling back to deploy ${priorGood.id} (commit ${priorGood.commit?.id ?? "unknown"})`);
  const redeploy = await renderFetch(`/services/${serviceId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ commitId: priorGood.commit?.id }),
  });
  console.log(`Rollback deploy triggered: ${redeploy.id}`);
  return pollDeploy(redeploy.id);
}

try {
  const result = rollback ? await rollbackToLastGood() : await waitForCommitLive(arg3);
  console.log(`Deploy ${result.id} is live (commit ${result.commit?.id ?? "unknown"})`);
} catch (err) {
  console.error("DEPLOY FAILED:", err.message);
  process.exit(1);
}
