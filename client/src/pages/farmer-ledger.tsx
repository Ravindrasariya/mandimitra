import { useState, useMemo, useRef, Fragment } from "react";
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
import { DISTRICTS } from "@shared/schema";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Users, Search, Pencil, RefreshCw, Printer, Archive, AlertTriangle, ArrowUpDown, ArrowUp, ArrowDown, ChevronDown, ChevronRight, Calendar, Download, X, Check, ChevronsUpDown, FileText } from "lucide-react";
import jsPDF from "jspdf";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";
import { format } from "date-fns";
import { printReceipt } from "@/lib/receiptUtils";

type FarmerWithDues = Farmer & { totalPayable: string; totalDue: string; totalAdvance: string; advanceEntries?: { date: string; amount: string }[]; salesCount: number; bidDates?: string[] };
type SortField = "farmerId" | "name" | "totalPayable" | "totalDue";
type SortDir = "asc" | "desc";

function formatIndianCurrency(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "₹0";
  const absNum = Math.abs(num);
  const formatted = absNum.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  return `₹${formatted}`;
}

function generateFarmerListPrintHtml(farmers: FarmerWithDues[], summary: { total: number; withDues: number; totalPayable: number; totalDue: number }, duesMap: Map<number, { payable: number; due: number }>) {
  const rows = farmers.map(f => {
    const d = duesMap.get(f.id);
    const payable = d?.payable ?? parseFloat(f.totalPayable);
    const due = d?.due ?? parseFloat(f.totalDue);
    return `
    <tr>
      <td style="padding:6px;border:1px solid #ddd">${f.farmerId}</td>
      <td style="padding:6px;border:1px solid #ddd">${f.name}</td>
      <td style="padding:6px;border:1px solid #ddd">${f.village || "-"}</td>
      <td style="padding:6px;border:1px solid #ddd">${f.phone}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right">${formatIndianCurrency(payable)}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:right;color:${due > 0 ? '#dc2626' : '#16a34a'}">${formatIndianCurrency(due)}</td>
      <td style="padding:6px;border:1px solid #ddd;text-align:center">${f.redFlag ? "FLAG" : "-"}</td>
    </tr>
  `;
  }).join("");

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
<div style="text-align:center;margin-top:20px;padding-top:10px;border-top:1px dashed #ccc;font-size:15px;font-weight:bold;color:#555">हमें सेवा का अवसर देने के लिए धन्यवाद!</div>
</body></html>`;
}

type FarmerLedgerData = {
  farmerName: string;
  farmerId: string;
  businessName: string;
  businessAddress: string;
  openingBalance: number;
  fyStart: string;
  fyEnd: string;
  entries: { date: string; particulars: string; dr: number; cr: number; sourceType: string; sourceId: number }[];
};

function getFyOptions() {
  const now = new Date();
  const currentFy = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options: { value: number; label: string }[] = [];
  for (let fy = currentFy; fy >= currentFy - 4; fy--) {
    options.push({ value: fy, label: `${fy}-${String(fy + 1).slice(2)}` });
  }
  return options;
}

function FarmerLedgerSection({ farmer }: { farmer: FarmerWithDues }) {
  const fyOptions = useMemo(() => getFyOptions(), []);
  const [selectedFy, setSelectedFy] = useState(fyOptions[0].value);

  const { data, isLoading } = useQuery<FarmerLedgerData>({
    queryKey: [`/api/farmers/${farmer.id}/ledger`, selectedFy],
    queryFn: async () => {
      const res = await fetch(`/api/farmers/${farmer.id}/ledger?fy=${selectedFy}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const openingBal = data.openingBalance;
    const result: Array<{
      itemNo: number;
      date: string;
      particulars: string;
      dr: number;
      cr: number;
      balance: number;
      isOpening?: boolean;
    }> = [];

    result.push({
      itemNo: 1,
      date: data.fyStart,
      particulars: "Opening Balance",
      dr: openingBal < 0 ? Math.abs(openingBal) : 0,
      cr: openingBal > 0 ? openingBal : 0,
      balance: openingBal,
      isOpening: true,
    });

    let balance = openingBal;
    let totalDr = openingBal < 0 ? Math.abs(openingBal) : 0;
    let totalCr = openingBal > 0 ? openingBal : 0;
    for (const entry of data.entries) {
      balance = balance - entry.dr + entry.cr;
      totalDr += entry.dr;
      totalCr += entry.cr;
      result.push({
        itemNo: result.length + 1,
        date: entry.date,
        particulars: entry.particulars,
        dr: entry.dr,
        cr: entry.cr,
        balance,
      });
    }

    result.push({
      itemNo: result.length + 1,
      date: data.fyEnd,
      particulars: "Closing Balance",
      dr: totalDr,
      cr: totalCr,
      balance,
      isOpening: true,
    });

    return result;
  }, [data]);

  const handleDownloadPdf = () => {
    if (!data) return;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = 210;
    const margin = 12;
    const contentW = pageW - margin * 2;
    let y = 16;

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text(data.businessName || "Mandi Mitra", pageW / 2, y, { align: "center" });
    y += 5;
    if (data.businessAddress) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(data.businessAddress, pageW / 2, y, { align: "center" });
      y += 5;
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`Farmer Ledger: ${data.farmerName} (${data.farmerId})`, margin, y);
    y += 5;
    const fyStartFmt = format(new Date(data.fyStart + "T00:00:00"), "dd MMM yyyy");
    const fyEndFmt = format(new Date(data.fyEnd + "T00:00:00"), "dd MMM yyyy");
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`FY: ${fyStartFmt} to ${fyEndFmt}`, margin, y);
    y += 8;

    const cols = {
      no: margin,
      date: margin + 10,
      particulars: margin + 30,
      dr: margin + 127,
      cr: margin + 150,
      bal: pageW - margin,
    };
    const rowH = 6.5;
    const headerH = 7;

    doc.setFillColor(46, 125, 50);
    doc.rect(margin, y - headerH + 1, contentW, headerH, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("#", cols.no, y - 1);
    doc.text("Date", cols.date, y - 1);
    doc.text("Particulars", cols.particulars, y - 1);
    doc.text("Dr", cols.dr, y - 1, { align: "right" });
    doc.text("Cr", cols.cr, y - 1, { align: "right" });
    doc.text("Balance", cols.bal, y - 1, { align: "right" });
    y += 3;

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(7.5);

    const fmtAmt = (n: number) =>
      n.toLocaleString("en-IN", { maximumFractionDigits: 0 });

    for (const row of rows) {
      if (y > 280) {
        doc.addPage();
        y = 14;
      }
      if (row.isOpening) {
        doc.setFillColor(232, 245, 233);
        doc.rect(margin, y - rowH + 1.5, contentW, rowH, "F");
      } else if (row.itemNo % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(margin, y - rowH + 1.5, contentW, rowH, "F");
      }
      doc.setFont("helvetica", row.isOpening ? "bold" : "normal");
      doc.text(row.particulars === "Closing Balance" ? "–" : String(row.itemNo), cols.no, y);
      doc.text(format(new Date(row.date + "T00:00:00"), "dd/MM/yy"), cols.date, y);
      const partText = row.particulars.length > 45 ? row.particulars.substring(0, 44) + "…" : row.particulars;
      doc.text(partText, cols.particulars, y);
      doc.text(row.dr > 0 ? fmtAmt(row.dr) : "-", cols.dr, y, { align: "right" });
      doc.text(row.cr > 0 ? fmtAmt(row.cr) : "-", cols.cr, y, { align: "right" });
      const balStr = (row.balance < 0 ? "(" : "") + fmtAmt(Math.abs(row.balance)) + (row.balance < 0 ? " Dr)" : row.balance > 0 ? " Cr" : "");
      doc.setTextColor(row.balance > 0 ? 22 : row.balance < 0 ? 185 : 0, row.balance > 0 ? 163 : row.balance < 0 ? 28 : 0, row.balance > 0 ? 74 : row.balance < 0 ? 28 : 0);
      doc.text(balStr, cols.bal, y, { align: "right" });
      doc.setTextColor(0, 0, 0);
      y += rowH;
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y - rowH + 1.5, pageW - margin, y - rowH + 1.5);
    }

    y += 4;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text("Generated by Mandi Mitra", pageW / 2, y, { align: "center" });

    doc.save(`Farmer_Ledger_${data.farmerName.replace(/[^a-zA-Z0-9]/g, "_")}_FY${data.fyStart.substring(0, 4)}.pdf`);
  };

  return (
    <div className="bg-muted/10 border-t px-4 py-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground">
          Ledger
        </p>
        <div className="flex items-center gap-2">
          <select
            data-testid={`select-farmer-fy-${farmer.id}`}
            className="text-xs border rounded px-1.5 py-0.5 bg-background text-foreground"
            value={selectedFy}
            onChange={(e) => setSelectedFy(Number(e.target.value))}
          >
            {fyOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <button
            data-testid={`button-farmer-ledger-pdf-${farmer.id}`}
            className="p-1 rounded hover:bg-muted text-muted-foreground disabled:opacity-40"
            onClick={handleDownloadPdf}
            title="Download PDF"
            disabled={isLoading || !data}
          >
            <FileText className="w-4 h-4" />
          </button>
        </div>
      </div>
      {isLoading ? (
        <div className="text-xs text-muted-foreground py-3 text-center">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="p-1.5 font-medium w-7">#</th>
                <th className="p-1.5 font-medium w-24">Date</th>
                <th className="p-1.5 font-medium">Particulars</th>
                <th className="p-1.5 font-medium w-24 text-right text-red-700">Dr (Rs.)</th>
                <th className="p-1.5 font-medium w-24 text-right text-green-700">Cr (Rs.)</th>
                <th className="p-1.5 font-medium w-28 text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.itemNo}
                  className={`border-b border-border/50 ${row.isOpening ? "bg-green-50 dark:bg-green-900/10 font-semibold" : ""}`}
                >
                  <td className="p-1.5 text-muted-foreground">{row.particulars === "Closing Balance" ? "–" : row.itemNo}</td>
                  <td className="p-1.5 tabular-nums">
                    {format(new Date(row.date + "T00:00:00"), "dd/MM/yyyy")}
                  </td>
                  <td className="p-1.5">
                    <span>{row.particulars}</span>
                  </td>
                  <td className="p-1.5 text-right tabular-nums text-red-700">
                    {row.dr > 0 ? formatIndianCurrency(row.dr) : ""}
                  </td>
                  <td className="p-1.5 text-right tabular-nums text-green-700">
                    {row.cr > 0 ? formatIndianCurrency(row.cr) : ""}
                  </td>
                  <td className={`p-1.5 text-right tabular-nums font-medium ${
                    row.balance > 0 ? "text-green-600" : row.balance < 0 ? "text-red-600" : "text-muted-foreground"
                  }`}>
                    {formatIndianCurrency(Math.abs(row.balance))}
                    {row.balance !== 0 && (
                      <span className="text-[10px] ml-0.5 font-normal">
                        {row.balance > 0 ? "Cr" : "Dr"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 2 && (
                <tr>
                  <td colSpan={6} className="text-center py-3 text-muted-foreground text-xs">
                    No transactions in this financial year
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function FarmerLedgerPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [searchName, setSearchName] = usePersistedState("fl-searchName", "");
  const [searchNameId, setSearchNameId] = useState<number | null>(null);
  const [searchNameOpen, setSearchNameOpen] = useState(false);
  const searchNameRef = useRef<HTMLDivElement>(null);
  const [searchVillage, setSearchVillage] = usePersistedState("fl-searchVillage", "");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [showArchived, setShowArchived] = usePersistedState("fl-showArchived", false);

  const capFirst = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingFarmer, setEditingFarmer] = useState<FarmerWithDues | null>(null);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editVillage, setEditVillage] = useState("");
  const [editRedFlag, setEditRedFlag] = useState("false");
  const [editTehsil, setEditTehsil] = useState("");
  const [editDistrict, setEditDistrict] = useState("");
  const [editState, setEditState] = useState("");
  const [editBankName, setEditBankName] = useState("");
  const [editBankAccountNumber, setEditBankAccountNumber] = useState("");
  const [editIfscCode, setEditIfscCode] = useState("");

  const [showVillageSuggestions, setShowVillageSuggestions] = useState(false);
  const [showTehsilSuggestions, setShowTehsilSuggestions] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);

  const [mergeConfirmOpen, setMergeConfirmOpen] = useState(false);
  const [duplicateFarmer, setDuplicateFarmer] = useState<Farmer | null>(null);

  const [historyFarmerId, setHistoryFarmerId] = useState<number | null>(null);

  const [selectedMonths, setSelectedMonths] = useState<string[]>([String(new Date().getMonth() + 1)]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const [expandedFarmerId, setExpandedFarmerId] = useState<number | null>(null);

  const [sortField, setSortField] = usePersistedState<SortField>("fl-sortField", "totalDue");
  const [sortDir, setSortDir] = usePersistedState<SortDir>("fl-sortDir", "desc");

  const { data: farmersWithDues = [], isLoading } = useQuery<FarmerWithDues[]>({
    queryKey: ["/api/farmers-with-dues"],
  });

  const { data: allTransactions = [] } = useQuery<{ id: number; date: string; farmerId: number; totalPayableToFarmer: string; farmerPaidAmount: string; farmerPaymentStatus: string; isReversed: boolean }[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: editHistory = [] } = useQuery<FarmerEditHistory[]>({
    queryKey: ["/api/farmer-edit-history", historyFarmerId],
    enabled: !!historyFarmerId,
  });

  const { data: locationData } = useQuery<{ villages: string[]; tehsils: string[] }>({
    queryKey: ["/api/farmers/locations"],
  });

  const filteredVillages = (locationData?.villages || []).filter(
    (v) => editVillage.length >= 1 && v.toLowerCase().includes(editVillage.toLowerCase()) && v.toLowerCase() !== editVillage.toLowerCase()
  );
  const filteredTehsils = (locationData?.tehsils || []).filter(
    (th) => editTehsil.length >= 1 && th.toLowerCase().includes(editTehsil.toLowerCase()) && th.toLowerCase() !== editTehsil.toLowerCase()
  );
  const villageKb = useKeyboardNav(filteredVillages);
  const tehsilKb = useKeyboardNav(filteredTehsils);

  const updateFarmerMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/farmers/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/farmers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/cash-entries");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
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
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/farmers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/cash-entries");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
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
    allTransactions.forEach(t => {
      if (!t.isReversed) yearSet.add(t.date.substring(0, 4));
    });
    const fromData = Array.from(yearSet).sort().reverse();
    if (fromData.length === 0) return [String(now.getFullYear())];
    return fromData;
  }, [allTransactions]);

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
    ? t("common.allMonths")
    : selectedMonths.length === 1
      ? MONTH_LABELS[parseInt(selectedMonths[0]) - 1]
      : `${selectedMonths.length} ${t("common.nMonths")}`;

  const dayLabel = selectedDays.length === 0
    ? t("common.allDays")
    : selectedDays.length === 1
      ? selectedDays[0]
      : `${selectedDays.length} ${t("common.nDays")}`;

  const anyFilterActive = yearFilter !== "all" || selectedMonths.length > 0 || selectedDays.length > 0;

  const nameSuggestions = useMemo(() => {
    if (!searchName.trim() || searchNameId !== null) return [];
    const q = searchName.toLowerCase();
    return farmersWithDues
      .filter(f => !f.isArchived && f.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 15);
  }, [farmersWithDues, searchName, searchNameId]);

  const searchNameKb = useKeyboardNav(nameSuggestions, f => String(f.id));

  const filteredFarmers = useMemo(() => {
    return farmersWithDues.filter(f => {
      if (!showArchived && f.isArchived) return false;
      if (showArchived && !f.isArchived) return false;
      if (searchNameId !== null) { if (f.id !== searchNameId) return false; }
      else if (searchName && !f.name.toLowerCase().includes(searchName.toLowerCase())) return false;
      if (searchVillage && !(f.village || "").toLowerCase().includes(searchVillage.toLowerCase())) return false;
      if (anyFilterActive) {
        const farmerTxns = allTransactions.filter(t => t.farmerId === f.id && !t.isReversed);
        if (farmerTxns.length === 0) return true;
        const hasMatch = farmerTxns.some(t => {
          const [y, m, day] = t.date.split("-");
          if (yearFilter !== "all" && y !== yearFilter) return false;
          if (selectedMonths.length > 0 && !selectedMonths.includes(String(parseInt(m)))) return false;
          if (selectedDays.length > 0 && !selectedDays.includes(String(parseInt(day)))) return false;
          return true;
        });
        if (!hasMatch) return false;
      }
      return true;
    });
  }, [farmersWithDues, showArchived, searchName, searchNameId, searchVillage, yearFilter, selectedMonths, selectedDays, allTransactions, anyFilterActive]);

  const filteredDuesByFarmer = useMemo(() => {
    const map = new Map<number, { payable: number; due: number }>();
    for (const f of filteredFarmers) {
      if (!anyFilterActive) {
        map.set(f.id, {
          payable: parseFloat(f.totalPayable),
          due: parseFloat(f.totalDue),
        });
      } else {
        const txns = allTransactions.filter(t => t.farmerId === f.id && !t.isReversed);
        let payable = 0;
        let due = 0;
        for (const t of txns) {
          const [y, m, day] = t.date.split("-");
          if (yearFilter !== "all" && y !== yearFilter) continue;
          if (selectedMonths.length > 0 && !selectedMonths.includes(String(parseInt(m)))) continue;
          if (selectedDays.length > 0 && !selectedDays.includes(String(parseInt(day)))) continue;
          const p = parseFloat(t.totalPayableToFarmer || "0");
          const paid = parseFloat(t.farmerPaidAmount || "0");
          payable += p;
          due += Math.max(0, p - paid);
        }
        map.set(f.id, { payable, due });
      }
    }
    return map;
  }, [filteredFarmers, allTransactions, yearFilter, selectedMonths, selectedDays, anyFilterActive]);

  const sortedFarmers = useMemo(() => {
    const sorted = [...filteredFarmers];
    sorted.sort((a, b) => {
      let cmp = 0;
      if (sortField === "farmerId") {
        cmp = a.farmerId.localeCompare(b.farmerId);
      } else if (sortField === "name") {
        cmp = a.name.localeCompare(b.name);
      } else if (sortField === "totalPayable") {
        const aVal = filteredDuesByFarmer.get(a.id)?.payable ?? parseFloat(a.totalPayable);
        const bVal = filteredDuesByFarmer.get(b.id)?.payable ?? parseFloat(b.totalPayable);
        cmp = aVal - bVal;
      } else if (sortField === "totalDue") {
        const aVal = filteredDuesByFarmer.get(a.id)?.due ?? parseFloat(a.totalDue);
        const bVal = filteredDuesByFarmer.get(b.id)?.due ?? parseFloat(b.totalDue);
        cmp = aVal - bVal;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return sorted;
  }, [filteredFarmers, filteredDuesByFarmer, sortField, sortDir]);

  const summary = useMemo(() => {
    const total = filteredFarmers.length;
    const withDues = filteredFarmers.filter(f => (filteredDuesByFarmer.get(f.id)?.due ?? 0) > 0).length;
    const totalPayable = filteredFarmers.reduce((s, f) => s + (filteredDuesByFarmer.get(f.id)?.payable ?? 0), 0);
    const totalDue = filteredFarmers.reduce((s, f) => s + (filteredDuesByFarmer.get(f.id)?.due ?? 0), 0);
    return { total, withDues, totalPayable, totalDue };
  }, [filteredFarmers, filteredDuesByFarmer]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir(field === "farmerId" || field === "name" ? "asc" : "desc");
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
    setEditTehsil(farmer.tehsil || "");
    setEditDistrict(farmer.district || "");
    setEditState(farmer.state || "");
    setEditRedFlag(farmer.redFlag ? "true" : "false");
    setEditBankName(farmer.bankName || "");
    setEditBankAccountNumber(farmer.bankAccountNumber || "");
    setEditIfscCode(farmer.ifscCode || "");
    setHistoryFarmerId(farmer.id);
    setEditDialogOpen(true);
  };

  const saveEdit = () => {
    if (!editingFarmer) return;
    const newRedFlag = editRedFlag === "true";
    updateFarmerMutation.mutate({
      id: editingFarmer.id,
      data: { name: editName, phone: editPhone, village: editVillage, tehsil: editTehsil, district: editDistrict, state: editState, redFlag: newRedFlag, bankName: editBankName, bankAccountNumber: editBankAccountNumber, ifscCode: editIfscCode },
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
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
    toast({ title: "Data Synced", variant: "success" });
  };

  const handlePrint = () => {
    const html = generateFarmerListPrintHtml(sortedFarmers, summary, filteredDuesByFarmer);
    printReceipt(html);
  };

  const handleCsvDownload = () => {
    const headers = ["Farmer ID", "Name", "Phone", "Village", "Bank Name", "Bank Account #", "IFSC Code", "Total Payable", "Total Due"];
    const escCsv = (v: string) => {
      if (v.includes(",") || v.includes('"') || v.includes("\n")) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const rows = sortedFarmers.map(f => {
      const d = filteredDuesByFarmer.get(f.id);
      const payable = d?.payable ?? parseFloat(f.totalPayable);
      const due = d?.due ?? parseFloat(f.totalDue);
      return [
        f.farmerId,
        f.name,
        f.phone || "",
        f.village || "",
        f.bankName || "",
        f.bankAccountNumber || "",
        f.ifscCode || "",
        String(Math.round(payable)),
        String(Math.round(due)),
      ].map(escCsv).join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `farmers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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
              <span>{t("common.allMonths")}</span>
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
              <span>{t("common.allDays")}</span>
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
        <div className="relative" ref={searchNameRef}>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            data-testid="input-search-name"
            value={searchName}
            onChange={(e) => { setSearchName(e.target.value); setSearchNameId(null); setSearchNameOpen(true); }}
            onFocus={() => setSearchNameOpen(true)}
            onBlur={() => setTimeout(() => { setSearchNameOpen(false); searchNameKb.reset(); }, 150)}
            onKeyDown={e => {
              if (searchNameOpen && nameSuggestions.length > 0) {
                searchNameKb.handleKeyDown(e, (f) => { setSearchName(f.name); setSearchNameId(f.id); setSearchNameOpen(false); searchNameKb.reset(); }, () => { setSearchNameOpen(false); searchNameKb.reset(); });
              }
            }}
            placeholder={t("farmerLedger.searchByName")}
            className={`pl-8 h-9 ${searchNameId !== null ? "w-[195px] pr-6" : "w-[160px]"}`}
          />
          {searchName && (
            <button
              className="absolute right-1.5 top-1/2 -translate-y-1/2"
              data-testid="button-clear-search-name"
              onClick={() => { setSearchName(""); setSearchNameId(null); setSearchNameOpen(false); searchNameKb.reset(); }}
            >
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          )}
          {searchNameOpen && nameSuggestions.length > 0 && (
            <div ref={searchNameKb.listRef} className="absolute top-full left-0 z-50 mt-1 w-[260px] max-h-52 overflow-y-auto rounded-md border bg-popover shadow-md">
              {nameSuggestions.map((f, i) => (
                <button
                  key={f.id}
                  data-testid={`name-suggestion-${f.id}`}
                  className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === searchNameKb.activeIndex ? "bg-accent" : "hover:bg-accent"}`}
                  onMouseEnter={() => searchNameKb.setActiveIndex(i)}
                  onMouseDown={() => { setSearchName(f.name); setSearchNameId(f.id); setSearchNameOpen(false); searchNameKb.reset(); }}
                >
                  <div className="font-medium">{f.name}</div>
                  {(f.phone || f.village) && (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {f.phone && <span>{f.phone}</span>}
                      {f.phone && f.village && <span> · </span>}
                      {f.village && <span>{f.village}</span>}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
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
        <Button variant="outline" size="sm" onClick={handleCsvDownload} data-testid="button-csv-download">
          <Download className="w-4 h-4" />
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
                <th
                  className="text-left p-2 font-medium text-muted-foreground cursor-pointer select-none"
                  onClick={() => toggleSort("name")}
                  data-testid="sort-name"
                >
                  <span className="inline-flex items-center">{t("common.name")} <SortIcon field="name" /></span>
                </th>
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
                const fDues = filteredDuesByFarmer.get(farmer.id);
                const displayPayable = fDues?.payable ?? parseFloat(farmer.totalPayable);
                const due = fDues?.due ?? parseFloat(farmer.totalDue);
                const isExpanded = expandedFarmerId === farmer.id;
                return (
                  <Fragment key={farmer.id}>
                    <tr
                      className={`border-b hover:bg-muted/30 transition-colors cursor-pointer ${isExpanded ? "bg-muted/20" : ""}`}
                      data-testid={`row-farmer-${farmer.id}`}
                      onClick={() => setExpandedFarmerId(isExpanded ? null : farmer.id)}
                    >
                      <td className="p-2 flex items-center gap-1">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => { e.stopPropagation(); openEditDialog(farmer); }}
                          data-testid={`button-edit-farmer-${farmer.id}`}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                      <td className="p-2 font-mono text-xs text-muted-foreground">{farmer.farmerId}</td>
                      <td className="p-2 font-medium">{farmer.name}</td>
                      <td className="p-2 text-muted-foreground">{farmer.village || "-"}</td>
                      <td className="p-2 text-muted-foreground">{farmer.phone}</td>
                      <td className="p-2 text-right font-medium text-green-600">{formatIndianCurrency(String(displayPayable))}</td>
                      <td className={`p-2 text-right font-bold ${due > 0 ? "text-red-600" : due < 0 ? "text-green-600" : "text-muted-foreground"}`}>
                        {formatIndianCurrency(String(due))}
                      </td>
                      <td className="p-2 text-center">
                        {farmer.redFlag && (
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
                          onClick={(e) => { e.stopPropagation(); handleToggleArchive(farmer); }}
                          title={farmer.isArchived ? t("farmerLedger.reinstate") : t("farmerLedger.archive")}
                          data-testid={`button-archive-farmer-${farmer.id}`}
                        >
                          <Archive className="w-3.5 h-3.5" />
                        </Button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={9} className="p-0">
                          <FarmerLedgerSection farmer={farmer} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("farmerLedger.editFarmer")}</DialogTitle>
            <DialogDescription>{t("farmerLedger.editDesc")}</DialogDescription>
          </DialogHeader>
          {editingFarmer && (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground font-mono">ID: {editingFarmer.farmerId}</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.name")}</Label>
                  <Input
                    data-testid="input-edit-farmer-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
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
                    <p className="text-xs text-orange-600">10-digit number required</p>
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("common.village")}</Label>
                  <div className="relative">
                    <Input
                      data-testid="input-edit-farmer-village"
                      value={editVillage}
                      onChange={(e) => { setEditVillage(capFirst(e.target.value)); setShowVillageSuggestions(true); }}
                      onFocus={() => setShowVillageSuggestions(true)}
                      onBlur={() => setTimeout(() => { setShowVillageSuggestions(false); villageKb.reset(); }, 150)}
                      onKeyDown={(e) => {
                        if (showVillageSuggestions && filteredVillages.length > 0) {
                          villageKb.handleKeyDown(e, (v) => { setEditVillage(v); setShowVillageSuggestions(false); villageKb.reset(); }, () => { setShowVillageSuggestions(false); villageKb.reset(); });
                        }
                      }}
                      autoComplete="off"
                    />
                    {showVillageSuggestions && filteredVillages.length > 0 && (
                      <div ref={villageKb.listRef} className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto top-full">
                        {filteredVillages.map((v, i) => (
                          <button key={v} type="button" data-testid={`suggestion-edit-village-${v}`}
                            className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === villageKb.activeIndex ? "bg-accent" : "hover:bg-muted"}`}
                            onMouseEnter={() => villageKb.setActiveIndex(i)}
                            onMouseDown={() => { setEditVillage(v); setShowVillageSuggestions(false); villageKb.reset(); }}>
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tehsil</Label>
                  <div className="relative">
                    <Input
                      data-testid="input-edit-farmer-tehsil"
                      value={editTehsil}
                      onChange={(e) => { setEditTehsil(capFirst(e.target.value)); setShowTehsilSuggestions(true); }}
                      onFocus={() => setShowTehsilSuggestions(true)}
                      onBlur={() => setTimeout(() => { setShowTehsilSuggestions(false); tehsilKb.reset(); }, 150)}
                      onKeyDown={(e) => {
                        if (showTehsilSuggestions && filteredTehsils.length > 0) {
                          tehsilKb.handleKeyDown(e, (th) => { setEditTehsil(th); setShowTehsilSuggestions(false); tehsilKb.reset(); }, () => { setShowTehsilSuggestions(false); tehsilKb.reset(); });
                        }
                      }}
                      autoComplete="off"
                    />
                    {showTehsilSuggestions && filteredTehsils.length > 0 && (
                      <div ref={tehsilKb.listRef} className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto top-full">
                        {filteredTehsils.map((th, i) => (
                          <button key={th} type="button" data-testid={`suggestion-edit-tehsil-${th}`}
                            className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === tehsilKb.activeIndex ? "bg-accent" : "hover:bg-muted"}`}
                            onMouseEnter={() => tehsilKb.setActiveIndex(i)}
                            onMouseDown={() => { setEditTehsil(th); setShowTehsilSuggestions(false); tehsilKb.reset(); }}>
                            {th}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">District</Label>
                  <Popover open={districtOpen} onOpenChange={setDistrictOpen}>
                    <PopoverTrigger asChild>
                      <Button data-testid="select-edit-farmer-district" variant="outline" role="combobox" aria-expanded={districtOpen} className="w-full justify-between font-normal">
                        {editDistrict || <span className="text-muted-foreground">Select district</span>}
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder="Search district..." className="h-9 text-sm" />
                        <CommandList>
                          <CommandEmpty className="py-3 text-xs">No district found.</CommandEmpty>
                          <CommandGroup>
                            {DISTRICTS.map(d => (
                              <CommandItem key={d} value={d} onSelect={() => { setEditDistrict(d); setDistrictOpen(false); }} className="text-sm">
                                <Check className={`mr-2 h-3.5 w-3.5 ${editDistrict === d ? "opacity-100" : "opacity-0"}`} />
                                {d}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">State</Label>
                  <Select value={editState} onValueChange={setEditState}>
                    <SelectTrigger data-testid="select-edit-farmer-state">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Madhya Pradesh">Madhya Pradesh</SelectItem>
                      <SelectItem value="Gujarat">Gujarat</SelectItem>
                      <SelectItem value="Uttar Pradesh">Uttar Pradesh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bank Name</Label>
                  <Input
                    data-testid="input-edit-farmer-bank-name"
                    value={editBankName}
                    onChange={(e) => setEditBankName(e.target.value)}
                    placeholder="e.g. State Bank of India"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Bank Account #</Label>
                  <Input
                    data-testid="input-edit-farmer-bank-account"
                    value={editBankAccountNumber}
                    onChange={(e) => setEditBankAccountNumber(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    placeholder="Account number"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">IFSC Code</Label>
                  <Input
                    data-testid="input-edit-farmer-ifsc"
                    value={editIfscCode}
                    onChange={(e) => setEditIfscCode(e.target.value.toUpperCase().slice(0, 11))}
                    placeholder="e.g. SBIN0001234"
                    maxLength={11}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("farmerLedger.redFlag")}</Label>
                  <Select value={editRedFlag} onValueChange={setEditRedFlag}>
                    <SelectTrigger data-testid="select-edit-red-flag">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="false">{t("common.no")}</SelectItem>
                      <SelectItem value="true">{t("common.yes")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
