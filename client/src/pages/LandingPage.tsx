import { useState } from "react";
import { BarChart3, ArrowRight, Zap, Shield, TrendingUp, Activity, Target, Layers, LogIn, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth, UserButton } from "@clerk/clerk-react";
import TermsAcceptanceModal from "@/components/TermsAcceptanceModal";

const features = [
  {
    icon: TrendingUp,
    title: "Multi-Timeframe Fusion",
    description: "Analyze 5m to daily charts with a unified signal engine that detects consensus across timeframes.",
  },
  {
    icon: Target,
    title: "Pattern Detection",
    description: "Automatic detection of head & shoulders, flags, pennants, wedges, and 17+ structural patterns.",
  },
  {
    icon: Activity,
    title: "Live Signal Engine",
    description: "Real-time directional signals with confidence scoring, entry zones, stop losses, and R:R targets.",
  },
  {
    icon: Shield,
    title: "Price Action Safety",
    description: "Built-in safety layer prevents fighting the tape by detecting contradictions between signals and price.",
  },
  {
    icon: Layers,
    title: "Gamma Ghost Analysis",
    description: "Dealer positioning and gamma exposure mapping to identify liquidity walls and GEX flip zones.",
  },
  {
    icon: Zap,
    title: "Monster OTM Scanner",
    description: "Identifies high-probability options plays using PCE scoring with multi-factor confirmations.",
  },
];

export default function LandingPage() {
  const { isSignedIn } = useAuth();
  const [termsOpen, setTermsOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background" data-testid="landing-page">
      <nav className="sticky top-0 z-50 border-b border-border/50 bg-background/95 backdrop-blur-xl">
        <div className="h-1 bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-500" />
        <div className="max-w-6xl mx-auto px-4 lg:px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
            </div>
            <span className="text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Trading Terminal
            </span>
          </div>
          <div className="flex items-center gap-3">
            {isSignedIn ? (
              <>
                <a href="/app" data-testid="link-launch-app-nav">
                  <Button variant="outline">Launch App</Button>
                </a>
                <a href="/manage-subscription" data-testid="link-manage-subscription-nav">
                  <Button variant="ghost">
                    <CreditCard className="w-4 h-4 mr-2" />
                    Manage Subscription
                  </Button>
                </a>
                <UserButton afterSignOutUrl="/" />
              </>
            ) : (
              <>
                <a href="/login" data-testid="link-login-nav">
                  <Button variant="ghost">
                    <LogIn className="w-4 h-4 mr-2" />
                    Log In
                  </Button>
                </a>
                <a href="/signup" data-testid="link-signup-nav">
                  <Button variant="outline">Sign Up</Button>
                </a>
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-blue-500/5 to-purple-500/5" />
        <div className="absolute inset-0">
          <div className="absolute top-20 left-1/4 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute top-40 right-1/4 w-96 h-96 bg-blue-500/8 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-1/2 w-80 h-80 bg-purple-500/8 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 lg:px-6 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 mb-8">
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-xs font-semibold text-cyan-400 tracking-wider uppercase">Live Trading Analytics</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight mb-6" data-testid="text-hero-title">
            <span className="bg-gradient-to-r from-foreground via-foreground to-muted-foreground bg-clip-text text-transparent">
              Professional-Grade
            </span>
            <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
              Signal Intelligence
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
            Real-time multi-timeframe analysis, pattern detection, and actionable trading signals.
            Powered by fusion engine technology with built-in safety mechanisms.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Button
              onClick={() => setTermsOpen(true)}
              className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 px-8 text-base"
              data-testid="button-start-free-trial"
            >
              Start Free Trial
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            {isSignedIn ? (
              <a href="/app" data-testid="link-launch-app">
                <Button variant="outline" className="px-8 text-base">
                  Launch App
                </Button>
              </a>
            ) : (
              <a href="/login" data-testid="link-login-hero">
                <Button variant="outline" className="px-8 text-base">
                  Log In
                </Button>
              </a>
            )}
          </div>

          <div className="mt-8 max-w-2xl mx-auto text-left space-y-2 text-xs text-muted-foreground leading-relaxed" data-testid="text-hero-disclosure">
            <p>
              <strong className="text-foreground/70">Risk Warning:</strong> Options trading involves substantial risk of loss and is not suitable for all investors. The value of options can fluctuate significantly, and you may lose more than your initial investment. Past performance is not indicative of future results. You should carefully consider your investment objectives, level of experience, and risk appetite before engaging in options trading.
            </p>
            <p>
              <strong className="text-foreground/70">No Guarantee of Accuracy:</strong> The signals, analytics, grades, and recommendations provided by this application are generated by automated algorithms and may not always be accurate, complete, or timely. Market conditions change rapidly, and no system can predict market movements with certainty. Always verify information independently before making any trading decisions.
            </p>
            <p>
              <strong className="text-foreground/70">Not Financial Advice:</strong> Nothing on this platform constitutes financial, investment, legal, or tax advice. All content is for informational and educational purposes only. You should consult with a qualified financial advisor before making any investment decisions. Trading Terminal and its creators are not registered investment advisors, broker-dealers, or financial planners.
            </p>
            <p>
              <strong className="text-foreground/70">Limitation of Liability:</strong> Trading Terminal shall not be held liable for any losses, damages, or claims arising from the use of this application or reliance on any information provided herein. By using this platform, you acknowledge that all trading decisions are made at your own risk.
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 lg:px-6 py-20">
        <div className="text-center mb-14">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3" data-testid="text-features-title">
            Everything You Need to Trade Smarter
          </h2>
          <p className="text-muted-foreground max-w-xl mx-auto">
            A comprehensive suite of analytics tools designed for serious traders.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((feature) => (
            <Card key={feature.title} className="hover-elevate" data-testid={`card-feature-${feature.title.toLowerCase().replace(/\s+/g, '-')}`}>
              <CardContent className="pt-6 pb-5 px-5">
                <div className="p-2.5 rounded-lg bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 w-fit mb-4">
                  <feature.icon className="w-5 h-5 text-cyan-400" />
                </div>
                <h3 className="font-semibold text-base mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="border-t border-border/50 bg-gradient-to-b from-card/50 to-background">
        <div className="max-w-3xl mx-auto px-4 lg:px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Ready to Upgrade Your Trading?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
            Start your 2-day free trial today. No commitment required.
          </p>
          <Button
            onClick={() => setTermsOpen(true)}
            className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 px-8 text-base"
            data-testid="button-start-free-trial-bottom"
          >
            Start Free Trial
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </section>

      <section className="border-t border-border/50 bg-card/30">
        <div className="max-w-4xl mx-auto px-4 lg:px-6 py-10">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4" data-testid="text-disclosure-title">
            Important Disclosures
          </h3>
          <div className="space-y-3 text-xs text-muted-foreground leading-relaxed">
            <p>
              <strong className="text-foreground/70">Risk Warning:</strong> Options trading involves substantial risk of loss and is not suitable for all investors. The value of options can fluctuate significantly, and you may lose more than your initial investment. Past performance is not indicative of future results. You should carefully consider your investment objectives, level of experience, and risk appetite before engaging in options trading.
            </p>
            <p>
              <strong className="text-foreground/70">No Guarantee of Accuracy:</strong> The signals, analytics, grades, and recommendations provided by this application are generated by automated algorithms and may not always be accurate, complete, or timely. Market conditions change rapidly, and no system can predict market movements with certainty. Always verify information independently before making any trading decisions.
            </p>
            <p>
              <strong className="text-foreground/70">Not Financial Advice:</strong> Nothing on this platform constitutes financial, investment, legal, or tax advice. All content is for informational and educational purposes only. You should consult with a qualified financial advisor before making any investment decisions. Trading Terminal and its creators are not registered investment advisors, broker-dealers, or financial planners.
            </p>
            <p>
              <strong className="text-foreground/70">Limitation of Liability:</strong> Trading Terminal shall not be held liable for any losses, damages, or claims arising from the use of this application or reliance on any information provided herein. By using this platform, you acknowledge that all trading decisions are made at your own risk.
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/50 py-6">
        <div className="max-w-6xl mx-auto px-4 lg:px-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Trading Terminal</span>
          </div>
          <p className="text-xs text-muted-foreground">
            For informational purposes only. Not financial advice.
          </p>
        </div>
      </footer>

      <TermsAcceptanceModal open={termsOpen} onClose={() => setTermsOpen(false)} />
    </div>
  );
}
