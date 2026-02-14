import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import type { Buyer, BuyerEditHistory } from "@shared/schema";
import { ShoppingBag, Search, Plus, Pencil, Users } from "lucide-react";
import { format } from "date-fns";

type BuyerWithDues = Buyer & { receivableDue: string; overallDue: string };

function formatIndianCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `\u20B9${formatted}`;
}

export default function BuyerLedgerPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingBuyer, setEditingBuyer] = useState<BuyerWithDues | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);

  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBuyerCode, setEditBuyerCode] = useState("");
  const [editNegativeFlag, setEditNegativeFlag] = useState(false);
  const [editOpeningBalance, setEditOpeningBalance] = useState("");

  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newBuyerCode, setNewBuyerCode] = useState("");
  const [newOpeningBalance, setNewOpeningBalance] = useState("");

  const buyerQueryParams = `?withDues=true${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`;
  const { data: buyers = [], isLoading } = useQuery<BuyerWithDues[]>({
    queryKey: ["/api/buyers" + buyerQueryParams],
  });

  const { data: editHistory = [] } = useQuery<BuyerEditHistory[]>({
    queryKey: [`/api/buyers/${editingBuyer?.id}/edit-history`],
    enabled: !!editingBuyer,
  });

  const createBuyerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/buyers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      setShowAddDialog(false);
      setNewName("");
      setNewAddress("");
      setNewPhone("");
      setNewBuyerCode("");
      setNewOpeningBalance("");
      toast({ title: "Success", description: t("buyerLedger.addNewBuyer") });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateBuyerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/buyers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      setEditingBuyer(null);
      toast({ title: "Updated", description: t("buyerLedger.editBuyer") });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/buyers/${id}`, { isActive });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
    },
  });

  const filteredBuyers = statusFilter === "all"
    ? buyers
    : statusFilter === "active"
      ? buyers.filter(b => b.isActive)
      : statusFilter === "inactive"
        ? buyers.filter(b => !b.isActive)
        : statusFilter === "negative"
          ? buyers.filter(b => b.negativeFlag)
          : buyers;

  const openEdit = (buyer: BuyerWithDues) => {
    setEditingBuyer(buyer);
    setEditName(buyer.name);
    setEditAddress(buyer.address || "");
    setEditPhone(buyer.phone || "");
    setEditBuyerCode(buyer.buyerCode || "");
    setEditNegativeFlag(buyer.negativeFlag);
    setEditOpeningBalance(buyer.openingBalance || "0");
  };

  const saveEdit = () => {
    if (!editingBuyer) return;
    updateBuyerMutation.mutate({
      id: editingBuyer.id,
      data: {
        name: editName,
        address: editAddress || null,
        phone: editPhone || null,
        buyerCode: editBuyerCode || null,
        negativeFlag: editNegativeFlag,
        openingBalance: editOpeningBalance || "0",
      },
    });
  };

  const addBuyer = () => {
    if (!newName.trim()) {
      toast({ title: "Error", description: "Buyer name is required", variant: "destructive" });
      return;
    }
    createBuyerMutation.mutate({
      name: newName.trim(),
      address: newAddress || null,
      phone: newPhone || null,
      buyerCode: newBuyerCode || null,
      openingBalance: newOpeningBalance || "0",
    });
  };

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
          <ShoppingBag className="w-6 h-6 text-primary" />
          {t("buyerLedger.title")}
        </h1>
        <p data-testid="text-buyer-subtitle" className="text-sm text-muted-foreground">{t("buyerLedger.subtitle")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5" />
              {t("buyerLedger.buyerManagement")}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger data-testid="select-status-filter" className="w-[100px] mobile-touch-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("common.all")}...</SelectItem>
                  <SelectItem value="active">{t("common.active")}</SelectItem>
                  <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
                  <SelectItem value="negative">{t("buyerLedger.negative")}</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-buyer-search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t("buyerLedger.searchName")}
                  className="pl-9 mobile-touch-target w-full sm:w-[180px]"
                />
              </div>
              <Button
                data-testid="button-add-buyer"
                className="mobile-touch-target"
                onClick={() => setShowAddDialog(true)}
              >
                <Plus className="w-4 h-4 mr-1" />
                {t("buyerLedger.addBuyer")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
          ) : filteredBuyers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("buyerLedger.noBuyers")}</div>
          ) : (
            <>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium"></th>
                      <th className="text-left p-3 font-medium">{t("buyerLedger.buyerId")}</th>
                      <th className="text-left p-3 font-medium">{t("common.name")}</th>
                      <th className="text-left p-3 font-medium">{t("common.address")}</th>
                      <th className="text-left p-3 font-medium">{t("buyerLedger.mandiCode")}</th>
                      <th className="text-left p-3 font-medium">{t("common.contact")}</th>
                      <th className="text-center p-3 font-medium">{t("buyerLedger.negative")}</th>
                      <th className="text-center p-3 font-medium">{t("common.active")}</th>
                      <th className="text-right p-3 font-medium">{t("buyerLedger.overallDue")}</th>
                      <th className="text-right p-3 font-medium">{t("buyerLedger.receivables")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBuyers.map((buyer) => (
                      <tr key={buyer.id} data-testid={`row-buyer-${buyer.id}`} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <button
                            data-testid={`button-edit-buyer-${buyer.id}`}
                            className="p-1.5 rounded hover:bg-muted"
                            onClick={() => openEdit(buyer)}
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </td>
                        <td className="p-3 font-mono text-xs">{buyer.buyerId}</td>
                        <td className="p-3 font-medium">{buyer.name}</td>
                        <td className="p-3 text-muted-foreground">{buyer.address || "-"}</td>
                        <td className="p-3 text-muted-foreground">{buyer.buyerCode || "-"}</td>
                        <td className="p-3">{buyer.phone || "-"}</td>
                        <td className="p-3 text-center">
                          <span className={`text-xs font-medium ${buyer.negativeFlag ? "text-destructive" : "text-muted-foreground"}`}>
                            {buyer.negativeFlag ? t("common.yes") : t("common.no")}
                          </span>
                        </td>
                        <td className="p-3 text-center">
                          <Switch
                            data-testid={`switch-active-${buyer.id}`}
                            checked={buyer.isActive}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: buyer.id, isActive: checked })
                            }
                          />
                        </td>
                        <td className="p-3 text-right font-medium">
                          {formatIndianCurrency(buyer.overallDue)}
                        </td>
                        <td className="p-3 text-right font-medium text-orange-600">
                          {formatIndianCurrency(buyer.receivableDue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3 p-3">
                {filteredBuyers.map((buyer) => (
                  <Card key={buyer.id} data-testid={`card-buyer-${buyer.id}`}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-muted-foreground">{buyer.buyerId}</span>
                            {buyer.negativeFlag && <Badge variant="destructive" className="text-xs">{t("buyerLedger.negative")}</Badge>}
                            {!buyer.isActive && <Badge variant="secondary" className="text-xs">{t("common.inactive")}</Badge>}
                          </div>
                          <p className="font-medium">{buyer.name}</p>
                          {buyer.address && <p className="text-xs text-muted-foreground">{buyer.address}</p>}
                          {buyer.phone && <p className="text-xs">{buyer.phone}</p>}
                          {buyer.buyerCode && <p className="text-xs text-muted-foreground">Code: {buyer.buyerCode}</p>}
                          <div className="flex gap-4 text-xs pt-1">
                            <span>{t("buyerLedger.overall")}: <strong>{formatIndianCurrency(buyer.overallDue)}</strong></span>
                            <span>{t("buyerLedger.receivable")}: <strong className="text-orange-600">{formatIndianCurrency(buyer.receivableDue)}</strong></span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <button
                            data-testid={`button-edit-buyer-mobile-${buyer.id}`}
                            className="p-1.5 rounded hover:bg-muted"
                            onClick={() => openEdit(buyer)}
                          >
                            <Pencil className="w-4 h-4 text-muted-foreground" />
                          </button>
                          <Switch
                            data-testid={`switch-active-mobile-${buyer.id}`}
                            checked={buyer.isActive}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: buyer.id, isActive: checked })
                            }
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editingBuyer} onOpenChange={(open) => !open && setEditingBuyer(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("buyerLedger.editBuyer")} - {editingBuyer?.buyerId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("buyerLedger.buyerId")}</Label>
              <Input value={editingBuyer?.buyerId || ""} disabled className="mobile-touch-target bg-muted" />
            </div>
            <div className="space-y-1">
              <Label>{t("common.name")} *</Label>
              <Input
                data-testid="input-edit-buyer-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("common.address")}</Label>
              <Input
                data-testid="input-edit-buyer-address"
                value={editAddress}
                onChange={(e) => setEditAddress(e.target.value)}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("common.contact")}</Label>
              <Input
                data-testid="input-edit-buyer-phone"
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="mobile-touch-target"
                maxLength={10}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("buyerLedger.buyerCode")}</Label>
              <Input
                data-testid="input-edit-buyer-code"
                value={editBuyerCode}
                onChange={(e) => setEditBuyerCode(e.target.value)}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("buyerLedger.openingBalance")}</Label>
              <Input
                data-testid="input-edit-opening-balance"
                type="text"
                inputMode="decimal"
                value={editOpeningBalance}
                onChange={(e) => setEditOpeningBalance(e.target.value)}
                className="mobile-touch-target"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("buyerLedger.negativeFlag")}</Label>
              <Switch
                data-testid="switch-edit-negative"
                checked={editNegativeFlag}
                onCheckedChange={setEditNegativeFlag}
              />
            </div>
            <Button
              data-testid="button-save-buyer-edit"
              className="w-full mobile-touch-target"
              onClick={saveEdit}
              disabled={updateBuyerMutation.isPending}
            >
              {updateBuyerMutation.isPending ? t("common.saving") : t("common.saveChanges")}
            </Button>

            {editHistory.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">{t("buyerLedger.editHistory")}</h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {editHistory.map((entry) => (
                      <div key={entry.id} className="text-xs border rounded p-2 bg-muted/50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{entry.fieldChanged}</span>
                          <span className="text-muted-foreground">
                            {format(new Date(entry.createdAt), "dd MMM yyyy, hh:mm a")}
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1">
                          <span className="line-through">{entry.oldValue || "(empty)"}</span>
                          {" → "}
                          <span className="font-medium">{entry.newValue || "(empty)"}</span>
                        </p>
                        {entry.changedBy && (
                          <p className="text-muted-foreground mt-0.5">by {entry.changedBy}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("buyerLedger.addNewBuyer")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>{t("common.name")} *</Label>
              <Input
                data-testid="input-new-buyer-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("bidding.buyerName")}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("common.address")}</Label>
              <Input
                data-testid="input-new-buyer-address"
                value={newAddress}
                onChange={(e) => setNewAddress(e.target.value)}
                placeholder={t("common.address")}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("common.contact")}</Label>
              <Input
                data-testid="input-new-buyer-phone"
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder={t("common.phone")}
                className="mobile-touch-target"
                maxLength={10}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("buyerLedger.buyerCode")}</Label>
              <Input
                data-testid="input-new-buyer-code"
                value={newBuyerCode}
                onChange={(e) => setNewBuyerCode(e.target.value)}
                placeholder={t("common.optional")}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>{t("buyerLedger.openingBalance")}</Label>
              <Input
                data-testid="input-new-opening-balance"
                type="text"
                inputMode="decimal"
                value={newOpeningBalance}
                onChange={(e) => setNewOpeningBalance(e.target.value)}
                placeholder="0"
                className="mobile-touch-target"
              />
            </div>
            <Button
              data-testid="button-submit-new-buyer"
              className="w-full mobile-touch-target"
              onClick={addBuyer}
              disabled={createBuyerMutation.isPending}
            >
              {createBuyerMutation.isPending ? t("buyerLedger.adding") : t("buyerLedger.addBuyer")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
