import { useState } from "react";
import { BarChart3, CreditCard, ArrowLeft, Mail, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth, UserButton } from "@clerk/clerk-react";
import TermsAcceptanceModal from "@/components/TermsAcceptanceModal";

export default function ManageSubscription() {
  const { isSignedIn } = useAuth();
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <a href="/" className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Trading Terminal
            </span>
          </a>
          <div className="flex items-center gap-3">
            <a href="/app" data-testid="link-back-to-app">
              <Button variant="ghost">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to App
              </Button>
            </a>
            {isSignedIn && <UserButton afterSignOutUrl="/" />}
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 lg:px-6 py-16">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center p-3 rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 mb-4">
            <CreditCard className="w-8 h-8 text-cyan-400" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-manage-title">
            Manage Your Subscription
          </h1>
          <p className="text-muted-foreground">
            View, update, or cancel your subscription at any time.
          </p>
        </div>

        <div className="space-y-6">
          <Card data-testid="card-cancel-trial">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <XCircle className="w-5 h-5 text-red-400" />
                Cancel Your Trial or Subscription
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                You can cancel your free trial at any time before the 2-day trial period ends and you will not be charged. To cancel:
              </p>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                  <Mail className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Check Your Email</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      When you signed up, Stripe sent you a confirmation email with a link to manage your subscription. Click "Manage Subscription" in that email to cancel.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-md bg-muted/50">
                  <CreditCard className="w-5 h-5 text-cyan-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Contact Support</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      If you can't find the email, reach out to us and we'll cancel your subscription immediately. You will not be billed if you cancel during the trial period.
                    </p>
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs text-muted-foreground">
                  <strong className="text-foreground/70">No-charge guarantee:</strong> If you cancel within the 2-day free trial, your card will not be charged. If you've already been billed and believe it was an error, please contact support for assistance.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card data-testid="card-start-subscription">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Don't have a subscription yet?</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Start your 2-day free trial to access all premium features. Cancel anytime before the trial ends and you won't be charged.
              </p>
              <Button
                onClick={() => setTermsOpen(true)}
                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0"
                data-testid="button-start-trial-manage"
              >
                Start Free Trial
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <TermsAcceptanceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
