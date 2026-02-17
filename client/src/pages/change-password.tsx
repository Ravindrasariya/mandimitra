import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Eye, EyeOff, ArrowLeft, Globe } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { Link, useLocation } from "wouter";

export default function ChangePasswordPage({ standalone = false }: { standalone?: boolean }) {
  const { user, changePassword } = useAuth();
  const { toast } = useToast();
  const { t, language, setLanguage } = useLanguage();
  const [, setLocation] = useLocation();
  const [username, setUsername] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const isLoggedIn = !!user;
  const isMustChange = isLoggedIn && user.mustChangePassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      if (isMustChange) {
        if (!phone.trim()) {
          toast({ title: "Error", description: "Please enter your registered mobile number", variant: "destructive" });
          setLoading(false);
          return;
        }
        await changePassword("", newPassword, phone.trim());
        toast({ title: "Password Changed", variant: "success" });
      } else if (standalone && !isLoggedIn) {
        if (!username.trim() || !currentPassword) {
          toast({ title: "Error", description: "Please enter your username and current password", variant: "destructive" });
          setLoading(false);
          return;
        }
        await apiRequest("POST", "/api/auth/change-password-public", {
          username: username.trim(),
          phone: phone.trim(),
          currentPassword,
          newPassword,
        });
        toast({ title: "Password Changed", description: "Please login with your new password.", variant: "success" });
        setLocation("/");
      } else {
        if (!currentPassword) {
          toast({ title: "Error", description: "Please enter your current password", variant: "destructive" });
          setLoading(false);
          return;
        }
        await changePassword(currentPassword, newPassword, phone.trim());
        toast({ title: "Password Changed", variant: "success" });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-background p-4 relative">
      <button
        data-testid="button-language-toggle"
        className="absolute top-4 right-4 flex items-center gap-1.5 rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
        onClick={() => setLanguage(language === "en" ? "hi" : "en")}
        title={language === "en" ? "हिंदी में बदलें" : "Switch to English"}
      >
        <Globe className="w-4 h-4" />
        <span className="text-xs font-medium">{language === "en" ? "हिंदी" : "EN"}</span>
      </button>
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center space-y-2 pb-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Lock className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-xl font-bold">{t("changePassword.title")}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {isMustChange
              ? `Welcome, ${user.username}! Please verify your mobile number and set a new password.`
              : "Enter your credentials and set a new password."}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLoggedIn && (
              <div className="space-y-2">
                <Label htmlFor="username" className="font-semibold">{t("login.userName")}</Label>
                <Input
                  id="username"
                  data-testid="input-cp-username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("changePassword.enterUsername")}
                  className="mobile-touch-target"
                  autoComplete="username"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="phone" className="font-semibold">{t("changePassword.registeredMobile")}</Label>
              <Input
                id="phone"
                data-testid="input-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("changePassword.enterMobile")}
                className="mobile-touch-target"
              />
            </div>
            {!isMustChange && (
              <div className="space-y-2">
                <Label htmlFor="currentPassword" className="font-semibold">{t("changePassword.currentPassword")}</Label>
                <div className="relative">
                  <Input
                    id="currentPassword"
                    data-testid="input-current-password"
                    type={showCurrentPassword ? "text" : "password"}
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t("changePassword.enterCurrent")}
                    className="mobile-touch-target pr-10"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    tabIndex={-1}
                  >
                    {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="newPassword" className="font-semibold">{t("changePassword.newPassword")}</Label>
              <div className="relative">
                <Input
                  id="newPassword"
                  data-testid="input-new-password"
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={t("changePassword.enterNew")}
                  className="mobile-touch-target pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  tabIndex={-1}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="font-semibold">{t("changePassword.confirmPassword")}</Label>
              <Input
                id="confirmPassword"
                data-testid="input-confirm-password"
                type={showNewPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("changePassword.confirmNew")}
                className="mobile-touch-target"
                autoComplete="new-password"
              />
            </div>
            <Button
              type="submit"
              data-testid="button-change-password"
              className="w-full mobile-touch-target bg-green-500"
              disabled={loading || (!isLoggedIn && (!username || !currentPassword || !phone)) || (isMustChange && !phone) || (!isMustChange && isLoggedIn && (!currentPassword || !phone)) || !newPassword || !confirmPassword}
            >
              {loading ? t("changePassword.changing") : t("changePassword.setNew")}
            </Button>
            {!isMustChange && (
              <p className="text-xs text-muted-foreground text-center">
                {t("changePassword.forgotPassword")} <span className="text-green-400 font-semibold">Krashu</span><span className="text-orange-500 font-semibold">Ved</span> at +918882589392 to reset it.
              </p>
            )}
          </form>
          {(standalone || !isLoggedIn) && (
            <div className="mt-3 text-center">
              <Link href="/" data-testid="link-back-login" className="text-green-500 text-sm font-medium inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />
                {t("changePassword.backToLogin")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
