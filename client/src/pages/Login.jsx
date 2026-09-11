import { useState } from "react";
import { toast } from "sonner";
import { Loader2, LogIn, Mail } from "lucide-react";
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

export default function Login({ onLogin, onSwitchToRegister }) {
  const [form, setForm] = useState({ email: "", password: "" });
  const [submitting, setSubmitting] = useState(false);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.email || !form.password) {
      return toast.error("Enter your email and password");
    }
    setSubmitting(true);
    try {
      await onLogin(form);
      toast.success("Welcome back!");
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
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Log in to manage your campaigns.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="login-email">Email</Label>
              <Input
                id="login-email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={form.email}
                onChange={set("email")}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="login-password">Password</Label>
              <Input
                id="login-password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={form.password}
                onChange={set("password")}
              />
            </div>
            <Button type="submit" disabled={submitting} className="mt-2">
              {submitting ? <Loader2 className="animate-spin" /> : <LogIn />}
              Log in
            </Button>
          </form>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don't have an account?{" "}
            <button
              type="button"
              onClick={onSwitchToRegister}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Create one
            </button>
          </p>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
