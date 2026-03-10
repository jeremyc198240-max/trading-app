import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ClerkProvider } from "@clerk/clerk-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import CheckoutSuccess from "@/pages/CheckoutSuccess";
import ManageSubscription from "@/pages/ManageSubscription";
import ProtectedRoute from "@/components/ProtectedRoute";

const CLERK_KEY =
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const HAS_CLERK_KEY = typeof CLERK_KEY === "string" && CLERK_KEY.trim().length > 0;

function Router() {
  return (
    <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/login/:rest*" component={LoginPage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/signup/:rest*" component={SignupPage} />
      <Route path="/signup" component={SignupPage} />
      <Route path="/success" component={CheckoutSuccess} />
      <Route path="/manage-subscription" component={ManageSubscription} />
      <Route path="/app">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  if (!HAS_CLERK_KEY) {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
              <section className="max-w-2xl w-full rounded-lg border border-border bg-card p-6 space-y-4">
                <h1 className="text-2xl font-semibold">Missing Clerk Key</h1>
                <p className="text-muted-foreground">
                  Set <code className="font-mono">VITE_CLERK_PUBLISHABLE_KEY</code> in a
                  <code className="font-mono"> .env.local</code> file at the project root,
                  then restart the dev server.
                </p>
                <pre className="rounded-md bg-muted p-3 overflow-x-auto text-sm">
{`VITE_CLERK_PUBLISHABLE_KEY=pk_test_your_key_here`}
                </pre>
                <p className="text-sm text-muted-foreground">
                  Get your publishable key from Clerk Dashboard: API Keys.
                </p>
              </section>
            </main>
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return (
    <ClerkProvider publishableKey={CLERK_KEY} afterSignOutUrl="/">
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </ClerkProvider>
  );
}

export default App;
