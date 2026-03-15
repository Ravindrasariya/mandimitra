import { format } from "date-fns";
import type { Bid, Buyer, Lot, Farmer, Transaction } from "@shared/schema";

export type TransactionWithDetails = Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid };

export type UnifiedLotGroup = {
  lotId: string;
  lot: Lot;
  farmer: Farmer;
  pendingBids: (Bid & { buyer: Buyer; lot: Lot; farmer: Farmer })[];
  completedTxns: TransactionWithDetails[];
};

export type UnifiedSerialGroup = {
  serialNumber: number;
  date: string;
  farmer: Farmer;
  lotGroups: UnifiedLotGroup[];
  allPendingBids: (Bid & { buyer: Buyer; lot: Lot; farmer: Farmer })[];
  allCompletedTxns: TransactionWithDetails[];
  totalBags: number;
};

export type BuyerLotEntry = { lot: Lot; tx: TransactionWithDetails };

export function generateFarmerReceiptHtml(sg: UnifiedSerialGroup, businessName?: string, businessAddress?: string) {
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

export function generateBuyerReceiptHtml(lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string, businessAddress?: string) {
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
<tr><td><strong>Buyer:</strong> ${tx.buyer.name}</td><td style="text-align:right"><strong>Licence No:</strong> ${tx.buyer.licenceNo || "-"}</td></tr>
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

export function applyFarmerTemplate(tmpl: string, sg: UnifiedSerialGroup, businessName?: string, businessAddress?: string, businessPhone?: string, businessLicenceNo?: string, businessShopNo?: string): string {
  const farmer = sg.farmer;
  const allTxns = sg.lotGroups.flatMap(lg => lg.completedTxns.filter(t => !t.isReversed));
  const firstLot = sg.lotGroups[0]?.lot;
  const cropLabel: Record<string, string> = { Potato: "आलू / Potato", Onion: "प्याज / Onion", Garlic: "लहसुन / Garlic" };

  const totalHammali = allTxns.reduce((s, t) => s + parseFloat(t.hammaliCharges || "0"), 0);
  const totalExtraCharges = allTxns.reduce((s, t) => s + parseFloat(t.extraChargesFarmer || "0"), 0);
  const totalTulai = allTxns.reduce((s, t) => s + parseFloat((t as any).extraTulaiFarmer || "0"), 0);
  const totalBharai = allTxns.reduce((s, t) => s + parseFloat((t as any).extraBharaiFarmer || "0"), 0);
  const totalKhadiKarai = allTxns.reduce((s, t) => s + parseFloat((t as any).extraKhadiKaraiFarmer || "0"), 0);
  const totalThelaBhada = allTxns.reduce((s, t) => s + parseFloat((t as any).extraThelaBhadaFarmer || "0"), 0);
  const totalFreight = allTxns.reduce((s, t) => s + parseFloat(t.freightCharges || "0"), 0);
  const hammaliAndExtras = totalHammali + totalTulai + totalBharai + totalKhadiKarai;
  const totalAadhat = allTxns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + parseFloat((t as any).extraPerKgFarmer || "0"));
    return s + gross * parseFloat(t.aadhatFarmerPercent || "0") / 100;
  }, 0);
  const totalMandi = allTxns.reduce((s, t) => {
    const gross = parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + parseFloat((t as any).extraPerKgFarmer || "0"));
    return s + gross * parseFloat(t.mandiFarmerPercent || "0") / 100;
  }, 0);
  const farmerAdvance = parseFloat(firstLot?.farmerAdvanceAmount || "0");
  const totalDeduction = hammaliAndExtras + totalThelaBhada + totalFreight + totalAadhat + totalMandi + farmerAdvance;
  const totalGross = allTxns.reduce((s, t) => s + parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + parseFloat((t as any).extraPerKgFarmer || "0")), 0);
  const totalNetWeight = allTxns.reduce((s, t) => s + parseFloat(t.netWeight || "0"), 0);
  const netPayable = allTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0) - farmerAdvance;

  const txnRowsHtml = allTxns.map(t => {
    const nw = parseFloat(t.netWeight || "0");
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    const rate = parseFloat(t.pricePerKg || "0") + epk;
    const gross = nw * rate;
    const crop = t.lot?.crop || firstLot?.crop || "";
    return `<tr><td>${cropLabel[crop] || crop}</td><td>${t.numberOfBags || 0}</td><td>${nw.toFixed(2)}</td><td>${(rate * 100).toFixed(2)}</td><td>${gross.toFixed(2)}</td></tr>`;
  }).join("");

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": businessName || "",
    "{{BUSINESS_ADDRESS}}": businessAddress || "",
    "{{BUSINESS_PHONE}}": businessPhone || "",
    "{{BUSINESS_LICENCE}}": businessLicenceNo || "",
    "{{BUSINESS_SHOP_NO}}": businessShopNo || "",
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
    "{{TULAI}}": totalTulai.toFixed(2),
    "{{BHARAI}}": totalBharai.toFixed(2),
    "{{KHADI_KARAI}}": totalKhadiKarai.toFixed(2),
    "{{THELA_BHADA}}": totalThelaBhada.toFixed(2),
    "{{HAMMALI_AND_EXTRAS}}": hammaliAndExtras.toFixed(2),
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

export function applyBuyerTemplate(tmpl: string, lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string, businessAddress?: string, businessInitials?: string, businessPhone?: string, businessLicenceNo?: string, businessShopNo?: string): string {
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
    "{{LOT_ID}}": "",
    "{{SERIAL_NUMBER}}": String(lot.serialNumber),
    "{{DATE}}": tx.date || format(new Date(), "yyyy-MM-dd"),
    "{{BUYER_NAME}}": tx.buyer.name,
    "{{BUYER_CODE}}": tx.buyer.licenceNo || "",
    "{{FARMER_NAME}}": farmer.name,
    "{{FARMER_VILLAGE}}": farmer.village || "",
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

export function generateCombinedBuyerReceiptHtml(entries: BuyerLotEntry[], serialNumber: number, date: string, businessName?: string, businessAddress?: string, businessPhone?: string): string {
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
<style>body{font-family:Arial,sans-serif;margin:8px 14px;color:#333}
table{width:100%;border-collapse:collapse;margin:6px 0}
.header{text-align:center;margin-bottom:4px}
.info-table td{padding:2px 6px}
.summary{margin-top:8px;border-top:2px solid #333;padding-top:6px}
.summary-row{display:flex;justify-content:space-between;padding:2px 0}
.total{font-weight:bold;font-size:1.1em;color:#dc2626;border-top:2px solid #333;padding-top:6px;margin-top:6px}
th{padding:6px;border:1px solid #ccc;background:#f5f5f5;text-align:right}
th:first-child{text-align:left}
.totals-row td{font-weight:bold;background:#f0f0f0;padding:5px;border:1px solid #ccc}
@media print{body{margin:6mm}.no-print{display:none!important}}
</style></head><body>
<div style="display:flex;justify-content:flex-end;font-size:12px;margin-bottom:1px">${businessPhone ? `&#9742; ${businessPhone}` : ""}</div>
<div class="header">
${businessName ? `<div style="font-weight:bold;font-size:1.05em;margin-bottom:1px">${businessName}</div>` : ""}
${businessAddress ? `<p style="font-size:0.82em;color:#555;margin:1px 0">${businessAddress}</p>` : ""}
<h3 style="margin:2px 0 3px 0;font-size:1.05em">Buyer Receipt</h3>
</div>
<table class="info-table" style="margin-bottom:6px">
<tr><td><strong>SR #:</strong> ${serialNumber}</td><td style="text-align:right"><strong>Licence No:</strong> ${firstTx.buyer.licenceNo || "-"}</td></tr>
<tr><td><strong>Buyer:</strong> ${firstTx.buyer.name}</td><td style="text-align:right"><strong>Date:</strong> ${date}</td></tr>
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
</body></html>`;
}

export function generateAllBuyerReceiptHtml(entries: BuyerLotEntry[], businessName?: string, businessAddress?: string, receiptSerialNumber?: number, hideAadhat?: boolean, businessPhone?: string): string {
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
    return { srNo: (lot as any).serialNumber, crop: lot.crop, bags, nw, rate, gross, hammaliBuyerPerBag: parseFloat(tx.hammaliBuyerPerBag || "0"), extra: parseFloat(tx.extraChargesBuyer || "0") };
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
<style>body{font-family:Arial,sans-serif;margin:8px 14px;color:#333}
table{width:100%;border-collapse:collapse;margin:6px 0}
.header{text-align:center;margin-bottom:4px}
.info-table td{padding:2px 6px}
.summary{margin-top:8px;border-top:2px solid #333;padding-top:6px}
.summary-row{display:flex;justify-content:space-between;padding:2px 0}
.total{font-weight:bold;font-size:1.1em;color:#dc2626;border-top:2px solid #333;padding-top:6px;margin-top:6px}
th{padding:6px;border:1px solid #ccc;background:#f5f5f5;text-align:right}
th:first-child{text-align:left}
.totals-row td{font-weight:bold;background:#f0f0f0;padding:5px;border:1px solid #ccc}
@media print{body{margin:6mm}.no-print{display:none!important}}
</style></head><body>
<div style="display:flex;justify-content:flex-end;font-size:12px;margin-bottom:1px">${businessPhone ? `&#9742; ${businessPhone}` : ""}</div>
<div class="header">
${businessName ? `<div style="font-weight:bold;font-size:1.05em;margin-bottom:1px">${businessName}</div>` : ""}
${businessAddress ? `<p style="font-size:0.82em;color:#555;margin:1px 0">${businessAddress}</p>` : ""}
<h3 style="margin:2px 0 3px 0;font-size:1.05em">Buyer Receipt</h3>
</div>
<table class="info-table" style="margin-bottom:6px">
<tr><td>${receiptSerialNumber ? `<strong>Bill no.:</strong> ${receiptSerialNumber}` : ""}</td><td style="text-align:right"><strong>Licence No:</strong> ${buyer.licenceNo || "-"}</td></tr>
<tr><td><strong>Buyer:</strong> ${buyer.name}</td><td style="text-align:right"><strong>Date:</strong> ${format(new Date(), "dd/MM/yyyy")}</td></tr>
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
${!hideAadhat && totalAadhat > 0 ? `<div class="summary-row"><span>Aadhat (${aadhatPct}%):</span><span>Rs.${totalAadhat.toFixed(2)}</span></div>` : ""}
${!hideAadhat && totalMandi > 0 ? `<div class="summary-row"><span>Mandi (${mandiPct}%):</span><span>Rs.${totalMandi.toFixed(2)}</span></div>` : ""}
${!hideAadhat ? `<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${grandTotal.toFixed(2)}</span></div>` : ""}
</div>
<div style="text-align:right;margin-top:32px;font-size:13px;color:#333">
  <div style="display:inline-block;border-top:1px solid #555;padding-top:4px;min-width:150px;text-align:center">Signature</div>
</div>
</body></html>`;
}

export function applyCombinedBuyerTemplate(tmpl: string, entries: BuyerLotEntry[], serialNumber: number, date: string, businessName?: string, businessAddress?: string, businessInitials?: string, businessPhone?: string, businessLicenceNo?: string, businessShopNo?: string, receiptSerialNumber?: number): string {
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
    "{{RECEIPT_SERIAL}}": receiptSerialNumber ? String(receiptSerialNumber) : "",
    "{{DATE}}": date,
    "{{BUYER_NAME}}": firstTx.buyer.name,
    "{{BUYER_CODE}}": firstTx.buyer.licenceNo || "",
    "{{FARMER_NAME}}": "",
    "{{FARMER_VILLAGE}}": "",
    "{{CROP}}": firstLot.crop,
    "{{SIZE}}": firstLot.size || "",
    "{{LOT_ID}}": "",
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
