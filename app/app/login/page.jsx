import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in | AI Pulse" };

export default async function LoginPage({ searchParams }) {
  const sp = await searchParams;
  const next = typeof sp?.next === "string" ? sp.next : "/";
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="card w-full max-w-sm p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          829 Studios · AI Pulse
        </p>
        <h1 className="mt-1 text-xl font-semibold">Sign in</h1>
        <LoginForm next={next} />
      </div>
    </main>
  );
}
