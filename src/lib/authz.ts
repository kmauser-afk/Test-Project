import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { QueueRole } from "@prisma/client";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  employeeId?: string | null;
};

/** Server-side gate: the real security boundary. UI affordances are cosmetic. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHENTICATED");
  return session.user as SessionUser;
}

export async function requireRole(...roles: string[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new Error("FORBIDDEN");
  return user;
}

/** Queue ids the employee can act in (optionally filtered to specific memberships). */
export async function memberQueueIds(
  employeeId: string,
  roles?: QueueRole[],
): Promise<string[]> {
  const memberships = await prisma.queueMembership.findMany({
    where: {
      employeeId,
      ...(roles ? { role: { in: roles } } : {}),
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { queueId: true },
  });
  return memberships.map((m) => m.queueId);
}

/** Throws FORBIDDEN unless the employee has (an allowed) membership in the queue. */
export async function assertQueueAccess(
  employeeId: string,
  queueId: string,
  roles?: QueueRole[],
): Promise<void> {
  const ids = await memberQueueIds(employeeId, roles);
  if (!ids.includes(queueId)) throw new Error("FORBIDDEN");
}
