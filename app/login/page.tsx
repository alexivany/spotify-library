import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function safeNext(value: string | undefined): string {
  if (!value) return "/";
  return value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeNext(next);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl bg-background p-8 shadow-lg">
        <h1 className="font-heading text-xl font-bold">Spotify Library Manager</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Enter the password to continue.
        </p>

        <form action="/api/auth/login" method="post" className="mt-6 flex flex-col gap-3">
          <input type="hidden" name="next" value={nextPath} />
          <Input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            autoComplete="current-password"
            aria-label="Password"
          />
          {error && (
            <p className="text-sm text-destructive">Incorrect password.</p>
          )}
          <Button type="submit" className="mt-1">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
