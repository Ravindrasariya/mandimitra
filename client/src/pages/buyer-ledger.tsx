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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import type { Buyer, BuyerEditHistory } from "@shared/schema";
import { ShoppingBag, Search, Plus, Pencil, ArrowUpDown, ArrowUp, ArrowDown, Printer, RefreshCw, ChevronDown, Calendar } from "lucide-react";
import { format } from "date-fns";

type BuyerWithDues = Buyer & { receivableDue: string; overallDue: string; bidDates?: string[] };
type SortField = "buyerId" | "overallDue" | "receivableDue";
type SortDir = "asc" | "desc";

function formatIndianCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "0";
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `\u20B9${formatted}`;
}

type PaanaTxn = {
  id: number;
  date: string;
  crop: string;
  lotId: string;
  numberOfBags: number;
  totalReceivableFromBuyer: string;
  paidAmount: string;
  paymentStatus: string;
};

function generateBuyerPaanaHtml(
  businessName: string,
  businessAddress: string,
  buyer: { name: string; address?: string | null; phone?: string | null; openingBalance?: string | null },
  txns: PaanaTxn[],
  overallDue: string
) {
  const today = format(new Date(), "dd/MM/yyyy");
  const dueTxns = txns.filter(t => t.paymentStatus === "due" || t.paymentStatus === "partial");
  const openingBal = parseFloat(buyer.openingBalance || "0");

  let tableRows = "";
  let totalDue = 0;

  for (const tx of dueTxns) {
    const receivable = parseFloat(tx.totalReceivableFromBuyer || "0");
    const paid = parseFloat(tx.paidAmount || "0");
    const dueAmt = receivable - paid;
    totalDue += dueAmt;

    const txDate = new Date(tx.date + "T00:00:00");
    const diffDays = Math.floor((Date.now() - txDate.getTime()) / (1000 * 60 * 60 * 24));
    const dateStr = format(txDate, "dd/MM/yyyy");
    const cropLabel: Record<string, string> = { Potato: "Potato", Onion: "Onion", Garlic: "Garlic" };

    tableRows += `<tr>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${dateStr}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${cropLabel[tx.crop] || tx.crop}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:center">${tx.lotId}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${tx.numberOfBags}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right">${diffDays}</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:600">${dueAmt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
    </tr>`;
  }

  let totalSection = `<tr style="background:#f5f5f5;font-weight:bold">
    <td colspan="5" style="padding:8px;border:1px solid #ddd;text-align:right">Total Receivable Due</td>
    <td style="padding:8px;border:1px solid #ddd;text-align:right">\u20B9${totalDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
  </tr>`;

  if (openingBal > 0) {
    const grandTotal = totalDue + openingBal;
    totalSection += `<tr style="font-weight:bold">
      <td colspan="5" style="padding:8px;border:1px solid #ddd;text-align:right">PY Receivable (Opening Balance)</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right">\u20B9${openingBal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
    </tr>
    <tr style="background:#e8f5e9;font-weight:bold;font-size:1.1em">
      <td colspan="5" style="padding:8px;border:1px solid #ddd;text-align:right">Grand Total Due</td>
      <td style="padding:8px;border:1px solid #ddd;text-align:right">\u20B9${grandTotal.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</td>
    </tr>`;
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Buyer Paana - ${buyer.name}</title>
<style>
  @media print { body { margin: 0; } @page { margin: 15mm; } }
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { background: #2e7d32; color: white; padding: 8px; border: 1px solid #ddd; text-align: center; font-size: 0.85em; }
</style></head><body>
  <div style="text-align:center;margin-bottom:16px">
    <h2 style="margin:0;color:#2e7d32">${businessName}</h2>
    ${businessAddress ? `<p style="margin:2px 0;color:#555;font-size:0.85em">${businessAddress}</p>` : ""}
    <p style="margin:4px 0;color:#666;font-size:0.85em">Date: ${today}</p>
  </div>
  <div style="background:#f8f8f8;padding:12px;border-radius:6px;margin-bottom:16px">
    <h3 style="margin:0 0 6px 0">Buyer Paana - ${buyer.name}</h3>
    ${buyer.address ? `<p style="margin:2px 0;font-size:0.9em;color:#555">${buyer.address}</p>` : ""}
    ${buyer.phone ? `<p style="margin:2px 0;font-size:0.9em;color:#555">Phone: ${buyer.phone}</p>` : ""}
  </div>
  <table>
    <thead><tr>
      <th>Bidding Date</th>
      <th>Crop</th>
      <th>Lot ID</th>
      <th># Bags</th>
      <th># Days</th>
      <th>Due Amount (\u20B9)</th>
    </tr></thead>
    <tbody>
      ${tableRows || `<tr><td colspan="6" style="padding:12px;text-align:center;color:#999;border:1px solid #ddd">No outstanding dues</td></tr>`}
      ${totalSection}
    </tbody>
  </table>
</body></html>`;
}

function generateBuyerListPrintHtml(buyers: BuyerWithDues[], summary: { total: number; withDues: number; totalOverallDue: number; totalReceivableDue: number; duesOver15: number; duesOver30: number }) {
  const rows = buyers.map(b => `<tr>
<td style="padding:6px 10px;border:1px solid #ddd">${b.buyerId}</td>
<td style="padding:6px 10px;border:1px solid #ddd">${b.name}</td>
<td style="padding:6px 10px;border:1px solid #ddd">${b.phone || "-"}</td>
<td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${formatIndianCurrency(b.overallDue)}</td>
<td style="padding:6px 10px;border:1px solid #ddd;text-align:right">${formatIndianCurrency(b.receivableDue)}</td>
</tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Buyer Ledger</title>
<style>body{font-family:Arial,sans-serif;margin:20px}table{border-collapse:collapse;width:100%}th{background:#f3f4f6;padding:8px 10px;border:1px solid #ddd;text-align:left}
.summary{display:flex;gap:20px;justify-content:center;margin:15px 0}
.summary-card{padding:10px 20px;border:1px solid #ddd;border-radius:8px;text-align:center}
@media print{body{margin:5mm}}</style></head><body>
<h2 style="text-align:center;margin-bottom:5px">Buyer Ledger</h2>
<div class="summary">
<div class="summary-card"><div style="font-size:0.8em;color:#666">Total Buyers</div><div style="font-size:1.3em;font-weight:bold">${summary.total}</div></div>
<div class="summary-card"><div style="font-size:0.8em;color:#666">With Dues</div><div style="font-size:1.3em;font-weight:bold;color:#dc2626">${summary.withDues}</div></div>
<div class="summary-card"><div style="font-size:0.8em;color:#666">Overall Due</div><div style="font-size:1.3em;font-weight:bold;color:#2563eb">${formatIndianCurrency(summary.totalOverallDue)}</div></div>
<div class="summary-card"><div style="font-size:0.8em;color:#666">Receivable Due</div><div style="font-size:1.3em;font-weight:bold;color:#dc2626">${formatIndianCurrency(summary.totalReceivableDue)}</div></div>
</div>
<table>${rows ? `<thead><tr><th>Buyer ID</th><th>Name</th><th>Phone</th><th style="text-align:right">Overall Due</th><th style="text-align:right">Receivable Due</th></tr></thead><tbody>${rows}</tbody>` : ""}</table>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}

export default function BuyerLedgerPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = usePersistedState("bl-searchTerm", "");
  const [statusFilter, setStatusFilter] = usePersistedState("bl-statusFilter", "all");
  const [sortField, setSortField] = usePersistedState<SortField>("bl-sortField", "overallDue");
  const [sortDir, setSortDir] = usePersistedState<SortDir>("bl-sortDir", "desc");
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
  const [yearFilter, setYearFilter] = usePersistedState("bl-yearFilter", "all");
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("bl-selectedMonths", []);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("bl-selectedDays", []);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const buyerQueryParams = `?withDues=true${searchTerm ? `&search=${encodeURIComponent(searchTerm)}` : ""}`;
  const { data: buyers = [], isLoading } = useQuery<BuyerWithDues[]>({
    queryKey: ["/api/buyers" + buyerQueryParams],
  });

  const { data: allTransactions = [] } = useQuery<{ id: number; date: string; buyerId: number; totalReceivableFromBuyer: string; paidAmount: string; paymentStatus: string; isReversed: boolean }[]>({
    queryKey: ["/api/transactions"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setShowAddDialog(false);
      setNewName("");
      setNewAddress("");
      setNewPhone("");
      setNewBuyerCode("");
      setNewOpeningBalance("");
      toast({ title: "Buyer Created", variant: "success" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      setEditingBuyer(null);
      toast({ title: "Buyer Updated", variant: "success" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
    },
  });

  const now = new Date();
  const years = useMemo(() => {
    const yearSet = new Set<string>();
    buyers.forEach(b => {
      (b.bidDates || []).forEach(d => {
        yearSet.add(d.substring(0, 4));
      });
    });
    return Array.from(yearSet).sort().reverse();
  }, [buyers]);

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

  const filteredBuyers = useMemo(() => {
    return buyers.filter(b => {
      const dates = b.bidDates || [];
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
      if (statusFilter === "active" && !b.isActive) return false;
      if (statusFilter === "inactive" && b.isActive) return false;
      if (statusFilter === "negative" && !b.negativeFlag) return false;
      return true;
    });
  }, [buyers, yearFilter, selectedMonths, selectedDays, statusFilter]);

  const sortedBuyers = useMemo(() => {
    const sorted = [...filteredBuyers];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === "buyerId") {
        cmp = a.buyerId.localeCompare(b.buyerId);
      } else if (sortField === "overallDue") {
        cmp = parseFloat(a.overallDue) - parseFloat(b.overallDue);
      } else if (sortField === "receivableDue") {
        cmp = parseFloat(a.receivableDue) - parseFloat(b.receivableDue);
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredBuyers, sortField, sortDir]);

  const summary = useMemo(() => {
    const total = filteredBuyers.length;
    const withDues = filteredBuyers.filter(b => parseFloat(b.overallDue) > 0).length;
    const totalOverallDue = filteredBuyers.reduce((s, b) => s + parseFloat(b.overallDue), 0);
    const totalReceivableDue = filteredBuyers.reduce((s, b) => s + parseFloat(b.receivableDue), 0);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const filteredBuyerIds = new Set(filteredBuyers.map(b => b.id));
    const activeTxns = allTransactions.filter(t => 
      !t.isReversed && filteredBuyerIds.has(t.buyerId)
    );
    
    let duesOver15 = 0;
    let duesOver30 = 0;
    activeTxns.forEach(t => {
      const due = parseFloat(t.totalReceivableFromBuyer || "0") - parseFloat(t.paidAmount || "0");
      if (due <= 0) return;
      const txDate = new Date(t.date + "T00:00:00");
      const diffDays = Math.floor((today.getTime() - txDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 30) duesOver30 += due;
      if (diffDays > 15) duesOver15 += due;
    });
    
    return { total, withDues, totalOverallDue, totalReceivableDue, duesOver15, duesOver30 };
  }, [filteredBuyers, allTransactions]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "buyerId" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="w-3 h-3 ml-1" /> : <ArrowDown className="w-3 h-3 ml-1" />;
  };

  const openEdit = (buyer: BuyerWithDues) => {
    setEditingBuyer(buyer);
    setEditName(buyer.name);
    setEditAddress(buyer.address || "");
    setEditPhone(buyer.phone || "");
    setEditBuyerCode(buyer.buyerCode || "");
    setEditNegativeFlag(buyer.negativeFlag);
    setEditOpeningBalance(buyer.openingBalance || "0");
  };

  const printBuyerPaana = async (buyer: BuyerWithDues) => {
    try {
      const res = await apiRequest("GET", `/api/buyers/${buyer.id}/paana`);
      const data = await res.json();
      const html = generateBuyerPaanaHtml(
        data.businessName,
        data.businessAddress || "",
        data.buyer,
        data.transactions,
        buyer.overallDue
      );
      const w = window.open("", "_blank");
      if (w) {
        w.document.write(html);
        w.document.close();
        w.onload = () => w.print();
      }
    } catch {
      toast({ title: t("common.error"), description: "Failed to generate Buyer Paana", variant: "destructive" });
    }
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

  const handleSync = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/buyers");
    }});
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    toast({ title: "Data Synced", variant: "success" });
  };

  const handlePrintList = () => {
    const html = generateBuyerListPrintHtml(sortedBuyers, summary);
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
          <ShoppingBag className="w-5 h-5 text-primary" />
          {t("buyerLedger.title")}
        </h1>
        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSelectedDays([]); }}>
          <SelectTrigger className="w-[100px]" data-testid="select-year-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("buyerLedger.allYears")}</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="bl-select-month-filter">
              {monthLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="bl-month-select-all"
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
                    data-testid={`bl-month-option-${val}`}
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
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="bl-select-day-filter">
              <Calendar className="w-3 h-3 mr-1" />
              {dayLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="bl-day-select-all"
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
                  data-testid={`bl-day-option-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger data-testid="select-status-filter" className="w-[100px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}...</SelectItem>
            <SelectItem value="active">{t("common.active")}</SelectItem>
            <SelectItem value="inactive">{t("common.inactive")}</SelectItem>
            <SelectItem value="negative">{t("buyerLedger.negative")}</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-buyer-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t("buyerLedger.searchName")}
            className="pl-8 w-[160px] h-9"
          />
        </div>
        <Button
          data-testid="button-add-buyer"
          onClick={() => setShowAddDialog(true)}
        >
          <Plus className="w-4 h-4 mr-1" />
          {t("buyerLedger.addBuyer")}
        </Button>
        <Button variant="outline" size="sm" onClick={handleSync} data-testid="button-sync">
          <RefreshCw className="w-4 h-4" />
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrintList} data-testid="button-print-list">
          <Printer className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("buyerLedger.totalBuyers")}</p>
            <p className="text-base font-bold text-blue-600" data-testid="text-total-buyers">{summary.total}</p>
            <p className="text-[11px] text-red-600 font-medium" data-testid="text-buyers-with-dues">{t("buyerLedger.buyersWithDues")}: {summary.withDues}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("buyerLedger.totalOverallDue")}</p>
            <p className="text-base font-bold text-green-600" data-testid="text-overall-due">{formatIndianCurrency(summary.totalOverallDue)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-orange-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("buyerLedger.totalReceivableDue")}</p>
            <p className="text-base font-bold text-orange-600" data-testid="text-receivable-due">{formatIndianCurrency(summary.totalReceivableDue)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-red-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("buyerLedger.duesOver30")}</p>
            <p className="text-base font-bold text-red-600" data-testid="text-dues-over-30">{formatIndianCurrency(summary.duesOver30)}</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="pt-3 pb-3 text-center">
            <p className="text-xs text-muted-foreground">{t("buyerLedger.duesOver15")}</p>
            <p className="text-base font-bold text-purple-600" data-testid="text-dues-over-15">{formatIndianCurrency(summary.duesOver15)}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : sortedBuyers.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">{t("buyerLedger.noBuyers")}</div>
      ) : (
        <>
          <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium"></th>
                      <th
                        className="text-left p-3 font-medium cursor-pointer select-none"
                        onClick={() => toggleSort("buyerId")}
                        data-testid="sort-buyer-id"
                      >
                        <span className="inline-flex items-center">{t("buyerLedger.buyerId")} <SortIcon field="buyerId" /></span>
                      </th>
                      <th className="text-left p-3 font-medium">{t("common.name")}</th>
                      <th className="text-left p-3 font-medium">{t("common.address")}</th>
                      <th className="text-left p-3 font-medium">{t("buyerLedger.mandiCode")}</th>
                      <th className="text-left p-3 font-medium">{t("common.contact")}</th>
                      <th className="text-center p-3 font-medium">{t("buyerLedger.negative")}</th>
                      <th className="text-center p-3 font-medium">{t("common.active")}</th>
                      <th
                        className="text-right p-3 font-medium cursor-pointer select-none"
                        onClick={() => toggleSort("overallDue")}
                        data-testid="sort-overall-due"
                      >
                        <span className="inline-flex items-center justify-end">{t("buyerLedger.overallDue")} <SortIcon field="overallDue" /></span>
                      </th>
                      <th
                        className="text-right p-3 font-medium cursor-pointer select-none"
                        onClick={() => toggleSort("receivableDue")}
                        data-testid="sort-receivables"
                      >
                        <span className="inline-flex items-center justify-end">{t("buyerLedger.receivables")} <SortIcon field="receivableDue" /></span>
                      </th>
                      <th className="p-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBuyers.map((buyer) => (
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
                        <td className="p-3">
                          <button
                            data-testid={`button-print-buyer-${buyer.id}`}
                            className="p-1.5 rounded hover:bg-muted"
                            onClick={() => printBuyerPaana(buyer)}
                          >
                            <Printer className="w-4 h-4 text-muted-foreground" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="md:hidden space-y-3 p-3">
                {sortedBuyers.map((buyer) => (
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
                          <div className="flex items-center gap-1">
                            <button
                              data-testid={`button-edit-buyer-mobile-${buyer.id}`}
                              className="p-1.5 rounded hover:bg-muted"
                              onClick={() => openEdit(buyer)}
                            >
                              <Pencil className="w-4 h-4 text-muted-foreground" />
                            </button>
                            <button
                              data-testid={`button-print-buyer-mobile-${buyer.id}`}
                              className="p-1.5 rounded hover:bg-muted"
                              onClick={() => printBuyerPaana(buyer)}
                            >
                              <Printer className="w-4 h-4 text-muted-foreground" />
                            </button>
                          </div>
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
                onFocus={(e) => e.target.select()}
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
                onFocus={(e) => e.target.select()}
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
