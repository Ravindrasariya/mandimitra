import { useState, useMemo } from "react";
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
import type { Bid, Buyer, Lot, Farmer, Transaction } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Receipt, Pencil, Printer, ChevronDown } from "lucide-react";
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
  const totalBags = txns.reduce((s, t) => s + (t.numberOfBags || 0), 0);
  const totalHammali = txns.reduce((s, t) => s + parseFloat(t.hammaliCharges || "0"), 0);
  const totalGrading = txns.reduce((s, t) => s + parseFloat(t.gradingCharges || "0"), 0);
  const sellerChargedTxns = txns.filter(t => t.chargedTo === "Seller");
  const totalAadhat = sellerChargedTxns.reduce((s, t) => s + parseFloat(t.aadhatCharges || "0"), 0);
  const totalMandi = sellerChargedTxns.reduce((s, t) => s + parseFloat(t.mandiCharges || "0"), 0);
  const totalPayable = txns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0);
  const totalGross = txns.reduce((s, t) => s + (parseFloat(t.netWeight || "0") * parseFloat(t.pricePerKg || "0")), 0);
  const dateStr = txns[0]?.date || format(new Date(), "yyyy-MM-dd");

  const totalNetWeight = txns.reduce((s, t) => s + parseFloat(t.netWeight || "0"), 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>किसान रसीद</title>
<style>body{font-family:'Noto Sans Devanagari',sans-serif;margin:20px;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
h2{text-align:center;margin-bottom:5px}
.header{text-align:center;margin-bottom:15px}
.summary{margin-top:15px;border-top:2px solid #333;padding-top:10px}
.summary-row{display:flex;justify-content:space-between;padding:3px 0}
.total{font-weight:bold;font-size:1.1em;color:#16a34a;border-top:2px solid #333;padding-top:8px;margin-top:8px}
@media print{body{margin:10mm}}
</style></head><body>
<div class="header">
<h2>किसान रसीद / Farmer Receipt</h2>
</div>
<table>
<tr><td><strong>लॉट नं:</strong> ${lot.lotId}</td><td><strong>दिनांक:</strong> ${dateStr}</td></tr>
<tr><td><strong>किसान:</strong> ${farmer.name}</td><td><strong>फोन:</strong> ${farmer.phone || "-"}</td></tr>
<tr><td><strong>फसल:</strong> ${lot.crop}</td><td><strong>किस्म:</strong> ${lot.variety || "-"}</td></tr>
<tr><td><strong>थैले:</strong> ${lot.numberOfBags}</td><td><strong>वज़न:</strong> ${totalNetWeight.toFixed(2)} kg</td></tr>
</table>
<div class="summary">
<div class="summary-row"><span>कुल राशि (Gross):</span><span>₹${totalGross.toFixed(2)}</span></div>
<div class="summary-row"><span>हम्माली (${totalBags} थैले):</span><span>₹${totalHammali.toFixed(2)}</span></div>
<div class="summary-row"><span>ग्रेडिंग:</span><span>₹${totalGrading.toFixed(2)}</span></div>
${sellerChargedTxns.length > 0 ? `<div class="summary-row"><span>आढ़त:</span><span>₹${totalAadhat.toFixed(2)}</span></div>
<div class="summary-row"><span>मण्डी शुल्क:</span><span>₹${totalMandi.toFixed(2)}</span></div>` : ""}
<div class="summary-row total"><span>किसान को देय राशि:</span><span>₹${totalPayable.toFixed(2)}</span></div>
</div>
<script>window.onload=function(){window.print()}</script>
</body></html>`;
}

function generateBuyerReceiptHtml(lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string) {
  const grossAmount = parseFloat(tx.netWeight || "0") * parseFloat(tx.pricePerKg || "0");
  const dateStr = tx.date || format(new Date(), "yyyy-MM-dd");

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
<p style="font-size:0.9em;color:#666">${businessName || "Mandi Mitra"}</p>
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
<tr><td style="padding:6px;border:1px solid #ccc">Bags</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${tx.numberOfBags}</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Total Weight</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${parseFloat(tx.totalWeight || "0").toFixed(2)} kg</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Net Weight</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${parseFloat(tx.netWeight || "0").toFixed(2)} kg</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Rate</td><td style="padding:6px;border:1px solid #ccc;text-align:right">Rs.${parseFloat(tx.pricePerKg || "0").toFixed(2)}/kg</td></tr>
<tr style="background:#f9f9f9"><td style="padding:6px;border:1px solid #ccc"><strong>Gross Amount</strong></td><td style="padding:6px;border:1px solid #ccc;text-align:right"><strong>Rs.${grossAmount.toFixed(2)}</strong></td></tr>
</table>
<div class="summary">
<div class="summary-row"><span>Hammali (${tx.numberOfBags} bags × Rs.${parseFloat(tx.hammaliPerBag || "0").toFixed(2)}):</span><span>Rs.${parseFloat(tx.hammaliCharges || "0").toFixed(2)}</span></div>
<div class="summary-row"><span>Grading:</span><span>Rs.${parseFloat(tx.gradingCharges || "0").toFixed(2)}</span></div>
${tx.chargedTo === "Buyer" ? `<div class="summary-row"><span>Aadhat (${tx.aadhatCommissionPercent}%):</span><span>Rs.${parseFloat(tx.aadhatCharges || "0").toFixed(2)}</span></div>
<div class="summary-row"><span>Mandi (${tx.mandiCommissionPercent}%):</span><span>Rs.${parseFloat(tx.mandiCharges || "0").toFixed(2)}</span></div>` : ""}
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
  const [cropFilter, setCropFilter] = useState("all");
  const [reverseConfirmOpen, setReverseConfirmOpen] = useState(false);
  const [reversingTxn, setReversingTxn] = useState<TransactionWithDetails | null>(null);
  const now = new Date();
  const [yearFilter, setYearFilter] = useState(String(now.getFullYear()));
  const [monthFilter, setMonthFilter] = useState(String(now.getMonth() + 1));
  const [dayFilter, setDayFilter] = useState("all");

  const [totalWeight, setTotalWeight] = useState("");
  const [hammaliPerBag, setHammaliPerBag] = useState("0");
  const [gradingCharges, setGradingCharges] = useState("0");
  const [aadhatPercent, setAadhatPercent] = useState("2");
  const [mandiPercent, setMandiPercent] = useState("1");
  const [chargedTo, setChargedTo] = useState("Buyer");

  const { data: allBids = [] } = useQuery<BidWithDetails[]>({
    queryKey: ["/api/bids"],
  });

  const { data: txns = [] } = useQuery<TransactionWithDetails[]>({
    queryKey: ["/api/transactions"],
  });

  const createTxMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/transactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
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

  const filteredGroups = useMemo(() => {
    return unifiedGroups.filter(g => {
      if (cropFilter !== "all" && g.lot.crop !== cropFilter) return false;
      const lotDate = new Date(g.lot.createdAt);
      if (lotDate.getFullYear() !== parseInt(yearFilter)) return false;
      if (monthFilter !== "all" && lotDate.getMonth() + 1 !== parseInt(monthFilter)) return false;
      if (dayFilter !== "all" && lotDate.getDate() !== parseInt(dayFilter)) return false;
      return true;
    });
  }, [unifiedGroups, cropFilter, yearFilter, monthFilter, dayFilter]);

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
      resetFormDefaults();
    }

    setDialogOpen(true);
  };

  const prefillFromTxn = (tx: TransactionWithDetails) => {
    setTotalWeight(tx.totalWeight || "");
    setHammaliPerBag(tx.hammaliPerBag || "0");
    setGradingCharges(tx.gradingCharges || "0");
    setAadhatPercent(tx.aadhatCommissionPercent || "2");
    setMandiPercent(tx.mandiCommissionPercent || "1");
    setChargedTo(tx.chargedTo || "Buyer");
  };

  const resetFormDefaults = () => {
    setTotalWeight("");
    setHammaliPerBag("0");
    setGradingCharges("0");
    setAadhatPercent("2");
    setMandiPercent("1");
    setChargedTo("Buyer");
  };

  const handleBuyerChange = (val: string) => {
    const idx = parseInt(val);
    setSelectedIdx(idx);
    const item = dialogItems[idx];
    if (item?.type === "completed" && item.txn) {
      prefillFromTxn(item.txn);
    } else {
      resetFormDefaults();
    }
  };

  const currentItem = dialogItems[selectedIdx] || null;
  const selectedBid = currentItem?.bid || null;
  const isEditing = currentItem?.type === "completed";

  const tw = parseFloat(totalWeight) || 0;
  const bags = selectedBid?.numberOfBags || 0;
  const netWeight = tw > 0 ? (tw - bags).toFixed(2) : "0.00";
  const nw = parseFloat(netWeight);
  const price = parseFloat(selectedBid?.pricePerKg || "0");
  const grossAmount = nw * price;
  const hammaliRate = parseFloat(hammaliPerBag) || 0;
  const totalHammali = hammaliRate * bags;
  const grading = parseFloat(gradingCharges) || 0;
  const aadhat = (grossAmount * (parseFloat(aadhatPercent) || 0)) / 100;
  const mandi = (grossAmount * (parseFloat(mandiPercent) || 0)) / 100;
  const totalCommission = aadhat + mandi;

  const farmerPayable = grossAmount - totalHammali - grading - (chargedTo === "Seller" ? totalCommission : 0);
  const buyerReceivable = grossAmount + (chargedTo === "Buyer" ? totalCommission : 0) + totalHammali + grading;

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
      hammaliPerBag: hammaliRate.toString(),
      hammaliCharges: totalHammali.toString(),
      gradingCharges: grading.toString(),
      netWeight,
      pricePerKg: selectedBid.pricePerKg,
      aadhatCommissionPercent: aadhatPercent,
      mandiCommissionPercent: mandiPercent,
      aadhatCharges: aadhat.toFixed(2),
      mandiCharges: mandi.toFixed(2),
      chargedTo,
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

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-base md:text-lg font-bold flex items-center gap-2 mr-auto">
          <Receipt className="w-5 h-5 text-primary" />
          {t("transactions.title")}
        </h1>
        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setDayFilter("all"); }}>
          <SelectTrigger className="w-[85px]" data-testid="select-year-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
              <SelectItem key={y} value={y}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={(v) => { setMonthFilter(v); setDayFilter("all"); }}>
          <SelectTrigger className="w-[100px]" data-testid="select-month-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transactions.allMonths")}</SelectItem>
            {["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].map((m, i) => (
              <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={dayFilter} onValueChange={setDayFilter}>
          <SelectTrigger className="w-[90px]" data-testid="select-day-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("transactions.allDays")}</SelectItem>
            {Array.from({ length: new Date(parseInt(yearFilter), parseInt(monthFilter), 0).getDate() }, (_, i) => String(i + 1)).map(d => (
              <SelectItem key={d} value={d}>{d}</SelectItem>
            ))}
          </SelectContent>
        </Select>
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
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <Badge variant="secondary" className="text-xs">{group.lotId}</Badge>
                        <Badge variant="outline" className="text-xs">{group.lot.crop}</Badge>
                      </div>
                      <p className="text-sm">{t("transactions.farmer")}: <strong>{group.farmer.name}</strong></p>
                      <p className="text-xs text-muted-foreground">{group.lot.numberOfBags} {t("transactions.bagsTotal")}</p>
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

                  {hasCompleted && (
                    <div className="border-t pt-2 mb-2 flex justify-between font-medium text-sm text-primary">
                      <span>{t("transactions.payableToFarmer")}:</span>
                      <span>Rs.{totalFarmerPayable.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="border-t pt-2 space-y-1">
                    {group.completedTxns.map((tx) => (
                      <div key={tx.id} className={`flex items-center justify-between text-sm py-1 ${tx.isReversed ? "opacity-40" : ""}`}>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{t("transactions.buyer")}:</span>
                          <strong>{tx.buyer.name}</strong>
                          {tx.isReversed && <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">{t("transactions.reversed")}</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <Badge className="text-xs">Rs.{tx.pricePerKg}/kg</Badge>
                          <span>{tx.numberOfBags} bags</span>
                          <span>{tx.lot.size || ""}</span>
                          <span>Net: {tx.netWeight}kg</span>
                          <span className="text-chart-2 font-medium">Rs.{tx.totalReceivableFromBuyer}</span>
                          
                        </div>
                      </div>
                    ))}
                    {group.pendingBids.map((bid) => (
                      <div key={bid.id} className="flex items-center justify-between text-sm py-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{t("transactions.buyer")}:</span>
                          <strong>{bid.buyer.name}</strong>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <Badge className="text-xs">Rs.{bid.pricePerKg}/kg</Badge>
                          <span>{bid.numberOfBags} bags</span>
                          <span>{bid.grade || "N/A"}</span>
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
                <p>{t("transactions.lot")}: <strong>{selectedBid.lot.lotId}</strong></p>
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

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("transactions.hammali")}</Label>
                  <Input
                    data-testid="input-hammali-per-bag"
                    type="text"
                    inputMode="decimal"
                    value={hammaliPerBag}
                    onChange={(e) => setHammaliPerBag(e.target.value)}
                    className="mobile-touch-target"
                  />
                  <p className="text-xs text-muted-foreground">Total: Rs.{totalHammali.toFixed(2)} ({bags} bags)</p>
                </div>
                <div className="space-y-1">
                  <Label>{t("transactions.grading")}</Label>
                  <Input
                    data-testid="input-grading"
                    type="text"
                    inputMode="decimal"
                    value={gradingCharges}
                    onChange={(e) => setGradingCharges(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("transactions.aadhat")}</Label>
                  <Input
                    data-testid="input-aadhat"
                    type="text"
                    inputMode="decimal"
                    value={aadhatPercent}
                    onChange={(e) => setAadhatPercent(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("transactions.mandi")}</Label>
                  <Input
                    data-testid="input-mandi"
                    type="text"
                    inputMode="decimal"
                    value={mandiPercent}
                    onChange={(e) => setMandiPercent(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>{t("transactions.chargedTo")}</Label>
                <Select value={chargedTo} onValueChange={setChargedTo}>
                  <SelectTrigger data-testid="select-charged-to" className="mobile-touch-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Buyer">{t("transactions.buyer")}</SelectItem>
                    <SelectItem value="Seller">{t("transactions.sellerFarmer")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-muted rounded-md p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>{t("transactions.grossAmount")}:</span>
                  <span className="font-medium">Rs.{grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Hammali ({bags} bags × Rs.{hammaliRate.toFixed(2)}):</span>
                  <span>Rs.{totalHammali.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Grading:</span>
                  <span>Rs.{grading.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Aadhat ({aadhatPercent}%):</span>
                  <span>Rs.{aadhat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Mandi ({mandiPercent}%):</span>
                  <span>Rs.{mandi.toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium text-primary">
                  <span>{t("transactions.payableToFarmer")}:</span>
                  <span>Rs.{farmerPayable.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>{t("transactions.receivableFromBuyer")}:</span>
                  <span>Rs.{buyerReceivable.toFixed(2)}</span>
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
