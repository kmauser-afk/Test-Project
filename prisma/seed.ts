import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // ── Department + queues ──────────────────────────────────────────────
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

  const helpdesk = await prisma.queue.upsert({
    where: { slug: "it-helpdesk" },
    update: {},
    create: {
      name: "IT Helpdesk",
      slug: "it-helpdesk",
      description: "Tier 1 support for all staff.",
      isPrivate: false, // requesters may submit here
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

  // ── Users (Credentials login for local/dev) ──────────────────────────
  const password = await bcrypt.hash("Password123!", 10);

  await prisma.user.upsert({
    where: { email: "admin@stmarysbank.com" },
    update: { role: "SYS_ADMIN", employeeId: adminEmp.id },
    create: {
      email: "admin@stmarysbank.com",
      name: "Help Desk Admin",
      role: "SYS_ADMIN",
      passwordHash: password,
      employeeId: adminEmp.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "agent@stmarysbank.com" },
    update: { role: "AGENT", employeeId: agentEmp.id },
    create: {
      email: "agent@stmarysbank.com",
      name: "Tier 1 Agent",
      role: "AGENT",
      passwordHash: password,
      employeeId: agentEmp.id,
    },
  });

  await prisma.user.upsert({
    where: { email: "teller@stmarysbank.com" },
    update: { role: "END_USER", employeeId: requesterEmp.id },
    create: {
      email: "teller@stmarysbank.com",
      name: "Branch Teller",
      role: "END_USER",
      passwordHash: password,
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

  console.log("✅ Seed complete.");
  console.log("   Logins (password: Password123!):");
  console.log("   - admin@stmarysbank.com   (SYS_ADMIN)");
  console.log("   - agent@stmarysbank.com   (AGENT)");
  console.log("   - teller@stmarysbank.com  (END_USER)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
