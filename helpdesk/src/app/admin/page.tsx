import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Middleware already gates /admin; re-check on the server (boundary, not cosmetic).
  await requireRole("SYS_ADMIN", "DEPT_ADMIN");

  const [departments, queues, memberships, employees] = await Promise.all([
    prisma.department.findMany({ orderBy: { name: "asc" } }),
    prisma.queue.findMany({
      orderBy: { name: "asc" },
      include: { department: { select: { name: true } } },
    }),
    prisma.queueMembership.findMany({
      include: {
        employee: { select: { displayName: true } },
        queue: { select: { name: true } },
      },
      orderBy: { grantedAt: "desc" },
      take: 50,
    }),
    prisma.employee.count(),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-2xl font-bold text-navy-900">
        Admin console
      </h1>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="Departments" value={departments.length} />
        <Stat label="Queues" value={queues.length} />
        <Stat label="Memberships" value={memberships.length} />
        <Stat label="Employees" value={employees} />
      </div>

      <Panel title="Queues">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="py-1">Queue</th>
              <th>Department</th>
              <th>Private</th>
            </tr>
          </thead>
          <tbody>
            {queues.map((q) => (
              <tr key={q.id} className="border-t border-gray-100">
                <td className="py-1 text-navy-900">{q.name}</td>
                <td className="text-gray-500">{q.department.name}</td>
                <td className="text-gray-500">{q.isPrivate ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      <Panel title="Queue membership matrix">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-gray-500">
              <th className="py-1">Employee</th>
              <th>Queue</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {memberships.map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="py-1 text-navy-900">{m.employee.displayName}</td>
                <td className="text-gray-500">{m.queue.name}</td>
                <td className="text-gray-500">{m.role}</td>
              </tr>
            ))}
            {memberships.length === 0 && (
              <tr>
                <td colSpan={3} className="py-2 text-gray-500">
                  No memberships yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-bold text-navy-900">{value}</div>
      <div className="text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold text-navy-900">{title}</h2>
      {children}
    </section>
  );
}
