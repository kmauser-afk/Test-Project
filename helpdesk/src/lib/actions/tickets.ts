"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser, assertQueueAccess } from "@/lib/authz";
import { nextReference } from "@/lib/reference";

// Every Server Action follows the PMO pattern:
//   authz() -> validate (Zod) -> write -> append TicketEvent -> revalidatePath()

const CreateTicketInput = z.object({
  subject: z.string().min(3, "Subject is too short").max(200),
  queueId: z.string().min(1, "Pick a queue"),
  description: z.string().max(10000).optional(),
});

export async function createTicket(input: unknown) {
  const user = await requireUser();
  if (!user.employeeId) throw new Error("NO_EMPLOYEE_PROFILE");

  const data = CreateTicketInput.parse(input);
  const reference = await nextReference(data.queueId);

  const ticket = await prisma.ticket.create({
    data: {
      reference,
      subject: data.subject,
      queueId: data.queueId,
      requesterId: user.employeeId,
      source: "PORTAL",
      status: "NEW",
      events: {
        create: {
          actorId: user.employeeId,
          eventType: "CREATED",
          toValue: "NEW",
        },
      },
      ...(data.description
        ? {
            comments: {
              create: {
                authorId: user.employeeId,
                body: data.description,
                visibility: "PUBLIC",
              },
            },
          }
        : {}),
    },
  });

  revalidatePath("/portal");
  return ticket.reference;
}

const StatusInput = z.object({
  ticketId: z.string().min(1),
  status: z.enum([
    "NEW",
    "ASSIGNED",
    "IN_PROGRESS",
    "PENDING",
    "RESOLVED",
    "CLOSED",
    "CANCELLED",
  ]),
});

export async function updateTicketStatus(input: unknown) {
  const user = await requireUser();
  if (!user.employeeId) throw new Error("NO_EMPLOYEE_PROFILE");
  const { ticketId, status } = StatusInput.parse(input);

  const ticket = await prisma.ticket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new Error("NOT_FOUND");

  // Agents may only act within queues they belong to (server-enforced).
  await assertQueueAccess(user.employeeId, ticket.queueId, [
    "AGENT",
    "LEAD",
    "DEPT_ADMIN",
  ]);

  await prisma.$transaction([
    prisma.ticket.update({
      where: { id: ticketId },
      data: {
        status,
        ...(status === "RESOLVED" ? { resolvedAt: new Date() } : {}),
        ...(status === "CLOSED" ? { closedAt: new Date() } : {}),
      },
    }),
    prisma.ticketEvent.create({
      data: {
        ticketId,
        actorId: user.employeeId,
        eventType: "STATUS_CHANGED",
        fromValue: ticket.status,
        toValue: status,
      },
    }),
  ]);

  revalidatePath(`/agent`);
  revalidatePath(`/tickets/${ticketId}`);
}

const CommentInput = z.object({
  ticketId: z.string().min(1),
  body: z.string().min(1).max(10000),
  visibility: z.enum(["PUBLIC", "INTERNAL"]).default("PUBLIC"),
});

export async function addComment(input: unknown) {
  const user = await requireUser();
  if (!user.employeeId) throw new Error("NO_EMPLOYEE_PROFILE");
  const data = CommentInput.parse(input);

  const ticket = await prisma.ticket.findUnique({
    where: { id: data.ticketId },
  });
  if (!ticket) throw new Error("NOT_FOUND");

  // Requesters can comment publicly on their own tickets; agents need queue access.
  const isRequester = ticket.requesterId === user.employeeId;
  if (!isRequester) {
    await assertQueueAccess(user.employeeId, ticket.queueId, [
      "AGENT",
      "LEAD",
      "DEPT_ADMIN",
      "COLLABORATOR",
    ]);
  }
  // Requesters can never post internal notes.
  const visibility = isRequester ? "PUBLIC" : data.visibility;

  await prisma.comment.create({
    data: {
      ticketId: data.ticketId,
      authorId: user.employeeId,
      body: data.body,
      visibility,
    },
  });

  revalidatePath(`/tickets/${data.ticketId}`);
}
