import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Scheduled job endpoint — the host's scheduler calls this on a cron.
//   • Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
//   • Azure App Service WebJob (or any caller) can send `?key=<JOBS_SHARED_SECRET>`.
// Secret-guarded (extends the PMO "secret-guarded endpoint" pattern). Node runtime
// so it can use Prisma; keep it idempotent — safe to run repeatedly.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const url = new URL(req.url);
  const cronSecret = process.env.CRON_SECRET;
  const jobsSecret = process.env.JOBS_SHARED_SECRET;
  const auth = req.headers.get("authorization");
  if (cronSecret && auth === `Bearer ${cronSecret}`) return true;
  if (jobsSecret && url.searchParams.get("key") === jobsSecret) return true;
  return false;
}

export async function GET(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Phase 0 stub of the SLA sweep: flag open tickets whose resolve target has
  // passed and aren't already marked breached. The full engine (warning
  // thresholds, business-hours pausing, escalation actions) lands in Phase 2.
  let breached = 0;
  try {
    const dueClocks = await prisma.slaClock.findMany({
      where: { breached: false, targetAt: { lt: now } },
      select: { id: true },
      take: 500,
    });
    if (dueClocks.length) {
      await prisma.slaClock.updateMany({
        where: { id: { in: dueClocks.map((c) => c.id) } },
        data: { breached: true, breachedAt: now },
      });
      breached = dueClocks.length;
    }
  } catch (err) {
    // Don't fail the cron on a transient DB hiccup; report it.
    return NextResponse.json(
      { ok: false, error: "db_error" },
      { status: 200 },
    );
  }

  return NextResponse.json({ ok: true, ranAt: now.toISOString(), breached });
}
