export default function Dashboard() {
  return (
    <main className="min-h-screen bg-background text-foreground p-6" data-testid="dashboard-page">
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Trading Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Dashboard source was missing and has been restored with a safe placeholder.
          </p>
        </header>

        <section className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">
            Your app is up again. If you want the previous full dashboard layout back,
            provide a backup copy of <code className="font-mono">Dashboard.tsx</code> and it can be restored exactly.
          </p>
        </section>
      </div>
    </main>
  );
}
