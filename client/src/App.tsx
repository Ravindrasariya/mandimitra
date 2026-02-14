import { Switch, Route, useLocation, Link } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useIsMobile } from "@/hooks/use-mobile";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import ChangePasswordPage from "@/pages/change-password";
import AdminPage from "@/pages/admin";
import StockEntryPage from "@/pages/stock-entry";
import StockRegisterPage from "@/pages/stock-register";
import BiddingPage from "@/pages/bidding";
import TransactionsPage from "@/pages/transactions";
import CashPage from "@/pages/cash";
import FarmerLedgerPage from "@/pages/farmer-ledger";
import BuyerLedgerPage from "@/pages/buyer-ledger";
import {
  Package, ClipboardList, Gavel, Receipt, Wallet, Users, ShoppingBag, LogOut, Wheat, Menu, X, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const navItems = [
  { path: "/", label: "Stock Entry", icon: Package, shortLabel: "Entry" },
  { path: "/register", label: "Stock Register", icon: ClipboardList, shortLabel: "Register" },
  { path: "/bidding", label: "Bidding", icon: Gavel, shortLabel: "Bidding" },
  { path: "/transactions", label: "Transactions", icon: Receipt, shortLabel: "Txns" },
  { path: "/cash", label: "Cash", icon: Wallet, shortLabel: "Cash" },
  { path: "/farmer-ledger", label: "Farmer Ledger", icon: Users, shortLabel: "Farmers" },
  { path: "/buyer-ledger", label: "Buyer Ledger", icon: ShoppingBag, shortLabel: "Buyers" },
];

function MobileBottomNav() {
  const [location] = useLocation();
  const [showMore, setShowMore] = useState(false);

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
                  data-testid={`nav-more-${item.shortLabel.toLowerCase()}`}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-md text-sm ${location === item.path ? "bg-primary text-primary-foreground" : "hover-elevate"}`}
                  onClick={() => setShowMore(false)}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              </Link>
            ))}
          </div>
        </div>
      )}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t safe-area-bottom">
        <div className="flex items-stretch">
          {primaryNav.map((item) => {
            const isActive = location === item.path;
            return (
              <Link key={item.path} href={item.path} className="flex-1">
                <button
                  data-testid={`nav-${item.shortLabel.toLowerCase()}`}
                  className={`w-full flex flex-col items-center justify-center py-2 px-1 text-xs gap-0.5 ${isActive ? "text-primary font-medium" : "text-muted-foreground"}`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  <span className="truncate max-w-full">{item.shortLabel}</span>
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
            <span>More</span>
          </button>
        </div>
      </nav>
    </>
  );
}

function DesktopSidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const [location] = useLocation();
  const { logout } = useAuth();

  return (
    <div className={`hidden md:flex flex-col border-r bg-sidebar h-screen sticky top-0 transition-all duration-200 ${collapsed ? "w-16" : "w-56"}`}>
      <div className="flex items-center gap-2 p-3 border-b h-14">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Wheat className="w-4 h-4 text-primary" />
        </div>
        {!collapsed && <span className="font-bold text-sm truncate">Mandi Mitra</span>}
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
                  data-testid={`sidebar-${item.shortLabel.toLowerCase()}`}
                  className={`w-full flex items-center gap-3 rounded-md text-sm transition-colors ${collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"} ${isActive ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover-elevate"}`}
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </button>
              </Link>
            );
          })}
        </div>
      </ScrollArea>
      <div className="border-t p-2">
        <button
          data-testid="button-logout"
          className={`w-full flex items-center gap-3 rounded-md text-sm text-destructive px-3 py-2.5 hover-elevate ${collapsed ? "justify-center" : ""}`}
          onClick={logout}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </div>
  );
}

function MobileHeader() {
  const { logout } = useAuth();

  return (
    <header className="md:hidden flex items-center justify-between px-3 py-2 border-b bg-card sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
          <Wheat className="w-4 h-4 text-primary" />
        </div>
        <span className="font-bold text-sm">Mandi Mitra</span>
      </div>
      <Button
        variant="secondary"
        size="icon"
        data-testid="button-mobile-logout"
        onClick={logout}
      >
        <LogOut className="w-4 h-4" />
      </Button>
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
            <Route path="/" component={StockEntryPage} />
            <Route path="/register" component={StockRegisterPage} />
            <Route path="/bidding" component={BiddingPage} />
            <Route path="/transactions" component={TransactionsPage} />
            <Route path="/cash" component={CashPage} />
            <Route path="/farmer-ledger" component={FarmerLedgerPage} />
            <Route path="/buyer-ledger" component={BuyerLedgerPage} />
            <Route component={NotFound} />
          </Switch>
        </main>
        {isMobile && <MobileBottomNav />}
      </div>
    </div>
  );
}

function AuthGate() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto animate-pulse">
            <Wheat className="w-6 h-6 text-primary" />
          </div>
          <p className="text-muted-foreground text-sm">Loading...</p>
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
        <AuthProvider>
          <AuthGate />
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
