import { useState, useMemo, useRef, useEffect } from "react";
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
import type { Bid, Buyer, Lot, Farmer, Transaction, BusinessChargeSettings, TransactionEditHistory, ReceiptTemplate } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, Pencil, Printer, ChevronDown, ChevronRight, Calendar, Package, Users, Landmark, HandCoins, Download, History, Share2, Calculator, Plus, X, AlertTriangle, Search } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";
import { printReceipt, shareReceiptAsPdf } from "@/lib/receiptUtils";

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

type UnifiedSerialGroup = {
  serialNumber: number;
  date: string;
  farmer: Farmer;
  lotGroups: UnifiedLotGroup[];
  allPendingBids: BidWithDetails[];
  allCompletedTxns: TransactionWithDetails[];
  totalBags: number;
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

function getFyYear(date: string) { const d = new Date(date); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; }

function buildSerialGroups(lotGroups: UnifiedLotGroup[]): UnifiedSerialGroup[] {
  const map = new Map<string, UnifiedSerialGroup>();

  for (const lg of lotGroups) {
    const key = `${getFyYear(lg.lot.date)}-${lg.lot.serialNumber}`;
    if (!map.has(key)) {
      map.set(key, {
        serialNumber: lg.lot.serialNumber,
        date: lg.lot.date,
        farmer: lg.farmer,
        lotGroups: [],
        allPendingBids: [],
        allCompletedTxns: [],
        totalBags: 0,
      });
    }
    const sg = map.get(key)!;
    sg.lotGroups.push(lg);
    sg.allPendingBids.push(...lg.pendingBids);
    sg.allCompletedTxns.push(...lg.completedTxns);
    sg.totalBags += lg.lot.actualNumberOfBags ?? lg.lot.numberOfBags;
  }

  return Array.from(map.values());
}

function generateFarmerReceiptHtml(sg: UnifiedSerialGroup, businessName?: string, businessAddress?: string) {
  const farmer = sg.farmer;
  const allTxns = sg.lotGroups.flatMap(lg => lg.completedTxns.filter(t => !t.isReversed));
  const dateStr = sg.date || format(new Date(), "yyyy-MM-dd");
  const firstLot = sg.lotGroups[0]?.lot;
  const totalOriginalBags = sg.totalBags;
  const cropLabel: Record<string, string> = { Potato: "आलू / Potato", Onion: "प्याज / Onion", Garlic: "लहसुन / Garlic" };

  const totalHammali = allTxns.reduce((s, t) => s + parseFloat(t.hammaliCharges || "0"), 0);
  const totalExtraCharges = allTxns.reduce((s, t) => s + parseFloat(t.extraChargesFarmer || "0"), 0);
  const totalFreight = allTxns.reduce((s, t) => s + parseFloat(t.freightCharges || "0"), 0);
  const totalAadhatFarmer = allTxns.reduce((s, t) => {
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    const gross = parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + epk);
    return s + gross * parseFloat(t.aadhatFarmerPercent || "0") / 100;
  }, 0);
  const totalMandiFarmer = allTxns.reduce((s, t) => {
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    const gross = parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + epk);
    return s + gross * parseFloat(t.mandiFarmerPercent || "0") / 100;
  }, 0);

  const farmerAdvance = parseFloat(firstLot?.farmerAdvanceAmount || "0");
  const totalDeduction = totalHammali + totalExtraCharges + totalFreight + totalAadhatFarmer + totalMandiFarmer;
  const totalPayable = allTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0) - farmerAdvance;
  const totalGross = allTxns.reduce((s, t) => {
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    return s + (parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + epk));
  }, 0);

  const txnRows = allTxns.map(t => {
    const nw = parseFloat(t.netWeight || "0");
    const ppk = parseFloat(t.pricePerKg || "0");
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    const effectiveRate = ppk + epk;
    const gross = nw * effectiveRate;
    const crop = t.lot?.crop || firstLot?.crop || "";
    const rateDisplay = `₹${effectiveRate.toFixed(2)}`;
    return `<tr>
      <td style="padding:6px;border:1px solid #999;text-align:center">${cropLabel[crop] || crop}</td>
      <td style="padding:6px;border:1px solid #999;text-align:center">${t.numberOfBags || 0}</td>
      <td style="padding:6px;border:1px solid #999;text-align:right">${nw.toFixed(2)}</td>
      <td style="padding:6px;border:1px solid #999;text-align:right">${rateDisplay}</td>
      <td style="padding:6px;border:1px solid #999;text-align:right">₹${gross.toFixed(2)}</td>
    </tr>`;
  }).join("");

  const totalActualBags = allTxns.reduce((s, t) => s + (t.numberOfBags || 0), 0);
  const totalNetWeight = allTxns.reduce((s, t) => s + parseFloat(t.netWeight || "0"), 0);

  const hammaliPerBag = allTxns.length > 0 ? parseFloat(allTxns[0].hammaliFarmerPerBag || "0") : 0;
  const aadhatPct = allTxns.length > 0 ? parseFloat(allTxns[0].aadhatFarmerPercent || "0") : 0;
  const mandiPct = allTxns.length > 0 ? parseFloat(allTxns[0].mandiFarmerPercent || "0") : 0;

  const hammaliDetail = hammaliPerBag > 0 ? ` (${totalActualBags} × ₹${hammaliPerBag.toFixed(2)}/bag)` : "";
  const freightDetail = totalFreight > 0 && firstLot?.vehicleBhadaRate ? ` (कुल भाड़ा / Total Freight)` : "";
  const aadhatDetail = aadhatPct > 0 ? ` (${aadhatPct}%)` : "";
  const mandiDetail = mandiPct > 0 ? ` (${mandiPct}%)` : "";

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
@media print{body{margin:10mm}.no-print{display:none!important}}
</style></head><body>
<div class="header">
${businessName ? `<h2 style="margin-bottom:2px">${businessName}</h2>` : ""}
${businessAddress ? `<p style="font-size:0.85em;color:#555;margin:2px 0">${businessAddress}</p>` : ""}
<h3 style="margin:8px 0 2px 0;font-size:1.1em">किसान रसीद / Farmer Receipt</h3>
</div>

<table class="info-table">
<tr><td><strong>SR #:</strong> ${sg.serialNumber}</td><td style="text-align:right"><strong>दिनांक:</strong> ${dateStr}</td></tr>
</table>

<table class="info-table">
<tr><td><strong>किसान / Farmer:</strong> ${farmer.name}</td><td><strong>फोन:</strong> ${farmer.phone || "-"}</td></tr>
<tr><td><strong>गाँव:</strong> ${farmer.village || "-"}</td><td><strong>तहसील:</strong> ${farmer.tehsil || "-"}</td></tr>
<tr><td><strong>जिला:</strong> ${farmer.district || "-"}</td><td><strong>राज्य:</strong> ${farmer.state || "-"}</td></tr>
<tr><td><strong>गाड़ी नं:</strong> ${firstLot?.vehicleNumber || "-"}</td><td><strong>थैले / Total Bags:</strong> ${totalOriginalBags}</td></tr>
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
${totalHammali > 0 ? `<div class="ded-row"><span>हम्माली / Hammali${hammaliDetail}:</span><span>₹${totalHammali.toFixed(2)}</span></div>` : ""}
${totalExtraCharges > 0 ? `<div class="ded-row"><span>अतिरिक्त शुल्क / Extra Charges:</span><span>₹${totalExtraCharges.toFixed(2)}</span></div>` : ""}
${totalAadhatFarmer > 0 ? `<div class="ded-row"><span>आढ़त / Aadhat${aadhatDetail}:</span><span>₹${totalAadhatFarmer.toFixed(2)}</span></div>` : ""}
${totalMandiFarmer > 0 ? `<div class="ded-row"><span>मण्डी शुल्क / Mandi${mandiDetail}:</span><span>₹${totalMandiFarmer.toFixed(2)}</span></div>` : ""}
${totalFreight > 0 ? `<div class="ded-row"><span>भाड़ा / Freight${freightDetail}:</span><span>₹${totalFreight.toFixed(2)}</span></div>` : ""}
${farmerAdvance > 0 ? `<div class="ded-row"><span>अग्रिम / Advance (${firstLot?.farmerAdvanceMode || "Cash"}):</span><span>₹${farmerAdvance.toFixed(2)}</span></div>` : ""}
${(totalDeduction + farmerAdvance) > 0 ? `<div class="ded-row sub-total"><span>कुल कटौती / Total Deduction:</span><span>₹${(totalDeduction + farmerAdvance).toFixed(2)}</span></div>` : ""}
<div class="ded-row total-row"><span>किसान को देय राशि / Net Payable:</span><span>₹${totalPayable.toFixed(2)}</span></div>
</div>
<div style="text-align:center;margin-top:20px;padding-top:10px;border-top:1px dashed #ccc;font-size:15px;font-weight:bold;color:#555">हमें सेवा का अवसर देने के लिए धन्यवाद!</div>
</body></html>`;
}

function generateBuyerReceiptHtml(lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string, businessAddress?: string) {
  const nw = parseFloat(tx.netWeight || "0");
  const ppk = parseFloat(tx.pricePerKg || "0");
  const epkBuyer = parseFloat((tx as any).extraPerKgBuyer || "0");
  const effectiveRate = ppk + epkBuyer;
  const grossAmount = nw * effectiveRate;
  const dateStr = tx.date || format(new Date(), "yyyy-MM-dd");
  const bags = tx.numberOfBags || 0;

  const hammaliBuyer = parseFloat(tx.hammaliBuyerPerBag || "0") * bags;
  const extraBuyer = parseFloat(tx.extraChargesBuyer || "0");
  const aadhatBuyer = grossAmount * parseFloat(tx.aadhatBuyerPercent || "0") / 100;
  const mandiBuyer = grossAmount * parseFloat(tx.mandiBuyerPercent || "0") / 100;

  const rateDisplay = `Rs.${effectiveRate.toFixed(2)}/kg`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Buyer Receipt</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
h2{text-align:center;margin-bottom:5px}
.header{text-align:center;margin-bottom:15px}
.detail-table td{padding:6px;border:1px solid #ccc}
.summary{margin-top:15px;border-top:2px solid #333;padding-top:10px}
.summary-row{display:flex;justify-content:space-between;padding:3px 0}
.total{font-weight:bold;font-size:1.1em;color:#dc2626;border-top:2px solid #333;padding-top:8px;margin-top:8px}
@media print{body{margin:10mm}.no-print{display:none!important}}
</style></head><body>
<div class="header">
${businessName ? `<h2 style="margin-bottom:2px">${businessName}</h2>` : ""}
${businessAddress ? `<p style="font-size:0.85em;color:#555;margin:2px 0">${businessAddress}</p>` : ""}
<h3 style="margin:8px 0 5px 0;font-size:1.1em">Buyer Receipt</h3>
</div>
<table class="detail-table">
<tr><td><strong>Buyer:</strong> ${tx.buyer.name}</td><td><strong>Licence No:</strong> ${tx.buyer.licenceNo || "-"}</td></tr>
<tr><td><strong>Crop:</strong> ${lot.crop}</td><td><strong>Date:</strong> ${dateStr}</td></tr>
</table>
<table style="margin-top:15px">
<tr style="background:#f5f5f5">
<th style="padding:8px;border:1px solid #ccc;text-align:left">Description</th>
<th style="padding:8px;border:1px solid #ccc;text-align:right">Amount</th>
</tr>
<tr><td style="padding:6px;border:1px solid #ccc">Bags</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${bags}</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Net Weight</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${nw.toFixed(2)} kg</td></tr>
<tr><td style="padding:6px;border:1px solid #ccc">Rate</td><td style="padding:6px;border:1px solid #ccc;text-align:right">${rateDisplay}</td></tr>
<tr style="background:#f9f9f9"><td style="padding:6px;border:1px solid #ccc"><strong>Gross Amount</strong></td><td style="padding:6px;border:1px solid #ccc;text-align:right"><strong>Rs.${grossAmount.toFixed(2)}</strong></td></tr>
</table>
<div class="summary">
${hammaliBuyer > 0 ? `<div class="summary-row"><span>Hammali (${bags} bags):</span><span>Rs.${hammaliBuyer.toFixed(2)}</span></div>` : ""}
${extraBuyer > 0 ? `<div class="summary-row"><span>Extra Charges:</span><span>Rs.${extraBuyer.toFixed(2)}</span></div>` : ""}
${aadhatBuyer > 0 ? `<div class="summary-row"><span>Aadhat (${tx.aadhatBuyerPercent}%):</span><span>Rs.${aadhatBuyer.toFixed(2)}</span></div>` : ""}
${mandiBuyer > 0 ? `<div class="summary-row"><span>Mandi (${tx.mandiBuyerPercent}%):</span><span>Rs.${mandiBuyer.toFixed(2)}</span></div>` : ""}
<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${parseFloat(tx.totalReceivableFromBuyer || "0").toFixed(2)}</span></div>
</div>
<div style="text-align:center;margin-top:20px;padding-top:10px;border-top:1px dashed #ccc;font-size:15px;font-weight:bold;color:#555">हमें सेवा का अवसर देने के लिए धन्यवाद!</div>
</body></html>`;
}

function applyFarmerTemplate(tmpl: string, sg: UnifiedSerialGroup, businessName?: string, businessAddress?: string): string {
  const farmer = sg.farmer;
  const allTxns = sg.lotGroups.flatMap(lg => lg.completedTxns.filter(t => !t.isReversed));
  const firstLot = sg.lotGroups[0]?.lot;
  const cropLabel: Record<string, string> = { Potato: "आलू / Potato", Onion: "प्याज / Onion", Garlic: "लहसुन / Garlic" };

  const totalHammali = allTxns.reduce((s, t) => s + parseFloat(t.hammaliCharges || "0"), 0);
  const totalExtraCharges = allTxns.reduce((s, t) => s + parseFloat(t.extraChargesFarmer || "0"), 0);
  const totalFreight = allTxns.reduce((s, t) => s + parseFloat(t.freightCharges || "0"), 0);
  const totalAadhat = allTxns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + parseFloat((t as any).extraPerKgFarmer || "0"));
    return s + gross * parseFloat(t.aadhatFarmerPercent || "0") / 100;
  }, 0);
  const totalMandi = allTxns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + parseFloat((t as any).extraPerKgFarmer || "0"));
    return s + gross * parseFloat(t.mandiFarmerPercent || "0") / 100;
  }, 0);
  const farmerAdvance = parseFloat(firstLot?.farmerAdvanceAmount || "0");
  const totalDeduction = totalHammali + totalExtraCharges + totalFreight + totalAadhat + totalMandi + farmerAdvance;
  const totalGross = allTxns.reduce((s, t) => s + parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + parseFloat((t as any).extraPerKgFarmer || "0")), 0);
  const totalNetWeight = allTxns.reduce((s, t) => s + parseFloat(t.netWeight || "0"), 0);
  const netPayable = allTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0) - farmerAdvance;

  const txnRowsHtml = allTxns.map(t => {
    const nw = parseFloat(t.netWeight || "0");
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    const rate = parseFloat(t.pricePerKg || "0") + epk;
    const gross = nw * rate;
    const crop = t.lot?.crop || firstLot?.crop || "";
    return `<tr><td>${cropLabel[crop] || crop}</td><td>${t.numberOfBags || 0}</td><td>${nw.toFixed(2)}</td><td>₹${rate.toFixed(2)}</td><td>₹${gross.toFixed(2)}</td></tr>`;
  }).join("");

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": businessName || "",
    "{{BUSINESS_ADDRESS}}": businessAddress || "",
    "{{SERIAL_NUMBER}}": String(sg.serialNumber),
    "{{DATE}}": sg.date || format(new Date(), "yyyy-MM-dd"),
    "{{FARMER_NAME}}": farmer.name,
    "{{FARMER_PHONE}}": farmer.phone || "",
    "{{FARMER_VILLAGE}}": farmer.village || "",
    "{{FARMER_TEHSIL}}": farmer.tehsil || "",
    "{{FARMER_DISTRICT}}": farmer.district || "",
    "{{VEHICLE_NUMBER}}": firstLot?.vehicleNumber || "",
    "{{TOTAL_BAGS}}": String(sg.totalBags),
    "{{NET_WEIGHT}}": totalNetWeight.toFixed(2),
    "{{GROSS_AMOUNT}}": totalGross.toFixed(2),
    "{{HAMMALI}}": totalHammali.toFixed(2),
    "{{AADHAT}}": totalAadhat.toFixed(2),
    "{{MANDI_CHARGES}}": totalMandi.toFixed(2),
    "{{FREIGHT}}": totalFreight.toFixed(2),
    "{{ADVANCE}}": farmerAdvance.toFixed(2),
    "{{TOTAL_DEDUCTION}}": totalDeduction.toFixed(2),
    "{{NET_PAYABLE}}": netPayable.toFixed(2),
    "{{CROP}}": firstLot?.crop || "",
    "{{TXN_ROWS_HTML}}": txnRowsHtml,
  };
  return Object.entries(replacements).reduce((html, [token, val]) => html.split(token).join(val), tmpl);
}

type BuyerLotEntry = { lot: Lot; tx: TransactionWithDetails };

function generateCombinedBuyerReceiptHtml(entries: BuyerLotEntry[], serialNumber: number, date: string, businessName?: string, businessAddress?: string): string {
  const firstTx = entries[0].tx;
  const crop = entries[0].lot.crop;
  const aadhatPct = parseFloat(firstTx.aadhatBuyerPercent || "0");
  const mandiPct = parseFloat(firstTx.mandiBuyerPercent || "0");

  const rows = entries.map(({ lot, tx }) => {
    const nw = parseFloat(tx.netWeight || "0");
    const ppk = parseFloat(tx.pricePerKg || "0");
    const epk = parseFloat((tx as any).extraPerKgBuyer || "0");
    const rate = ppk + epk;
    const gross = nw * rate;
    const bags = tx.numberOfBags || 0;
    return { crop: lot.crop, bags, nw, rate, gross, hammaliBuyerPerBag: parseFloat(tx.hammaliBuyerPerBag || "0"), extra: parseFloat(tx.extraChargesBuyer || "0") };
  });

  const totalBags = rows.reduce((s, r) => s + r.bags, 0);
  const totalNw = rows.reduce((s, r) => s + r.nw, 0);
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalHammali = rows.reduce((s, r) => s + r.hammaliBuyerPerBag * r.bags, 0);
  const totalExtra = rows.reduce((s, r) => s + r.extra, 0);
  const totalAadhat = totalGross * aadhatPct / 100;
  const totalMandi = totalGross * mandiPct / 100;
  const grandTotal = totalGross + totalHammali + totalExtra + totalAadhat + totalMandi;

  const rowsHtml = rows.map(r => `
<tr>
  <td style="padding:6px;border:1px solid #ccc">${r.crop}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.bags}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.nw.toFixed(2)}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.rate.toFixed(2)}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.gross.toFixed(2)}</td>
</tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Buyer Receipt</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
h2{text-align:center;margin-bottom:5px}
.header{text-align:center;margin-bottom:15px}
.info-table td{padding:5px 8px;border:1px solid #ccc}
.summary{margin-top:15px;border-top:2px solid #333;padding-top:10px}
.summary-row{display:flex;justify-content:space-between;padding:3px 0}
.total{font-weight:bold;font-size:1.1em;color:#dc2626;border-top:2px solid #333;padding-top:8px;margin-top:8px}
th{padding:8px;border:1px solid #ccc;background:#f5f5f5;text-align:right}
th:first-child{text-align:left}
.totals-row td{font-weight:bold;background:#f0f0f0;padding:6px;border:1px solid #ccc}
@media print{body{margin:10mm}.no-print{display:none!important}}
</style></head><body>
<div class="header">
${businessName ? `<h2 style="margin-bottom:2px">${businessName}</h2>` : ""}
${businessAddress ? `<p style="font-size:0.85em;color:#555;margin:2px 0">${businessAddress}</p>` : ""}
<h3 style="margin:8px 0 5px 0;font-size:1.1em">Buyer Receipt</h3>
</div>
<table class="info-table" style="margin-bottom:12px">
<tr><td><strong>Buyer:</strong> ${firstTx.buyer.name}</td><td><strong>Licence No:</strong> ${firstTx.buyer.licenceNo || "-"}</td></tr>
<tr><td><strong>Crop:</strong> ${crop}</td><td><strong>SR #:</strong> ${serialNumber} &nbsp; <strong>Date:</strong> ${date}</td></tr>
</table>
<table>
<thead>
<tr>
  <th style="text-align:left">Crop</th>
  <th style="text-align:right">Bags</th>
  <th style="text-align:right">Net Wt (kg)</th>
  <th style="text-align:right">Rate (₹/kg)</th>
  <th style="text-align:right">Gross (₹)</th>
</tr>
</thead>
<tbody>
${rowsHtml}
<tr class="totals-row">
  <td>Total</td>
  <td style="text-align:right">${totalBags}</td>
  <td style="text-align:right">${totalNw.toFixed(2)}</td>
  <td style="text-align:right">-</td>
  <td style="text-align:right">${totalGross.toFixed(2)}</td>
</tr>
</tbody>
</table>
<div class="summary">
${totalHammali > 0 ? `<div class="summary-row"><span>Hammali (${totalBags} bags):</span><span>Rs.${totalHammali.toFixed(2)}</span></div>` : ""}
${totalExtra > 0 ? `<div class="summary-row"><span>Extra Charges:</span><span>Rs.${totalExtra.toFixed(2)}</span></div>` : ""}
${totalAadhat > 0 ? `<div class="summary-row"><span>Aadhat (${aadhatPct}%):</span><span>Rs.${totalAadhat.toFixed(2)}</span></div>` : ""}
${totalMandi > 0 ? `<div class="summary-row"><span>Mandi (${mandiPct}%):</span><span>Rs.${totalMandi.toFixed(2)}</span></div>` : ""}
<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${grandTotal.toFixed(2)}</span></div>
</div>
<div style="text-align:center;margin-top:20px;padding-top:10px;border-top:1px dashed #ccc;font-size:15px;font-weight:bold;color:#555">हमें सेवा का अवसर देने के लिए धन्यवाद!</div>
</body></html>`;
}

function generateAllBuyerReceiptHtml(entries: BuyerLotEntry[], businessName?: string, businessAddress?: string): string {
  if (entries.length === 0) return "";
  const firstTx = entries[0].tx;
  const buyer = firstTx.buyer;
  const aadhatPct = parseFloat(firstTx.aadhatBuyerPercent || "0");
  const mandiPct = parseFloat(firstTx.mandiBuyerPercent || "0");

  const rows = entries.map(({ lot, tx }) => {
    const nw = parseFloat(tx.netWeight || "0");
    const ppk = parseFloat(tx.pricePerKg || "0");
    const epk = parseFloat((tx as any).extraPerKgBuyer || "0");
    const rate = ppk + epk;
    const gross = nw * rate;
    const bags = tx.numberOfBags || 0;
    return { srNo: lot.serialNumber, crop: lot.crop, bags, nw, rate, gross, hammaliBuyerPerBag: parseFloat(tx.hammaliBuyerPerBag || "0"), extra: parseFloat(tx.extraChargesBuyer || "0"), date: tx.date || lot.date };
  });

  const totalBags = rows.reduce((s, r) => s + r.bags, 0);
  const totalNw = rows.reduce((s, r) => s + r.nw, 0);
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalHammali = rows.reduce((s, r) => s + r.hammaliBuyerPerBag * r.bags, 0);
  const totalExtra = rows.reduce((s, r) => s + r.extra, 0);
  const totalAadhat = totalGross * aadhatPct / 100;
  const totalMandi = totalGross * mandiPct / 100;
  const grandTotal = totalGross + totalHammali + totalExtra + totalAadhat + totalMandi;

  const rowsHtml = rows.map(r => `
<tr>
  <td style="padding:6px;border:1px solid #ccc">${r.srNo}</td>
  <td style="padding:6px;border:1px solid #ccc">${r.crop}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.bags}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.nw.toFixed(2)}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.rate.toFixed(2)}</td>
  <td style="padding:6px;border:1px solid #ccc;text-align:right">${r.gross.toFixed(2)}</td>
</tr>`).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Buyer Receipt</title>
<style>body{font-family:Arial,sans-serif;margin:20px;color:#333}
table{width:100%;border-collapse:collapse;margin:10px 0}
h2{text-align:center;margin-bottom:5px}
.header{text-align:center;margin-bottom:15px}
.info-table td{padding:5px 8px;border:1px solid #ccc}
.summary{margin-top:15px;border-top:2px solid #333;padding-top:10px}
.summary-row{display:flex;justify-content:space-between;padding:3px 0}
.total{font-weight:bold;font-size:1.1em;color:#dc2626;border-top:2px solid #333;padding-top:8px;margin-top:8px}
th{padding:8px;border:1px solid #ccc;background:#f5f5f5;text-align:right}
th:first-child{text-align:left}
.totals-row td{font-weight:bold;background:#f0f0f0;padding:6px;border:1px solid #ccc}
@media print{body{margin:10mm}.no-print{display:none!important}}
</style></head><body>
<div class="header">
${businessName ? `<h2 style="margin-bottom:2px">${businessName}</h2>` : ""}
${businessAddress ? `<p style="font-size:0.85em;color:#555;margin:2px 0">${businessAddress}</p>` : ""}
<h3 style="margin:8px 0 5px 0;font-size:1.1em">Buyer Receipt</h3>
</div>
<table class="info-table" style="margin-bottom:12px">
<tr><td><strong>Buyer:</strong> ${buyer.name}</td><td><strong>Licence No:</strong> ${buyer.licenceNo || "-"}</td></tr>
<tr><td><strong>Date:</strong> ${format(new Date(), "dd/MM/yyyy")}</td><td></td></tr>
</table>
<table>
<thead>
<tr>
  <th style="text-align:left">SR #</th>
  <th style="text-align:left">Crop</th>
  <th style="text-align:right">Bags</th>
  <th style="text-align:right">Net Wt (kg)</th>
  <th style="text-align:right">Rate (₹/kg)</th>
  <th style="text-align:right">Gross (₹)</th>
</tr>
</thead>
<tbody>
${rowsHtml}
<tr class="totals-row">
  <td colspan="2">Total</td>
  <td style="text-align:right">${totalBags}</td>
  <td style="text-align:right">${totalNw.toFixed(2)}</td>
  <td style="text-align:right">-</td>
  <td style="text-align:right">${totalGross.toFixed(2)}</td>
</tr>
</tbody>
</table>
<div class="summary">
${totalHammali > 0 ? `<div class="summary-row"><span>Hammali (${totalBags} bags):</span><span>Rs.${totalHammali.toFixed(2)}</span></div>` : ""}
${totalExtra > 0 ? `<div class="summary-row"><span>Extra Charges:</span><span>Rs.${totalExtra.toFixed(2)}</span></div>` : ""}
${totalAadhat > 0 ? `<div class="summary-row"><span>Aadhat (${aadhatPct}%):</span><span>Rs.${totalAadhat.toFixed(2)}</span></div>` : ""}
${totalMandi > 0 ? `<div class="summary-row"><span>Mandi (${mandiPct}%):</span><span>Rs.${totalMandi.toFixed(2)}</span></div>` : ""}
<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${grandTotal.toFixed(2)}</span></div>
</div>
<div style="text-align:center;margin-top:20px;padding-top:10px;border-top:1px dashed #ccc;font-size:15px;font-weight:bold;color:#555">हमें सेवा का अवसर देने के लिए धन्यवाद!</div>
</body></html>`;
}

function applyBuyerTemplate(tmpl: string, lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string, businessAddress?: string, businessInitials?: string, businessPhone?: string, businessLicenceNo?: string, businessShopNo?: string): string {
  const nw = parseFloat(tx.netWeight || "0");
  const ppk = parseFloat(tx.pricePerKg || "0");
  const epkBuyer = parseFloat((tx as any).extraPerKgBuyer || "0");
  const effectiveRate = ppk + epkBuyer;
  const ratePerQuintal = effectiveRate * 100;
  const grossAmount = nw * effectiveRate;
  const bags = tx.numberOfBags || 0;
  const hammaliBuyer = parseFloat(tx.hammaliBuyerPerBag || "0") * bags;
  const extraBuyer = parseFloat(tx.extraChargesBuyer || "0");
  const aadhatBuyer = grossAmount * parseFloat(tx.aadhatBuyerPercent || "0") / 100;
  const mandiBuyer = grossAmount * parseFloat(tx.mandiBuyerPercent || "0") / 100;

  const singleRowHtml = `<tr><td style="text-align:left">${lot.crop}</td><td>${bags}</td><td>${nw.toFixed(2)}</td><td>${ratePerQuintal.toFixed(2)}</td><td>${grossAmount.toFixed(2)}</td></tr>`;
  const singleSummaryRowHtml = `<tr><td>${grossAmount.toFixed(2)}</td><td></td><td></td><td></td><td></td><td></td></tr>`;

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": businessName || "",
    "{{BUSINESS_ADDRESS}}": businessAddress || "",
    "{{BUSINESS_INITIALS}}": businessInitials || "",
    "{{BUSINESS_PHONE}}": businessPhone || "",
    "{{BUSINESS_LICENCE}}": businessLicenceNo || "",
    "{{BUSINESS_SHOP_NO}}": businessShopNo || "",
    "{{LOT_ID}}": lot.lotId,
    "{{SERIAL_NUMBER}}": String(lot.serialNumber),
    "{{DATE}}": tx.date || format(new Date(), "yyyy-MM-dd"),
    "{{BUYER_NAME}}": tx.buyer.name,
    "{{BUYER_CODE}}": tx.buyer.licenceNo || "",
    "{{FARMER_NAME}}": "",
    "{{FARMER_VILLAGE}}": "",
    "{{CROP}}": lot.crop,
    "{{SIZE}}": lot.size || "",
    "{{BAGS}}": String(bags),
    "{{TOTAL_BAGS}}": String(bags),
    "{{NET_WEIGHT}}": nw.toFixed(2),
    "{{TOTAL_NET_WEIGHT}}": nw.toFixed(2),
    "{{RATE}}": effectiveRate.toFixed(2),
    "{{RATE_PER_QUINTAL}}": ratePerQuintal.toFixed(2),
    "{{GROSS_AMOUNT}}": grossAmount.toFixed(2),
    "{{TOTAL_GROSS_AMOUNT}}": grossAmount.toFixed(2),
    "{{TXN_ROWS_HTML}}": singleRowHtml,
    "{{SUMMARY_ROWS_HTML}}": singleSummaryRowHtml,
    "{{HAMMALI}}": hammaliBuyer.toFixed(2),
    "{{EXTRA_CHARGES}}": extraBuyer.toFixed(2),
    "{{AADHAT}}": aadhatBuyer.toFixed(2),
    "{{AADHAT_PCT}}": tx.aadhatBuyerPercent || "0",
    "{{MANDI_CHARGES}}": mandiBuyer.toFixed(2),
    "{{MANDI_PCT}}": tx.mandiBuyerPercent || "0",
    "{{TOTAL_RECEIVABLE}}": parseFloat(tx.totalReceivableFromBuyer || "0").toFixed(2),
  };
  return Object.entries(replacements).reduce((html, [token, val]) => html.split(token).join(val), tmpl);
}

function applyCombinedBuyerTemplate(tmpl: string, entries: BuyerLotEntry[], serialNumber: number, date: string, businessName?: string, businessAddress?: string, businessInitials?: string, businessPhone?: string, businessLicenceNo?: string, businessShopNo?: string): string {
  const firstTx = entries[0].tx;
  const firstLot = entries[0].lot;
  const aadhatPct = parseFloat(firstTx.aadhatBuyerPercent || "0");
  const mandiPct = parseFloat(firstTx.mandiBuyerPercent || "0");

  const rows = entries.map(({ lot, tx }) => {
    const nw = parseFloat(tx.netWeight || "0");
    const ppk = parseFloat(tx.pricePerKg || "0");
    const epk = parseFloat((tx as any).extraPerKgBuyer || "0");
    const rate = ppk + epk;
    const gross = nw * rate;
    const bags = tx.numberOfBags || 0;
    return { crop: lot.crop, bags, nw, rate, gross, hammaliBuyerPerBag: parseFloat(tx.hammaliBuyerPerBag || "0"), extra: parseFloat(tx.extraChargesBuyer || "0") };
  });

  const totalBags = rows.reduce((s, r) => s + r.bags, 0);
  const totalNw = rows.reduce((s, r) => s + r.nw, 0);
  const totalGross = rows.reduce((s, r) => s + r.gross, 0);
  const totalHammali = rows.reduce((s, r) => s + r.hammaliBuyerPerBag * r.bags, 0);
  const totalExtra = rows.reduce((s, r) => s + r.extra, 0);
  const totalAadhat = totalGross * aadhatPct / 100;
  const totalMandi = totalGross * mandiPct / 100;
  const grandTotal = totalGross + totalHammali + totalExtra + totalAadhat + totalMandi;
  const firstRatePerQuintal = rows[0].rate * 100;

  const txnRowsHtml = rows.map(r =>
    `<tr><td style="text-align:left">${r.crop}</td><td>${r.bags}</td><td>${r.nw.toFixed(2)}</td><td>${(r.rate * 100).toFixed(2)}</td><td>${r.gross.toFixed(2)}</td></tr>`
  ).join("");
  const summaryRowsHtml = rows.map(r =>
    `<tr><td>${r.gross.toFixed(2)}</td><td></td><td></td><td></td><td></td><td></td></tr>`
  ).join("");

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": businessName || "",
    "{{BUSINESS_ADDRESS}}": businessAddress || "",
    "{{BUSINESS_INITIALS}}": businessInitials || "",
    "{{BUSINESS_PHONE}}": businessPhone || "",
    "{{BUSINESS_LICENCE}}": businessLicenceNo || "",
    "{{BUSINESS_SHOP_NO}}": businessShopNo || "",
    "{{SERIAL_NUMBER}}": String(serialNumber),
    "{{DATE}}": date,
    "{{BUYER_NAME}}": firstTx.buyer.name,
    "{{BUYER_CODE}}": firstTx.buyer.licenceNo || "",
    "{{FARMER_NAME}}": "",
    "{{FARMER_VILLAGE}}": "",
    "{{CROP}}": firstLot.crop,
    "{{SIZE}}": firstLot.size || "",
    "{{LOT_ID}}": firstLot.lotId,
    "{{BAGS}}": String(totalBags),
    "{{TOTAL_BAGS}}": String(totalBags),
    "{{NET_WEIGHT}}": totalNw.toFixed(2),
    "{{TOTAL_NET_WEIGHT}}": totalNw.toFixed(2),
    "{{RATE}}": rows[0].rate.toFixed(2),
    "{{RATE_PER_QUINTAL}}": firstRatePerQuintal.toFixed(2),
    "{{GROSS_AMOUNT}}": totalGross.toFixed(2),
    "{{TOTAL_GROSS_AMOUNT}}": totalGross.toFixed(2),
    "{{HAMMALI}}": totalHammali.toFixed(2),
    "{{EXTRA_CHARGES}}": totalExtra.toFixed(2),
    "{{AADHAT}}": totalAadhat.toFixed(2),
    "{{AADHAT_PCT}}": String(aadhatPct),
    "{{MANDI_CHARGES}}": totalMandi.toFixed(2),
    "{{MANDI_PCT}}": String(mandiPct),
    "{{TOTAL_RECEIVABLE}}": grandTotal.toFixed(2),
    "{{TXN_ROWS_HTML}}": txnRowsHtml,
    "{{SUMMARY_ROWS_HTML}}": summaryRowsHtml,
  };
  return Object.entries(replacements).reduce((html, [token, val]) => html.split(token).join(val), tmpl);
}

export default function TransactionsPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [dialogItems, setDialogItems] = useState<DialogItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reverseConfirmOpen, setReverseConfirmOpen] = useState(false);
  const [reversingTxn, setReversingTxn] = useState<TransactionWithDetails | null>(null);
  const [deleteBidConfirmOpen, setDeleteBidConfirmOpen] = useState(false);
  const [deletingBid, setDeletingBid] = useState<any>(null);
  const [txHistoryOpen, setTxHistoryOpen] = useState(false);
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1);
  const currentDay = String(now.getDate());
  const [yearFilter, setYearFilter] = usePersistedState("txn-yearFilter", currentYear);
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("txn-selectedMonths", [currentMonth]);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("txn-selectedDays", [currentDay]);
  const [cropFilter, setCropFilter] = usePersistedState("txn-cropFilter", "all");
  const [billingFilter, setBillingFilter] = usePersistedState("txn-billingFilter", "all");
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);
  const [farmerNameSearch, setFarmerNameSearch] = useState("");
  const [buyerNameSearch, setBuyerNameSearch] = useState("");
  const [showFarmerDropdown, setShowFarmerDropdown] = useState(false);
  const [showBuyerDropdown, setShowBuyerDropdown] = useState(false);
  const farmerDropdownRef = useRef<HTMLDivElement>(null);
  const buyerDropdownRef = useRef<HTMLDivElement>(null);

  const isFiltered = cropFilter !== "all" || billingFilter !== "all" || farmerNameSearch !== "" || buyerNameSearch !== ""
    || selectedMonths.join(",") !== currentMonth || selectedDays.join(",") !== currentDay;

  const clearFilters = () => {
    setCropFilter("all");
    setBillingFilter("all");
    setSelectedMonths([currentMonth]);
    setSelectedDays([currentDay]);
    setFarmerNameSearch("");
    setBuyerNameSearch("");
  };

  const [netWeightInput, setNetWeightInput] = useState("");
  const [showWeightCalc, setShowWeightCalc] = useState(false);
  const [sampleWeightsMap, setSampleWeightsMap] = useState<Record<number, string[]>>({});
  const [extraChargesFarmer, setExtraChargesFarmer] = useState("0");
  const [extraChargesBuyer, setExtraChargesBuyer] = useState("0");
  const [extraPerKgFarmer, setExtraPerKgFarmer] = useState("0");
  const [extraPerKgBuyer, setExtraPerKgBuyer] = useState("0");

  type ChargeSettingsData = {
    mandiCommissionFarmerPercent: string;
    mandiCommissionBuyerPercent: string;
    aadhatCommissionFarmerPercent: string;
    aadhatCommissionBuyerPercent: string;
    hammaliFarmerPerBag: string;
    hammaliBuyerPerBag: string;
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

  const { data: receiptTemplates = [] } = useQuery<ReceiptTemplate[]>({
    queryKey: ["/api/receipt-templates"],
  });

  const { data: buyersWithDues = [] } = useQuery<(Buyer & { receivableDue: string; overallDue: string })[]>({
    queryKey: ["/api/buyers?withDues=true"],
  });

  const farmerSuggestions = useMemo(() => {
    if (!farmerNameSearch || farmerNameSearch.length < 1) return [];
    const s = farmerNameSearch.toLowerCase();
    return farmersWithDues.filter(f =>
      f.name.toLowerCase().includes(s) ||
      (f.phone && f.phone.includes(s)) ||
      ((f as any).village && (f as any).village.toLowerCase().includes(s))
    ).slice(0, 10);
  }, [farmerNameSearch, farmersWithDues]);

  const buyerSuggestions = useMemo(() => {
    if (!buyerNameSearch || buyerNameSearch.length < 1) return [];
    const s = buyerNameSearch.toLowerCase();
    return buyersWithDues.filter(b =>
      b.name.toLowerCase().includes(s) ||
      (b.phone && b.phone.includes(s))
    ).slice(0, 10);
  }, [buyerNameSearch, buyersWithDues]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (farmerDropdownRef.current && !farmerDropdownRef.current.contains(e.target as Node)) setShowFarmerDropdown(false);
      if (buyerDropdownRef.current && !buyerDropdownRef.current.contains(e.target as Node)) setShowBuyerDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: txAggregates } = useQuery<{
    totalHammali: number; totalExtraCharges: number; totalMandiCommission: number;
    paidHammali: number; paidMandiCommission: number;
  }>({
    queryKey: ["/api/transaction-aggregates"],
  });

  const editingTxnId = dialogItems[selectedIdx]?.txn?.id;
  const { data: txEditHistory = [] } = useQuery<TransactionEditHistory[]>({
    queryKey: ["/api/transaction-edit-history", editingTxnId],
    enabled: !!editingTxnId && dialogOpen,
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
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-edit-history"] });
      setDialogOpen(false);
      setDialogItems([]);
      toast({ title: "Transaction Created", variant: "success" });
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
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-edit-history"] });
      setDialogOpen(false);
      setDialogItems([]);
      toast({ title: "Transaction Updated", variant: "success" });
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
      toast({ title: "Transaction Reversed", description: `${data.bagsReturned} bags returned to stock`, variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteBidMutation = useMutation({
    mutationFn: async (bidId: number) => {
      await apiRequest("DELETE", `/api/bids/${bidId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      setDeleteBidConfirmOpen(false);
      setDeletingBid(null);
      setDialogOpen(false);
      toast({ title: t("transactions.bidDeleted"), description: t("transactions.bidDeletedDesc"), variant: "success" });
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

  const serialGroups = useMemo(
    () => buildSerialGroups(unifiedGroups),
    [unifiedGroups]
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

  const filteredSerialGroups = useMemo(() => {
    const filtered = serialGroups.filter(sg => {
      if (cropFilter !== "all" && !sg.lotGroups.some(lg => lg.lot.crop === cropFilter)) return false;
      const bidDates: Date[] = [
        ...sg.allPendingBids.map(b => new Date(b.createdAt)),
        ...sg.allCompletedTxns.map(t => new Date(t.bid.createdAt)),
      ];
      if (bidDates.length === 0) {
        bidDates.push(...sg.lotGroups.map(lg => new Date(lg.lot.createdAt)));
      }
      const hasMatchingDate = bidDates.some(bd => {
        if (bd.getFullYear() !== parseInt(yearFilter)) return false;
        if (selectedMonths.length > 0 && !selectedMonths.includes(String(bd.getMonth() + 1))) return false;
        if (selectedDays.length > 0 && !selectedDays.includes(String(bd.getDate()))) return false;
        return true;
      });
      if (!hasMatchingDate) return false;
      if (billingFilter !== "all") {
        const isBilled = sg.lotGroups.every(lg => lg.lot.remainingBags === 0) && sg.allPendingBids.length === 0;
        if (billingFilter === "billed" && !isBilled) return false;
        if (billingFilter === "unbilled" && isBilled) return false;
      }
      if (farmerNameSearch.trim()) {
        const s = farmerNameSearch.trim().toLowerCase();
        if (!sg.farmer.name.toLowerCase().includes(s)) return false;
      }
      if (buyerNameSearch.trim()) {
        const s = buyerNameSearch.trim().toLowerCase();
        const hasBuyer = sg.allCompletedTxns.some(t => t.buyer.name.toLowerCase().includes(s))
          || sg.allPendingBids.some(b => b.buyer.name.toLowerCase().includes(s));
        if (!hasBuyer) return false;
      }
      return true;
    });
    filtered.sort((a, b) => {
      const fyA = getFyYear(a.date), fyB = getFyYear(b.date);
      if (fyA !== fyB) return fyB - fyA;
      return b.serialNumber - a.serialNumber;
    });
    return filtered;
  }, [serialGroups, cropFilter, yearFilter, selectedMonths, selectedDays, billingFilter, farmerNameSearch, buyerNameSearch]);

  const filteredGroups = useMemo(() => {
    return filteredSerialGroups.flatMap(sg => sg.lotGroups);
  }, [filteredSerialGroups]);

  const summaryStats = useMemo(() => {
    const allActiveTxns = filteredSerialGroups.flatMap(sg => sg.allCompletedTxns.filter(t => !t.isReversed));
    const lotsCount = filteredSerialGroups.length;
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
    const firstActiveIdx = items.findIndex(item => !(item.type === "completed" && item.txn?.isReversed));
    const startIdx = firstActiveIdx >= 0 ? firstActiveIdx : 0;
    setSelectedIdx(startIdx);

    const firstItem = items[startIdx];
    if (firstItem?.type === "completed" && firstItem.txn) {
      prefillFromTxn(firstItem.txn);
    } else {
      resetFormDefaults(firstItem?.bid);
    }

    setDialogOpen(true);
  };

  const prefillFromTxn = (tx: TransactionWithDetails) => {
    setNetWeightInput(tx.netWeight || "");
    setExtraChargesFarmer(tx.extraChargesFarmer || "0");
    setExtraChargesBuyer(tx.extraChargesBuyer || "0");
    setExtraPerKgFarmer((tx as any).extraPerKgFarmer || "0");
    setExtraPerKgBuyer((tx as any).extraPerKgBuyer || "0");
  };

  const calcProportionateNetWeight = (bid: BidWithDetails): string => {
    const lotWeight = parseFloat(bid.lot.initialTotalWeight || "0");
    const lotBags = bid.lot.numberOfBags || 1;
    const bidBags = bid.numberOfBags || 0;
    if (lotWeight <= 0 || lotBags <= 0) return "";
    return ((bidBags / lotBags) * lotWeight).toFixed(2);
  };

  const resetFormDefaults = (bid?: BidWithDetails) => {
    setNetWeightInput(bid ? calcProportionateNetWeight(bid) : "");
    setExtraChargesFarmer("0");
    setExtraChargesBuyer("0");
    setExtraPerKgFarmer("0");
    setExtraPerKgBuyer("0");
  };

  const handleBuyerChange = (val: string) => {
    const idx = parseInt(val);
    const item = dialogItems[idx];
    if (item?.type === "completed" && item.txn?.isReversed) return;
    setSelectedIdx(idx);
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
  };

  const bags = selectedBid?.numberOfBags || 0;
  const nw = parseFloat(netWeightInput) || 0;
  const price = parseFloat(selectedBid?.pricePerKg || "0");
  const extraPerKgFarmerVal = parseFloat(extraPerKgFarmer) || 0;
  const extraPerKgBuyerVal = parseFloat(extraPerKgBuyer) || 0;
  const farmerGross = nw * (price + extraPerKgFarmerVal);
  const buyerGross = nw * (price + extraPerKgBuyerVal);
  const grossAmount = nw * price;

  const hammaliFarmerRate = parseFloat(cs.hammaliFarmerPerBag) || 0;
  const hammaliBuyerRate = parseFloat(cs.hammaliBuyerPerBag) || 0;
  const extraFarmer = parseFloat(extraChargesFarmer) || 0;
  const extraBuyer = parseFloat(extraChargesBuyer) || 0;
  const aadhatFarmerPct = parseFloat(cs.aadhatCommissionFarmerPercent) || 0;
  const aadhatBuyerPct = parseFloat(cs.aadhatCommissionBuyerPercent) || 0;
  const mandiFarmerPct = parseFloat(cs.mandiCommissionFarmerPercent) || 0;
  const mandiBuyerPct = parseFloat(cs.mandiCommissionBuyerPercent) || 0;

  const vehicleBhadaRate = parseFloat(selectedBid?.lot.vehicleBhadaRate || "0");
  const totalBagsInVehicle = selectedBid?.lot.totalBagsInVehicle || selectedBid?.lot.actualNumberOfBags || selectedBid?.lot.numberOfBags || 1;
  const freightFarmerTotal = totalBagsInVehicle > 0 ? (vehicleBhadaRate * bags) / totalBagsInVehicle : 0;

  const hammaliFarmerTotal = hammaliFarmerRate * bags;
  const hammaliBuyerTotal = hammaliBuyerRate * bags;
  const aadhatFarmer = (farmerGross * aadhatFarmerPct) / 100;
  const aadhatBuyer = (buyerGross * aadhatBuyerPct) / 100;
  const mandiFarmer = (farmerGross * mandiFarmerPct) / 100;
  const mandiBuyer = (buyerGross * mandiBuyerPct) / 100;

  const farmerDeductions = hammaliFarmerTotal + extraFarmer + aadhatFarmer + mandiFarmer + freightFarmerTotal;
  const buyerAdditions = hammaliBuyerTotal + extraBuyer + aadhatBuyer + mandiBuyer;

  const farmerPayable = farmerGross - farmerDeductions;
  const buyerReceivable = buyerGross + buyerAdditions;

  const submitTransaction = () => {
    if (!selectedBid || !netWeightInput) {
      toast({ title: "Error", description: "Net weight is required", variant: "destructive" });
      return;
    }

    const payload = {
      lotId: selectedBid.lot.id,
      bidId: selectedBid.id,
      buyerId: selectedBid.buyerId,
      farmerId: selectedBid.lot.farmerId,
      totalWeight: netWeightInput,
      numberOfBags: bags,
      hammaliCharges: hammaliFarmerTotal.toString(),
      freightCharges: freightFarmerTotal.toFixed(2),
      netWeight: netWeightInput,
      pricePerKg: selectedBid.pricePerKg,
      aadhatCharges: aadhatBuyer.toFixed(2),
      mandiCharges: mandiBuyer.toFixed(2),
      aadhatFarmerPercent: aadhatFarmerPct.toString(),
      mandiFarmerPercent: mandiFarmerPct.toString(),
      aadhatBuyerPercent: aadhatBuyerPct.toString(),
      mandiBuyerPercent: mandiBuyerPct.toString(),
      hammaliFarmerPerBag: hammaliFarmerRate.toString(),
      hammaliBuyerPerBag: hammaliBuyerRate.toString(),
      extraChargesFarmer: extraFarmer.toFixed(2),
      extraChargesBuyer: extraBuyer.toFixed(2),
      extraPerKgFarmer: extraPerKgFarmerVal.toFixed(2),
      extraPerKgBuyer: extraPerKgBuyerVal.toFixed(2),
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

  const getFarmerReceiptHtml = (sg: UnifiedSerialGroup): string => {
    const customTmpl = receiptTemplates.find(t => t.templateType === "farmer");
    if (customTmpl) return applyFarmerTemplate(customTmpl.templateHtml, sg, user?.businessName, user?.businessAddress);
    return generateFarmerReceiptHtml(sg, user?.businessName, user?.businessAddress);
  };

  const getBuyerReceiptHtml = (tx: TransactionWithDetails, group: UnifiedLotGroup): string => {
    const crop = group.lot.crop;
    const customTmpl = receiptTemplates.find(t => t.templateType === "buyer" && t.crop === crop)
      || receiptTemplates.find(t => t.templateType === "buyer" && t.crop === "");
    if (customTmpl) return applyBuyerTemplate(customTmpl.templateHtml, group.lot, group.farmer, tx, user?.businessName, user?.businessAddress, user?.businessInitials, user?.businessPhone, user?.businessLicenceNo, user?.businessShopNo);
    return generateBuyerReceiptHtml(group.lot, group.farmer, tx, user?.businessName, user?.businessAddress);
  };

  const handlePrintFarmerReceipt = (sg: UnifiedSerialGroup) => {
    printReceipt(getFarmerReceiptHtml(sg));
  };

  const handleShareFarmerReceipt = (sg: UnifiedSerialGroup) => {
    const farmerShortName = sg.farmer.name.split(/\s+/).slice(0, 2).join("");
    const fileName = `Farmer_Receipt_${farmerShortName}_${sg.date}.pdf`;
    shareReceiptAsPdf(getFarmerReceiptHtml(sg), fileName);
  };

  const handlePrintBuyerReceipt = (tx: TransactionWithDetails, group: UnifiedLotGroup) => {
    printReceipt(getBuyerReceiptHtml(tx, group));
  };

  const handleShareBuyerReceipt = (tx: TransactionWithDetails, group: UnifiedLotGroup) => {
    const fileName = `Buyer_Receipt_${group.lotId}_${tx.buyer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
    shareReceiptAsPdf(getBuyerReceiptHtml(tx, group), fileName);
  };

  const getCombinedBuyerReceiptHtml = (entries: BuyerLotEntry[], sg: UnifiedSerialGroup): string => {
    const crop = entries[0].lot.crop;
    const customTmpl = receiptTemplates.find(t => t.templateType === "buyer" && t.crop === crop)
      || receiptTemplates.find(t => t.templateType === "buyer" && t.crop === "");
    if (customTmpl) return applyCombinedBuyerTemplate(customTmpl.templateHtml, entries, sg.serialNumber, sg.date, user?.businessName, user?.businessAddress, user?.businessInitials, user?.businessPhone, user?.businessLicenceNo, user?.businessShopNo);
    return generateCombinedBuyerReceiptHtml(entries, sg.serialNumber, sg.date, user?.businessName, user?.businessAddress);
  };

  const handlePrintCombinedBuyerReceipt = (entries: BuyerLotEntry[], sg: UnifiedSerialGroup) => {
    printReceipt(getCombinedBuyerReceiptHtml(entries, sg));
  };

  const handleShareCombinedBuyerReceipt = (entries: BuyerLotEntry[], sg: UnifiedSerialGroup) => {
    const buyerName = entries[0].tx.buyer.name.replace(/[^a-zA-Z0-9]/g, "_");
    const crop = entries[0].lot.crop;
    const fileName = `Buyer_Receipt_${buyerName}_${crop}_${sg.date}.pdf`;
    shareReceiptAsPdf(getCombinedBuyerReceiptHtml(entries, sg), fileName);
  };

  const handlePrintAllBuyerReceipt = () => {
    const s = buyerNameSearch.trim().toLowerCase();
    if (!s) return;
    const entries: BuyerLotEntry[] = [];
    filteredSerialGroups.forEach(sg => {
      sg.lotGroups.forEach(lg => {
        if (cropFilter !== "all" && lg.lot.crop !== cropFilter) return;
        lg.completedTxns.filter(t => !t.isReversed && t.buyer.name.toLowerCase().includes(s)).forEach(tx => {
          entries.push({ lot: lg.lot, tx });
        });
      });
    });
    if (entries.length === 0) return;
    printReceipt(generateAllBuyerReceiptHtml(entries, user?.businessName, user?.businessAddress));
  };

  const exportCSV = () => {
    const allTxns = filteredSerialGroups.flatMap(sg => sg.allCompletedTxns.filter(t => !t.isReversed));
    if (allTxns.length === 0) return;

    const headers = [
      "Transaction ID", "Date", "Lot ID", "Serial #", "Crop", "Variety",
      "Farmer Name", "Farmer Phone", "Farmer Village",
      "Buyer Name", "Buyer Phone",
      "Vehicle #", "Driver Name", "Driver Contact", "Freight Type",
      "Grade", "No. of Bags", "Rate/Kg",
      "Net Weight",
      "Hammali Farmer/Bag", "Hammali Buyer/Bag", "Extra Charges Farmer", "Extra Charges Buyer",
      "Extra/Kg Farmer", "Extra/Kg Buyer",
      "Aadhat Farmer %", "Aadhat Buyer %", "Mandi Farmer %", "Mandi Buyer %",
      "Freight Charges",
      "Payable to Farmer", "Receivable from Buyer",
      "Farmer Payment Status", "Buyer Payment Status", "Status"
    ];

    const escCSV = (val: any) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = allTxns.map(tx => {
      const bid = bidForTxn(tx);
      const farmerPaid = parseFloat(tx.farmerPaidAmount || "0");
      const farmerPayable = parseFloat(tx.totalPayableToFarmer || "0");
      const farmerStatus = farmerPaid >= farmerPayable ? "Paid" : farmerPaid > 0 ? "Partial" : "Due";
      const buyerStatus = tx.paymentStatus === "paid" ? "Paid" : tx.paymentStatus === "partial" ? "Partial" : "Due";
      return [
        tx.transactionId, tx.date, tx.lot.lotId, tx.lot.serialNumber, tx.lot.crop, tx.lot.variety || "",
        tx.farmer.name, tx.farmer.phone, tx.farmer.village || "",
        tx.buyer.name, tx.buyer.phone || "",
        tx.lot.vehicleNumber || "", tx.lot.driverName || "", tx.lot.driverContact || "", tx.lot.freightType || "",
        bid.grade || "", tx.numberOfBags, tx.pricePerKg,
        tx.netWeight,
        tx.hammaliFarmerPerBag || "0", tx.hammaliBuyerPerBag || "0",
        tx.extraChargesFarmer || "0", tx.extraChargesBuyer || "0",
        (tx as any).extraPerKgFarmer || "0", (tx as any).extraPerKgBuyer || "0",
        tx.aadhatFarmerPercent || "0", tx.aadhatBuyerPercent || "0",
        tx.mandiFarmerPercent || "0", tx.mandiBuyerPercent || "0",
        tx.freightCharges || "0",
        tx.totalPayableToFarmer, tx.totalReceivableFromBuyer,
        farmerStatus, buyerStatus, tx.isReversed ? "Reversed" : "Active"
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
        <Select value={billingFilter} onValueChange={setBillingFilter}>
          <SelectTrigger className="w-[110px]" data-testid="select-billing-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="billed">Billed</SelectItem>
            <SelectItem value="unbilled">Unbilled</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative" ref={farmerDropdownRef}>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              data-testid="input-farmer-name-filter"
              value={farmerNameSearch}
              onChange={(e) => { setFarmerNameSearch(e.target.value); setShowFarmerDropdown(true); }}
              onFocus={() => { if (farmerNameSearch.length >= 1) setShowFarmerDropdown(true); }}
              placeholder="Farmer..."
              className="w-32 h-8 text-xs pl-7"
              autoComplete="off"
            />
          </div>
          {showFarmerDropdown && farmerNameSearch.length >= 1 && farmerSuggestions.length > 0 && (
            <div className="absolute z-50 w-64 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto">
              {farmerSuggestions.map((f) => (
                <div
                  key={f.id}
                  className="px-3 py-2 text-xs hover:bg-accent cursor-pointer"
                  data-testid={`option-txn-farmer-${f.id}`}
                  onClick={() => { setFarmerNameSearch(f.name); setShowFarmerDropdown(false); }}
                >
                  <span className="font-medium">{f.name}</span>
                  {f.phone && <span className="text-muted-foreground"> — {f.phone}</span>}
                  {(f as any).village && <span className="text-muted-foreground"> — {(f as any).village}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          <div className="relative" ref={buyerDropdownRef}>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                data-testid="input-buyer-name-filter"
                value={buyerNameSearch}
                onChange={(e) => { setBuyerNameSearch(e.target.value); setShowBuyerDropdown(true); }}
                onFocus={() => { if (buyerNameSearch.length >= 1) setShowBuyerDropdown(true); }}
                placeholder="Buyer..."
                className="w-32 h-8 text-xs pl-7"
                autoComplete="off"
              />
            </div>
            {showBuyerDropdown && buyerNameSearch.length >= 1 && buyerSuggestions.length > 0 && (
              <div className="absolute z-50 w-64 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto right-0">
                {buyerSuggestions.map((b) => (
                  <div
                    key={b.id}
                    className="px-3 py-2 text-xs hover:bg-accent cursor-pointer"
                    data-testid={`option-txn-buyer-${b.id}`}
                    onClick={() => { setBuyerNameSearch(b.name); setShowBuyerDropdown(false); }}
                  >
                    <span className="font-medium">{b.name}</span>
                    {b.phone && <span className="text-muted-foreground"> — {b.phone}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

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

        {buyerNameSearch.trim() && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            data-testid="button-print-all-buyer-receipt"
            title={`Print receipt for ${buyerNameSearch}${cropFilter !== "all" ? ` (${cropFilter})` : ""}`}
            onClick={handlePrintAllBuyerReceipt}
          >
            <Printer className="w-4 h-4" />
          </Button>
        )}

        {isFiltered && (
          <Button
            variant="secondary"
            size="sm"
            className="h-8 text-xs px-2 shrink-0 gap-1"
            data-testid="button-clear-filters"
            onClick={clearFilters}
            title="Clear extra filters"
          >
            <X className="w-3 h-3" />
            Clear
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0 shrink-0"
          data-testid="button-export-csv"
          onClick={exportCSV}
          disabled={filteredSerialGroups.flatMap(sg => sg.allCompletedTxns.filter(t => !t.isReversed)).length === 0}
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

      {filteredSerialGroups.length > 0 ? (
        <div className="space-y-3">
          {filteredSerialGroups.map((sg) => {
            const activeTxns = sg.allCompletedTxns.filter(t => !t.isReversed);
            const hasCompleted = activeTxns.length > 0;
            const sgAdvance = parseFloat(sg.lotGroups[0]?.lot?.farmerAdvanceAmount || "0");
            const totalFarmerPayable = activeTxns.reduce(
              (s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0
            ) - sgAdvance;
            const isBilled = sg.lotGroups.every(lg => lg.lot.remainingBags === 0) && sg.allPendingBids.length === 0;

            return (
              <Card key={`${sg.date}-${sg.serialNumber}`} data-testid={`card-serial-${sg.serialNumber}`}>
                <CardContent className="pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs font-semibold">SR #{sg.serialNumber}</Badge>
                      <span className="text-xs text-muted-foreground">{sg.date}</span>
                      {isBilled && <Badge variant="outline" className="text-xs border-green-400 text-green-700 bg-green-50">Billed</Badge>}
                    </div>
                    <div className="flex items-center gap-1">
                      {hasCompleted && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              data-testid={`button-print-serial-${sg.serialNumber}`}
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
                              data-testid={`button-print-farmer-${sg.serialNumber}`}
                              onClick={() => handlePrintFarmerReceipt(sg)}
                            >
                              <Printer className="w-4 h-4 mr-2" />
                              Print किसान रसीद
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              data-testid={`button-share-farmer-${sg.serialNumber}`}
                              onClick={() => handleShareFarmerReceipt(sg)}
                            >
                              <Share2 className="w-4 h-4 mr-2" />
                              Share किसान रसीद
                            </DropdownMenuItem>
                            {(() => {
                              const buyerCropMap = new Map<string, BuyerLotEntry[]>();
                              sg.lotGroups.forEach(lg => {
                                lg.completedTxns.filter(t => !t.isReversed).forEach(tx => {
                                  const key = `${tx.buyerId}__${lg.lot.crop}`;
                                  if (!buyerCropMap.has(key)) buyerCropMap.set(key, []);
                                  buyerCropMap.get(key)!.push({ lot: lg.lot, tx });
                                });
                              });
                              return Array.from(buyerCropMap.entries()).map(([key, entries]) => {
                                const { tx, lot } = entries[0];
                                const label = `${tx.buyer.name} (${lot.crop})`;
                                return (
                                  <div key={key}>
                                    <DropdownMenuItem
                                      data-testid={`button-print-buyer-${key}`}
                                      onClick={() => entries.length > 1
                                        ? handlePrintCombinedBuyerReceipt(entries, sg)
                                        : handlePrintBuyerReceipt(tx, sg.lotGroups.find(lg => lg.lot.id === lot.id)!)}
                                    >
                                      <Printer className="w-4 h-4 mr-2" />
                                      Print {label}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      data-testid={`button-share-buyer-${key}`}
                                      onClick={() => entries.length > 1
                                        ? handleShareCombinedBuyerReceipt(entries, sg)
                                        : handleShareBuyerReceipt(tx, sg.lotGroups.find(lg => lg.lot.id === lot.id)!)}
                                    >
                                      <Share2 className="w-4 h-4 mr-2" />
                                      Share {label}
                                    </DropdownMenuItem>
                                  </div>
                                );
                              });
                            })()}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium">{sg.farmer.name}</span>
                    {sg.farmer.phone && <span className="text-xs text-muted-foreground">{sg.farmer.phone}</span>}
                    {sg.farmer.village && <span className="text-xs text-muted-foreground">{sg.farmer.village}</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mb-2">
                    <span>{sg.totalBags} {t("transactions.bagsTotal")}</span>
                    {parseFloat(sg.lotGroups[0]?.lot?.farmerAdvanceAmount || "0") > 0 && (
                      <span className="text-orange-600 font-medium">
                        Advance: Rs.{parseFloat(sg.lotGroups[0].lot.farmerAdvanceAmount || "0").toFixed(2)}
                        {sg.lotGroups[0].lot.farmerAdvanceMode ? ` (${sg.lotGroups[0].lot.farmerAdvanceMode})` : ""}
                      </span>
                    )}
                  </div>

                  {hasCompleted && (() => {
                    const farmerTotalPayable = activeTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0) - sgAdvance;
                    const farmerTotalPaid = activeTxns.reduce((s, t) => s + parseFloat(t.farmerPaidAmount || "0"), 0);
                    const fStatus = farmerTotalPaid >= farmerTotalPayable ? "paid" : farmerTotalPaid > 0 ? "partial" : "due";
                    return (
                      <div className="border-t pt-2 mb-2 flex justify-between items-center font-medium text-sm text-primary">
                        <span className="flex items-center gap-2">
                          {t("transactions.payableToFarmer")}:
                          {fStatus === "paid" && <Badge variant="outline" className="text-xs border-green-400 text-green-700 bg-green-50">Paid</Badge>}
                          {fStatus === "partial" && <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">Partial</Badge>}
                          {fStatus === "due" && <Badge variant="outline" className="text-xs border-red-400 text-red-600 bg-red-50">Due</Badge>}
                        </span>
                        <span>Rs.{totalFarmerPayable.toFixed(2)}</span>
                      </div>
                    );
                  })()}

                  <div className="border-t pt-2 space-y-1">
                    {sg.lotGroups.map((lg) => (
                      <div key={lg.lot.id}>
                        {(lg.completedTxns.length > 0 || lg.pendingBids.length > 0) && (
                          <div className="flex items-center gap-2 mt-1 mb-0.5">
                            <Badge className="text-xs">{lg.lot.crop}</Badge>
                            {lg.lot.size && <Badge variant="outline" className="text-xs">{lg.lot.size}</Badge>}
                            <span className="text-xs text-muted-foreground">{lg.lot.actualNumberOfBags ?? lg.lot.numberOfBags} bags</span>
                            <Button
                              data-testid={`button-edit-lot-${lg.lot.id}`}
                              size="icon"
                              variant="ghost"
                              className="h-5 w-5"
                              onClick={() => openEditDialog(lg)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                        {lg.completedTxns.map((tx) => (
                          <div key={tx.id} className={`text-sm py-1 ${tx.isReversed ? "opacity-40" : ""}`}>
                            <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-muted-foreground">{t("transactions.buyer")}:</span>
                                <strong className="truncate">{tx.buyer.name}</strong>
                                <span className="text-green-600 font-semibold whitespace-nowrap">₹{tx.pricePerKg}/kg</span>
                                {tx.isReversed && <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">{t("transactions.reversed")}</Badge>}
                                {!tx.isReversed && tx.paymentStatus === "paid" && <Badge variant="outline" className="text-xs border-green-400 text-green-700 bg-green-50">Paid</Badge>}
                                {!tx.isReversed && tx.paymentStatus === "partial" && <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">Partial</Badge>}
                                {!tx.isReversed && tx.paymentStatus === "due" && <Badge variant="outline" className="text-xs border-red-400 text-red-600 bg-red-50">Due</Badge>}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{tx.numberOfBags} bags</span>
                                <span>Net: {tx.netWeight}kg</span>
                                <span className="text-chart-2 font-medium text-sm">Rs.{tx.totalReceivableFromBuyer}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                        {lg.pendingBids.map((bid) => (
                          <div key={bid.id} className="text-sm py-1">
                            <div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-0.5">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-muted-foreground">{t("transactions.buyer")}:</span>
                                <strong className="truncate">{bid.buyer.name}</strong>
                                <span className="text-green-600 font-semibold whitespace-nowrap">₹{bid.pricePerKg}/kg</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span>{bid.numberOfBags} bags</span>
                                {bid.grade && bid.grade !== "__all__" && <span>{bid.grade}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
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

      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setShowWeightCalc(false); }}>
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
                      {dialogItems.map((item, idx) => {
                        const isReversed = item.type === "completed" && item.txn?.isReversed;
                        return (
                          <SelectItem
                            key={item.bid.id}
                            value={idx.toString()}
                            disabled={!!isReversed}
                            className={isReversed ? "opacity-40" : ""}
                          >
                            {item.bid.buyer.name} - Rs.{item.bid.pricePerKg}/kg ({item.bid.numberOfBags} bags)
                            {item.type === "completed" && !isReversed ? " ✓" : ""}
                            {isReversed ? " (Reversed)" : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="bg-muted/50 rounded-md p-2 text-sm">
                <p>{t("transactions.buyer")}: <strong>{selectedBid.buyer.name}</strong></p>
                <p>Price: <strong>Rs.{selectedBid.pricePerKg}/kg</strong> | Bags: <strong>{selectedBid.numberOfBags}</strong>{selectedBid.grade && selectedBid.grade !== "__all__" && <> | Grade: <strong>{selectedBid.grade}</strong></>}</p>
                {selectedBid.paymentType === "Cash" && parseFloat(selectedBid.advanceAmount || "0") > 0 && (
                  <p className="text-green-600 font-medium">Cash | Advance: ₹{selectedBid.advanceAmount}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label>{t("transactions.netWeight")}</Label>
                <div className="flex gap-2">
                  <Input
                    data-testid="input-net-weight"
                    type="text"
                    inputMode="decimal"
                    value={netWeightInput}
                    onChange={(e) => setNetWeightInput(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    className="mobile-touch-target flex-1"
                  />
                  <Button
                    data-testid="button-calculate-weight"
                    type="button"
                    variant={showWeightCalc ? "default" : "outline"}
                    size="sm"
                    className="whitespace-nowrap mobile-touch-target"
                    onClick={() => {
                      if (!showWeightCalc && selectedBid) {
                        const bidId = selectedBid.id;
                        if (!sampleWeightsMap[bidId]) {
                          setSampleWeightsMap(prev => ({ ...prev, [bidId]: ["", "", ""] }));
                        }
                      }
                      setShowWeightCalc(!showWeightCalc);
                    }}
                  >
                    <Calculator className="h-4 w-4 mr-1" />
                    Calc Wt
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Total - {bags} bags</p>

                {showWeightCalc && selectedBid && (() => {
                  const bidId = selectedBid.id;
                  const samples = sampleWeightsMap[bidId] || ["", "", ""];
                  const nonZeroWeights = samples.map(s => parseFloat(s) || 0).filter(w => w > 0);
                  const average = nonZeroWeights.length > 0 ? nonZeroWeights.reduce((a, b) => a + b, 0) / nonZeroWeights.length : 0;
                  const hasWarning = samples.some(s => (parseFloat(s) || 0) > 100);

                  const updateSample = (idx: number, val: string) => {
                    const updated = [...samples];
                    updated[idx] = val;
                    setSampleWeightsMap(prev => ({ ...prev, [bidId]: updated }));
                    const nzw = updated.map(s => parseFloat(s) || 0).filter(w => w > 0);
                    if (nzw.length > 0) {
                      const avg = nzw.reduce((a, b) => a + b, 0) / nzw.length;
                      setNetWeightInput((avg * bags).toFixed(2));
                    }
                  };

                  const addSample = () => {
                    setSampleWeightsMap(prev => ({ ...prev, [bidId]: [...samples, ""] }));
                  };

                  const removeSample = (idx: number) => {
                    if (samples.length <= 1) return;
                    const updated = samples.filter((_, i) => i !== idx);
                    setSampleWeightsMap(prev => ({ ...prev, [bidId]: updated }));
                    const nzw = updated.map(s => parseFloat(s) || 0).filter(w => w > 0);
                    if (nzw.length > 0) {
                      const avg = nzw.reduce((a, b) => a + b, 0) / nzw.length;
                      setNetWeightInput((avg * bags).toFixed(2));
                    }
                  };

                  return (
                    <div className="bg-muted/50 rounded-md p-2 space-y-2 mt-1" data-testid="weight-calculator">
                      <p className="text-xs font-semibold text-muted-foreground">Sample Bag Weights (kg)</p>
                      <div className="grid grid-cols-2 gap-2">
                        {samples.map((w, idx) => (
                          <div key={idx} className="space-y-0.5">
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                              <Input
                                data-testid={`input-sample-weight-${idx}`}
                                type="text"
                                inputMode="decimal"
                                value={w}
                                onChange={(e) => updateSample(idx, e.target.value)}
                                onFocus={(e) => e.target.select()}
                                placeholder="0.00"
                                className="h-7 text-xs flex-1"
                              />
                              {samples.length > 1 && (
                                <Button
                                  data-testid={`button-remove-sample-${idx}`}
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0"
                                  onClick={() => removeSample(idx)}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                            {(parseFloat(w) || 0) > 100 && (
                              <p className="text-xs text-orange-500 font-medium ml-6 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Over 100kg</p>
                            )}
                          </div>
                        ))}
                      </div>
                      <Button
                        data-testid="button-add-sample"
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs w-full"
                        onClick={addSample}
                      >
                        <Plus className="h-3 w-3 mr-1" /> Add Sample
                      </Button>
                      <div className="border-t pt-1 flex justify-between text-xs font-medium">
                        <span>Average ({nonZeroWeights.length} samples):</span>
                        <span>{average > 0 ? `${average.toFixed(2)} kg` : "—"}</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Net Weight ({average.toFixed(2)} × {bags} bags):</span>
                        <span>{average > 0 ? `${(average * bags).toFixed(2)} kg` : "—"}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs" data-testid="charge-rates-display">
                <div className="bg-muted/50 rounded p-2 space-y-1">
                  <p className="font-semibold text-muted-foreground">Farmer Charges</p>
                  <div className="flex justify-between"><span>Aadhat:</span><span>{aadhatFarmerPct}%</span></div>
                  <div className="flex justify-between"><span>Mandi:</span><span>{mandiFarmerPct}%</span></div>
                  <div className="flex justify-between"><span>Hammali:</span><span>₹{hammaliFarmerRate}/bag</span></div>
                  <div className="flex items-center justify-between">
                    <span>Extra:</span>
                    <Input
                      data-testid="input-extra-charges-farmer"
                      type="text"
                      inputMode="decimal"
                      value={extraChargesFarmer}
                      onChange={(e) => setExtraChargesFarmer(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-20 h-6 text-xs text-right p-1"
                    />
                  </div>
                  {vehicleBhadaRate > 0 && (
                    <div className="flex justify-between"><span>Freight/Bhada (Total):</span><span>₹{vehicleBhadaRate}</span></div>
                  )}
                  <div className="flex items-center justify-between border-t pt-1 mt-1">
                    <span className="font-semibold">Extra ₹/Kg:</span>
                    <Input
                      data-testid="input-extra-per-kg-farmer"
                      type="text"
                      inputMode="decimal"
                      value={extraPerKgFarmer}
                      onChange={(e) => setExtraPerKgFarmer(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-20 h-6 text-xs text-right p-1"
                    />
                  </div>
                </div>
                <div className="bg-muted/50 rounded p-2 space-y-1">
                  <p className="font-semibold text-muted-foreground">Buyer Charges</p>
                  <div className="flex justify-between"><span>Aadhat:</span><span>{aadhatBuyerPct}%</span></div>
                  <div className="flex justify-between"><span>Mandi:</span><span>{mandiBuyerPct}%</span></div>
                  <div className="flex justify-between"><span>Hammali:</span><span>₹{hammaliBuyerRate}/bag</span></div>
                  <div className="flex items-center justify-between">
                    <span>Extra:</span>
                    <Input
                      data-testid="input-extra-charges-buyer"
                      type="text"
                      inputMode="decimal"
                      value={extraChargesBuyer}
                      onChange={(e) => setExtraChargesBuyer(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-20 h-6 text-xs text-right p-1"
                    />
                  </div>
                  <div className="flex items-center justify-between border-t pt-1 mt-1">
                    <span className="font-semibold">Extra ₹/Kg:</span>
                    <Input
                      data-testid="input-extra-per-kg-buyer"
                      type="text"
                      inputMode="decimal"
                      value={extraPerKgBuyer}
                      onChange={(e) => setExtraPerKgBuyer(e.target.value)}
                      onFocus={(e) => e.target.select()}
                      className="w-20 h-6 text-xs text-right p-1"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-muted rounded-md p-3 space-y-2 text-sm" data-testid="txn-calculation-summary">
                <div className="flex justify-between">
                  <span>Bid Rate:</span>
                  <span className="font-medium">Rs.{price.toFixed(2)}/kg</span>
                </div>
                {extraPerKgFarmerVal > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Farmer Rate: {price.toFixed(2)} + {extraPerKgFarmerVal.toFixed(2)}</span>
                    <span className="font-medium">Rs.{(price + extraPerKgFarmerVal).toFixed(2)}/kg</span>
                  </div>
                )}
                {extraPerKgBuyerVal > 0 && (
                  <div className="flex justify-between text-blue-600">
                    <span>Buyer Rate: {price.toFixed(2)} + {extraPerKgBuyerVal.toFixed(2)}</span>
                    <span className="font-medium">Rs.{(price + extraPerKgBuyerVal).toFixed(2)}/kg</span>
                  </div>
                )}

                <div className="border-t pt-2 mt-2">
                  <div className="flex justify-between">
                    <span>Farmer Gross ({nw.toFixed(2)} × Rs.{(price + extraPerKgFarmerVal).toFixed(2)}):</span>
                    <span className="font-medium">Rs.{farmerGross.toFixed(2)}</span>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1 mt-1">Farmer Deductions:</p>
                  {hammaliFarmerRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Hammali ({bags} × ₹{hammaliFarmerRate}):</span>
                      <span>-Rs.{hammaliFarmerTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {extraFarmer > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Extra Charges:</span>
                      <span>-Rs.{extraFarmer.toFixed(2)}</span>
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
                      <span>Freight (₹{vehicleBhadaRate} × {bags}/{totalBagsInVehicle}):</span>
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
                  <div className="flex justify-between">
                    <span>Buyer Gross ({nw.toFixed(2)} × Rs.{(price + extraPerKgBuyerVal).toFixed(2)}):</span>
                    <span className="font-medium">Rs.{buyerGross.toFixed(2)}</span>
                  </div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1 mt-1">Buyer Additions:</p>
                  {hammaliBuyerRate > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Hammali ({bags} × ₹{hammaliBuyerRate}):</span>
                      <span>+Rs.{hammaliBuyerTotal.toFixed(2)}</span>
                    </div>
                  )}
                  {extraBuyer > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Extra Charges:</span>
                      <span>+Rs.{extraBuyer.toFixed(2)}</span>
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

              {txEditHistory.length > 0 && (
                <Collapsible open={txHistoryOpen} onOpenChange={setTxHistoryOpen}>
                  <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground w-full py-1" data-testid="toggle-tx-history">
                    {txHistoryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <History className="h-3 w-3" />
                    <span>Edit History ({txEditHistory.length})</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="space-y-2 mt-1 max-h-40 overflow-y-auto">
                      {(() => {
                        const fieldLabels: Record<string, string> = {
                          created: "Created",
                          reversed: "Reversed",
                          totalWeight: "Weight",
                          numberOfBags: "Bags",
                          extraChargesFarmer: "Extra (Farmer)",
                          extraChargesBuyer: "Extra (Buyer)",
                          extraPerKgFarmer: "Extra/Kg (Farmer)",
                          extraPerKgBuyer: "Extra/Kg (Buyer)",
                          netWeight: "Net Weight",
                          pricePerKg: "Price/Kg",
                          totalPayableToFarmer: "Farmer Payable",
                          totalReceivableFromBuyer: "Buyer Receivable",
                          hammaliCharges: "Hammali",
                          freightCharges: "Freight",
                          aadhatCharges: "Aadhat",
                          mandiCharges: "Mandi",
                        };
                        const grouped = txEditHistory.reduce((acc, h) => {
                          const key = new Date(h.createdAt).toISOString();
                          if (!acc[key]) acc[key] = { changedBy: h.changedBy, createdAt: h.createdAt, fields: [] };
                          acc[key].fields.push(h);
                          return acc;
                        }, {} as Record<string, { changedBy: string | null; createdAt: Date; fields: TransactionEditHistory[] }>);
                        const sortedGroups = Object.values(grouped).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                        return sortedGroups.map((group, i) => (
                          <div key={i} className="bg-muted/50 rounded p-2 text-xs space-y-0.5">
                            <div className="flex justify-between text-muted-foreground">
                              <span className="font-medium">{group.changedBy}</span>
                              <span>{format(new Date(group.createdAt), "dd MMM yyyy, hh:mm a")}</span>
                            </div>
                            {group.fields.map((h, j) => (
                              <div key={j} className="flex gap-1 flex-wrap">
                                {h.fieldChanged === "created" ? (
                                  <span className="text-green-600 font-medium">{h.newValue}</span>
                                ) : h.fieldChanged === "reversed" ? (
                                  <span className="text-red-500 font-medium">Transaction Reversed</span>
                                ) : (
                                  <>
                                    <span className="text-muted-foreground">{fieldLabels[h.fieldChanged] || h.fieldChanged}:</span>
                                    <span className="line-through text-red-500">{h.oldValue || "—"}</span>
                                    <span>→</span>
                                    <span className="text-green-600 font-medium">{h.newValue || "—"}</span>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        ));
                      })()}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}

              {!isEditing && currentItem && (
                <Button
                  variant="destructive"
                  data-testid="button-return-bid-to-stock"
                  className="w-full mobile-touch-target"
                  onClick={() => {
                    setDeletingBid(currentItem.bid);
                    setDeleteBidConfirmOpen(true);
                  }}
                  disabled={deleteBidMutation.isPending}
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

      <AlertDialog open={deleteBidConfirmOpen} onOpenChange={(open) => { setDeleteBidConfirmOpen(open); if (!open) setDeletingBid(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("transactions.bidReturnConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("transactions.bidReturnConfirmMsg")}
              {deletingBid && (
                <span className="block mt-2 text-orange-600 font-medium">
                  {t("transactions.bidReturnBuyerInfo").replace("{buyer}", deletingBid.buyer?.name || "").replace("{bags}", String(deletingBid.numberOfBags))}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-bid">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-delete-bid"
              className="bg-destructive text-destructive-foreground"
              onClick={() => deletingBid && deleteBidMutation.mutate(deletingBid.id)}
              disabled={deleteBidMutation.isPending}
            >
              {deleteBidMutation.isPending ? t("transactions.returning") : t("transactions.yesReturn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
