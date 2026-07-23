import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

// The request gate: enforces login + admin role before any page renders.
// Uses the edge-safe config (no Prisma/bcrypt) so it runs on the edge runtime.
export default NextAuth(authConfig).auth;

export const config = {
  // Run on everything except Next internals, the auth API, static assets, and
  // public routes (login, survey token pages).
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|login|robots.txt|sitemap.xml).*)",
  ],
};
