import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, Users as UsersIcon, Plus, Search, Pencil, Power, Archive, RotateCcw,
  Trash2, KeyRound, LogOut, AlertTriangle, PlayCircle, Upload, X, FileText, ChevronDown, ChevronRight,
} from "lucide-react";
import type { Business, User, DemoVideo, ReceiptTemplate } from "@shared/schema";
import { CROPS } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type SafeUser = Omit<User, "password"> & { business: Business };

function StatusBadge({ status }: { status: string }) {
  const { t } = useLanguage();
  if (status === "active") return <Badge data-testid="badge-status-active" className="bg-green-500 hover:bg-green-600">{t("common.active")}</Badge>;
  if (status === "inactive") return <Badge data-testid="badge-status-inactive" variant="secondary">{t("common.inactive")}</Badge>;
  return <Badge data-testid="badge-status-archived" variant="outline">Archived</Badge>;
}

export default function AdminPage() {
  const { logout } = useAuth();
  const { t } = useLanguage();
  const [tab, setTab] = useState<"merchants" | "users" | "videos">("merchants");

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b bg-card sticky top-0 z-30">
        <div>
          <h1 className="text-lg font-bold">{t("admin.title")}</h1>
          <p className="text-xs text-muted-foreground">{t("admin.subtitle")}</p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-admin-logout" onClick={logout}>
          <LogOut className="w-4 h-4 mr-1" /> {t("nav.logout")}
        </Button>
      </header>

      <div className="px-4 md:px-6 py-4">
        <div className="flex gap-2 mb-6">
          <Button
            variant={tab === "merchants" ? "default" : "outline"}
            size="sm"
            data-testid="tab-merchants"
            onClick={() => setTab("merchants")}
          >
            <Building2 className="w-4 h-4 mr-1" /> {t("admin.merchants")}
          </Button>
          <Button
            variant={tab === "users" ? "default" : "outline"}
            size="sm"
            data-testid="tab-users"
            onClick={() => setTab("users")}
          >
            <UsersIcon className="w-4 h-4 mr-1" /> {t("admin.users")}
          </Button>
          <Button
            variant={tab === "videos" ? "default" : "outline"}
            size="sm"
            data-testid="tab-videos"
            onClick={() => setTab("videos")}
          >
            <PlayCircle className="w-4 h-4 mr-1" /> {t("demoVideos.title")}
          </Button>
        </div>

        {tab === "merchants" ? <MerchantsTab /> : tab === "users" ? <UsersTab /> : <DemoVideosTab />}
      </div>
    </div>
  );
}

function MerchantsTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editBiz, setEditBiz] = useState<Business | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "toggle" | "archive" | "reset"; biz: Business } | null>(null);
  const [templatesBiz, setTemplatesBiz] = useState<Business | null>(null);

  const { data: businesses = [], isLoading } = useQuery<Business[]>({
    queryKey: ["/api/admin/businesses"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string; address: string; licenceNo: string; shopNo: string; initials: string }) => {
      const res = await apiRequest("POST", "/api/admin/businesses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: "Merchant Created", variant: "success" });
      setShowAdd(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Business> }) => {
      const res = await apiRequest("PATCH", `/api/admin/businesses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: "Merchant Updated", variant: "success" });
      setEditBiz(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = businesses.filter(b =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.merchantId.toLowerCase().includes(search.toLowerCase()) ||
    (b.phone || "").includes(search)
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{t("admin.merchants")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("admin.manageMerchants")}</p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-merchants"
                  placeholder={t("admin.searchMerchants")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button data-testid="button-add-merchant" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1" /> {t("admin.addMerchant")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("admin.noMerchants")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 px-2 font-medium">{t("admin.merchantId")}</th>
                    <th className="py-2 px-2 font-medium">{t("common.name")}</th>
                    <th className="py-2 px-2 font-medium">{t("admin.status")}</th>
                    <th className="py-2 px-2 font-medium">{t("common.contact")}</th>
                    <th className="py-2 px-2 font-medium">{t("common.address")}</th>
                    <th className="py-2 px-2 font-medium text-right">{t("common.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((biz) => (
                    <tr key={biz.id} className="border-b hover:bg-muted/50" data-testid={`row-merchant-${biz.id}`}>
                      <td className="py-3 px-2 font-mono text-xs">{biz.merchantId}</td>
                      <td className="py-3 px-2 font-medium">{biz.name}</td>
                      <td className="py-3 px-2"><StatusBadge status={biz.status} /></td>
                      <td className="py-3 px-2">{biz.phone ? `${biz.phone}` : "-"}</td>
                      <td className="py-3 px-2 max-w-[200px] truncate text-muted-foreground">{biz.address || "-"}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-edit-merchant-${biz.id}`}
                            title={t("common.edit")}
                            onClick={() => setEditBiz(biz)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-toggle-merchant-${biz.id}`}
                            title={biz.status === "active" ? "Deactivate" : "Activate"}
                            onClick={() => setConfirmAction({ type: "toggle", biz })}
                          >
                            <Power className={`w-4 h-4 ${biz.status === "active" ? "text-green-600" : "text-muted-foreground"}`} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-archive-merchant-${biz.id}`}
                            title={biz.status === "archived" ? "Unarchive" : "Archive"}
                            onClick={() => setConfirmAction({ type: "archive", biz })}
                          >
                            <Archive className={`w-4 h-4 ${biz.status === "archived" ? "text-orange-500" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-reset-merchant-${biz.id}`}
                            title="Reset"
                            onClick={() => setConfirmAction({ type: "reset", biz })}
                          >
                            <RotateCcw className="w-4 h-4 text-destructive" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-receipt-templates-${biz.id}`}
                            title="Receipt Templates"
                            onClick={() => setTemplatesBiz(biz)}
                          >
                            <FileText className="w-4 h-4 text-blue-600" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddMerchantDialog open={showAdd} onClose={() => setShowAdd(false)} onSubmit={(data) => createMutation.mutate(data)} isPending={createMutation.isPending} />
      {editBiz && <EditMerchantDialog biz={editBiz} onClose={() => setEditBiz(null)} onSubmit={(data) => updateMutation.mutate({ id: editBiz.id, data })} isPending={updateMutation.isPending} />}
      {confirmAction && <ConfirmMerchantAction action={confirmAction} onClose={() => setConfirmAction(null)} />}
      {templatesBiz && <ReceiptTemplatesDialog biz={templatesBiz} onClose={() => setTemplatesBiz(null)} />}
    </>
  );
}

function AddMerchantDialog({ open, onClose, onSubmit, isPending }: { open: boolean; onClose: () => void; onSubmit: (data: { name: string; phone: string; address: string; licenceNo: string; shopNo: string; initials: string }) => void; isPending: boolean }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [licenceNo, setLicenceNo] = useState("");
  const [shopNo, setShopNo] = useState("");
  const [initials, setInitials] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, phone, address, licenceNo, shopNo, initials });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setName(""); setPhone(""); setAddress(""); setLicenceNo(""); setShopNo(""); setInitials(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.addMerchant")}</DialogTitle>
          <DialogDescription>{t("admin.createMerchant")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label>{t("admin.businessName")}</Label>
              <Input data-testid="input-merchant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter business name" required />
            </div>
            <div className="w-24 space-y-2">
              <Label>Initials</Label>
              <Input data-testid="input-merchant-initials" value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="e.g. MM" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.contactNumber")}</Label>
            <Input data-testid="input-merchant-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter contact number" />
          </div>
          <div className="space-y-2">
            <Label>{t("common.address")}</Label>
            <Input data-testid="input-merchant-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter address" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Licence No</Label>
              <Input data-testid="input-merchant-licence-no" value={licenceNo} onChange={(e) => setLicenceNo(e.target.value)} placeholder="Enter licence no." />
            </div>
            <div className="space-y-2">
              <Label>Shop No</Label>
              <Input data-testid="input-merchant-shop-no" value={shopNo} onChange={(e) => setShopNo(e.target.value)} placeholder="Enter shop no." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" data-testid="button-save-merchant" disabled={isPending || !name}>{isPending ? t("common.saving") : t("common.save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMerchantDialog({ biz, onClose, onSubmit, isPending }: { biz: Business; onClose: () => void; onSubmit: (data: Partial<Business>) => void; isPending: boolean }) {
  const { t } = useLanguage();
  const [name, setName] = useState(biz.name);
  const [phone, setPhone] = useState(biz.phone || "");
  const [address, setAddress] = useState(biz.address || "");
  const [licenceNo, setLicenceNo] = useState(biz.licenceNo || "");
  const [shopNo, setShopNo] = useState(biz.shopNo || "");
  const [initials, setInitials] = useState(biz.initials || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, phone, address, licenceNo, shopNo, initials });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.editMerchant")}</DialogTitle>
          <DialogDescription>{t("admin.updateMerchant")} {biz.merchantId}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label>{t("admin.businessName")}</Label>
              <Input data-testid="input-edit-merchant-name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="w-24 space-y-2">
              <Label>Initials</Label>
              <Input data-testid="input-edit-merchant-initials" value={initials} onChange={(e) => setInitials(e.target.value)} placeholder="e.g. MM" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("admin.contactNumber")}</Label>
            <Input data-testid="input-edit-merchant-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("common.address")}</Label>
            <Input data-testid="input-edit-merchant-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Licence No</Label>
              <Input data-testid="input-edit-merchant-licence-no" value={licenceNo} onChange={(e) => setLicenceNo(e.target.value)} placeholder="Enter licence no." />
            </div>
            <div className="space-y-2">
              <Label>Shop No</Label>
              <Input data-testid="input-edit-merchant-shop-no" value={shopNo} onChange={(e) => setShopNo(e.target.value)} placeholder="Enter shop no." />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" data-testid="button-update-merchant" disabled={isPending || !name}>{isPending ? "Updating..." : t("admin.update")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmMerchantAction({ action, onClose }: { action: { type: "toggle" | "archive" | "reset"; biz: Business }; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [adminPassword, setAdminPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/businesses/${action.biz.id}/toggle-status`, { adminPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: `Merchant ${action.biz.status === "active" ? "Deactivated" : "Activated"}`, variant: "success" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/businesses/${action.biz.id}/archive`, { adminPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: `Merchant ${action.biz.status === "archived" ? "Reinstated" : "Archived"}`, variant: "success" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/businesses/${action.biz.id}/reset`, { adminPassword, resetPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/books/");
      }});
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/cash-entries");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && (key.startsWith("/api/books/balance-sheet") || key.startsWith("/api/books/profit-and-loss"));
      }});
      toast({ title: "Business Data Reset", variant: "success" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isPending = toggleMutation.isPending || archiveMutation.isPending || resetMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (action.type === "toggle") toggleMutation.mutate();
    else if (action.type === "archive") archiveMutation.mutate();
    else resetMutation.mutate();
  };

  const isToggle = action.type === "toggle";
  const isArchive = action.type === "archive";
  const isReset = action.type === "reset";

  const title = isToggle
    ? (action.biz.status === "active" ? "Deactivate Merchant" : "Activate Merchant")
    : isArchive
    ? (action.biz.status === "archived" ? "Reinstate Merchant" : "Archive Merchant")
    : "Reset Merchant Data";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={isReset ? "text-destructive" : ""}>{title}</DialogTitle>
          <DialogDescription>
            {action.biz.name} ({action.biz.merchantId})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isReset && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">
                <p className="font-semibold">Warning: This action cannot be undone!</p>
                <p className="mt-1">This will permanently delete ALL data entered by users of this business including farmers, buyers, lots, bids, transactions, and cash entries. Business and user account details will be preserved.</p>
              </div>
            </div>
          )}

          {(isToggle || isArchive) && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {isToggle
                  ? (action.biz.status === "active"
                    ? "No users under this business will be able to login while it is inactive."
                    : "Users under this business will be able to login again.")
                  : (action.biz.status === "archived"
                    ? "Users under this business will be able to login again after reinstatement."
                    : "No users under this business will be able to login while it is archived.")}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>{t("admin.adminPassword")}</Label>
            <Input
              data-testid="input-admin-password"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter your admin password"
              required
            />
          </div>

          {isReset && (
            <div className="space-y-2">
              <Label>{t("admin.resetPassword")}</Label>
              <Input
                data-testid="input-reset-password"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Enter reset password"
                required
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              type="submit"
              variant={isReset ? "destructive" : "default"}
              data-testid="button-confirm-action"
              disabled={isPending || !adminPassword || (isReset && !resetPassword)}
            >
              {isPending ? t("admin.processing") : t("admin.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const FARMER_PLACEHOLDERS = [
  { token: "{{BUSINESS_NAME}}", desc: "Firm / business name" },
  { token: "{{BUSINESS_ADDRESS}}", desc: "Business address" },
  { token: "{{SERIAL_NUMBER}}", desc: "Serial number of the lot group" },
  { token: "{{DATE}}", desc: "Date of transaction" },
  { token: "{{FARMER_NAME}}", desc: "Farmer full name" },
  { token: "{{FARMER_PHONE}}", desc: "Farmer phone number" },
  { token: "{{FARMER_VILLAGE}}", desc: "Farmer village" },
  { token: "{{FARMER_TEHSIL}}", desc: "Farmer tehsil" },
  { token: "{{FARMER_DISTRICT}}", desc: "Farmer district" },
  { token: "{{VEHICLE_NUMBER}}", desc: "Vehicle number" },
  { token: "{{TOTAL_BAGS}}", desc: "Total number of bags" },
  { token: "{{NET_WEIGHT}}", desc: "Total net weight (kg)" },
  { token: "{{GROSS_AMOUNT}}", desc: "Gross sale amount" },
  { token: "{{HAMMALI}}", desc: "Total hammali deduction" },
  { token: "{{AADHAT}}", desc: "Aadhat commission" },
  { token: "{{MANDI_CHARGES}}", desc: "Mandi charges" },
  { token: "{{FREIGHT}}", desc: "Freight/bhada amount" },
  { token: "{{ADVANCE}}", desc: "Farmer advance amount" },
  { token: "{{TOTAL_DEDUCTION}}", desc: "Sum of all deductions" },
  { token: "{{NET_PAYABLE}}", desc: "Net amount payable to farmer" },
  { token: "{{TXN_ROWS_HTML}}", desc: "Full HTML table rows of all transactions (crop, bags, weight, rate, amount)" },
];

const BUYER_PLACEHOLDERS = [
  { token: "{{BUSINESS_NAME}}", desc: "Firm / business name" },
  { token: "{{BUSINESS_ADDRESS}}", desc: "Business address" },
  { token: "{{LOT_ID}}", desc: "Lot ID" },
  { token: "{{DATE}}", desc: "Date of transaction" },
  { token: "{{BUYER_NAME}}", desc: "Buyer name" },
  { token: "{{BUYER_CODE}}", desc: "Buyer licence number" },
  { token: "{{FARMER_NAME}}", desc: "Farmer name" },
  { token: "{{CROP}}", desc: "Crop name" },
  { token: "{{SIZE}}", desc: "Produce size/grade" },
  { token: "{{BAGS}}", desc: "Number of bags" },
  { token: "{{NET_WEIGHT}}", desc: "Net weight in kg" },
  { token: "{{RATE}}", desc: "Rate per kg" },
  { token: "{{GROSS_AMOUNT}}", desc: "Gross amount" },
  { token: "{{HAMMALI}}", desc: "Hammali charge (buyer)" },
  { token: "{{EXTRA_CHARGES}}", desc: "Extra charges (buyer)" },
  { token: "{{AADHAT}}", desc: "Aadhat commission" },
  { token: "{{AADHAT_PCT}}", desc: "Aadhat percentage" },
  { token: "{{MANDI_CHARGES}}", desc: "Mandi charges" },
  { token: "{{MANDI_PCT}}", desc: "Mandi percentage" },
  { token: "{{TOTAL_RECEIVABLE}}", desc: "Total amount receivable from buyer" },
  { token: "{{RECEIPT_SERIAL}}", desc: "Bill no. (auto-assigned per buyer/date/crop/FY)" },
];

function ReceiptTemplatesDialog({ biz, onClose }: { biz: Business; onClose: () => void }) {
  const { toast } = useToast();
  const [buyerCrop, setBuyerCrop] = useState<string>("");
  const [farmerCrop, setFarmerCrop] = useState<string>("");
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  const { data: templates = [], isLoading, refetch } = useQuery<ReceiptTemplate[]>({
    queryKey: [`/api/admin/receipt-templates/${biz.id}`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/receipt-templates/${biz.id}`);
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ templateType, crop, templateHtml }: { templateType: string; crop: string; templateHtml: string }) => {
      const res = await apiRequest("POST", `/api/admin/receipt-templates/${biz.id}`, { templateType, crop, templateHtml });
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Template uploaded", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Upload failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/receipt-templates/${biz.id}/${id}`);
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Template deleted", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const handleFileUpload = (templateType: string, crop: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".html,text/html";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const templateHtml = await file.text();
      uploadMutation.mutate({ templateType, crop, templateHtml });
    };
    input.click();
  };

  const farmerTemplates = templates.filter(t => t.templateType === "farmer");
  const buyerTemplates = templates.filter(t => t.templateType === "buyer");
  const overallBuyerTemplate = templates.find(t => t.templateType === "buyer-overall");

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Receipt Templates — {biz.name}
          </DialogTitle>
          <DialogDescription>
            Upload custom HTML receipt formats for this business. If not uploaded, the default format is used.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="py-6 text-center text-muted-foreground text-sm">Loading...</div>
        ) : (
          <div className="space-y-5">
            <div className="border rounded-lg p-4 space-y-3">
              <div>
                <p className="font-medium text-sm">Farmer Receipts</p>
                <p className="text-xs text-muted-foreground">Different template per crop — select a crop, then upload</p>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Select crop</label>
                  <Select value={farmerCrop} onValueChange={setFarmerCrop}>
                    <SelectTrigger data-testid="select-farmer-crop-template" className="h-8">
                      <SelectValue placeholder="Choose a crop..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CROPS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline" size="sm"
                  data-testid="button-upload-farmer-template"
                  disabled={!farmerCrop || uploadMutation.isPending}
                  onClick={() => farmerCrop && handleFileUpload("farmer", farmerCrop)}
                >
                  <Upload className="w-3 h-3 mr-1" /> Upload HTML
                </Button>
              </div>

              {farmerTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No farmer templates uploaded yet — using default for all crops.</p>
              ) : (
                <div className="space-y-2">
                  {farmerTemplates.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-muted/40 rounded px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3 h-3 text-green-600" />
                        <span className="text-sm font-medium">{t.crop || "Generic"}</span>
                        <span className="text-xs text-muted-foreground">Updated {new Date(t.updatedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleFileUpload("farmer", t.crop)} disabled={uploadMutation.isPending} title="Replace">
                          <Upload className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" data-testid={`button-delete-farmer-template-${t.crop || 'generic'}`} onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending} title="Delete">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div>
                <p className="font-medium text-sm">Buyer Receipts</p>
                <p className="text-xs text-muted-foreground">Different template per crop — select a crop, then upload</p>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs text-muted-foreground">Select crop</label>
                  <Select value={buyerCrop} onValueChange={setBuyerCrop}>
                    <SelectTrigger data-testid="select-buyer-crop-template" className="h-8">
                      <SelectValue placeholder="Choose a crop..." />
                    </SelectTrigger>
                    <SelectContent>
                      {CROPS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline" size="sm"
                  data-testid="button-upload-buyer-template"
                  disabled={!buyerCrop || uploadMutation.isPending}
                  onClick={() => buyerCrop && handleFileUpload("buyer", buyerCrop)}
                >
                  <Upload className="w-3 h-3 mr-1" /> Upload HTML
                </Button>
              </div>

              {buyerTemplates.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No buyer templates uploaded yet — using default for all crops.</p>
              ) : (
                <div className="space-y-2">
                  {buyerTemplates.map(t => (
                    <div key={t.id} className="flex items-center justify-between bg-muted/40 rounded px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileText className="w-3 h-3 text-green-600" />
                        <span className="text-sm font-medium">{t.crop}</span>
                        <span className="text-xs text-muted-foreground">Updated {new Date(t.updatedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => handleFileUpload("buyer", t.crop)} disabled={uploadMutation.isPending} title="Replace">
                          <Upload className="w-3 h-3" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(t.id)} disabled={deleteMutation.isPending} title="Delete">
                          <Trash2 className="w-3 h-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Overall Buyer Receipt</p>
                  <p className="text-xs text-muted-foreground">Single template for the combined/filtered buyer statement</p>
                </div>
                {overallBuyerTemplate ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <FileText className="w-3 h-3" /> Custom uploaded
                    </span>
                    <Button
                      variant="ghost" size="icon"
                      data-testid="button-delete-overall-buyer-template"
                      onClick={() => deleteMutation.mutate(overallBuyerTemplate.id)}
                      disabled={deleteMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleFileUpload("buyer-overall", "")} disabled={uploadMutation.isPending}>
                      <Upload className="w-3 h-3 mr-1" /> Replace
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" data-testid="button-upload-overall-buyer-template" onClick={() => handleFileUpload("buyer-overall", "")} disabled={uploadMutation.isPending}>
                    <Upload className="w-3 h-3 mr-1" /> Upload HTML
                  </Button>
                )}
              </div>
              {overallBuyerTemplate && (
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(overallBuyerTemplate.updatedAt).toLocaleDateString()}
                </p>
              )}
            </div>

            <Collapsible open={showPlaceholders} onOpenChange={setShowPlaceholders}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="w-full justify-between text-muted-foreground">
                  <span className="text-xs">Available template placeholders</span>
                  {showPlaceholders ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Farmer Receipt</p>
                    <div className="space-y-1">
                      {FARMER_PLACEHOLDERS.map(p => (
                        <div key={p.token} className="flex gap-2 text-xs">
                          <code className="font-mono text-blue-700 dark:text-blue-400 whitespace-nowrap">{p.token}</code>
                          <span className="text-muted-foreground">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">Buyer Receipt</p>
                    <div className="space-y-1">
                      {BUYER_PLACEHOLDERS.map(p => (
                        <div key={p.token} className="flex gap-2 text-xs">
                          <code className="font-mono text-blue-700 dark:text-blue-400 whitespace-nowrap">{p.token}</code>
                          <span className="text-muted-foreground">{p.desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<SafeUser | null>(null);

  const { data: allUsers = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ["/api/admin/businesses"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { username: string; name: string; phone: string; businessId: number; accessLevel: string }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Created", description: "Default password: password123", variant: "success" });
      setShowAdd(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Updated", variant: "success" });
      setEditUser(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User Deleted", variant: "success" });
      setDeleteUser(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetPwMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/users/${id}/reset-password`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Password Reset", description: "Default password: password123", variant: "success" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = allUsers.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.phone || "").includes(search)
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">{t("admin.users")}</CardTitle>
              <p className="text-xs text-muted-foreground">{t("admin.manageUsers")}</p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-users"
                  placeholder={t("admin.searchUsers")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button data-testid="button-add-user" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1" /> {t("admin.addUser")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("admin.noUsers")}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 px-2 font-medium">Username</th>
                    <th className="py-2 px-2 font-medium">Name</th>
                    <th className="py-2 px-2 font-medium">Mobile</th>
                    <th className="py-2 px-2 font-medium">Merchant</th>
                    <th className="py-2 px-2 font-medium">Permissions</th>
                    <th className="py-2 px-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b hover:bg-muted/50" data-testid={`row-user-${u.id}`}>
                      <td className="py-3 px-2 font-medium">{u.username}</td>
                      <td className="py-3 px-2">{u.name || "-"}</td>
                      <td className="py-3 px-2">{u.phone || "-"}</td>
                      <td className="py-3 px-2">{u.business?.name || "-"}</td>
                      <td className="py-3 px-2">
                        {u.role === "system_admin" ? (
                          <Badge className="bg-green-500 hover:bg-green-600">Full Access</Badge>
                        ) : u.accessLevel === "view" ? (
                          <Badge variant="outline">View Only</Badge>
                        ) : (
                          <Badge variant="secondary">Can Edit</Badge>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-end gap-1">
                          {u.role !== "system_admin" && (
                            <>
                              <Button
                                variant="ghost" size="icon"
                                data-testid={`button-edit-user-${u.id}`}
                                title="Edit"
                                onClick={() => setEditUser(u)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                data-testid={`button-reset-password-${u.id}`}
                                title="Reset Password"
                                onClick={() => resetPwMutation.mutate(u.id)}
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                data-testid={`button-delete-user-${u.id}`}
                                title="Delete"
                                onClick={() => setDeleteUser(u)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showAdd && (
        <AddUserDialog
          open={showAdd}
          onClose={() => setShowAdd(false)}
          businesses={businesses}
          onSubmit={(data) => createMutation.mutate(data)}
          isPending={createMutation.isPending}
        />
      )}

      {editUser && (
        <EditUserDialog
          user={editUser}
          businesses={businesses}
          onClose={() => setEditUser(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editUser.id, data })}
          isPending={updateMutation.isPending}
        />
      )}

      {deleteUser && (
        <Dialog open onOpenChange={(v) => { if (!v) setDeleteUser(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>Are you sure you want to delete this user?</DialogDescription>
            </DialogHeader>
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3">
              <p className="text-sm"><strong>Username:</strong> {deleteUser.username}</p>
              <p className="text-sm"><strong>Name:</strong> {deleteUser.name}</p>
              <p className="text-sm"><strong>Merchant:</strong> {deleteUser.business?.name}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
              <Button
                variant="destructive"
                data-testid="button-confirm-delete-user"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteUser.id)}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function AddUserDialog({ open, onClose, businesses, onSubmit, isPending }: {
  open: boolean;
  onClose: () => void;
  businesses: Business[];
  onSubmit: (data: { username: string; name: string; phone: string; businessId: number; accessLevel: string }) => void;
  isPending: boolean;
}) {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessId, setBusinessId] = useState<string>("");
  const [accessLevel, setAccessLevel] = useState<string>("edit");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ username, name, phone, businessId: parseInt(businessId), accessLevel });
  };

  const activeBusinesses = businesses.filter(b => b.status === "active");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setUsername(""); setName(""); setPhone(""); setBusinessId(""); setAccessLevel("edit"); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("admin.addUser")}</DialogTitle>
          <DialogDescription>Create a new user with default password: password123</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("common.name")} *</Label>
            <Input data-testid="input-user-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter full name" required />
          </div>
          <div className="space-y-2">
            <Label>Username *</Label>
            <Input data-testid="input-user-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" required />
          </div>
          <div className="space-y-2">
            <Label>Mobile Number *</Label>
            <Input data-testid="input-user-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter mobile number" required />
          </div>
          <div className="space-y-2">
            <Label>Assign Merchant *</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger data-testid="select-user-business">
                <SelectValue placeholder="Select a merchant" />
              </SelectTrigger>
              <SelectContent>
                {activeBusinesses.map(b => (
                  <SelectItem key={b.id} value={b.id.toString()}>{b.name}{b.address ? ` — ${b.address}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Access Level *</Label>
            <Select value={accessLevel} onValueChange={setAccessLevel}>
              <SelectTrigger data-testid="select-user-access-level">
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="edit">Can Edit</SelectItem>
                <SelectItem value="view">View Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" data-testid="button-save-user" disabled={isPending || !username || !name || !phone || !businessId}>
              {isPending ? t("common.saving") : t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, businesses, onClose, onSubmit, isPending }: {
  user: SafeUser;
  businesses: Business[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const { t } = useLanguage();
  const [username, setUsername] = useState(user.username);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || "");
  const [businessId, setBusinessId] = useState(user.businessId.toString());
  const [accessLevel, setAccessLevel] = useState(user.accessLevel || "edit");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ username, name, phone, businessId: parseInt(businessId), accessLevel });
  };

  const activeBusinesses = businesses.filter(b => b.status === "active");

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update user account details</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>{t("common.name")} *</Label>
            <Input data-testid="input-edit-user-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Username *</Label>
            <Input data-testid="input-edit-user-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Mobile Number</Label>
            <Input data-testid="input-edit-user-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Assign Merchant *</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger data-testid="select-edit-user-business">
                <SelectValue placeholder="Select a merchant" />
              </SelectTrigger>
              <SelectContent>
                {activeBusinesses.map(b => (
                  <SelectItem key={b.id} value={b.id.toString()}>{b.name}{b.address ? ` — ${b.address}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Access Level *</Label>
            <Select value={accessLevel} onValueChange={setAccessLevel}>
              <SelectTrigger data-testid="select-edit-user-access-level">
                <SelectValue placeholder="Select access level" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="edit">Can Edit</SelectItem>
                <SelectItem value="view">View Only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" data-testid="button-update-user" disabled={isPending || !username || !name}>{isPending ? "Updating..." : t("admin.update")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DemoVideosTab() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [caption, setCaption] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [editingVideo, setEditingVideo] = useState<DemoVideo | null>(null);
  const [editCaption, setEditCaption] = useState("");
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: videos = [], isLoading } = useQuery<DemoVideo[]>({
    queryKey: ["/api/demo-videos"],
  });

  const handleUpload = async (file: File) => {
    if (!caption.trim()) {
      toast({ title: "Caption is required", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("video", file);
      formData.append("caption", caption.trim());
      const res = await fetch("/api/admin/demo-videos", { method: "POST", body: formData, credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      queryClient.invalidateQueries({ queryKey: ["/api/demo-videos"] });
      setCaption("");
      toast({ title: "Video uploaded successfully" });
    } catch (e: any) {
      toast({ title: e.message || "Upload failed", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/demo-videos/${id}`, { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error("Delete failed");
      queryClient.invalidateQueries({ queryKey: ["/api/demo-videos"] });
      setDeleteConfirmId(null);
      toast({ title: "Video deleted" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
  };

  const handleEditCaption = async () => {
    if (!editingVideo || !editCaption.trim()) return;
    try {
      await apiRequest("PATCH", `/api/admin/demo-videos/${editingVideo.id}`, { caption: editCaption.trim() });
      queryClient.invalidateQueries({ queryKey: ["/api/demo-videos"] });
      setEditingVideo(null);
      toast({ title: "Caption updated" });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div>
      <p className="text-sm text-muted-foreground mb-4">{t("demoVideos.manageVideos")}</p>

      <Card className="mb-6">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-2">
            <Label>{t("demoVideos.caption")} *</Label>
            <Input
              data-testid="input-video-caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder={t("demoVideos.captionPlaceholder")}
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="file"
              accept="video/*"
              id="video-upload-input"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(file);
                e.target.value = "";
              }}
              data-testid="input-video-file"
            />
            <Button
              disabled={isUploading || !caption.trim()}
              onClick={() => document.getElementById("video-upload-input")?.click()}
              data-testid="button-upload-video"
            >
              <Upload className="w-4 h-4 mr-1" />
              {isUploading ? t("demoVideos.uploading") : t("demoVideos.upload")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : videos.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">{t("demoVideos.noVideos")}</div>
      ) : (
        <div className="space-y-3">
          {videos.map((video) => (
            <Card key={video.id} data-testid={`admin-video-${video.id}`}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{video.caption}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {video.originalName} &middot; {formatFileSize(video.fileSize)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingVideo(video); setEditCaption(video.caption); }} data-testid={`button-edit-video-${video.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(video.id)} data-testid={`button-delete-video-${video.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingVideo} onOpenChange={() => setEditingVideo(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Caption</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              data-testid="input-edit-video-caption"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              placeholder={t("demoVideos.captionPlaceholder")}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingVideo(null)}>{t("common.cancel")}</Button>
              <Button onClick={handleEditCaption} disabled={!editCaption.trim()} data-testid="button-save-video-caption">{t("common.save")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("demoVideos.deleteConfirm")}</DialogTitle>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>{t("common.cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)} data-testid="button-confirm-delete-video">{t("common.delete")}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

