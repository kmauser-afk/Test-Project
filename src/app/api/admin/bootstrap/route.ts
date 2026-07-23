import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSeed } from "@/lib/seed";

// One-time, secret-guarded bootstrap (PMO pattern #7): creates the demo
// departments, queues, employees, logins, memberships, and a sample ticket on
// a fresh deploy — no shell or DB access required. Idempotent (safe to re-run).
//
//   GET/POST /api/admin/bootstrap?key=<JOBS_SHARED_SECRET>
//   or header:  Authorization: Bearer <JOBS_SHARED_SECRET>
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = process.env.JOBS_SHARED_SECRET;
  if (!secret) return false; // refuse if no secret is configured
  const url = new URL(req.url);
  if (url.searchParams.get("key") === secret) return true;
  if (req.headers.get("authorization") === `Bearer ${secret}`) return true;
  return false;
}

async function handle(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSeed(prisma);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "seed_failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
