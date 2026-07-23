import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const session = await auth();
  if (session?.user) redirect("/portal");

  const entraEnabled = !!process.env.AUTH_ENTRA_ID_ID;

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="font-serif text-2xl font-bold text-navy-900">Sign in</h1>
      <p className="mt-1 text-sm text-gray-600">
        St. Mary&rsquo;s Bank Help Desk
      </p>

      {searchParams?.error && (
        <p className="mt-4 rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          Sign-in failed. Check your email and password.
        </p>
      )}

      {entraEnabled && (
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/portal" });
          }}
        >
          <button className="w-full rounded bg-navy-900 px-4 py-2 font-semibold text-white hover:bg-navy-800">
            Sign in with Microsoft
          </button>
        </form>
      )}

      <form
        className="mt-6 space-y-3"
        action={async (formData: FormData) => {
          "use server";
          try {
            await signIn("credentials", {
              email: String(formData.get("email") ?? ""),
              password: String(formData.get("password") ?? ""),
              redirectTo: "/portal",
            });
          } catch (error) {
            if (error instanceof AuthError) {
              redirect("/login?error=CredentialsSignin");
            }
            throw error;
          }
        }}
      >
        <label className="block text-sm">
          <span className="text-gray-700">Email</span>
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-gray-700">Password</span>
          <input
            name="password"
            type="password"
            required
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>
        <button className="w-full rounded bg-gold-500 px-4 py-2 font-semibold text-navy-900 hover:bg-gold-400">
          Sign in
        </button>
      </form>
    </div>
  );
}
