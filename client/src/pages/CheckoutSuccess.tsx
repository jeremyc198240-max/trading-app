import { useLocation } from "wouter";
import { BarChart3, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex items-center justify-center" data-testid="checkout-success-page">
      <div className="max-w-md text-center px-4">
        <div className="flex justify-center mb-6">
          <div className="p-4 rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
        </div>
        <h1 className="text-2xl font-bold mb-3" data-testid="text-success-title">Payment Successful</h1>
        <p className="text-muted-foreground mb-8">
          Your payment was processed successfully. You can now access the trading terminal.
        </p>
        <Button
          onClick={() => setLocation("/app")}
          className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white border-0 px-8"
          data-testid="button-go-to-app"
        >
          <BarChart3 className="w-4 h-4 mr-2" />
          Launch Trading Terminal
        </Button>
      </div>
    </div>
  );
}
