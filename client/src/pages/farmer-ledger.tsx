import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { Farmer, FarmerEditHistory } from "@shared/schema";
import { Users, Search, Pencil, RefreshCw, Printer, Archive, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

type FarmerWithDues = Farmer & { totalPayable: string; totalDue: string; salesCount: number };

function formatIndianCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "₹0";
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `₹${formatted}`;
}

function generateFarmerListPrintHtml(farmers: FarmerWithDues[], summary: { total: number; withDues: number; totalPayable: number; totalDue: number }) {
  const rows = farmers.map(f => `
    <tr>
      <td style="padding:6px;border:1px solid #ddd">FM${f.id}</td>
      <td style="padding:6px;border:1px solid #ddd">${f.name}</td>
      <td style="padding:6px;border:1px solid #ddd">${f.village || "-"}</td>
      <td style="padding:6px;border:1px solid #ddd">${f.phone}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right">${formatIndianCurrency(f.totalPayable)}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right;color:${parseFloat(f.totalDue) > 0 ? '#dc2626' : '#16a34a'}">${formatIndianCurrency(f.totalDue)}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:center">${f.negativeFlag ? "FLAG" : "-"}</td>
    </tr>
  `).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Farmer Ledger</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#333}table{width:100%;border-collapse:collapse}
h2{text-align:center}th{background:#f5f5f5;padding:8px;border:1px solid #ddd;text-align:left}
.summary{display:flex;gap:20px;justify-content:center;margin:15px 0}
.summary-card{padding:10px 20px;border:1px solid #ddd;border-radius:8px;text-align:center}
@media print{body{margin:5mm}}</style></head><body>
<h2>Farmer Ledger Report</h2>
<p style="text-align:center;color:#666">${format(new Date(), "dd MMM yyyy")}</p>
<div class="summary">
<div class="summary-card"><div style="font-size:0.8em;color:#666">Total Farmers</div><div style="font-size:1.3em;font-weight:bold">${summary.total}</div></div>
<div class="summary-card"><div style="font-size:0.8em;color:#666">With Dues</div><div style="font-size:1.3em;font-weight:bold;color:#dc2626">${summary.withDues}</div></div>
<div class="summary-card"><div style="font-size:0.8em;color:#666">Total Payable</div><div style="font-size:1.3em;font-weight:bold;color:#2563eb">${formatIndianCurrency(summary.totalPayable)}</div></div>
<div class="summary-card"><div style="font-size:0.8em;color:#666">Total Dues</div><div style="font-size:1.3em;font-weight:bold;color:#dc2626">${formatIndianCurrency(summary.totalDue)}</div></div>
</div>
<table><tr><th>Farmer ID</th><th>Name</th><th>Village</th><th>Contact</th><th style="text-align:right">Total Payable</th><th style="text-align:right">Total Due</th><th style="text-align:center">Flag</th></tr>
${rows}</table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}

export default function FarmerLedgerPage() {
  const { toast } = useToast();
  const [searchName, setSearchName] = useState("");
  const [searchVillage, setSearchVillage] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [showArchived, setShowArchived] = useState(false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFarmer, setEditingFarmer] = useState<FarmerWithDues | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editVillage, setEditVillage] = useState("");
  const [editNegativeFlag, setEditNegativeFlag] = useState("false");

  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [duplicateFarmer, setDuplicateFarmer] = useState<Farmer | null>(null);

  const [historyFarmerId, setHistoryFarmerId] = useState<number | null>(null);

  const { data: farmersWithDues = [], isLoading } = useQuery<FarmerWithDues[]>({
    queryKey: ["/api/farmers-with-dues"],
  });

  const { data: editHistory = [] } = useQuery<FarmerEditHistory[]>({
    queryKey: ["/api/farmer-edit-history", historyFarmerId],
    enabled: !!historyFarmerId,
  });

  const updateFarmerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/farmers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      if (historyFarmerId) queryClient.invalidateQueries({ queryKey: ["/api/farmer-edit-history", historyFarmerId] });
      setEditDialogOpen(false);
      toast({ title: "Farmer Updated" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const mergeFarmersMutation = useMutation({
    mutationFn: async (data: { keepId: number; mergeId: number }) => {
      const res = await apiRequest("POST", "/api/farmers/merge", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      setMergeConfirmOpen(false);
      setEditDialogOpen(false);
      setDuplicateFarmer(null);
      toast({ title: "Farmers Merged", description: "Records have been merged successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const now = new Date();
  const years = Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i));

  const filteredFarmers = useMemo(() => {
    return farmersWithDues.filter(f => {
      if (!showArchived && f.isArchived) return false;
      if (showArchived && !f.isArchived) return false;
      if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (searchVillage && !(f.village || "").toLowerCase().includes(searchVillage.toLowerCase())) return false;
      if (yearFilter !== "all") {
        const year = new Date(f.createdAt).getFullYear();
        if (year !== parseInt(yearFilter)) return false;
      }
      return true;
    });
  }, [farmersWithDues, showArchived, searchName, searchVillage, yearFilter]);

  const summary = useMemo(() => {
    const total = filteredFarmers.length;
    const withDues = filteredFarmers.filter(f => parseFloat(f.totalDue) > 0).length;
    const totalPayable = filteredFarmers.reduce((s, f) => s + parseFloat(f.totalPayable), 0);
    const totalDue = filteredFarmers.reduce((s, f) => s + parseFloat(f.totalDue), 0);
    return { total, withDues, totalPayable, totalDue };
  }, [filteredFarmers]);

  const openEditDialog = (farmer: FarmerWithDues) => {
    setEditingFarmer(farmer);
    setEditName(farmer.name);
    setEditPhone(farmer.phone);
    setEditVillage(farmer.village || "");
    setEditNegativeFlag(farmer.negativeFlag ? "true" : "false");
    setHistoryFarmerId(farmer.id);
    setEditDialogOpen(true);
  };

  const saveEdit = () => {
    if (!editingFarmer) return;
    const newNeg = editNegativeFlag === "true";
    updateFarmerMutation.mutate({
      id: editingFarmer.id,
      data: { name: editName, phone: editPhone, village: editVillage, negativeFlag: newNeg },
    });
  };

  const handleSaveEdit = async () => {
    if (!editingFarmer) return;

    try {
      const checkRes = await apiRequest("POST", "/api/farmers/check-duplicate", {
        name: editName,
        phone: editPhone,
        village: editVillage,
        excludeId: editingFarmer.id,
      });
      const { duplicate } = await checkRes.json();

      if (duplicate) {
        setDuplicateFarmer(duplicate);
        setMergeConfirmOpen(true);
        return;
      }
    } catch {
      // proceed with save if duplicate check fails
    }

    saveEdit();
  };

  const handleMergeConfirm = () => {
    if (!editingFarmer || !duplicateFarmer) return;
    const keepId = Math.min(editingFarmer.id, duplicateFarmer.id);
    const mergeId = Math.max(editingFarmer.id, duplicateFarmer.id);
    mergeFarmersMutation.mutate({ keepId, mergeId });
  };

  const handleToggleArchive = (farmer: FarmerWithDues) => {
    updateFarmerMutation.mutate({
      id: farmer.id,
      data: { isArchived: !farmer.isArchived },
    });
  };

  const handleSync = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
    toast({ title: "Synced", description: "Data refreshed" });
  };

  const handlePrint = () => {
    const html = generateFarmerListPrintHtml(filteredFarmers, summary);
    const w = window.open("", "_blank", "width=800,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2 mr-auto">
          <Users className="w-6 h-6 text-primary" />
          Farmer Ledger
        </h1>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-[100px]" data-testid="select-year-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-search-name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Search By Name..."
            className="pl-8 w-[160px] h-9"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-search-village"
            value={searchVillage}
            onChange={(e) => setSearchVillage(e.target.value)}
            placeholder="Search By Village..."
            className="pl-8 w-[160px] h-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Switch
            data-testid="switch-show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">Show Archived</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleSync} data-testid="button-sync">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint} data-testid="button-print">
          <Printer className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Total Farmers</p>
            <p className="text-xl font-bold text-blue-600" data-testid="text-total-farmers">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground"># Farmers with Dues</p>
            <p className="text-xl font-bold text-orange-600" data-testid="text-farmers-with-dues">{summary.withDues}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Total Payable</p>
            <p className="text-xl font-bold text-green-600" data-testid="text-total-payable">{formatIndianCurrency(summary.totalPayable)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">Total Dues</p>
            <p className="text-xl font-bold text-red-600" data-testid="text-total-dues">{formatIndianCurrency(summary.totalDue)}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading farmers...</div>
      ) : filteredFarmers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {showArchived ? "No archived farmers found" : "No farmers found"}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-farmer-ledger">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium text-muted-foreground"></th>
                <th className="text-left p-2 font-medium text-muted-foreground">Farmer ID</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Name</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Village</th>
                <th className="text-left p-2 font-medium text-muted-foreground">Contact</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Total Payable</th>
                <th className="text-right p-2 font-medium text-muted-foreground">Total Due</th>
                <th className="text-center p-2 font-medium text-muted-foreground">Flag</th>
                <th className="text-center p-2 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredFarmers.map((farmer) => {
                const due = parseFloat(farmer.totalDue);
                return (
                  <tr key={farmer.id} className="border-b hover:bg-muted/30 transition-colors" data-testid={`row-farmer-${farmer.id}`}>
                    <td className="p-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEditDialog(farmer)}
                        data-testid={`button-edit-farmer-${farmer.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                    <td className="p-2 font-mono text-xs text-muted-foreground">FM{farmer.id}</td>
                    <td className="p-2 font-medium">{farmer.name}</td>
                    <td className="p-2 text-muted-foreground">{farmer.village || "-"}</td>
                    <td className="p-2 text-muted-foreground">{farmer.phone}</td>
                    <td className="p-2 text-right font-medium text-green-600">{formatIndianCurrency(farmer.totalPayable)}</td>
                    <td className={`p-2 text-right font-bold ${due > 0 ? "text-red-600" : due < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                      {formatIndianCurrency(farmer.totalDue)}
                    </td>
                    <td className="p-2 text-center">
                      {farmer.negativeFlag && (
                        <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                          <AlertTriangle className="w-3 h-3 mr-0.5" />
                          Flag
                        </Badge>
                      )}
                    </td>
                    <td className="p-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleToggleArchive(farmer)}
                        title={farmer.isArchived ? "Reinstate" : "Archive"}
                        data-testid={`button-archive-farmer-${farmer.id}`}
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Farmer</DialogTitle>
            <DialogDescription>Update farmer details. Duplicate detection will trigger merge if a match is found.</DialogDescription>
          </DialogHeader>
          {editingFarmer && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Name</Label>
                <Input
                  data-testid="input-edit-farmer-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Contact</Label>
                <Input
                  data-testid="input-edit-farmer-phone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  inputMode="tel"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Village</Label>
                <Input
                  data-testid="input-edit-farmer-village"
                  value={editVillage}
                  onChange={(e) => setEditVillage(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Negative Flag</Label>
                <Select value={editNegativeFlag} onValueChange={setEditNegativeFlag}>
                  <SelectTrigger data-testid="select-edit-negative-flag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">No</SelectItem>
                    <SelectItem value="true">Yes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleSaveEdit}
                disabled={updateFarmerMutation.isPending}
                data-testid="button-save-farmer-edit"
              >
                {updateFarmerMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>

              {editHistory.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Edit History</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {editHistory.map((h) => (
                      <div key={h.id} className="text-xs bg-muted/50 rounded p-2">
                        <span className="font-medium">{h.fieldChanged}</span>:{" "}
                        <span className="text-muted-foreground">{h.oldValue || "—"}</span>{" → "}
                        <span className="font-medium">{h.newValue || "—"}</span>
                        <span className="text-muted-foreground ml-2">
                          by {h.changedBy} · {format(new Date(h.createdAt), "dd MMM yy HH:mm")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={mergeConfirmOpen} onOpenChange={setMergeConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="w-5 h-5" />
              Duplicate Farmer Found
            </DialogTitle>
            <DialogDescription>A farmer with these details already exists.</DialogDescription>
          </DialogHeader>
          {duplicateFarmer && editingFarmer && (
            <div className="space-y-3">
              <p className="text-sm">
                <strong>{duplicateFarmer.name}</strong> ({duplicateFarmer.phone}) from{" "}
                {duplicateFarmer.village || "unknown village"} already exists as FM{duplicateFarmer.id}.
              </p>
              <p className="text-sm text-muted-foreground">
                Do you want to merge? All dues and records will be moved to the older farmer ID
                (FM{Math.min(editingFarmer.id, duplicateFarmer.id)}).
              </p>
              <div className="flex flex-col gap-2">
                <Button
                  variant="destructive"
                  onClick={handleMergeConfirm}
                  disabled={mergeFarmersMutation.isPending}
                  data-testid="button-confirm-merge"
                >
                  {mergeFarmersMutation.isPending ? "Merging..." : "Yes, Merge Records"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setMergeConfirmOpen(false);
                    setDuplicateFarmer(null);
                    saveEdit();
                  }}
                  data-testid="button-save-anyway"
                >
                  No, Save Anyway
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setMergeConfirmOpen(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
