#!/usr/bin/env node
// Polls a deployed service's /healthz endpoint. Exits 0 if healthy within
// the retry budget, exits 1 otherwise -- signalling the caller to roll back.
//
// Usage: node scripts/healthcheck.mjs <base-url>

const baseUrl = process.argv[2];
if (!baseUrl) {
  console.error("Usage: node scripts/healthcheck.mjs <base-url>");
  process.exit(1);
}

const MAX_ATTEMPTS = 6;
const RETRY_DELAY_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  try {
    const res = await fetch(`${baseUrl}/healthz`);
    if (res.ok) {
      console.log(`healthz ok on attempt ${attempt}`);
      process.exit(0);
    }
    console.log(`healthz attempt ${attempt}: HTTP ${res.status}`);
  } catch (err) {
    console.log(`healthz attempt ${attempt}: ${err.message}`);
  }
  if (attempt < MAX_ATTEMPTS) await sleep(RETRY_DELAY_MS);
}

console.error(`HEALTH CHECK FAILED: /healthz did not return 200 after ${MAX_ATTEMPTS} attempts`);
process.exit(1);
