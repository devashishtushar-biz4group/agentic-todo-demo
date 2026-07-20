#!/usr/bin/env node
// Smoke-tests a deployed API: /healthz, then a create/read/delete round trip
// against /api/todos. Retries with backoff to ride out Render free-tier
// cold starts (~50s from a fully-idle instance).
//
// Usage: node scripts/smoke-test.mjs <base-url>

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node scripts/smoke-test.mjs <base-url>");
  process.exit(1);
}

const MAX_ATTEMPTS = 10;
const RETRY_DELAY_MS = 6000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealthy(url) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${url}/healthz`);
      if (res.ok) {
        console.log(`healthz ok on attempt ${attempt}`);
        return;
      }
      console.log(`healthz attempt ${attempt}: HTTP ${res.status}`);
    } catch (err) {
      console.log(`healthz attempt ${attempt}: ${err.message}`);
    }
    if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
  }
  throw new Error(`/healthz never returned 200 after ${MAX_ATTEMPTS} attempts`);
}

async function roundTrip(url) {
  const createRes = await fetch(`${url}/api/todos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "smoke-test todo", priority: "high" }),
  });
  if (createRes.status !== 201) {
    throw new Error(`POST /api/todos returned ${createRes.status}, expected 201`);
  }
  const created = await createRes.json();
  if (created.priority !== "high") {
    throw new Error(`created todo has priority "${created.priority}", expected "high"`);
  }

  const listRes = await fetch(`${url}/api/todos`);
  if (listRes.status !== 200) {
    throw new Error(`GET /api/todos returned ${listRes.status}, expected 200`);
  }
  const list = await listRes.json();
  if (!list.some((t) => t.id === created.id)) {
    throw new Error(`GET /api/todos did not include the just-created todo (id ${created.id})`);
  }

  const deleteRes = await fetch(`${url}/api/todos/${created.id}`, { method: "DELETE" });
  if (deleteRes.status !== 204) {
    throw new Error(`DELETE /api/todos/${created.id} returned ${deleteRes.status}, expected 204`);
  }

  console.log("create/read/delete round trip: ok");
}

try {
  console.log(`Smoke-testing ${baseUrl}`);
  await waitForHealthy(baseUrl);
  await roundTrip(baseUrl);
  console.log("SMOKE TEST PASSED");
} catch (err) {
  console.error("SMOKE TEST FAILED:", err.message);
  process.exit(1);
}
