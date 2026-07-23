import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser, memberQueueIds } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const user = await requireUser();

  if (!user.employeeId) {
    return (
      <p className="text-sm text-gray-600">
        Your account isn&rsquo;t linked to an employee profile yet.
      </p>
    );
  }

  // Read scoping: only queues this employee is a member of are visible.
  const queueIds = await memberQueueIds(user.employeeId);

  const [queues, tickets] = await Promise.all([
    prisma.queue.findMany({
      where: { id: { in: queueIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { tickets: true } } },
    }),
    prisma.ticket.findMany({
      where: {
        queueId: { in: queueIds },
        status: { notIn: ["CLOSED", "CANCELLED"] },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        queue: { select: { name: true } },
        requester: { select: { displayName: true } },
        assignee: { select: { displayName: true } },
      },
    }),
  ]);

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          My queues
        </h2>
        <ul className="mt-2 space-y-1 text-sm">
          {queues.length === 0 && (
            <li className="text-gray-400">No queue memberships.</li>
          )}
          {queues.map((q) => (
            <li
              key={q.id}
              className="flex items-center justify-between rounded px-2 py-1 hover:bg-white"
            >
              <span className="text-navy-900">{q.name}</span>
              <span className="text-xs text-gray-400">{q._count.tickets}</span>
            </li>
          ))}
        </ul>
      </aside>

      <section>
        <h1 className="font-serif text-2xl font-bold text-navy-900">
          Open tickets
        </h1>
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-xs uppercase text-gray-500">
              <th className="py-2">Ref</th>
              <th>Subject</th>
              <th>Queue</th>
              <th>Requester</th>
              <th>Assignee</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 && (
              <tr>
                <td colSpan={6} className="py-4 text-gray-500">
                  No open tickets in your queues.
                </td>
              </tr>
            )}
            {tickets.map((t) => (
              <tr key={t.id} className="border-b border-gray-100 hover:bg-white">
                <td className="py-2 font-mono text-xs text-gray-500">
                  <Link href={`/tickets/${t.id}`} className="hover:underline">
                    {t.reference}
                  </Link>
                </td>
                <td className="text-navy-900">{t.subject}</td>
                <td className="text-gray-500">{t.queue.name}</td>
                <td className="text-gray-500">{t.requester.displayName}</td>
                <td className="text-gray-500">
                  {t.assignee?.displayName ?? "—"}
                </td>
                <td className="text-gray-500">{t.status.replace("_", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
