import { useState, useMemo } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import type { Farmer, FarmerEditHistory } from "@shared/schema";
import { Users, Search, Pencil, RefreshCw, Printer, Archive, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, Calendar } from "lucide-react";
import { format } from "date-fns";

type FarmerWithDues = Farmer & { totalPayable: string; totalDue: string; salesCount: number; bidDates?: string[] };
type SortField = "farmerId" | "totalPayable" | "totalDue";
type SortDir = "asc" | "desc";

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
      <td style="padding:6px;border:1px solid #ddd">${f.farmerId}</td>
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
<div class="summary-card"><div style="font-size:0.8em;color:#666">Due Farmers</div><div style="font-size:1.3em;font-weight:bold;color:#dc2626">${summary.withDues}</div></div>
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
  const { t } = useLanguage();
  const [searchName, setSearchName] = usePersistedState("fl-searchName", "");
  const [searchVillage, setSearchVillage] = usePersistedState("fl-searchVillage", "");
  const [yearFilter, setYearFilter] = usePersistedState("fl-yearFilter", "all");
  const [showArchived, setShowArchived] = usePersistedState("fl-showArchived", false);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFarmer, setEditingFarmer] = useState<FarmerWithDues | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editVillage, setEditVillage] = useState("");
  const [editNegativeFlag, setEditNegativeFlag] = useState("false");

  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [duplicateFarmer, setDuplicateFarmer] = useState<Farmer | null>(null);

  const [historyFarmerId, setHistoryFarmerId] = useState<number | null>(null);

  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("fl-selectedMonths", []);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("fl-selectedDays", []);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const [sortField, setSortField] = usePersistedState<SortField>("fl-sortField", "totalDue");
  const [sortDir, setSortDir] = usePersistedState<SortDir>("fl-sortDir", "desc");

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
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      if (historyFarmerId) queryClient.invalidateQueries({ queryKey: ["/api/farmer-edit-history", historyFarmerId] });
      setEditDialogOpen(false);
      toast({ title: "Farmer Updated", variant: "success" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      setMergeConfirmOpen(false);
      setEditDialogOpen(false);
      setDuplicateFarmer(null);
      toast({ title: "Farmers Merged", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const now = new Date();
  const years = useMemo(() => {
    const yearSet = new Set<string>();
    farmersWithDues.forEach(f => {
      (f.bidDates || []).forEach(d => {
        yearSet.add(d.substring(0, 4));
      });
    });
    const fromData = Array.from(yearSet).sort().reverse();
    if (fromData.length === 0) return [String(now.getFullYear())];
    return fromData;
  }, [farmersWithDues]);

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const daysInMonths = useMemo(() => {
    if (selectedMonths.length === 0) return 31;
    const year = yearFilter !== "all" ? parseInt(yearFilter) : now.getFullYear();
    return Math.max(...selectedMonths.map(m => new Date(year, parseInt(m), 0).getDate()));
  }, [selectedMonths, yearFilter]);

  const toggleMonth = (month: string) => {
    setSelectedMonths(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);
    setSelectedDays([]);
  };

  const selectAllMonths = () => {
    setSelectedMonths([]);
    setSelectedDays([]);
    setMonthPopoverOpen(false);
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const selectAllDays = () => {
    setSelectedDays([]);
    setDayPopoverOpen(false);
  };

  const monthLabel = selectedMonths.length === 0
    ? t("stockRegister.allMonths")
    : selectedMonths.length === 1
      ? MONTH_LABELS[parseInt(selectedMonths[0]) - 1]
      : `${selectedMonths.length} ${t("stockRegister.nMonths")}`;

  const dayLabel = selectedDays.length === 0
    ? t("stockRegister.allDays")
    : selectedDays.length === 1
      ? selectedDays[0]
      : `${selectedDays.length} ${t("stockRegister.nDays")}`;

  const filteredFarmers = useMemo(() => {
    return farmersWithDues.filter(f => {
      if (!showArchived && f.isArchived) return false;
      if (showArchived && !f.isArchived) return false;
      if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (searchVillage && !(f.village || "").toLowerCase().includes(searchVillage.toLowerCase())) return false;
      const dates = f.bidDates || [];
      if (yearFilter !== "all" || selectedMonths.length > 0 || selectedDays.length > 0) {
        const hasMatchingDate = dates.some(d => {
          const [y, m, day] = d.split("-");
          if (yearFilter !== "all" && y !== yearFilter) return false;
          if (selectedMonths.length > 0 && !selectedMonths.includes(String(parseInt(m)))) return false;
          if (selectedDays.length > 0 && !selectedDays.includes(String(parseInt(day)))) return false;
          return true;
        });
        if (!hasMatchingDate) return false;
      }
      return true;
    });
  }, [farmersWithDues, showArchived, searchName, searchVillage, yearFilter, selectedMonths, selectedDays]);

  const sortedFarmers = useMemo(() => {
    const sorted = [...filteredFarmers];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === "farmerId") {
        cmp = a.farmerId.localeCompare(b.farmerId);
      } else if (sortField === "totalPayable") {
        cmp = parseFloat(a.totalPayable) - parseFloat(b.totalPayable);
      } else if (sortField === "totalDue") {
        cmp = parseFloat(a.totalDue) - parseFloat(b.totalDue);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredFarmers, sortField, sortDir]);

  const summary = useMemo(() => {
    const total = filteredFarmers.length;
    const withDues = filteredFarmers.filter(f => parseFloat(f.totalDue) > 0).length;
    const totalPayable = filteredFarmers.reduce((s, f) => s + parseFloat(f.totalPayable), 0);
    const totalDue = filteredFarmers.reduce((s, f) => s + parseFloat(f.totalDue), 0);
    return { total, withDues, totalPayable, totalDue };
  }, [filteredFarmers]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "farmerId" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

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
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    toast({ title: "Data Synced", variant: "success" });
  };

  const handlePrint = () => {
    const html = generateFarmerListPrintHtml(sortedFarmers, summary);
    const w = window.open("", "_blank", "width=800,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-base md:text-lg font-bold flex items-center gap-2 mr-auto">
          <Users className="w-5 h-5 text-primary" />
          {t("farmerLedger.title")}
        </h1>
        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSelectedDays([]); }}>
          <SelectTrigger className="w-[100px]" data-testid="select-year-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("farmerLedger.allYears")}</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="fl-select-month-filter">
              {monthLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="fl-month-select-all"
              onClick={selectAllMonths}
            >
              <Checkbox checked={selectedMonths.length === 0} />
              <span>{t("stockRegister.allMonths")}</span>
            </button>
            <div className="grid grid-cols-4 gap-0.5">
              {MONTH_LABELS.map((m, i) => {
                const val = String(i + 1);
                return (
                  <button
                    key={val}
                    className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedMonths.includes(val) ? "bg-primary text-primary-foreground" : ""}`}
                    data-testid={`fl-month-option-${val}`}
                    onClick={() => toggleMonth(val)}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>
        <Popover open={dayPopoverOpen} onOpenChange={setDayPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="fl-select-day-filter">
              <Calendar className="w-3 h-3 mr-1" />
              {dayLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="fl-day-select-all"
              onClick={selectAllDays}
            >
              <Checkbox checked={selectedDays.length === 0} />
              <span>{t("stockRegister.allDays")}</span>
            </button>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: daysInMonths }, (_, i) => String(i + 1)).map(d => (
                <button
                  key={d}
                  className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedDays.includes(d) ? "bg-primary text-primary-foreground" : ""}`}
                  data-testid={`fl-day-option-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-search-name"
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder={t("farmerLedger.searchByName")}
            className="pl-8 w-[160px] h-9"
          />
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-search-village"
            value={searchVillage}
            onChange={(e) => setSearchVillage(e.target.value)}
            placeholder={t("farmerLedger.searchByVillage")}
            className="pl-8 w-[160px] h-9"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Switch
            data-testid="switch-show-archived"
            checked={showArchived}
            onCheckedChange={setShowArchived}
          />
          <span className="text-xs text-muted-foreground whitespace-nowrap">{t("farmerLedger.showArchived")}</span>
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
            <p className="text-xs text-muted-foreground">{t("farmerLedger.totalFarmers")}</p>
            <p className="text-base font-bold text-blue-600" data-testid="text-total-farmers">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("farmerLedger.dueFarmers")}</p>
            <p className="text-base font-bold text-orange-600" data-testid="text-farmers-with-dues">{summary.withDues}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("farmerLedger.totalPayable")}</p>
            <p className="text-base font-bold text-green-600" data-testid="text-total-payable">{formatIndianCurrency(summary.totalPayable)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("farmerLedger.totalDues")}</p>
            <p className="text-base font-bold text-red-600" data-testid="text-total-dues">{formatIndianCurrency(summary.totalDue)}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("farmerLedger.loadingFarmers")}</div>
      ) : sortedFarmers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {showArchived ? t("farmerLedger.noArchived") : t("farmerLedger.noFarmers")}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="table-farmer-ledger">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left p-2 font-medium text-muted-foreground"></th>
                <th
                  className="text-left p-2 font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => toggleSort("farmerId")}
                  data-testid="sort-farmer-id"
                >
                  <span className="inline-flex items-center">{t("farmerLedger.farmerId")} <SortIcon field="farmerId" /></span>
                </th>
                <th className="text-left p-2 font-medium text-muted-foreground">{t("common.name")}</th>
                <th className="text-left p-2 font-medium text-muted-foreground">{t("common.village")}</th>
                <th className="text-left p-2 font-medium text-muted-foreground">{t("common.contact")}</th>
                <th
                  className="text-right p-2 font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => toggleSort("totalPayable")}
                  data-testid="sort-total-payable"
                >
                  <span className="inline-flex items-center justify-end">{t("farmerLedger.totalPayable")} <SortIcon field="totalPayable" /></span>
                </th>
                <th
                  className="text-right p-2 font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => toggleSort("totalDue")}
                  data-testid="sort-total-due"
                >
                  <span className="inline-flex items-center justify-end">{t("farmerLedger.totalDue")} <SortIcon field="totalDue" /></span>
                </th>
                <th className="text-center p-2 font-medium text-muted-foreground">{t("common.flag")}</th>
                <th className="text-center p-2 font-medium text-muted-foreground">{t("common.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedFarmers.map((farmer) => {
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
                    <td className="p-2 font-mono text-xs text-muted-foreground">{farmer.farmerId}</td>
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
                        title={farmer.isArchived ? t("farmerLedger.reinstate") : t("farmerLedger.archive")}
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
            <DialogTitle>{t("farmerLedger.editFarmer")}</DialogTitle>
            <DialogDescription>{t("farmerLedger.editDesc")}</DialogDescription>
          </DialogHeader>
          {editingFarmer && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground font-mono">ID: {editingFarmer.farmerId}</div>
              <div className="space-y-1">
                <Label className="text-xs">{t("common.name")}</Label>
                <Input
                  data-testid="input-edit-farmer-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("common.contact")}</Label>
                <Input
                  data-testid="input-edit-farmer-phone"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  inputMode="tel"
                  maxLength={10}
                />
                {editPhone && editPhone.length !== 10 && (
                  <p className="text-xs text-orange-600">Please enter a valid 10-digit mobile number</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("common.village")}</Label>
                <Input
                  data-testid="input-edit-farmer-village"
                  value={editVillage}
                  onChange={(e) => setEditVillage(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("farmerLedger.negativeFlag")}</Label>
                <Select value={editNegativeFlag} onValueChange={setEditNegativeFlag}>
                  <SelectTrigger data-testid="select-edit-negative-flag">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="false">{t("common.no")}</SelectItem>
                    <SelectItem value="true">{t("common.yes")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                className="w-full"
                onClick={handleSaveEdit}
                disabled={updateFarmerMutation.isPending || (editPhone.length > 0 && editPhone.length !== 10)}
                data-testid="button-save-farmer-edit"
              >
                {updateFarmerMutation.isPending ? t("common.saving") : t("common.saveChanges")}
              </Button>

              {editHistory.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{t("farmerLedger.editHistory")}</p>
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
                {duplicateFarmer.village || "unknown village"} already exists as {duplicateFarmer.farmerId}.
              </p>
              <p className="text-sm text-muted-foreground">
                Do you want to merge? All dues and records will be moved to the older farmer ID.
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
