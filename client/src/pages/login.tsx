import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Wheat, Eye, EyeOff } from "lucide-react";
import { Link } from "wouter";

export default function LoginPage() {
  const { login } = useAuth();
  const { toast } = useToast();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      await login(username, password);
    } catch (err: any) {
      toast({ title: "Login Failed", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 dark:bg-background p-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="text-center space-y-2 pb-2">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Wheat className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Mandi Mitra</CardTitle>
          <p className="text-sm">by <span className="text-green-400 font-semibold">Krashu</span><span className="text-orange-500 font-semibold">Ved</span></p>
          <p className="text-muted-foreground text-sm">Agricultural Marketplace Manager</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="font-semibold">User Name</Label>
              <Input
                id="username"
                data-testid="input-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter Your Username"
                className="mobile-touch-target"
                autoComplete="username"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="font-semibold">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  data-testid="input-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="mobile-touch-target pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  data-testid="button-toggle-password"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button
              type="submit"
              data-testid="button-login"
              className="w-full mobile-touch-target bg-green-500"
              disabled={loading || !username || !password}
            >
              {loading ? "Signing in..." : "Login"}
            </Button>
          </form>
          <div className="mt-3 text-center">
            <Link href="/change-password" data-testid="link-change-password" className="text-green-500 text-sm font-medium">
              Change Password
            </Link>
          </div>
        </CardContent>
      </Card>
      <p data-testid="text-help-footer" className="mt-6 text-center text-xs text-muted-foreground">
        Need Help? Please reach out to <span className="text-green-400 font-semibold">Krashu</span><span className="text-orange-500 font-semibold">Ved</span> +918882589392
      </p>
    </div>
  );
}
