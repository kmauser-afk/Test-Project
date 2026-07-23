import type { NextAuthConfig } from "next-auth";

// Edge-safe config: NO Prisma / bcrypt imports here so `middleware.ts` can run
// on the edge runtime. Real providers (Credentials/Entra) are added in auth.ts
// (Node runtime). Callbacks here are DB-free and therefore edge-safe.
//
// Protected route prefixes — the security boundary lives in middleware, not
// just in layouts, so Server Components never stream data to a signed-out user.
const PROTECTED = ["/portal", "/tickets", "/agent", "/admin", "/reports"];
const ADMIN_ROLES = ["SYS_ADMIN", "DEPT_ADMIN"];

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  providers: [], // populated in auth.ts
  callbacks: {
    // Gate requests in middleware.
    authorized({ auth, request: { nextUrl } }) {
      const path = nextUrl.pathname;
      const isLoggedIn = !!auth?.user;
      const role = (auth?.user as { role?: string } | undefined)?.role;

      const isProtected = PROTECTED.some(
        (p) => path === p || path.startsWith(p + "/"),
      );
      if (isProtected && !isLoggedIn) return false;

      if (path.startsWith("/admin") && !ADMIN_ROLES.includes(role ?? "")) {
        return false;
      }
      return true;
    },
    // Carry id / role / employeeId on the token so route gating needs no DB call.
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "END_USER";
        token.employeeId = (user as { employeeId?: string | null }).employeeId ?? null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub as string;
        (session.user as { role?: string }).role = token.role as string;
        (session.user as { employeeId?: string | null }).employeeId =
          (token.employeeId as string | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

export default authConfig;
