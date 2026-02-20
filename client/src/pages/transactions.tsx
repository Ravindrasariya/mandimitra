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
import type { Bid, Buyer, Lot, Farmer, Transaction, BusinessChargeSettings, TransactionEditHistory } from "@shared/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Receipt, Pencil, Printer, ChevronDown, ChevronRight, Calendar, Package, Users, Landmark, HandCoins, Download, History } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/lib/auth";

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

function generateFarmerReceiptHtml(lot: Lot, farmer: Farmer, txns: TransactionWithDetails[], businessName?: string, businessAddress?: string) {
  const dateStr = txns[0]?.date || format(new Date(), "yyyy-MM-dd");
  const originalBags = lot.numberOfBags;
  const cropLabel: Record<string, string> = { Potato: "आलू / Potato", Onion: "प्याज / Onion", Garlic: "लहसुन / Garlic" };

  const totalHammali = txns.reduce((s, t) => s + parseFloat(t.hammaliCharges || "0"), 0);
  const totalExtraCharges = txns.reduce((s, t) => s + parseFloat(t.extraChargesFarmer || "0"), 0);
  const totalFreight = txns.reduce((s, t) => s + parseFloat(t.freightCharges || "0"), 0);
  const totalAadhatFarmer = txns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * parseFloat(t.pricePerKg || "0");
    return s + gross * parseFloat(t.aadhatFarmerPercent || "0") / 100;
  }, 0);
  const totalMandiFarmer = txns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * parseFloat(t.pricePerKg || "0");
    return s + gross * parseFloat(t.mandiFarmerPercent || "0") / 100;
  }, 0);

  const totalDeduction = totalHammali + totalExtraCharges + totalFreight + totalAadhatFarmer + totalMandiFarmer;
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
@media print{body{margin:10mm}.no-print{display:none!important}}
</style></head><body>
<div class="header">
${businessName ? `<h2 style="margin-bottom:2px">${businessName}</h2>` : ""}
${businessAddress ? `<p style="font-size:0.85em;color:#555;margin:2px 0">${businessAddress}</p>` : ""}
<h3 style="margin:8px 0 2px 0;font-size:1.1em">किसान रसीद / Farmer Receipt</h3>
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
${totalExtraCharges > 0 ? `<div class="ded-row"><span>अतिरिक्त शुल्क / Extra Charges:</span><span>₹${totalExtraCharges.toFixed(2)}</span></div>` : ""}
${totalAadhatFarmer > 0 ? `<div class="ded-row"><span>आढ़त / Aadhat:</span><span>₹${totalAadhatFarmer.toFixed(2)}</span></div>` : ""}
${totalMandiFarmer > 0 ? `<div class="ded-row"><span>मण्डी शुल्क / Mandi:</span><span>₹${totalMandiFarmer.toFixed(2)}</span></div>` : ""}
${totalFreight > 0 ? `<div class="ded-row"><span>भाड़ा / Freight:</span><span>₹${totalFreight.toFixed(2)}</span></div>` : ""}
${totalDeduction > 0 ? `<div class="ded-row sub-total"><span>कुल कटौती / Total Deduction:</span><span>₹${totalDeduction.toFixed(2)}</span></div>` : ""}
<div class="ded-row total-row"><span>किसान को देय राशि / Net Payable:</span><span>₹${totalPayable.toFixed(2)}</span></div>
</div>
<div class="no-print" style="margin-top:20px;text-align:center;padding:12px;border-top:1px solid #eee;display:flex;justify-content:center;gap:12px;flex-wrap:wrap">
<button onclick="window.print()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#333;color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
Print / PDF
</button>
<button id="wa-share-btn" disabled onclick="shareAsPdf()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#25D366;color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;opacity:0.6">
<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.588-.832-6.32-2.222l-.44-.367-3.12 1.046 1.046-3.12-.367-.44A9.96 9.96 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
Preparing PDF...
</button>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js"><\/script>
<script>
var pdfFileName = "Farmer_Receipt_${lot.lotId}.pdf";
var cachedPdfBlob = null;
var libAttempts = 0;
function waitForLibs(cb) {
  if (typeof html2canvas !== "undefined" && typeof jspdf !== "undefined") { cb(); return; }
  libAttempts++;
  if (libAttempts > 100) {
    var btn = document.getElementById("wa-share-btn");
    btn.disabled = false; btn.style.opacity = "1";
    btn.lastChild.textContent = "Share via WhatsApp";
    return;
  }
  setTimeout(function() { waitForLibs(cb); }, 100);
}
function buildPdf(canvas) {
  var pdf = new jspdf.jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  var pageW = pdf.internal.pageSize.getWidth();
  var pageH = pdf.internal.pageSize.getHeight();
  var margin = 10;
  var usableW = pageW - margin * 2;
  var usableH = pageH - margin * 2;
  var imgW = usableW;
  var imgH = (canvas.height * imgW) / canvas.width;
  var pageImgH = (usableH / imgW) * canvas.width;
  if (imgH <= usableH) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, imgH);
  } else {
    var pages = Math.ceil(imgH / usableH);
    for (var p = 0; p < pages; p++) {
      if (p > 0) pdf.addPage();
      var srcY = p * pageImgH;
      var srcH = Math.min(pageImgH, canvas.height - srcY);
      var sc = document.createElement("canvas");
      sc.width = canvas.width; sc.height = srcH;
      sc.getContext("2d").drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      pdf.addImage(sc.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, (srcH * imgW) / canvas.width);
    }
  }
  return pdf;
}
function generatePdf() {
  var noPrintEls = document.querySelectorAll(".no-print");
  noPrintEls.forEach(function(el) { el.style.display = "none"; });
  html2canvas(document.body, { scale: 2, useCORS: true, logging: false }).then(function(canvas) {
    noPrintEls.forEach(function(el) { el.style.display = ""; });
    cachedPdfBlob = buildPdf(canvas).output("blob");
    var btn = document.getElementById("wa-share-btn");
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.lastChild.textContent = "Share via WhatsApp";
  }).catch(function() {
    document.querySelectorAll(".no-print").forEach(function(el) { el.style.display = ""; });
    var btn = document.getElementById("wa-share-btn");
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.lastChild.textContent = "Share via WhatsApp";
  });
}
waitForLibs(function() { setTimeout(generatePdf, 200); });
function shareAsPdf() {
  if (!cachedPdfBlob) {
    if (typeof html2canvas !== "undefined" && typeof jspdf !== "undefined") { generatePdf(); }
    else { window.print(); }
    return;
  }
  var pdfFile = new File([cachedPdfBlob], pdfFileName, { type: "application/pdf" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    navigator.share({ files: [pdfFile], title: pdfFileName }).catch(function() {});
  } else {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(cachedPdfBlob);
    a.download = pdfFileName;
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
  }
}
<\/script>
</body></html>`;
}

function generateBuyerReceiptHtml(lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string, businessAddress?: string) {
  const grossAmount = parseFloat(tx.netWeight || "0") * parseFloat(tx.pricePerKg || "0");
  const dateStr = tx.date || format(new Date(), "yyyy-MM-dd");
  const bags = tx.numberOfBags || 0;

  const hammaliBuyer = parseFloat(tx.hammaliBuyerPerBag || "0") * bags;
  const extraBuyer = parseFloat(tx.extraChargesBuyer || "0");
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
@media print{body{margin:10mm}.no-print{display:none!important}}
</style></head><body>
<div class="header">
${businessName ? `<h2 style="margin-bottom:2px">${businessName}</h2>` : ""}
${businessAddress ? `<p style="font-size:0.85em;color:#555;margin:2px 0">${businessAddress}</p>` : ""}
<h3 style="margin:8px 0 5px 0;font-size:1.1em">Buyer Receipt</h3>
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
${extraBuyer > 0 ? `<div class="summary-row"><span>Extra Charges:</span><span>Rs.${extraBuyer.toFixed(2)}</span></div>` : ""}
${aadhatBuyer > 0 ? `<div class="summary-row"><span>Aadhat (${tx.aadhatBuyerPercent}%):</span><span>Rs.${aadhatBuyer.toFixed(2)}</span></div>` : ""}
${mandiBuyer > 0 ? `<div class="summary-row"><span>Mandi (${tx.mandiBuyerPercent}%):</span><span>Rs.${mandiBuyer.toFixed(2)}</span></div>` : ""}
<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${parseFloat(tx.totalReceivableFromBuyer || "0").toFixed(2)}</span></div>
</div>
<div class="no-print" style="margin-top:20px;text-align:center;padding:12px;border-top:1px solid #eee;display:flex;justify-content:center;gap:12px;flex-wrap:wrap">
<button onclick="window.print()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#333;color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">
<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
Print / PDF
</button>
<button id="wa-share-btn" disabled onclick="shareAsPdf()" style="display:inline-flex;align-items:center;gap:8px;padding:10px 20px;background:#25D366;color:white;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;opacity:0.6">
<svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.96 11.96 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.387 0-4.588-.832-6.32-2.222l-.44-.367-3.12 1.046 1.046-3.12-.367-.44A9.96 9.96 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
Preparing PDF...
</button>
</div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.2/jspdf.umd.min.js"><\/script>
<script>
var pdfFileName = "Buyer_Receipt_${lot.lotId}_${tx.buyer.name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf";
var cachedPdfBlob = null;
var libAttempts = 0;
function waitForLibs(cb) {
  if (typeof html2canvas !== "undefined" && typeof jspdf !== "undefined") { cb(); return; }
  libAttempts++;
  if (libAttempts > 100) {
    var btn = document.getElementById("wa-share-btn");
    btn.disabled = false; btn.style.opacity = "1";
    btn.lastChild.textContent = "Share via WhatsApp";
    return;
  }
  setTimeout(function() { waitForLibs(cb); }, 100);
}
function buildPdf(canvas) {
  var pdf = new jspdf.jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  var pageW = pdf.internal.pageSize.getWidth();
  var pageH = pdf.internal.pageSize.getHeight();
  var margin = 10;
  var usableW = pageW - margin * 2;
  var usableH = pageH - margin * 2;
  var imgW = usableW;
  var imgH = (canvas.height * imgW) / canvas.width;
  var pageImgH = (usableH / imgW) * canvas.width;
  if (imgH <= usableH) {
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, imgH);
  } else {
    var pages = Math.ceil(imgH / usableH);
    for (var p = 0; p < pages; p++) {
      if (p > 0) pdf.addPage();
      var srcY = p * pageImgH;
      var srcH = Math.min(pageImgH, canvas.height - srcY);
      var sc = document.createElement("canvas");
      sc.width = canvas.width; sc.height = srcH;
      sc.getContext("2d").drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      pdf.addImage(sc.toDataURL("image/jpeg", 0.95), "JPEG", margin, margin, imgW, (srcH * imgW) / canvas.width);
    }
  }
  return pdf;
}
function generatePdf() {
  var noPrintEls = document.querySelectorAll(".no-print");
  noPrintEls.forEach(function(el) { el.style.display = "none"; });
  html2canvas(document.body, { scale: 2, useCORS: true, logging: false }).then(function(canvas) {
    noPrintEls.forEach(function(el) { el.style.display = ""; });
    cachedPdfBlob = buildPdf(canvas).output("blob");
    var btn = document.getElementById("wa-share-btn");
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.lastChild.textContent = "Share via WhatsApp";
  }).catch(function() {
    document.querySelectorAll(".no-print").forEach(function(el) { el.style.display = ""; });
    var btn = document.getElementById("wa-share-btn");
    btn.disabled = false;
    btn.style.opacity = "1";
    btn.lastChild.textContent = "Share via WhatsApp";
  });
}
waitForLibs(function() { setTimeout(generatePdf, 200); });
function shareAsPdf() {
  if (!cachedPdfBlob) {
    if (typeof html2canvas !== "undefined" && typeof jspdf !== "undefined") { generatePdf(); }
    else { window.print(); }
    return;
  }
  var pdfFile = new File([cachedPdfBlob], pdfFileName, { type: "application/pdf" });
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
    navigator.share({ files: [pdfFile], title: pdfFileName }).catch(function() {});
  } else {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(cachedPdfBlob);
    a.download = pdfFileName;
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
  }
}
<\/script>
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
  const [buyerPaymentFilter, setBuyerPaymentFilter] = usePersistedState("txn-buyerPaymentFilter", "all");
  const [farmerPaymentFilter, setFarmerPaymentFilter] = usePersistedState("txn-farmerPaymentFilter", "all");
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const [totalWeight, setTotalWeight] = useState("");
  const [extraChargesFarmer, setExtraChargesFarmer] = useState("0");
  const [extraChargesBuyer, setExtraChargesBuyer] = useState("0");

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

  const { data: buyersWithDues = [] } = useQuery<(Buyer & { receivableDue: string; overallDue: string })[]>({
    queryKey: ["/api/buyers?withDues=true"],
  });

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
      const bidDates: Date[] = [
        ...g.pendingBids.map(b => new Date(b.createdAt)),
        ...g.completedTxns.map(t => new Date(t.bid.createdAt)),
      ];
      if (bidDates.length === 0) bidDates.push(new Date(g.lot.createdAt));
      const hasMatchingDate = bidDates.some(bd => {
        if (bd.getFullYear() !== parseInt(yearFilter)) return false;
        if (selectedMonths.length > 0 && !selectedMonths.includes(String(bd.getMonth() + 1))) return false;
        if (selectedDays.length > 0 && !selectedDays.includes(String(bd.getDate()))) return false;
        return true;
      });
      if (!hasMatchingDate) return false;
      if (buyerPaymentFilter !== "all") {
        const activeTxns = g.completedTxns.filter(t => !t.isReversed);
        if (activeTxns.length === 0) return false;
        const hasMatch = activeTxns.some(t => t.paymentStatus === buyerPaymentFilter);
        if (!hasMatch) return false;
      }
      if (farmerPaymentFilter !== "all") {
        const activeTxns = g.completedTxns.filter(t => !t.isReversed);
        if (activeTxns.length === 0) return false;
        const totalPayable = activeTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0);
        const totalPaid = activeTxns.reduce((s, t) => s + parseFloat(t.farmerPaidAmount || "0"), 0);
        const groupFarmerStatus = totalPaid >= totalPayable ? "paid" : totalPaid > 0 ? "partial" : "due";
        if (groupFarmerStatus !== farmerPaymentFilter) return false;
      }
      return true;
    });
  }, [unifiedGroups, cropFilter, yearFilter, selectedMonths, selectedDays, buyerPaymentFilter, farmerPaymentFilter]);

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
    setTotalWeight(tx.totalWeight || "");
    setExtraChargesFarmer(tx.extraChargesFarmer || "0");
    setExtraChargesBuyer(tx.extraChargesBuyer || "0");
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
    setExtraChargesFarmer("0");
    setExtraChargesBuyer("0");
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

  const tw = parseFloat(totalWeight) || 0;
  const bags = selectedBid?.numberOfBags || 0;
  const netWeight = tw > 0 ? (tw - bags).toFixed(2) : "0.00";
  const nw = parseFloat(netWeight);
  const price = parseFloat(selectedBid?.pricePerKg || "0");
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
  const originalBags = selectedBid?.lot.numberOfBags || 1;
  const actualBags = selectedBid?.lot.actualNumberOfBags ?? originalBags;
  const freightFarmerTotal = actualBags > 0 ? ((bags * originalBags) / actualBags) * vehicleBhadaRate : 0;

  const hammaliFarmerTotal = hammaliFarmerRate * bags;
  const hammaliBuyerTotal = hammaliBuyerRate * bags;
  const aadhatFarmer = (grossAmount * aadhatFarmerPct) / 100;
  const aadhatBuyer = (grossAmount * aadhatBuyerPct) / 100;
  const mandiFarmer = (grossAmount * mandiFarmerPct) / 100;
  const mandiBuyer = (grossAmount * mandiBuyerPct) / 100;

  const farmerDeductions = hammaliFarmerTotal + extraFarmer + aadhatFarmer + mandiFarmer + freightFarmerTotal;
  const buyerAdditions = hammaliBuyerTotal + extraBuyer + aadhatBuyer + mandiBuyer;

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
      extraChargesFarmer: extraFarmer.toFixed(2),
      extraChargesBuyer: extraBuyer.toFixed(2),
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
    const html = generateFarmerReceiptHtml(group.lot, group.farmer, activeTxns, user?.businessName, user?.businessAddress);
    openPrintWindow(html);
  };

  const handlePrintBuyerReceipt = (tx: TransactionWithDetails, group: UnifiedLotGroup) => {
    const html = generateBuyerReceiptHtml(group.lot, group.farmer, tx, user?.businessName, user?.businessAddress);
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
      "Hammali Farmer/Bag", "Hammali Buyer/Bag", "Extra Charges Farmer", "Extra Charges Buyer",
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
        tx.extraChargesFarmer || "0", tx.extraChargesBuyer || "0",
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
        <Select value={buyerPaymentFilter} onValueChange={setBuyerPaymentFilter}>
          <SelectTrigger className="w-[120px]" data-testid="select-buyer-payment-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Buyer: All</SelectItem>
            <SelectItem value="paid">Buyer: Paid</SelectItem>
            <SelectItem value="due">Buyer: Due</SelectItem>
            <SelectItem value="partial">Buyer: Partial</SelectItem>
          </SelectContent>
        </Select>
        <Select value={farmerPaymentFilter} onValueChange={setFarmerPaymentFilter}>
          <SelectTrigger className="w-[125px]" data-testid="select-farmer-payment-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Farmer: All</SelectItem>
            <SelectItem value="paid">Farmer: Paid</SelectItem>
            <SelectItem value="due">Farmer: Due</SelectItem>
            <SelectItem value="partial">Farmer: Partial</SelectItem>
          </SelectContent>
        </Select>
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
                  <p className="text-sm mb-0.5">{t("transactions.farmer")}: <strong>{group.farmer.name}</strong></p>
                  <p className="text-xs text-muted-foreground mb-2">{group.lot.actualNumberOfBags ?? group.lot.numberOfBags} {t("transactions.bagsTotal")}{(group.lot.actualNumberOfBags != null && group.lot.actualNumberOfBags !== group.lot.numberOfBags) ? ` (Orig: ${group.lot.numberOfBags})` : ""}</p>

                  {hasCompleted && (() => {
                    const farmerTotalPayable = activeTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0);
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
                    {group.completedTxns.map((tx) => (
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
                    <div className="flex justify-between"><span>Freight/Bhada:</span><span>₹{vehicleBhadaRate}/bag</span></div>
                  )}
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
                          totalWeight: "Total Weight",
                          numberOfBags: "Bags",
                          extraChargesFarmer: "Extra (Farmer)",
                          extraChargesBuyer: "Extra (Buyer)",
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
