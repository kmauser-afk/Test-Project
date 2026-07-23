import { prisma } from "@/lib/prisma";

// Human-friendly ticket reference like `IT-104829`, prefixed by the queue's
// department slug. Uses a per-department running count; unique constraint on
// Ticket.reference is the backstop against races.
export async function nextReference(queueId: string): Promise<string> {
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { department: true },
  });
  const prefix = (queue?.department?.slug ?? queue?.slug ?? "REQ")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6);

  const count = await prisma.ticket.count({ where: { queueId } });
  const seq = 100000 + count + 1;
  return `${prefix}-${seq}`;
}
