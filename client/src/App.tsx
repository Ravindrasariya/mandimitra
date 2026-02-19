import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { LanguageProvider, useLanguage } from "@/lib/language";
import { useIsMobile } from "@/hooks/use-mobile";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ChangePasswordPage from "@/pages/change-password";
import AdminPage from "@/pages/admin";
import DashboardPage from "@/pages/dashboard";
import StockEntryPage from "@/pages/stock-entry";
import StockRegisterPage from "@/pages/stock-register";
import BiddingPage from "@/pages/bidding";
import TransactionsPage from "@/pages/transactions";
import CashPage from "@/pages/cash";
import FarmerLedgerPage from "@/pages/farmer-ledger";
import BuyerLedgerPage from "@/pages/buyer-ledger";
import {
  LayoutDashboard, Package, ClipboardList, Gavel, Receipt, Wallet, Users, ShoppingBag, LogOut, Wheat, Menu, ChevronLeft, ChevronRight, Globe, Phone, UserCircle,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { path: "/", labelKey: "nav.dashboard", icon: LayoutDashboard, shortLabelKey: "nav.dash", testId: "dashboard" },
  { path: "/stock-entry", labelKey: "nav.stockEntry", icon: Package, shortLabelKey: "nav.entry", testId: "entry" },
  { path: "/register", labelKey: "nav.stockRegister", icon: ClipboardList, shortLabelKey: "nav.register", testId: "register" },
  { path: "/bidding", labelKey: "nav.bidding", icon: Gavel, shortLabelKey: "nav.bidding", testId: "bidding" },
  { path: "/transactions", labelKey: "nav.transactions", icon: Receipt, shortLabelKey: "nav.txns", testId: "txns" },
  { path: "/cash", labelKey: "nav.cash", icon: Wallet, shortLabelKey: "nav.cash", testId: "cash" },
  { path: "/farmer-ledger", labelKey: "nav.farmerLedger", icon: Users, shortLabelKey: "nav.farmers", testId: "farmers" },
  { path: "/buyer-ledger", labelKey: "nav.buyerLedger", icon: ShoppingBag, shortLabelKey: "nav.buyers", testId: "buyers" },
];

function LanguageToggle({ compact }: { compact?: boolean }) {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      data-testid="button-language-toggle"
      className={`flex items-center gap-1.5 rounded-md text-sm transition-colors ${compact ? "px-2 py-1.5" : "px-3 py-2"} hover:bg-accent`}
      onClick={() => setLanguage(language === "en" ? "hi" : "en")}
      title={language === "en" ? "हिंदी में बदलें" : "Switch to English"}
    >
      <Globe className="w-4 h-4 flex-shrink-0" />
      {!compact && <span className="text-xs font-medium">{language === "en" ? "हिंदी" : "EN"}</span>}
    </button>
  );
}

function ProfileDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (!user) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCircle className="w-5 h-5" />
            {t("nav.profile")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="flex justify-between items-start gap-2">
            <span className="text-sm text-muted-foreground">{t("profile.name")}</span>
            <span className="text-sm font-medium text-right" data-testid="text-profile-name">{user.name}</span>
          </div>
          <div className="flex justify-between items-start gap-2">
            <span className="text-sm text-muted-foreground">{t("profile.mobile")}</span>
            <span className="text-sm font-medium text-right" data-testid="text-profile-mobile">{user.phone || "—"}</span>
          </div>
          <div className="flex justify-between items-start gap-2">
            <span className="text-sm text-muted-foreground">{t("profile.merchant")}</span>
            <span className="text-sm font-medium text-right" data-testid="text-profile-merchant">{user.businessName}</span>
          </div>
          {user.businessAddress && (
            <div className="flex justify-between items-start gap-2">
              <span className="text-sm text-muted-foreground">{t("profile.address")}</span>
              <span className="text-sm font-medium text-right" data-testid="text-profile-address">{user.businessAddress}</span>
            </div>
          )}
          <div className="flex justify-between items-center gap-2">
            <span className="text-sm text-muted-foreground">{t("profile.accessType")}</span>
            <Badge variant={user.accessLevel === "edit" ? "default" : "secondary"} data-testid="badge-profile-access">
              {user.accessLevel === "edit" ? t("profile.editAccess") : t("profile.viewAccess")}
            </Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function MobileBottomNav() {
  const [location] = useLocation();
  const [showMore, setShowMore] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const { logout } = useAuth();
  const { t } = useLanguage();

  const primaryNav = navItems.slice(0, 4);
  const moreNav = navItems.slice(4);

  return (
    <>
      {showMore && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-card border-t rounded-t-xl p-3 space-y-1" onClick={(e) => e.stopPropagation()}>
            {moreNav.map((item) => (
              <Link key={item.path} href={item.path}>
                <button
                  data-testid={`nav-more-${item.testId}`}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm ${location === item.path ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
                  onClick={() => setShowMore(false)}
                >
                  <item.icon className="w-5 h-5" />
                  {t(item.labelKey)}
                </button>
              </Link>
            ))}
            <div className="border-t my-1 pt-1">
              <button
                data-testid="nav-more-profile"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm hover-elevate"
                onClick={() => { setShowMore(false); setProfileOpen(true); }}
              >
                <UserCircle className="w-5 h-5" />
                {t("nav.profile")}
              </button>
              <button
                data-testid="nav-more-logout"
                className="w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm text-destructive hover-elevate"
                onClick={() => { setShowMore(false); logout(); }}
              >
                <LogOut className="w-5 h-5" />
                {t("nav.logout")}
              </button>
            </div>
          </div>
        </div>
      )}
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t safe-area-bottom">
        <div className="flex items-stretch">
          {primaryNav.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path} className="flex-1">
                <button
                  data-testid={`nav-${item.testId}`}
                  className={`w-full flex flex-col items-center justify-center py-2 px-1 text-xs gap-0.5 ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  <span className="truncate max-w-full">{t(item.shortLabelKey)}</span>
                </button>
              </Link>
            );
          })}
          <button
            data-testid="nav-more"
            className={`flex-1 flex flex-col items-center justify-center py-2 px-1 text-xs gap-0.5 ${showMore ? "text-primary" : "text-muted-foreground"}`}
            onClick={() => setShowMore(!showMore)}
          >
            <Menu className="w-5 h-5" />
            <span>{t("nav.more")}</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <div className={`hidden md:flex flex-col border-r bg-sidebar h-screen sticky top-0 transition-all duration-200 ${collapsed ? "w-16" : "w-56"}`}>
      <div className="flex items-center gap-2 p-3 border-b h-14">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Wheat className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight truncate">
            <span className="font-bold text-lg">{t("app.name")}</span>
            <span className="text-[9px] -mt-0.5">by <span className="text-green-500 font-semibold">Krashu</span><span className="text-orange-500 font-semibold">Ved</span></span>
          </div>
        )}
        <Button
          variant="secondary"
          size="icon"
          className="ml-auto flex-shrink-0"
          onClick={onToggle}
          data-testid="button-toggle-sidebar"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </Button>
      </div>
      <ScrollArea className="flex-1 py-2">
        <div className="space-y-0.5 px-2">
          {navItems.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path}>
                <button
                  data-testid={`sidebar-${item.testId}`}
                  className={`w-full flex items-center gap-3 rounded-md text-sm transition-colors ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"} ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover-elevate"}`}
                  title={collapsed ? t(item.labelKey) : undefined}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
                </button>
              </Link>
            );
          })}
        </div>
      </ScrollArea>
      <div className="border-t p-2 space-y-0.5">
        <div className={`flex ${collapsed ? "justify-center" : "px-1"}`}>
          <LanguageToggle compact={collapsed} />
        </div>
        <button
          data-testid="button-profile"
          className={`w-full flex items-center gap-3 rounded-md text-sm px-3 py-2.5 hover-elevate ${collapsed ? "justify-center" : ""}`}
          onClick={() => setProfileOpen(true)}
          title={collapsed ? t("nav.profile") : undefined}
        >
          <UserCircle className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>{t("nav.profile")}</span>}
        </button>
        <button
          data-testid="button-logout"
          className={`w-full flex items-center gap-3 rounded-md text-sm text-destructive px-3 py-2.5 hover-elevate ${collapsed ? "justify-center" : ""}`}
          onClick={logout}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>{t("nav.logout")}</span>}
        </button>
      </div>
      <ProfileDialog open={profileOpen} onOpenChange={setProfileOpen} />
    </div>
  );
}

function MobileHeader() {
  const { t } = useLanguage();

  return (
    <header className="md:hidden flex items-center justify-between px-3 py-2 border-b bg-card sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
          <Wheat className="w-4 h-4 text-primary" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="font-bold text-lg">{t("app.name")}</span>
          <span className="text-[9px] -mt-0.5">by <span className="text-green-500 font-semibold">Krashu</span><span className="text-orange-500 font-semibold">Ved</span></span>
        </div>
      </div>
      <LanguageToggle />
    </header>
  );
}

function AppLayout() {
  const isMobile = useIsMobile();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <DesktopSidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileHeader />
        <main className={`flex-1 overflow-y-auto ${isMobile ? "pb-20" : ""}`}>
          <Switch>
            <Route path="/" component={DashboardPage} />
            <Route path="/stock-entry" component={StockEntryPage} />
            <Route path="/register" component={StockRegisterPage} />
            <Route path="/bidding" component={BiddingPage} />
            <Route path="/transactions" component={TransactionsPage} />
            <Route path="/cash" component={CashPage} />
            <Route path="/farmer-ledger" component={FarmerLedgerPage} />
            <Route path="/buyer-ledger" component={BuyerLedgerPage} />
            <Route component={NotFound} />
          </Switch>
        </main>
        <footer className={`border-t bg-background text-xs text-muted-foreground px-4 py-2 flex flex-col sm:flex-row items-center justify-between gap-1 ${isMobile ? "mb-16" : ""}`}>
          <span className="flex items-center gap-1">
            <Phone className="w-3 h-3" /> Need Help? Reach out to <span className="font-medium"><span className="text-green-600">Krashu</span><span className="text-orange-500">Ved</span></span> : +918882589392
          </span>
          <span>Powered by <span className="font-medium"><span className="text-green-600">Krashu</span><span className="text-orange-500">Ved</span></span> &nbsp;All Rights Reserved</span>
        </footer>
        {isMobile && <MobileBottomNav />}
      </div>
    </div>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();
  const { t } = useLanguage();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
            <Wheat className="w-6 h-6 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm">{t("app.loading")}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <Switch>
        <Route path="/change-password">
          <ChangePasswordPage standalone />
        </Route>
        <Route>
          <LoginPage />
        </Route>
      </Switch>
    );
  }
  if (user.mustChangePassword) return <ChangePasswordPage />;
  if (user.role === "system_admin") return <AdminPage />;
  return <AppLayout />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LanguageProvider>
          <AuthProvider>
            <AuthGate />
            <Toaster />
          </AuthProvider>
        </LanguageProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
