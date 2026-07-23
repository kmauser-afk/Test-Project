import Link from "next/link";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  const isLoggedIn = !!session?.user;

  return (
    <div className="space-y-8">
      <section className="rounded-lg bg-navy-900 px-6 py-10 text-white">
        <h1 className="font-serif text-3xl font-bold">How can we help?</h1>
        <p className="mt-2 max-w-2xl text-white/80">
          File a request with IT, Facilities, Marketing, HR, or Operations —
          track it start to finish. One help desk for every department.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href={isLoggedIn ? "/portal" : "/login"}
            className="rounded bg-gold-500 px-4 py-2 font-semibold text-navy-900 hover:bg-gold-400"
          >
            {isLoggedIn ? "Go to my portal" : "Sign in to get help"}
          </Link>
          {isLoggedIn && (
            <Link
              href="/agent"
              className="rounded border border-white/40 px-4 py-2 hover:bg-white/10"
            >
              Agent workspace
            </Link>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { t: "Submit a request", d: "Pick a service, fill a short form, done." },
          { t: "Track your tickets", d: "See status and replies in one place." },
          { t: "Search the KB", d: "Answers before you even file a ticket." },
        ].map((c) => (
          <div
            key={c.t}
            className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
          >
            <h2 className="font-semibold text-navy-900">{c.t}</h2>
            <p className="mt-1 text-sm text-gray-600">{c.d}</p>
          </div>
        ))}
      </section>

      <p className="text-xs text-gray-500">
        Phase 0 skeleton — sibling app to the Credit Union PMO tool. Server-first
        Next.js + Prisma/Postgres + Auth.js (Entra&nbsp;SSO).
      </p>
    </div>
  );
}
