import type { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

export type SeedResult = {
  message: string;
  password: string;
  logins: { email: string; role: string }[];
};

// Idempotent seed (upserts) — safe to run repeatedly. Shared by the CLI seed
// (`npm run db:seed`) and the secret-guarded /api/admin/bootstrap endpoint so
// a fresh deploy can be bootstrapped without shell/DB access (PMO pattern #7).
export async function runSeed(prisma: PrismaClient): Promise<SeedResult> {
  const DEMO_PASSWORD = "Password123!";

  // ── Departments ──────────────────────────────────────────────────────
  const it = await prisma.department.upsert({
    where: { slug: "it" },
    update: {},
    create: { name: "Information Technology", slug: "it" },
  });

  const facilities = await prisma.department.upsert({
    where: { slug: "facilities" },
    update: {},
    create: { name: "Facilities", slug: "facilities" },
  });

  // ── Queues ───────────────────────────────────────────────────────────
  const helpdesk = await prisma.queue.upsert({
    where: { slug: "it-helpdesk" },
    update: {},
    create: {
      name: "IT Helpdesk",
      slug: "it-helpdesk",
      description: "Tier 1 support for all staff.",
      isPrivate: false,
      departmentId: it.id,
    },
  });

  await prisma.queue.upsert({
    where: { slug: "facilities-requests" },
    update: {},
    create: {
      name: "Facilities Requests",
      slug: "facilities-requests",
      description: "Building, maintenance, and workspace requests.",
      isPrivate: false,
      departmentId: facilities.id,
    },
  });

  // ── Employees ────────────────────────────────────────────────────────
  const adminEmp = await prisma.employee.upsert({
    where: { email: "admin@stmarysbank.com" },
    update: {},
    create: {
      displayName: "Help Desk Admin",
      email: "admin@stmarysbank.com",
      title: "IT Service Manager",
      departmentId: it.id,
    },
  });

  const agentEmp = await prisma.employee.upsert({
    where: { email: "agent@stmarysbank.com" },
    update: {},
    create: {
      displayName: "Tier 1 Agent",
      email: "agent@stmarysbank.com",
      title: "Support Analyst",
      departmentId: it.id,
    },
  });

  const requesterEmp = await prisma.employee.upsert({
    where: { email: "teller@stmarysbank.com" },
    update: {},
    create: {
      displayName: "Branch Teller",
      email: "teller@stmarysbank.com",
      title: "Teller",
      departmentId: facilities.id,
    },
  });

  // ── Users (Credentials login) ────────────────────────────────────────
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await prisma.user.upsert({
    where: { email: "admin@stmarysbank.com" },
    update: { role: "SYS_ADMIN", employeeId: adminEmp.id, passwordHash },
    create: {
      email: "admin@stmarysbank.com",
      name: "Help Desk Admin",
      role: "SYS_ADMIN",
      passwordHash,
      employeeId: adminEmp.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "agent@stmarysbank.com" },
    update: { role: "AGENT", employeeId: agentEmp.id, passwordHash },
    create: {
      email: "agent@stmarysbank.com",
      name: "Tier 1 Agent",
      role: "AGENT",
      passwordHash,
      employeeId: agentEmp.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "teller@stmarysbank.com" },
    update: { role: "END_USER", employeeId: requesterEmp.id, passwordHash },
    create: {
      email: "teller@stmarysbank.com",
      name: "Branch Teller",
      role: "END_USER",
      passwordHash,
      employeeId: requesterEmp.id,
    },
  });

  // ── Queue memberships (scoped permissions) ───────────────────────────
  for (const [employeeId, role] of [
    [adminEmp.id, "DEPT_ADMIN"],
    [agentEmp.id, "AGENT"],
  ] as const) {
    await prisma.queueMembership.upsert({
      where: { employeeId_queueId: { employeeId, queueId: helpdesk.id } },
      update: { role },
      create: { employeeId, queueId: helpdesk.id, role },
    });
  }

  // ── One demo ticket ──────────────────────────────────────────────────
  const existing = await prisma.ticket.findFirst({
    where: { queueId: helpdesk.id },
  });
  if (!existing) {
    await prisma.ticket.create({
      data: {
        reference: "IT-100001",
        subject: "Cannot connect to Wi-Fi in the Elm St branch",
        queueId: helpdesk.id,
        requesterId: requesterEmp.id,
        source: "PORTAL",
        status: "NEW",
        events: {
          create: {
            actorId: requesterEmp.id,
            eventType: "CREATED",
            toValue: "NEW",
          },
        },
        comments: {
          create: {
            authorId: requesterEmp.id,
            body: "My laptop shows connected but no internet since this morning.",
            visibility: "PUBLIC",
          },
        },
      },
    });
  }

  return {
    message: "Seed complete.",
    password: DEMO_PASSWORD,
    logins: [
      { email: "admin@stmarysbank.com", role: "SYS_ADMIN" },
      { email: "agent@stmarysbank.com", role: "AGENT" },
      { email: "teller@stmarysbank.com", role: "END_USER" },
    ],
  };
}
