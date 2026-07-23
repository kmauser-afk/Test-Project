#!/usr/bin/env node
// Build orchestrator (matches the PMO app):
//   prisma generate  ->  prisma migrate deploy  ->  next build
// Migrations run against DIRECT_URL so the advisory lock doesn't fight a pooler.
const { execSync } = require("node:child_process");

function run(cmd) {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit" });
}

try {
  run("prisma generate");

  // Only attempt migrations when a database is configured (skip on CI build steps
  // that just compile the app without a reachable DB).
  if (process.env.DATABASE_URL) {
    run("prisma migrate deploy");
  } else {
    console.log("\n⚠ DATABASE_URL not set — skipping `prisma migrate deploy`.");
  }

  run("next build");
  console.log("\n✅ Build complete.");
} catch (err) {
  console.error("\n❌ Build failed.");
  process.exit(1);
}
