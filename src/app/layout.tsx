import type { Metadata } from "next";
import Link from "next/link";
import { auth, signOut } from "@/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "St. Mary's Bank — Help Desk",
  description: "Internal service desk for St. Mary's Bank employees.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const user = session?.user as
    | { name?: string | null; email?: string | null; role?: string }
    | undefined;

  return (
    <html lang="en">
      <body className="font-body min-h-screen">
        <header className="bg-navy-900 text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
            <Link href="/" className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded bg-gold-500 font-serif text-sm font-bold text-navy-900">
                SMB
              </span>
              <span className="font-semibold">Help Desk</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {user ? (
                <>
                  <Link href="/portal" className="hover:text-gold-400">
                    Portal
                  </Link>
                  <Link href="/agent" className="hover:text-gold-400">
                    Agent
                  </Link>
                  {(user.role === "SYS_ADMIN" || user.role === "DEPT_ADMIN") && (
                    <Link href="/admin" className="hover:text-gold-400">
                      Admin
                    </Link>
                  )}
                  <span className="text-white/60">
                    {user.name ?? user.email}
                  </span>
                  <form
                    action={async () => {
                      "use server";
                      await signOut({ redirectTo: "/login" });
                    }}
                  >
                    <button className="rounded border border-white/30 px-2 py-1 hover:bg-white/10">
                      Sign out
                    </button>
                  </form>
                </>
              ) : (
                <Link href="/login" className="hover:text-gold-400">
                  Sign in
                </Link>
              )}
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
