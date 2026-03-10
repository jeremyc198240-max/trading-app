import { SignIn } from "@clerk/clerk-react";
import { BarChart3 } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4" data-testid="login-page">
      <div className="mb-8 flex items-center gap-2.5">
        <div className="p-1.5 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30">
          <BarChart3 className="w-5 h-5 text-cyan-400" />
        </div>
        <span className="text-lg font-black tracking-tight bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
          Trading Terminal
        </span>
      </div>
      <SignIn
        routing="path"
        path="/login"
        signUpUrl="/signup"
        fallbackRedirectUrl="/app"
        appearance={{
          variables: {
            colorBackground: "hsl(222, 47%, 9%)",
            colorText: "hsl(210, 40%, 96%)",
            colorTextSecondary: "hsl(215, 16%, 57%)",
            colorInputBackground: "hsl(217, 19%, 14%)",
            colorInputText: "hsl(210, 40%, 96%)",
            colorPrimary: "hsl(199, 89%, 48%)",
            colorDanger: "hsl(0, 84%, 60%)",
            borderRadius: "0.5rem",
          },
          elements: {
            rootBox: "mx-auto",
            card: "bg-card border border-border shadow-lg",
            headerTitle: "text-foreground",
            headerSubtitle: "text-muted-foreground",
            formFieldLabel: "text-foreground",
            formFieldInput: "bg-[hsl(217,19%,14%)] text-foreground border-border placeholder:text-muted-foreground",
            formButtonPrimary: "bg-primary text-primary-foreground hover:opacity-90",
            footerActionLink: "text-cyan-400 hover:text-cyan-300",
            identityPreviewEditButton: "text-cyan-400",
            formFieldInputShowPasswordButton: "text-muted-foreground",
            otpCodeFieldInput: "bg-[hsl(217,19%,14%)] text-foreground border-border text-lg",
            otpCodeField: "gap-2",
            dividerLine: "bg-border",
            dividerText: "text-muted-foreground",
            socialButtonsBlockButton: "bg-[hsl(217,19%,14%)] text-foreground border-border hover:bg-[hsl(217,19%,18%)]",
            socialButtonsBlockButtonText: "text-foreground",
            formFieldAction: "text-cyan-400",
            footerActionText: "text-muted-foreground",
            alertText: "text-foreground",
            formResendCodeLink: "text-cyan-400",
            backLink: "text-cyan-400",
          },
        }}
      />
    </div>
  );
}
