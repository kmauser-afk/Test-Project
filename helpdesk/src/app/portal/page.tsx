import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/authz";
import { createTicket } from "@/lib/actions/tickets";

export const dynamic = "force-dynamic";

const STATUS_COLORS: Record<string, string> = {
  NEW: "bg-info/10 text-info",
  ASSIGNED: "bg-info/10 text-info",
  IN_PROGRESS: "bg-gold-100 text-gold-500",
  PENDING: "bg-warning/10 text-warning",
  RESOLVED: "bg-success/10 text-success",
  CLOSED: "bg-gray-100 text-gray-600",
  CANCELLED: "bg-gray-100 text-gray-600",
};

export default async function PortalPage() {
  const user = await requireUser();

  const [queues, tickets] = await Promise.all([
    prisma.queue.findMany({
      where: { isPrivate: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    user.employeeId
      ? prisma.ticket.findMany({
          where: { requesterId: user.employeeId },
          orderBy: { createdAt: "desc" },
          take: 25,
          include: { queue: { select: { name: true } } },
        })
      : Promise.resolve([]),
  ]);

  // Fall back to any queue if none are public yet (fresh install).
  const requestQueues = queues.length
    ? queues
    : await prisma.queue.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      });

  async function submit(formData: FormData) {
    "use server";
    await createTicket({
      subject: String(formData.get("subject") ?? ""),
      queueId: String(formData.get("queueId") ?? ""),
      description: String(formData.get("description") ?? ""),
    });
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section>
        <h1 className="font-serif text-2xl font-bold text-navy-900">
          New request
        </h1>
        <form action={submit} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="text-gray-700">What do you need?</span>
            <input
              name="subject"
              required
              minLength={3}
              placeholder="e.g. Laptop won't connect to Wi-Fi"
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Department / queue</span>
            <select
              name="queueId"
              required
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            >
              {requestQueues.map((q) => (
                <option key={q.id} value={q.id}>
                  {q.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-gray-700">Details</span>
            <textarea
              name="description"
              rows={4}
              className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            />
          </label>
          <button className="rounded bg-gold-500 px-4 py-2 font-semibold text-navy-900 hover:bg-gold-400">
            Submit request
          </button>
        </form>
      </section>

      <section>
        <h2 className="font-serif text-2xl font-bold text-navy-900">
          My tickets
        </h2>
        <ul className="mt-4 space-y-2">
          {tickets.length === 0 && (
            <li className="text-sm text-gray-500">No tickets yet.</li>
          )}
          {tickets.map((t) => (
            <li key={t.id}>
              <Link
                href={`/tickets/${t.id}`}
                className="flex items-center justify-between rounded border border-gray-200 bg-white px-4 py-3 shadow-sm hover:border-gold-400"
              >
                <span>
                  <span className="font-mono text-xs text-gray-500">
                    {t.reference}
                  </span>
                  <span className="ml-2 text-navy-900">{t.subject}</span>
                  <span className="ml-2 text-xs text-gray-400">
                    {t.queue.name}
                  </span>
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    STATUS_COLORS[t.status] ?? "bg-gray-100 text-gray-600"
                  }`}
                >
                  {t.status.replace("_", " ")}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
