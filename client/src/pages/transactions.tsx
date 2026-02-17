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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { Bid, Buyer, Lot, Farmer, Transaction, BusinessChargeSettings } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Receipt, Pencil, Printer, ChevronDown, Calendar, Package, Users, Landmark, HandCoins, Download } from "lucide-react";
import { format } from "date-fns";

type BidWithDetails = Bid & { buyer: Buyer; lot: Lot; farmer: Farmer };
type TransactionWithDetails = Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid };

type DialogItem = {
  type: "pending" | "completed";
  bid: BidWithDetails;
  txn?: TransactionWithDetails;
};

type UnifiedLotGroup = {
  lotId: string;
  lot: Lot;
  farmer: Farmer;
  pendingBids: BidWithDetails[];
  completedTxns: TransactionWithDetails[];
};

function buildUnifiedLotGroups(
  pendingBids: BidWithDetails[],
  completedTxns: TransactionWithDetails[]
): UnifiedLotGroup[] {
  const map = new Map<number, UnifiedLotGroup>();

  for (const bid of pendingBids) {
    const key = bid.lot.id;
    if (!map.has(key)) {
      map.set(key, { lotId: bid.lot.lotId, lot: bid.lot, farmer: bid.farmer, pendingBids: [], completedTxns: [] });
    }
    map.get(key)!.pendingBids.push(bid);
  }

  for (const tx of completedTxns) {
    const key = tx.lot.id;
    if (!map.has(key)) {
      map.set(key, { lotId: tx.lot.lotId, lot: tx.lot, farmer: tx.farmer, pendingBids: [], completedTxns: [] });
    }
    map.get(key)!.completedTxns.push(tx);
  }

  return Array.from(map.values());
}

function generateFarmerReceiptHtml(lot: Lot, farmer: Farmer, txns: TransactionWithDetails[], businessName?: string) {
  const dateStr = txns[0]?.date || format(new Date(), "yyyy-MM-dd");
  const originalBags = lot.numberOfBags;
  const cropLabel: Record<string, string> = { Potato: "आलू / Potato", Onion: "प्याज / Onion", Garlic: "लहसुन / Garlic" };

  const totalHammali = txns.reduce((s, t) => s + parseFloat(t.hammaliCharges || "0"), 0);
  const totalGrading = txns.reduce((s, t) => s + parseFloat(t.gradingCharges || "0"), 0);
  const totalFreight = txns.reduce((s, t) => s + parseFloat(t.freightCharges || "0"), 0);
  const totalAadhatFarmer = txns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * parseFloat(t.pricePerKg || "0");
    return s + gross * parseFloat(t.aadhatFarmerPercent || "0") / 100;
  }, 0);
  const totalMandiFarmer = txns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * parseFloat(t.pricePerKg || "0");
    return s + gross * parseFloat(t.mandiFarmerPercent || "0") / 100;
  }, 0);

  const totalDeduction = totalHammali + totalGrading + totalFreight + totalAadhatFarmer + totalMandiFarmer;
  const totalPayable = txns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0);
  const totalGross = txns.reduce((s, t) => s + (parseFloat(t.netWeight || "0") * parseFloat(t.pricePerKg || "0")), 0);

  const txnRows = txns.map(t => {
    const nw = parseFloat(t.netWeight || "0");
    const ppk = parseFloat(t.pricePerKg || "0");
    const gross = nw * ppk;
    return `<tr>
      <td style="padding:6px;border:1px solid #999;text-align:center">${cropLabel[lot.crop] || lot.crop}</td>
      <td style="padding:6px;border:1px solid #999;text-align:center">${t.numberOfBags || 0}</td>
      <td style="padding:6px;border:1px solid #999;text-align:right">${nw.toFixed(2)}</td>
      <td style="padding:6px;border:1px solid #999;text-align:right">₹${ppk.toFixed(2)}</td>
      <td style="padding:6px;border:1px solid #999;text-align:right">₹${gross.toFixed(2)}</td>
    </tr>`;
  }).join("");

  const totalActualBags = txns.reduce((s, t) => s + (t.numberOfBags || 0), 0);
  const totalNetWeight = txns.reduce((s, t) => s + parseFloat(t.netWeight || "0"), 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>किसान रसीद</title>
<style>body{font-family:'Noto Sans Devanagari',sans-serif;margin:20px;color:#333;font-size:14px}
table{width:100%;border-collapse:collapse;margin:8px 0}
h2{text-align:center;margin-bottom:2px}
.header{text-align:center;margin-bottom:10px}
.info-table td{padding:4px 8px;vertical-align:top}
.info-table{margin-bottom:12px}
.txn-table th{padding:6px;border:1px solid #999;background:#f5f5f5;text-align:center;font-size:13px}
.ded-section{margin-top:12px;border-top:2px solid #333;padding-top:8px}
.ded-row{display:flex;justify-content:space-between;padding:3px 0;font-size:14px}
.total-row{font-weight:bold;font-size:1.1em;color:#16a34a;border-top:2px solid #333;padding-top:8px;margin-top:8px}
.sub-total{font-weight:bold;border-top:1px solid #999;padding-top:4px;margin-top:4px}
@media print{body{margin:10mm}}
</style></head><body>
<div class="header">
<h2>किसान रसीद / Farmer Receipt</h2>
${businessName ? `<p style="font-size:0.9em;color:#666;margin:2px 0">${businessName}</p>` : ""}
</div>

<table class="info-table">
<tr><td><strong>रसीद / Lot नं:</strong> ${lot.lotId}</td><td style="text-align:right"><strong>दिनांक:</strong> ${dateStr}</td></tr>
</table>

<table class="info-table">
<tr><td><strong>किसान / Farmer:</strong> ${farmer.name}</td><td><strong>फोन:</strong> ${farmer.phone || "-"}</td></tr>
<tr><td><strong>गाँव:</strong> ${farmer.village || "-"}</td><td><strong>तहसील:</strong> ${farmer.tehsil || "-"}</td></tr>
<tr><td><strong>जिला:</strong> ${farmer.district || "-"}</td><td><strong>राज्य:</strong> ${farmer.state || "-"}</td></tr>
<tr><td><strong>गाड़ी नं:</strong> ${lot.vehicleNumber || "-"}</td><td><strong>थैले (Original):</strong> ${originalBags}</td></tr>
</table>

<table class="txn-table">
<thead>
<tr>
  <th>फसल / Crop</th>
  <th>थैले / Bags</th>
  <th>वज़न / Net Wt (kg)</th>
  <th>भाव / Rate (₹/kg)</th>
  <th>राशि / Amount (₹)</th>
</tr>
</thead>
<tbody>
${txnRows}
<tr style="background:#f9f9f9;font-weight:bold">
  <td style="padding:6px;border:1px solid #999;text-align:center">कुल / Total</td>
  <td style="padding:6px;border:1px solid #999;text-align:center">${totalActualBags}</td>
  <td style="padding:6px;border:1px solid #999;text-align:right">${totalNetWeight.toFixed(2)}</td>
  <td style="padding:6px;border:1px solid #999;text-align:right">-</td>
  <td style="padding:6px;border:1px solid #999;text-align:right">₹${totalGross.toFixed(2)}</td>
</tr>
</tbody>
</table>

<div class="ded-section">
<div class="ded-row" style="font-weight:bold;margin-bottom:4px"><span>कटौती / Deductions:</span><span></span></div>
${totalHammali > 0 ? `<div class="ded-row"><span>हम्माली / Hammali:</span><span>₹${totalHammali.toFixed(2)}</span></div>` : ""}
${totalGrading > 0 ? `<div class="ded-row"><span>ग्रेडिंग / Grading:</span><span>₹${totalGrading.toFixed(2)}</span></div>` : ""}
${totalAadhatFarmer > 0 ? `<div class="ded-row"><span>आढ़त / Aadhat:</span><span>₹${totalAadhatFarmer.toFixed(2)}</span></div>` : ""}
${totalMandiFarmer > 0 ? `<div class="ded-row"><span>मण्डी शुल्क / Mandi:</span><span>₹${totalMandiFarmer.toFixed(2)}</span></div>` : ""}
${totalFreight > 0 ? `<div class="ded-row"><span>भाड़ा / Freight:</span><span>₹${totalFreight.toFixed(2)}</span></div>` : ""}
${totalDeduction > 0 ? `<div class="ded-row sub-total"><span>कुल कटौती / Total Deduction:</span><span>₹${totalDeduction.toFixed(2)}</span></div>` : ""}
<div class="ded-row total-row"><span>किसान को देय राशि / Net Payable:</span><span>₹${totalPayable.toFixed(2)}</span></div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}

function generateBuyerReceiptHtml(lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string) {
  const grossAmount = parseFloat(tx.netWeight || "0") * parseFloat(tx.pricePerKg || "0");
  const dateStr = tx.date || format(new Date(), "yyyy-MM-dd");
  const bags = tx.numberOfBags || 0;

  const hammaliBuyer = parseFloat(tx.hammaliBuyerPerBag || "0") * bags;
  const gradingBuyer = parseFloat(tx.gradingBuyerPerBag || "0") * bags;
  const aadhatBuyer = grossAmount * parseFloat(tx.aadhatBuyerPercent || "0") / 100;
  const mandiBuyer = grossAmount * parseFloat(tx.mandiBuyerPercent || "0") / 100;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Buyer Receipt</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
h2{text-align:center;margin-bottom:5px}
.header{text-align:center;margin-bottom:15px}
.detail-table td{padding:6px;border:1px solid #ccc}
.summary{margin-top:15px;border-top:2px solid #333;padding-top:10px}
.summary-row{display:flex;justify-content:space-between;padding:3px 0}
.total{font-weight:bold;font-size:1.1em;color:#dc2626;border-top:2px solid #333;padding-top:8px;margin-top:8px}
@media print{body{margin:10mm}}
</style></head><body>
<div class="header">
<h2>Buyer Receipt</h2>
${businessName ? `<p style="font-size:0.9em;color:#666">${businessName}</p>` : ""}
</div>
<table class="detail-table">
<tr><td><strong>Lot No:</strong> ${lot.lotId}</td><td><strong>Date:</strong> ${dateStr}</td></tr>
<tr><td><strong>Buyer:</strong> ${tx.buyer.name}</td><td><strong>Buyer Code:</strong> ${tx.buyer.buyerCode || "-"}</td></tr>
<tr><td><strong>Farmer:</strong> ${farmer.name}</td><td><strong>Crop:</strong> ${lot.crop}</td></tr>
<tr><td><strong>Size:</strong> ${lot.size || "-"}</td><td></td></tr>
</table>
<table style="margin-top:15px">
<tr style="background:#f5f5f5">
<th style="padding:8px;border:1px solid #ccc;text-align:left">Description</th>
<th style="padding:8px;border:1px solid #ccc;text-align:right">Amount</th>
</tr>
<tr><td style="padding:6px;border:1px solid #ccc">Bags</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${bags}</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Total Weight</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${parseFloat(tx.totalWeight || "0").toFixed(2)} kg</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Net Weight</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${parseFloat(tx.netWeight || "0").toFixed(2)} kg</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Rate</td><td style="padding:6px;border:1px solid #ccc;text-align:right">Rs.${parseFloat(tx.pricePerKg || "0").toFixed(2)}/kg</td></tr>
<tr style="background:#f9f9f9"><td style="padding:6px;border:1px solid #ccc"><strong>Gross Amount</strong></td><td style="padding:6px;border:1px solid #ccc;text-align:right"><strong>Rs.${grossAmount.toFixed(2)}</strong></td></tr>
</table>
<div class="summary">
${hammaliBuyer > 0 ? `<div class="summary-row"><span>Hammali (${bags} bags):</span><span>Rs.${hammaliBuyer.toFixed(2)}</span></div>` : ""}
${gradingBuyer > 0 ? `<div class="summary-row"><span>Grading:</span><span>Rs.${gradingBuyer.toFixed(2)}</span></div>` : ""}
${aadhatBuyer > 0 ? `<div class="summary-row"><span>Aadhat (${tx.aadhatBuyerPercent}%):</span><span>Rs.${aadhatBuyer.toFixed(2)}</span></div>` : ""}
${mandiBuyer > 0 ? `<div class="summary-row"><span>Mandi (${tx.mandiBuyerPercent}%):</span><span>Rs.${mandiBuyer.toFixed(2)}</span></div>` : ""}
<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${parseFloat(tx.totalReceivableFromBuyer || "0").toFixed(2)}</span></div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}

function openPrintWindow(html: string) {
  const w = window.open("", "_blank", "width=800,height=600");
  if (w) {
    w.document.write(html);
    w.document.close();
  }
}

export default function TransactionsPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [dialogItems, setDialogItems] = useState<DialogItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reverseConfirmOpen, setReverseConfirmOpen] = useState(false);
  const [reversingTxn, setReversingTxn] = useState<TransactionWithDetails | null>(null);
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1);
  const currentDay = String(now.getDate());
  const [yearFilter, setYearFilter] = usePersistedState("txn-yearFilter", currentYear);
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("txn-selectedMonths", [currentMonth]);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("txn-selectedDays", [currentDay]);
  const [cropFilter, setCropFilter] = usePersistedState("txn-cropFilter", "all");
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const [totalWeight, setTotalWeight] = useState("");
  const [applyFarmerGrading, setApplyFarmerGrading] = useState(false);
  const [applyBuyerGrading, setApplyBuyerGrading] = useState(false);

  type ChargeSettingsData = {
    mandiCommissionFarmerPercent: string;
    mandiCommissionBuyerPercent: string;
    aadhatCommissionFarmerPercent: string;
    aadhatCommissionBuyerPercent: string;
    hammaliFarmerPerBag: string;
    hammaliBuyerPerBag: string;
    gradingFarmerPerBag: string;
    gradingBuyerPerBag: string;
  };

  const { data: chargeSettings } = useQuery<ChargeSettingsData>({
    queryKey: ["/api/charge-settings"],
  });

  const { data: allBids = [] } = useQuery<BidWithDetails[]>({
    queryKey: ["/api/bids"],
  });

  const { data: txns = [] } = useQuery<TransactionWithDetails[]>({
    queryKey: ["/api/transactions"],
  });

  const { data: farmersWithDues = [] } = useQuery<(Farmer & { totalPayable: string; totalDue: string; salesCount: number })[]>({
    queryKey: ["/api/farmers-with-dues"],
  });

  const { data: buyersWithDues = [] } = useQuery<(Buyer & { receivableDue: string; overallDue: string })[]>({
    queryKey: ["/api/buyers?withDues=true"],
  });

  const { data: txAggregates } = useQuery<{
    totalHammali: number; totalGrading: number; totalMandiCommission: number;
    paidHammali: number; paidGrading: number; paidMandiCommission: number;
  }>({
    queryKey: ["/api/transaction-aggregates"],
  });

  const createTxMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/transactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      setDialogOpen(false);
      setDialogItems([]);
      toast({ title: "Transaction Created", description: "Transaction recorded successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateTxMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/transactions/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      setDialogOpen(false);
      setDialogItems([]);
      toast({ title: "Transaction Updated", description: "Transaction updated successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const reverseTxMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/transactions/${id}/reverse`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      setReverseConfirmOpen(false);
      setReversingTxn(null);
      setDialogOpen(false);
      toast({ title: "Transaction Reversed", description: `${data.bagsReturned} bags returned to stock` });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const existingBidIds = new Set(txns.map(t => t.bidId));
  const pendingBids = allBids.filter(b => !existingBidIds.has(b.id));

  const unifiedGroups = useMemo(
    () => buildUnifiedLotGroups(pendingBids, txns),
    [pendingBids, txns]
  );

  const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const daysInMonths = useMemo(() => {
    if (selectedMonths.length === 0) return 31;
    const year = parseInt(yearFilter);
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

  const filteredGroups = useMemo(() => {
    return unifiedGroups.filter(g => {
      if (cropFilter !== "all" && g.lot.crop !== cropFilter) return false;
      const lotDate = new Date(g.lot.createdAt);
      if (lotDate.getFullYear() !== parseInt(yearFilter)) return false;
      if (selectedMonths.length > 0) {
        const lotMonth = String(lotDate.getMonth() + 1);
        if (!selectedMonths.includes(lotMonth)) return false;
      }
      if (selectedDays.length > 0) {
        const lotDay = String(lotDate.getDate());
        if (!selectedDays.includes(lotDay)) return false;
      }
      return true;
    });
  }, [unifiedGroups, cropFilter, yearFilter, selectedMonths, selectedDays]);

  const summaryStats = useMemo(() => {
    const allActiveTxns = filteredGroups.flatMap(g => g.completedTxns.filter(t => !t.isReversed));
    const lotsCount = filteredGroups.length;
    const txnCount = allActiveTxns.length;
    const totalPayableToFarmer = allActiveTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0);
    const totalReceivableFromBuyer = allActiveTxns.reduce((s, t) => s + parseFloat(t.totalReceivableFromBuyer || "0"), 0);
    const totalMandiCommission = allActiveTxns.reduce((s, t) => s + parseFloat(t.mandiCharges || "0"), 0);
    const totalAadhatCommission = allActiveTxns.reduce((s, t) => s + parseFloat(t.aadhatCharges || "0"), 0);

    const farmerDue = farmersWithDues.reduce((s, f) => s + parseFloat(f.totalDue || "0"), 0);
    const buyerDue = buyersWithDues.reduce((s, b) => s + parseFloat(b.overallDue || "0"), 0);
    const mandiDue = (txAggregates?.totalMandiCommission || 0) - (txAggregates?.paidMandiCommission || 0);

    return { lotsCount, txnCount, totalPayableToFarmer, totalReceivableFromBuyer, totalMandiCommission, totalAadhatCommission, farmerDue, buyerDue, mandiDue };
  }, [filteredGroups, farmersWithDues, buyersWithDues, txAggregates]);

  const bidForTxn = (tx: TransactionWithDetails): BidWithDetails => {
    const found = allBids.find(b => b.id === tx.bidId);
    if (found) return found;
    return {
      ...tx.bid,
      buyer: tx.buyer,
      lot: tx.lot,
      farmer: tx.farmer,
    } as BidWithDetails;
  };

  const openEditDialog = (group: UnifiedLotGroup) => {
    const items: DialogItem[] = [];

    for (const bid of group.pendingBids) {
      items.push({ type: "pending", bid });
    }

    for (const tx of group.completedTxns) {
      items.push({ type: "completed", bid: bidForTxn(tx), txn: tx });
    }

    setDialogItems(items);
    setSelectedIdx(0);

    const firstItem = items[0];
    if (firstItem?.type === "completed" && firstItem.txn) {
      prefillFromTxn(firstItem.txn);
    } else {
      resetFormDefaults(firstItem?.bid);
    }

    setDialogOpen(true);
  };

  const prefillFromTxn = (tx: TransactionWithDetails) => {
    setTotalWeight(tx.totalWeight || "");
    setApplyFarmerGrading(parseFloat(tx.gradingFarmerPerBag || "0") > 0);
    setApplyBuyerGrading(parseFloat(tx.gradingBuyerPerBag || "0") > 0);
  };

  const calcProportionateWeight = (bid: BidWithDetails): string => {
    const lotWeight = parseFloat(bid.lot.initialTotalWeight || "0");
    const lotBags = bid.lot.numberOfBags || 1;
    const bidBags = bid.numberOfBags || 0;
    if (lotWeight <= 0 || lotBags <= 0) return "";
    return ((bidBags / lotBags) * lotWeight).toFixed(2);
  };

  const resetFormDefaults = (bid?: BidWithDetails) => {
    setTotalWeight(bid ? calcProportionateWeight(bid) : "");
    setApplyFarmerGrading(false);
    setApplyBuyerGrading(false);
  };

  const handleBuyerChange = (val: string) => {
    const idx = parseInt(val);
    setSelectedIdx(idx);
    const item = dialogItems[idx];
    if (item?.type === "completed" && item.txn) {
      prefillFromTxn(item.txn);
    } else {
      resetFormDefaults(item?.bid);
    }
  };

  const currentItem = dialogItems[selectedIdx] || null;
  const selectedBid = currentItem?.bid || null;
  const isEditing = currentItem?.type === "completed";

  const cs = chargeSettings || {
    mandiCommissionFarmerPercent: "0", mandiCommissionBuyerPercent: "1",
    aadhatCommissionFarmerPercent: "0", aadhatCommissionBuyerPercent: "2",
    hammaliFarmerPerBag: "0", hammaliBuyerPerBag: "0",
    gradingFarmerPerBag: "0", gradingBuyerPerBag: "0",
  };

  const tw = parseFloat(totalWeight) || 0;
  const bags = selectedBid?.numberOfBags || 0;
  const netWeight = tw > 0 ? (tw - bags).toFixed(2) : "0.00";
  const nw = parseFloat(netWeight);
  const price = parseFloat(selectedBid?.pricePerKg || "0");
  const grossAmount = nw * price;

  const hammaliFarmerRate = parseFloat(cs.hammaliFarmerPerBag) || 0;
  const hammaliBuyerRate = parseFloat(cs.hammaliBuyerPerBag) || 0;
  const gradingFarmerRate = applyFarmerGrading ? (parseFloat(cs.gradingFarmerPerBag) || 0) : 0;
  const gradingBuyerRate = applyBuyerGrading ? (parseFloat(cs.gradingBuyerPerBag) || 0) : 0;
  const aadhatFarmerPct = parseFloat(cs.aadhatCommissionFarmerPercent) || 0;
  const aadhatBuyerPct = parseFloat(cs.aadhatCommissionBuyerPercent) || 0;
  const mandiFarmerPct = parseFloat(cs.mandiCommissionFarmerPercent) || 0;
  const mandiBuyerPct = parseFloat(cs.mandiCommissionBuyerPercent) || 0;

  const vehicleBhadaRate = parseFloat(selectedBid?.lot.vehicleBhadaRate || "0");
  const originalBags = selectedBid?.lot.numberOfBags || 1;
  const actualBags = selectedBid?.lot.actualNumberOfBags ?? originalBags;
  const freightFarmerTotal = actualBags > 0 ? ((bags * originalBags) / actualBags) * vehicleBhadaRate : 0;

  const hammaliFarmerTotal = hammaliFarmerRate * bags;
  const hammaliBuyerTotal = hammaliBuyerRate * bags;
  const gradingFarmerTotal = gradingFarmerRate * bags;
  const gradingBuyerTotal = gradingBuyerRate * bags;
  const aadhatFarmer = (grossAmount * aadhatFarmerPct) / 100;
  const aadhatBuyer = (grossAmount * aadhatBuyerPct) / 100;
  const mandiFarmer = (grossAmount * mandiFarmerPct) / 100;
  const mandiBuyer = (grossAmount * mandiBuyerPct) / 100;

  const farmerDeductions = hammaliFarmerTotal + gradingFarmerTotal + aadhatFarmer + mandiFarmer + freightFarmerTotal;
  const buyerAdditions = hammaliBuyerTotal + gradingBuyerTotal + aadhatBuyer + mandiBuyer;

  const farmerPayable = grossAmount - farmerDeductions;
  const buyerReceivable = grossAmount + buyerAdditions;

  const submitTransaction = () => {
    if (!selectedBid || !totalWeight) {
      toast({ title: "Error", description: "Total weight is required", variant: "destructive" });
      return;
    }

    const payload = {
      lotId: selectedBid.lot.id,
      bidId: selectedBid.id,
      buyerId: selectedBid.buyerId,
      farmerId: selectedBid.lot.farmerId,
      totalWeight,
      numberOfBags: bags,
      hammaliCharges: hammaliFarmerTotal.toString(),
      gradingCharges: gradingFarmerTotal.toString(),
      freightCharges: freightFarmerTotal.toFixed(2),
      netWeight,
      pricePerKg: selectedBid.pricePerKg,
      aadhatCharges: aadhatBuyer.toFixed(2),
      mandiCharges: mandiBuyer.toFixed(2),
      aadhatFarmerPercent: aadhatFarmerPct.toString(),
      mandiFarmerPercent: mandiFarmerPct.toString(),
      aadhatBuyerPercent: aadhatBuyerPct.toString(),
      mandiBuyerPercent: mandiBuyerPct.toString(),
      hammaliFarmerPerBag: hammaliFarmerRate.toString(),
      hammaliBuyerPerBag: hammaliBuyerRate.toString(),
      gradingFarmerPerBag: gradingFarmerRate.toString(),
      gradingBuyerPerBag: gradingBuyerRate.toString(),
      totalPayableToFarmer: farmerPayable.toFixed(2),
      totalReceivableFromBuyer: buyerReceivable.toFixed(2),
      date: format(new Date(), "yyyy-MM-dd"),
    };

    if (isEditing && currentItem.txn) {
      payload.date = currentItem.txn.date || payload.date;
      updateTxMutation.mutate({ id: currentItem.txn.id, data: payload });
    } else {
      createTxMutation.mutate(payload);
    }
  };

  const isSaving = createTxMutation.isPending || updateTxMutation.isPending;

  const handlePrintFarmerReceipt = (group: UnifiedLotGroup) => {
    const activeTxns = group.completedTxns.filter(t => !t.isReversed);
    const html = generateFarmerReceiptHtml(group.lot, group.farmer, activeTxns);
    openPrintWindow(html);
  };

  const handlePrintBuyerReceipt = (tx: TransactionWithDetails, group: UnifiedLotGroup) => {
    const html = generateBuyerReceiptHtml(group.lot, group.farmer, tx);
    openPrintWindow(html);
  };

  const exportCSV = () => {
    const allTxns = filteredGroups.flatMap(g => g.completedTxns.filter(t => !t.isReversed));
    if (allTxns.length === 0) return;

    const headers = [
      "Transaction ID", "Date", "Lot ID", "Serial #", "Crop", "Variety",
      "Farmer Name", "Farmer Phone", "Farmer Village",
      "Buyer Name", "Buyer Phone",
      "Grade", "No. of Bags", "Rate/Kg",
      "Total Weight", "Net Weight",
      "Hammali Farmer/Bag", "Hammali Buyer/Bag", "Grading Farmer/Bag", "Grading Buyer/Bag",
      "Aadhat Farmer %", "Aadhat Buyer %", "Mandi Farmer %", "Mandi Buyer %",
      "Freight Charges",
      "Payable to Farmer", "Receivable from Buyer", "Status"
    ];

    const escCSV = (val: any) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = allTxns.map(tx => {
      const bid = bidForTxn(tx);
      return [
        tx.transactionId, tx.date, tx.lot.lotId, tx.lot.serialNumber, tx.lot.crop, tx.lot.variety || "",
        tx.farmer.name, tx.farmer.phone, tx.farmer.village || "",
        tx.buyer.name, tx.buyer.phone || "",
        bid.grade || "", tx.numberOfBags, tx.pricePerKg,
        tx.totalWeight, tx.netWeight,
        tx.hammaliFarmerPerBag || "0", tx.hammaliBuyerPerBag || "0",
        tx.gradingFarmerPerBag || "0", tx.gradingBuyerPerBag || "0",
        tx.aadhatFarmerPercent || "0", tx.aadhatBuyerPercent || "0",
        tx.mandiFarmerPercent || "0", tx.mandiBuyerPercent || "0",
        tx.freightCharges || "0",
        tx.totalPayableToFarmer, tx.totalReceivableFromBuyer, tx.isReversed ? "Reversed" : "Active"
      ].map(escCSV).join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-base md:text-lg font-bold flex items-center gap-2 mr-auto">
          <Receipt className="w-5 h-5 text-primary" />
          {t("transactions.title")}
        </h1>
        <Select value={cropFilter} onValueChange={setCropFilter}>
          <SelectTrigger className="w-[110px]" data-testid="select-crop-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transactions.allCrops")}</SelectItem>
            <SelectItem value="Potato">Potato</SelectItem>
            <SelectItem value="Onion">Onion</SelectItem>
            <SelectItem value="Garlic">Garlic</SelectItem>
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSelectedDays([]); }}>
          <SelectTrigger className="w-[85px]" data-testid="select-year-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="select-month-filter">
              {monthLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="month-select-all"
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
                    data-testid={`month-option-${val}`}
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
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="select-day-filter">
              <Calendar className="w-3 h-3 mr-1" />
              {dayLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="day-select-all"
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
                  data-testid={`day-option-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          data-testid="button-export-csv"
          onClick={exportCSV}
          disabled={filteredGroups.flatMap(g => g.completedTxns.filter(t => !t.isReversed)).length === 0}
          title="Download CSV"
        >
          <Download className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2" data-testid="txn-summary-cards">
        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Lots / Txns</span>
            </div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-400" data-testid="text-lots-txns">
              {summaryStats.lotsCount} <span className="text-xs font-normal text-muted-foreground">/</span> {summaryStats.txnCount}
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 dark:border-orange-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Farmer Payable</span>
            </div>
            <div className="text-sm font-bold text-orange-700 dark:text-orange-400" data-testid="text-farmer-payable">
              ₹{summaryStats.totalPayableToFarmer.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-red-600 font-medium" data-testid="text-farmer-due">
              Due: ₹{summaryStats.farmerDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <HandCoins className="w-3.5 h-3.5 text-green-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Buyer Receivable</span>
            </div>
            <div className="text-sm font-bold text-green-700 dark:text-green-400" data-testid="text-buyer-receivable">
              ₹{summaryStats.totalReceivableFromBuyer.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-red-600 font-medium" data-testid="text-buyer-due">
              Due: ₹{summaryStats.buyerDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="border-purple-200 dark:border-purple-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Landmark className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Mandi Comm.</span>
            </div>
            <div className="text-sm font-bold text-purple-700 dark:text-purple-400" data-testid="text-mandi-total">
              ₹{summaryStats.totalMandiCommission.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-red-600 font-medium" data-testid="text-mandi-due">
              Due: ₹{summaryStats.mandiDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1 border-amber-200 dark:border-amber-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Receipt className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Aadhat Comm.</span>
            </div>
            <div className="text-sm font-bold text-amber-700 dark:text-amber-400" data-testid="text-aadhat-total">
              ₹{summaryStats.totalAadhatCommission.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-green-600 font-medium" data-testid="text-aadhat-earned">
              Earned (via Buyer Dues)
            </div>
          </CardContent>
        </Card>
      </div>

      {filteredGroups.length > 0 ? (
        <div className="space-y-3">
          {filteredGroups.map((group) => {
            const activeTxns = group.completedTxns.filter(t => !t.isReversed);
            const hasCompleted = activeTxns.length > 0;
            const totalFarmerPayable = activeTxns.reduce(
              (s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0
            );

            return (
              <Card key={group.lot.id} data-testid={`card-lot-${group.lot.id}`}>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs">#{group.lot.serialNumber}</Badge>
                      <Badge variant="secondary" className="text-xs">{group.lotId}</Badge>
                      <Badge variant="outline" className="text-xs">{group.lot.crop}</Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        data-testid={`button-edit-lot-${group.lot.id}`}
                        size="sm"
                        className="mobile-touch-target"
                        onClick={() => openEditDialog(group)}
                      >
                        <Pencil className="w-4 h-4 mr-1" />
                        {t("common.edit")}
                      </Button>
                      {hasCompleted && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              data-testid={`button-print-lot-${group.lot.id}`}
                              variant="outline"
                              size="sm"
                              className="mobile-touch-target"
                            >
                              <Printer className="w-4 h-4" />
                              <ChevronDown className="w-3 h-3 ml-1" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              data-testid={`button-print-farmer-${group.lot.id}`}
                              onClick={() => handlePrintFarmerReceipt(group)}
                            >
                              किसान रसीद (Farmer Receipt - Hindi)
                            </DropdownMenuItem>
                            {group.completedTxns.filter(t => !t.isReversed).map((tx) => (
                              <DropdownMenuItem
                                key={tx.id}
                                data-testid={`button-print-buyer-${tx.id}`}
                                onClick={() => handlePrintBuyerReceipt(tx, group)}
                              >
                                Buyer Receipt - {tx.buyer.name}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm mb-0.5">{t("transactions.farmer")}: <strong>{group.farmer.name}</strong></p>
                  <p className="text-xs text-muted-foreground mb-2">{group.lot.actualNumberOfBags ?? group.lot.numberOfBags} {t("transactions.bagsTotal")}{(group.lot.actualNumberOfBags != null && group.lot.actualNumberOfBags !== group.lot.numberOfBags) ? ` (Orig: ${group.lot.numberOfBags})` : ""}</p>

                  {hasCompleted && (
                    <div className="border-t pt-2 mb-2 flex justify-between font-medium text-sm text-primary">
                      <span>{t("transactions.payableToFarmer")}:</span>
                      <span>Rs.{totalFarmerPayable.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="border-t pt-2 space-y-1">
                    {group.completedTxns.map((tx) => (
                      <div key={tx.id} className={`text-sm py-1 ${tx.isReversed ? "opacity-40" : ""}`}>
                        <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted-foreground">{t("transactions.buyer")}:</span>
                            <strong className="truncate">{tx.buyer.name}</strong>
                            <span className="text-green-600 font-semibold whitespace-nowrap">₹{tx.pricePerKg}/kg</span>
                            {tx.isReversed && <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">{t("transactions.reversed")}</Badge>}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{tx.numberOfBags} bags</span>
                            <span>{tx.lot.size || ""}</span>
                            <span>Net: {tx.netWeight}kg</span>
                            <span className="text-chart-2 font-medium text-sm">Rs.{tx.totalReceivableFromBuyer}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    {group.pendingBids.map((bid) => (
                      <div key={bid.id} className="text-sm py-1">
                        <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-0.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-muted-foreground">{t("transactions.buyer")}:</span>
                            <strong className="truncate">{bid.buyer.name}</strong>
                            <span className="text-green-600 font-semibold whitespace-nowrap">₹{bid.pricePerKg}/kg</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span>{bid.numberOfBags} bags</span>
                            <span>{bid.grade || "N/A"}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          {t("transactions.noBids")}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{isEditing ? t("transactions.editTransaction") : t("transactions.createTransaction")}</DialogTitle>
          </DialogHeader>
          {selectedBid && (
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <p>{t("transactions.lot")}: <strong>#{selectedBid.lot.serialNumber} - {selectedBid.lot.lotId}</strong></p>
                <p>{t("transactions.farmer")}: <strong>{selectedBid.farmer.name}</strong></p>
              </div>

              {dialogItems.length > 1 && (
                <div className="space-y-1">
                  <Label>{t("transactions.selectBuyer")}</Label>
                  <Select
                    data-testid="select-buyer-bid"
                    value={selectedIdx.toString()}
                    onValueChange={handleBuyerChange}
                  >
                    <SelectTrigger className="mobile-touch-target">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dialogItems.map((item, idx) => (
                        <SelectItem key={item.bid.id} value={idx.toString()}>
                          {item.bid.buyer.name} - Rs.{item.bid.pricePerKg}/kg ({item.bid.numberOfBags} bags)
                          {item.type === "completed" ? " ✓" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="bg-muted/50 rounded-md p-2 text-sm">
                <p>{t("transactions.buyer")}: <strong>{selectedBid.buyer.name}</strong></p>
                <p>Price: <strong>Rs.{selectedBid.pricePerKg}/kg</strong> | Bags: <strong>{selectedBid.numberOfBags}</strong> | Grade: <strong>{selectedBid.grade || "N/A"}</strong></p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("transactions.totalWeight")}</Label>
                  <Input
                    data-testid="input-total-weight"
                    type="text"
                    inputMode="decimal"
                    value={totalWeight}
                    onChange={(e) => setTotalWeight(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("transactions.netWeight")}</Label>
                  <Input value={netWeight} disabled className="mobile-touch-target bg-muted" />
                  <p className="text-xs text-muted-foreground">Total - {bags} bags</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs" data-testid="charge-rates-display">
                <div className="bg-muted/50 rounded p-2 space-y-1">
                  <p className="font-semibold text-muted-foreground">Farmer Charges</p>
                  <div className="flex justify-between"><span>Aadhat:</span><span>{aadhatFarmerPct}%</span></div>
                  <div className="flex justify-between"><span>Mandi:</span><span>{mandiFarmerPct}%</span></div>
                  <div className="flex justify-between"><span>Hammali:</span><span>₹{hammaliFarmerRate}/bag</span></div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={applyFarmerGrading} onCheckedChange={setApplyFarmerGrading} className="scale-75" data-testid="toggle-farmer-grading" />
                      <span>Grading:</span>
                    </div>
                    <span className={!applyFarmerGrading ? "text-muted-foreground/50 line-through" : ""}>₹{parseFloat(cs.gradingFarmerPerBag) || 0}/bag</span>
                  </div>
                  {vehicleBhadaRate > 0 && (
                    <div className="flex justify-between"><span>Freight/Bhada:</span><span>₹{vehicleBhadaRate}/bag</span></div>
                  )}
                </div>
                <div className="bg-muted/50 rounded p-2 space-y-1">
                  <p className="font-semibold text-muted-foreground">Buyer Charges</p>
                  <div className="flex justify-between"><span>Aadhat:</span><span>{aadhatBuyerPct}%</span></div>
                  <div className="flex justify-between"><span>Mandi:</span><span>{mandiBuyerPct}%</span></div>
                  <div className="flex justify-between"><span>Hammali:</span><span>₹{hammaliBuyerRate}/bag</span></div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Switch checked={applyBuyerGrading} onCheckedChange={setApplyBuyerGrading} className="scale-75" data-testid="toggle-buyer-grading" />
                      <span>Grading:</span>
                    </div>
                    <span className={!applyBuyerGrading ? "text-muted-foreground/50 line-through" : ""}>₹{parseFloat(cs.gradingBuyerPerBag) || 0}/bag</span>
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-md p-3 space-y-2 text-sm" data-testid="txn-calculation-summary">
                <div className="flex justify-between">
                  <span>{t("transactions.grossAmount")}:</span>
                  <span className="font-medium">Rs.{grossAmount.toFixed(2)}</span>
                </div>

                <div className="border-t pt-2 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Farmer Deductions:</p>
                  {hammaliFarmerRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Hammali ({bags} × ₹{hammaliFarmerRate}):</span>
                      <span>-Rs.{hammaliFarmerTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {gradingFarmerRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Grading ({bags} × ₹{gradingFarmerRate}):</span>
                      <span>-Rs.{gradingFarmerTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {aadhatFarmerPct > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Aadhat ({aadhatFarmerPct}%):</span>
                      <span>-Rs.{aadhatFarmer.toFixed(2)}</span>
                    </div>
                  )}
                  {mandiFarmerPct > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Mandi ({mandiFarmerPct}%):</span>
                      <span>-Rs.{mandiFarmer.toFixed(2)}</span>
                    </div>
                  )}
                  {freightFarmerTotal > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Freight ({originalBags !== actualBags ? `${bags}×${originalBags}/${actualBags}` : bags} × ₹{vehicleBhadaRate}):</span>
                      <span>-Rs.{freightFarmerTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {farmerDeductions === 0 && (
                    <div className="text-xs text-muted-foreground italic">No deductions</div>
                  )}
                </div>

                <div className="border-t pt-2">
                  <div className="flex justify-between font-medium text-primary">
                    <span>{t("transactions.payableToFarmer")}:</span>
                    <span>Rs.{farmerPayable.toFixed(2)}</span>
                  </div>
                </div>

                <div className="border-t pt-2 mt-2">
                  <p className="text-xs font-semibold text-muted-foreground mb-1">Buyer Additions:</p>
                  {hammaliBuyerRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Hammali ({bags} × ₹{hammaliBuyerRate}):</span>
                      <span>+Rs.{hammaliBuyerTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {gradingBuyerRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Grading ({bags} × ₹{gradingBuyerRate}):</span>
                      <span>+Rs.{gradingBuyerTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {aadhatBuyerPct > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Aadhat ({aadhatBuyerPct}%):</span>
                      <span>+Rs.{aadhatBuyer.toFixed(2)}</span>
                    </div>
                  )}
                  {mandiBuyerPct > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Mandi ({mandiBuyerPct}%):</span>
                      <span>+Rs.{mandiBuyer.toFixed(2)}</span>
                    </div>
                  )}
                  {buyerAdditions === 0 && (
                    <div className="text-xs text-muted-foreground italic">No additions</div>
                  )}
                </div>

                <div className="border-t pt-2">
                  <div className="flex justify-between font-medium">
                    <span>{t("transactions.receivableFromBuyer")}:</span>
                    <span>Rs.{buyerReceivable.toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <Button
                data-testid="button-submit-transaction"
                className="w-full mobile-touch-target"
                onClick={submitTransaction}
                disabled={isSaving}
              >
                {isSaving ? t("common.saving") : isEditing ? t("transactions.updateTransaction") : t("transactions.createTransaction")}
              </Button>
              {isEditing && currentItem?.txn && !currentItem.txn.isReversed && (
                <Button
                  variant="destructive"
                  data-testid="button-reverse-tx"
                  className="w-full mobile-touch-target"
                  onClick={() => {
                    const txn = currentItem.txn!;
                    const fullTxn = { ...txn, buyer: currentItem.bid.buyer, lot: currentItem.bid.lot, farmer: currentItem.bid.farmer } as TransactionWithDetails;
                    setReversingTxn(fullTxn);
                    setReverseConfirmOpen(true);
                  }}
                  disabled={reverseTxMutation.isPending}
                >
                  {t("transactions.returnToStockRegister")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={reverseConfirmOpen} onOpenChange={(open) => { setReverseConfirmOpen(open); if (!open) setReversingTxn(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("transactions.returnConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("transactions.returnConfirmMsg")}
              {reversingTxn && (
                <span className="block mt-2 text-orange-600 font-medium">
                  Buyer: {reversingTxn.buyer.name} — {reversingTxn.numberOfBags} bags will be returned to stock and become available for bidding again.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-reverse">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-reverse"
              className="bg-destructive text-destructive-foreground"
              onClick={() => reversingTxn && reverseTxMutation.mutate(reversingTxn.id)}
              disabled={reverseTxMutation.isPending}
            >
              {reverseTxMutation.isPending ? t("transactions.reversing") : t("transactions.yesReverse")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
