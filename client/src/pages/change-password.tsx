import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, ArrowLeft } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";

export default function ChangePasswordPage({ standalone = false }: { standalone?: boolean }) {
  const { user, changePassword } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLoggedIn = !!user;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const effectivePhone = phone.trim();
    const effectiveUsername = isLoggedIn ? user.username : username.trim();

    if (!isLoggedIn && !effectiveUsername) {
      toast({ title: "Error", description: "Please enter your username", variant: "destructive" });
      return;
    }
    if (!effectivePhone) {
      toast({ title: "Error", description: "Please enter your registered mobile number", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 4) {
      toast({ title: "Error", description: "Password must be at least 4 characters", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      if (isLoggedIn) {
        await changePassword("", newPassword, effectivePhone);
        toast({ title: "Success", description: "Password changed successfully" });
      } else {
        const res = await apiRequest("POST", "/api/auth/reset-password", {
          username: effectiveUsername,
          phone: effectivePhone,
          newPassword,
        });
        const data = await res.json();
        toast({ title: "Success", description: data.message || "Password changed successfully" });
        setLocation("/");
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-background p-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center space-y-2 pb-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold">Change Password</CardTitle>
          <p className="text-muted-foreground text-sm">
            {isLoggedIn
              ? `Welcome, ${user.username}! Verify your mobile number and set a new password.`
              : "Enter your username, registered mobile number, and a new password."}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoggedIn && (
              <div className="space-y-2">
                <Label htmlFor="username" className="font-semibold">User Name</Label>
                <Input
                  id="username"
                  data-testid="input-cp-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="mobile-touch-target"
                  autoComplete="username"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="phone" className="font-semibold">Registered Mobile Number</Label>
              <Input
                id="phone"
                data-testid="input-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Enter your registered mobile number"
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="font-semibold">New Password</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  data-testid="input-new-password"
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="mobile-touch-target pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-semibold">Confirm Password</Label>
              <Input
                id="confirmPassword"
                data-testid="input-confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="mobile-touch-target"
              />
            </div>
            <Button
              type="submit"
              data-testid="button-change-password"
              className="w-full mobile-touch-target bg-green-500"
              disabled={loading || (!isLoggedIn && !username) || !phone || !newPassword || !confirmPassword}
            >
              {loading ? "Changing..." : "Set New Password"}
            </Button>
          </form>
          {(standalone || !isLoggedIn) && (
            <div className="mt-3 text-center">
              <Link href="/" data-testid="link-back-login" className="text-green-500 text-sm font-medium inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />
                Back to Login
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
