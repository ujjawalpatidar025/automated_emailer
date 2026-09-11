import { useState } from "react";
import { toast } from "sonner";
import { Loader2, UserPlus, Mail, ChevronDown, ExternalLink } from "lucide-react";
import AuthShell from "./AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const initial = {
  name: "",
  email: "",
  password: "",
  confirmPassword: "",
  gmailAddress: "",
  gmailSenderName: "",
  gmailAppPassword: "",
};

export default function Register({ onRegister, onSwitchToLogin }) {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) {
      return toast.error("Name, email and password are required");
    }
    if (form.password.length < 8) {
      return toast.error("Password must be at least 8 characters");
    }
    if (form.password !== form.confirmPassword) {
      return toast.error("Passwords don't match");
    }
    if (!form.gmailAddress || !form.gmailAppPassword) {
      return toast.error("Your Gmail address and App Password are required to send email");
    }

    setSubmitting(true);
    try {
      await onRegister({
        name: form.name,
        email: form.email,
        password: form.password,
        gmailAddress: form.gmailAddress,
        gmailSenderName: form.gmailSenderName,
        gmailAppPassword: form.gmailAppPassword,
      });
      toast.success("Account created — you're in!");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell>
      <Card className="shadow-lg">
        <CardHeader>
          <div className="mb-1 flex size-10 items-center justify-center rounded-lg bg-brand-gradient text-white lg:hidden">
            <Mail className="size-5" />
          </div>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            One account per Gmail sender — everyone's campaigns stay private.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="reg-name">Full name</Label>
                <Input
                  id="reg-name"
                  placeholder="Ujjawal Patidar"
                  value={form.name}
                  onChange={set("name")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={set("email")}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="reg-password">Password</Label>
                <Input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="At least 8 characters"
                  value={form.password}
                  onChange={set("password")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reg-confirm">Confirm password</Label>
                <Input
                  id="reg-confirm"
                  type="password"
                  autoComplete="new-password"
                  placeholder="Repeat password"
                  value={form.confirmPassword}
                  onChange={set("confirmPassword")}
                />
              </div>
            </div>

            <div className="mt-1 border-t pt-4">
              <p className="mb-3 text-sm font-medium">Send campaigns from</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="reg-gmail">Gmail address</Label>
                  <Input
                    id="reg-gmail"
                    type="email"
                    placeholder="you@gmail.com"
                    value={form.gmailAddress}
                    onChange={set("gmailAddress")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reg-sendername">Sender name (optional)</Label>
                  <Input
                    id="reg-sendername"
                    placeholder="Shown in the From field"
                    value={form.gmailSenderName}
                    onChange={set("gmailSenderName")}
                  />
                </div>
              </div>

              <div className="mt-4 grid gap-2">
                <Label htmlFor="reg-apppassword">Gmail App Password</Label>
                <Input
                  id="reg-apppassword"
                  type="password"
                  placeholder="xxxx xxxx xxxx xxxx"
                  value={form.gmailAppPassword}
                  onChange={set("gmailAppPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowHelp((v) => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                >
                  <ChevronDown
                    className={`size-3.5 transition-transform ${showHelp ? "rotate-180" : ""}`}
                  />
                  Where do I get this?
                </button>
                {showHelp && (
                  <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
                    <ol className="list-inside list-decimal space-y-1">
                      <li>Turn on 2-Step Verification on your Google account.</li>
                      <li>
                        Open{" "}
                        <a
                          href="https://myaccount.google.com/apppasswords"
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline"
                        >
                          Google Account → Security → App passwords
                          <ExternalLink className="size-3" />
                        </a>
                      </li>
                      <li>Create one (name it "Automator Email") and paste the 16-character code here.</li>
                    </ol>
                    <p className="mt-2">
                      Stored encrypted — we only use it to send campaigns on your
                      behalf, from your own Gmail account.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? <Loader2 className="animate-spin" /> : <UserPlus />}
              Create account
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToLogin}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Log in
            </button>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
