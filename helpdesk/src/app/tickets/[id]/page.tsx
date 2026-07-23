import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser, memberQueueIds } from "@/lib/authz";
import { addComment, updateTicketStatus } from "@/lib/actions/tickets";

export const dynamic = "force-dynamic";

const STATUSES = [
  "NEW",
  "ASSIGNED",
  "IN_PROGRESS",
  "PENDING",
  "RESOLVED",
  "CLOSED",
] as const;

export default async function TicketPage({
  params,
}: {
  params: { id: string };
}) {
  const user = await requireUser();

  const ticket = await prisma.ticket.findUnique({
    where: { id: params.id },
    include: {
      queue: { select: { id: true, name: true } },
      requester: { select: { displayName: true } },
      assignee: { select: { displayName: true } },
      comments: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!ticket) notFound();

  // Access: requester, or a member of the ticket's queue. Otherwise it "doesn't exist".
  const isRequester = ticket.requesterId === user.employeeId;
  const queueIds = user.employeeId ? await memberQueueIds(user.employeeId) : [];
  const isAgent = queueIds.includes(ticket.queueId);
  if (!isRequester && !isAgent) notFound();

  // Requesters never see internal notes.
  const visibleComments = ticket.comments.filter(
    (c) => isAgent || c.visibility === "PUBLIC",
  );

  async function comment(formData: FormData) {
    "use server";
    await addComment({
      ticketId: params.id,
      body: String(formData.get("body") ?? ""),
      visibility: String(formData.get("visibility") ?? "PUBLIC"),
    });
  }

  async function setStatus(formData: FormData) {
    "use server";
    await updateTicketStatus({
      ticketId: params.id,
      status: String(formData.get("status") ?? "IN_PROGRESS"),
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <span className="font-mono text-xs text-gray-500">
          {ticket.reference}
        </span>
        <h1 className="font-serif text-2xl font-bold text-navy-900">
          {ticket.subject}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {ticket.queue.name} · {ticket.status.replace("_", " ")} ·{" "}
          {ticket.priority} · requester {ticket.requester.displayName} ·
          assignee {ticket.assignee?.displayName ?? "unassigned"}
        </p>
      </div>

      {isAgent && (
        <form action={setStatus} className="flex items-center gap-2">
          <select
            name="status"
            defaultValue={ticket.status}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace("_", " ")}
              </option>
            ))}
          </select>
          <button className="rounded bg-navy-900 px-3 py-1 text-sm text-white hover:bg-navy-800">
            Update status
          </button>
        </form>
      )}

      <section>
        <h2 className="text-sm font-semibold text-gray-700">Conversation</h2>
        <ul className="mt-3 space-y-3">
          {visibleComments.map((c) => (
            <li
              key={c.id}
              className={`rounded border px-4 py-3 text-sm ${
                c.visibility === "INTERNAL"
                  ? "border-warning/30 bg-warning/5"
                  : "border-gray-200 bg-white"
              }`}
            >
              {c.visibility === "INTERNAL" && (
                <span className="mr-2 rounded bg-warning/20 px-1.5 py-0.5 text-xs text-warning">
                  internal
                </span>
              )}
              <span className="whitespace-pre-wrap text-navy-900">{c.body}</span>
              <div className="mt-1 text-xs text-gray-400">
                {c.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </div>
            </li>
          ))}
          {visibleComments.length === 0 && (
            <li className="text-sm text-gray-500">No messages yet.</li>
          )}
        </ul>
      </section>

      <form action={comment} className="space-y-2">
        <textarea
          name="body"
          required
          rows={3}
          placeholder="Add a reply…"
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3">
          {isAgent && (
            <label className="flex items-center gap-1 text-xs text-gray-600">
              <input type="checkbox" name="visibility" value="INTERNAL" />
              Internal note
            </label>
          )}
          <button className="rounded bg-gold-500 px-3 py-1.5 text-sm font-semibold text-navy-900 hover:bg-gold-400">
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
