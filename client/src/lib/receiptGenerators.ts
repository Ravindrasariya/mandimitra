import { format } from "date-fns";
import { letterheadHtml } from "./receiptUtils";
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
  billBookNumber: number;
  date: string;
  farmer: Farmer;
  lotGroups: UnifiedLotGroup[];
  allPendingBids: (Bid & { buyer: Buyer; lot: Lot; farmer: Farmer })[];
  allCompletedTxns: TransactionWithDetails[];
  totalBags: number;
};

export type BuyerLotEntry = { lot: Lot; tx: TransactionWithDetails };

export function generateFarmerReceiptHtml(sg: UnifiedSerialGroup, businessName?: string, businessAddress?: string, businessPhone?: string, receiptHeaderImage?: string | null) {
  const farmer = sg.farmer;
  const allTxns = sg.lotGroups.flatMap(lg => lg.completedTxns.filter(t => !t.isReversed));
  const rawDate = sg.date || format(new Date(), "yyyy-MM-dd");
  const firstLot = sg.lotGroups[0]?.lot;
  const cropHindi: Record<string, string> = { Potato: "आलू", Onion: "प्याज", Garlic: "लहसुन" };
  const escMap: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, c => escMap[c]);

  // Format date as DD/MM/YYYY
  const [yr, mo, dy] = rawDate.split("-");
  const dateDisplay = `${dy}/${mo}/${yr}`;

  // Aggregates -- single source of truth for both the charges table and the payment slip below it.
  const totalFreight = allTxns.reduce((s, t) => s + parseFloat(t.freightCharges || "0"), 0);
  const totalHammali = allTxns.reduce((s, t) => s + parseFloat(t.hammaliCharges || "0"), 0);
  const totalExtra = allTxns.reduce((s, t) => s + parseFloat(t.extraChargesFarmer || "0"), 0);
  const hammaliAndExtras = totalHammali + totalExtra;
  const totalShownDeductions = totalFreight + hammaliAndExtras;
  // Itemised breakdown shown on the slip. extraChargesFarmer is already the sum of these, so the
  // breakdown is presentational only and does not alter the totals above. Every component is
  // listed -- including "others" -- so the printed items always add up to कुल खर्च exactly.
  const totalTulai = allTxns.reduce((s, t) => s + parseFloat((t as any).extraTulaiFarmer || "0"), 0);
  const totalBharai = allTxns.reduce((s, t) => s + parseFloat((t as any).extraBharaiFarmer || "0"), 0);
  const totalKhadiKarai = allTxns.reduce((s, t) => s + parseFloat((t as any).extraKhadiKaraiFarmer || "0"), 0);
  const totalThelaBhada = allTxns.reduce((s, t) => s + parseFloat((t as any).extraThelaBhadaFarmer || "0"), 0);
  const totalOthers = allTxns.reduce((s, t) => s + parseFloat((t as any).extraOthersFarmer || "0"), 0);
  const farmerAdvance = parseFloat(firstLot?.farmerAdvanceAmount || "0");
  const totalGross = allTxns.reduce((s, t) => {
    const nw = parseFloat(t.netWeight || "0");
    const ppk = parseFloat(t.pricePerKg || "0");
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    return s + nw * (ppk + epk);
  }, 0);
  const netPayable = totalGross - totalShownDeductions;

  // Column rules only. The pre-printed bill book draws no horizontal lines through the body, and
  // without them the flex-stretched rows can differ slightly in height without it being visible --
  // which is what lets the खर्च column run alongside the produce rows instead of below them.
  const CELL = "padding:5px 7px;border-left:1px solid #444;border-right:1px solid #444;vertical-align:middle;";
  const ROW_H = "34px";
  const td = (content: string, style = "") =>
    `<td style="${CELL}${style}">${content}</td>`;
  const tdEmpty = () => `<td style="${CELL}">&nbsp;</td>`;

  // The five produce columns of each row. खर्च is filled in separately below: it runs down the side
  // of these rows rather than belonging to any one of them.
  const produceCells = allTxns.map(t => {
    const nw = parseFloat(t.netWeight || "0");
    const ppk = parseFloat(t.pricePerKg || "0");
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    const rate = ppk + epk;
    const ratePerQ = (rate * 100).toFixed(0);
    const gross = nw * rate;
    const crop = t.lot?.crop || firstLot?.crop || "";
    return `${td(cropHindi[crop] || crop, "text-align:center")}
      ${td(String(t.numberOfBags || 0), "text-align:center")}
      ${td(ratePerQ, "text-align:center")}
      ${td(nw.toFixed(2), "text-align:center")}
      ${td(gross.toFixed(2), "text-align:center")}`;
  });

  // Keep the ruled table a sensible size on light receipts so the space freed up for the
  // slip does not leave the produce area looking stranded.
  const MIN_PRODUCE_ROWS = 8;
  const blankCells = `${tdEmpty()}${tdEmpty()}${tdEmpty()}${tdEmpty()}${tdEmpty()}`;
  while (produceCells.length < MIN_PRODUCE_ROWS) produceCells.push(blankCells);

  // खर्च is written down the last column the way it is in the bill book: each label sits above its
  // amount, with the three groups spaced out over the produce rows. Always printed in full, zeros
  // included, so every receipt has the charges in the same place. Anchored to the last eight rows,
  // so टोटल खर्च lands directly above किसान को देय no matter how many produce rows there are.
  // Same size as the column headings above -- these read as headings for the amounts under them.
  const kLabel = (text: string) => `<div>${text}</div>`;
  const kValue = (amount: number, bold = false) =>
    `<div style="${bold ? "font-weight:bold;text-decoration:underline;" : ""}">&#8377;${amount.toFixed(2)}</div>`;
  const kharchSlots = [
    "", kLabel("भाड़ा"), kValue(totalFreight),
    "", kLabel("हम्माली तुलाई"), kValue(hammaliAndExtras),
    kLabel("टोटल खर्च"), kValue(totalShownDeductions, true),
  ];
  const firstSlotRow = produceCells.length - kharchSlots.length;

  const produceRows = produceCells.map((cells, i) => {
    const slot = kharchSlots[i - firstSlotRow] || "";
    return `<tr style="height:${ROW_H}">
      ${cells}
      <td style="${CELL}text-align:center">${slot || "&nbsp;"}</td>
    </tr>`;
  }).join("");

  // The one horizontal rule in the body: it closes off the produce rows above the total.
  const NET = `${CELL}border-top:1px solid #444;`;
  const netPayableRow = `<tr style="height:${ROW_H}">
    <td style="${NET}">&nbsp;</td><td style="${NET}">&nbsp;</td><td style="${NET}">&nbsp;</td><td style="${NET}">&nbsp;</td>
    <td style="${NET}text-align:right;font-weight:bold">किसान को देय</td>
    <td style="${NET}font-weight:bold;font-size:1.05em;text-align:center">&#8377;${netPayable.toFixed(2)}</td>
  </tr>`;

  const th = (label: string) =>
    `<th style="padding:6px 7px;border:1px solid #444;background:#f0f0f0;font-weight:bold;text-align:center">${label}</th>`;

  // ---- Farmer payment slip (tear-off copy handed to the farmer) ----
  const slipVillage = esc(farmer.village);
  const slipFarmerLine = `<span class="bold">${esc(farmer.name)}</span>${slipVillage ? `&nbsp;&ndash;&nbsp;${slipVillage}` : ""}`;

  const slipCrop = firstLot?.crop || "";
  const slipCropBags = slipCrop ? `(${esc(cropHindi[slipCrop] || slipCrop)} - ${sg.totalBags})` : "";

  // Only print charges that actually apply, so a receipt with no deductions
  // does not hand the farmer a row of zeroes.
  const chargeList = (entries: [string, number][], sep: string) =>
    entries.filter(([, v]) => v > 0).map(([l, v]) => `${l} <span class="bold">${v.toFixed(2)}</span>`).join(sep);
  const slipCharges = chargeList([
    ["हम्माली", totalHammali], ["तुलाई", totalTulai], ["भराई", totalBharai], ["खड़ी कराई", totalKhadiKarai],
  ], " &nbsp; ");
  const slipBhada = chargeList([
    ["ठेला भाड़ा", totalThelaBhada], ["अन्य", totalOthers], ["ट्रक भाड़ा", totalFreight],
  ], "&nbsp;&nbsp;&nbsp; ");

  const bankParts: string[] = [];
  if (farmer.bankAccountNumber) bankParts.push(`<span class="bold">खाता नं :</span> ${esc(farmer.bankAccountNumber)}`);
  if (farmer.ifscCode) bankParts.push(`<span class="bold">IFSC :</span> ${esc(farmer.ifscCode)}`);
  if (farmer.bankName) bankParts.push(`<span class="bold">बैंक :</span> ${esc(farmer.bankName)}`);
  const slipBankRow = bankParts.join(" &nbsp;&nbsp; ");

  const cutLine = `<div class="cut-line">&#9986; ${"&mdash;".repeat(57)}</div>`;

  const slipHtml = `<div class="receipt-copy slip-copy">
  <div class="header">
    ${businessName ? `<div class="firm-title">${esc(businessName)}</div>` : ""}
    ${businessAddress ? `<div class="firm-address" style="font-size:12px;color:#333">${esc(businessAddress)}</div>` : ""}
  </div>

  <table class="slip-table">
    <tr>
      <td style="width:40%"><span class="bold">बिल दिनांक</span> : ${dateDisplay}</td>
      <td style="width:22%;text-align:center"><span class="bold">बिल नंबर</span> : <span style="font-size:19.5px">${sg.serialNumber}</span></td>
      <td style="width:18%;text-align:center"><span class="bold">बुक क्र.</span> : ${sg.billBookNumber || 1}</td>
      <td style="width:20%;text-align:right"><span class="bold">दिनांक</span> : ${dateDisplay}</td>
    </tr>
    <tr>
      <td colspan="3">${slipFarmerLine}</td>
      <td style="text-align:right"><span class="bold">कुल योग :</span> ${totalGross.toFixed(2)}</td>
    </tr>
    <tr>
      <td colspan="3" style="padding-top:6px">
        <span class="bold">प्रवेश क्रमांक :</span>${slipCharges ? ` &nbsp;&nbsp; ${slipCharges}` : ""}
      </td>
      <td style="text-align:right; vertical-align:middle"><span class="bold">कुल खर्च :</span> ${totalShownDeductions.toFixed(2)}</td>
    </tr>
    <tr>
      <td colspan="3">${slipBhada}</td>
      <td style="text-align:right"><span class="bold">नेट रकम :</span> ${netPayable.toFixed(2)}</td>
    </tr>
  </table>

  ${slipCropBags ? `<div style="font-size:14px;font-weight:bold;margin-top:10px">${slipCropBags}</div>` : ""}
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:8px;font-size:13px">
    <div>${slipBankRow}</div>
    <div>विक्रेता /कृषक के भुगतान प्राप्ति के हस्ताक्षर</div>
  </div>
</div>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>किसान बुक</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: 'Noto Sans Devanagari', Arial, sans-serif; color: #111; }
table { width: 100%; border-collapse: collapse; }
/* Height target for the on-screen / share-as-PDF render. The produce table below is flex-sized and
   swallows any leftover space, so this figure -- not the row count -- is what decides where the cut
   line and slip land. Sized to leave real slack under the one-page raster limit. */
.page-wrapper { display: flex; flex-direction: column; min-height: 997px; }
.receipt-copy { width: 100%; padding: 12px 18px; }
.receipt-copy.main-copy { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.slip-copy { font-size: 13px; break-inside: avoid; page-break-inside: avoid; }
.produce-wrap { flex: 1; display: flex; flex-direction: column; min-height: 0; }
table.produce { flex: 1; border: 1px solid #444; }
.cut-line { text-align: center; padding: 2px 0; font-size: 10px; color: #555; border-top: 1.5px dashed #888; border-bottom: 1.5px dashed #888; margin: 4px 0; }
.header { text-align: center; margin-bottom: 8px; }
.firm-title { font-size: 18px; font-weight: bold; }
.firm-address { font-size: 13px; margin-bottom: 3px; }
.bold { font-weight: bold; }
.slip-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 6px 0; border: 1.5px solid #000; }
.slip-table td { padding: 6px 10px; vertical-align: top; }
.slip-table tr td { border-bottom: 1px solid #000; }
.slip-table tr:last-child td { border-bottom: none; }
@page { size: A4 portrait; margin: 0; }
@media print {
  body { margin: 5mm; }
  /* min-height, not height: a normal receipt pins the slip near the bottom, but an unusually long
     produce table grows the page instead of spilling over a fixed box and colliding with the slip.
     Deliberately short of a full sheet -- sizing this to exactly 100% left no room for rounding and
     tipped ordinary receipts onto a second page. */
  .page-wrapper { min-height: calc(100vh - 37mm); }
  .no-print { display: none !important; }
}
</style></head><body>

<div class="page-wrapper">

<div class="receipt-copy main-copy">
${receiptHeaderImage ? letterheadHtml(receiptHeaderImage) : `<div style="text-align:right;font-size:12px;margin-bottom:2px">${businessPhone ? `&#9742; ${esc(businessPhone)}` : "&nbsp;"}</div>

<div style="text-align:center;margin-bottom:10px">
  ${businessName ? `<div style="font-size:1.2em;font-weight:bold;text-decoration:underline">${esc(businessName)}</div>` : ""}
  ${businessAddress ? `<div style="font-size:0.9em;margin-top:2px;text-decoration:underline">${esc(businessAddress)}</div>` : ""}
  <div style="margin-top:5px;font-size:0.88em">आलू, प्याज, लहसुन आदि के कमीशन एजेंट एवं थोक विक्रेता</div>
</div>`}
<div style="text-align:center;font-weight:bold;font-size:1.05em;text-decoration:underline;margin-bottom:8px">किसान बुक</div>

<table style="border:none;margin-bottom:8px">
  <tr>
    <td style="border:none;padding:2px 0">बिल क्र : <strong>${sg.serialNumber}</strong></td>
    <td style="border:none;padding:2px 0;text-align:center">बुक क्र. : <strong>${sg.billBookNumber || 1}</strong></td>
    <td style="border:none;padding:2px 0;text-align:right">दिनांक : <strong>${dateDisplay}</strong></td>
  </tr>
  <tr>
    <td style="border:none;padding:2px 0">श्रीमान <strong>${esc(farmer.name)}</strong></td>
    <td style="border:none;padding:2px 0;text-align:right">पता : <strong>${esc(farmer.village) || "-"}</strong></td>
  </tr>
</table>

<div class="produce-wrap">
<table class="produce" style="margin-top:8px">
  <thead>
    <tr>
      ${th("माल की किस्म")}
      ${th("नग")}
      ${th("भाव")}
      ${th("वज़न")}
      ${th("रुपये")}
      ${th("खर्च")}
    </tr>
  </thead>
  <tbody>
    ${produceRows}
    ${netPayableRow}
  </tbody>
</table>
</div>

<div style="display:flex;align-items:flex-end;margin-top:36px;font-size:13px">
  <div style="flex:1"></div>
  <div style="flex:2;text-align:center">हमें सेवा का अवसर देने के लिए धन्यवाद।</div>
  <div style="flex:1;text-align:right">हस्ताक्षर</div>
</div>
</div>

${cutLine}

${slipHtml}

</div>

</body></html>`;
}

export function generateBuyerReceiptHtml(lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string, businessAddress?: string, hideAadhat?: boolean, receiptHeaderImage?: string | null) {
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
  const muddatAnyaBuyer = grossAmount * parseFloat(tx.muddatAnyaBuyerPercent || "0") / 100;

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
${receiptHeaderImage ? letterheadHtml(receiptHeaderImage) : `<div class="header">
${businessName ? `<h2 style="margin-bottom:2px">${businessName}</h2>` : ""}
${businessAddress ? `<p style="font-size:0.85em;color:#555;margin:2px 0">${businessAddress}</p>` : ""}
<h3 style="margin:8px 0 5px 0;font-size:1.1em">Buyer Receipt</h3>
</div>`}
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
${!hideAadhat && aadhatBuyer > 0 ? `<div class="summary-row"><span>Aadhat:</span><span>Rs.${aadhatBuyer.toFixed(2)}</span></div>` : ""}
${!hideAadhat && muddatAnyaBuyer > 0 ? `<div class="summary-row"><span>Muddat + Anya:</span><span>Rs.${muddatAnyaBuyer.toFixed(2)}</span></div>` : ""}
${!hideAadhat && mandiBuyer > 0 ? `<div class="summary-row"><span>Mandi (${tx.mandiBuyerPercent}%):</span><span>Rs.${mandiBuyer.toFixed(2)}</span></div>` : ""}
${!hideAadhat ? `<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${parseFloat(tx.totalReceivableFromBuyer || "0").toFixed(2)}</span></div>` : ""}
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
  const totalDeduction = hammaliAndExtras + totalThelaBhada + totalFreight + totalAadhat + totalMandi;
  const totalGross = allTxns.reduce((s, t) => s + parseFloat(t.netWeight || "0") * (parseFloat(t.pricePerKg || "0") + parseFloat((t as any).extraPerKgFarmer || "0")), 0);
  const totalNetWeight = allTxns.reduce((s, t) => s + parseFloat(t.netWeight || "0"), 0);
  const netPayable = totalGross - totalDeduction;

  const dataRows = allTxns.map(t => {
    const nw = parseFloat(t.netWeight || "0");
    const epk = parseFloat((t as any).extraPerKgFarmer || "0");
    const rate = parseFloat(t.pricePerKg || "0") + epk;
    const gross = nw * rate;
    const crop = t.lot?.crop || firstLot?.crop || "";
    return `<tr><td>${(cropLabel[crop] || crop)} Pkt</td><td>${t.numberOfBags || 0}</td><td>${nw.toFixed(2)}</td><td>${(rate * 100).toFixed(2)}</td><td>${gross.toFixed(2)}</td></tr>`;
  });
  const MIN_PRODUCE_ROWS = 6;
  const blankRowCount = Math.max(0, MIN_PRODUCE_ROWS - dataRows.length);
  const blankRow = `<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>`;
  const txnRowsHtml = dataRows.join("") + Array(blankRowCount).fill(blankRow).join("");

  const bankParts: string[] = [];
  if (farmer.bankAccountNumber) bankParts.push(`<span class="bold">खाता नं :</span> ${farmer.bankAccountNumber}`);
  if (farmer.ifscCode) bankParts.push(`<span class="bold">IFSC :</span> ${farmer.ifscCode}`);
  if (farmer.bankName) bankParts.push(`<span class="bold">बैंक :</span> ${farmer.bankName}`);
  const farmerBankRow = bankParts.length > 0 ? bankParts.join(" &nbsp;&nbsp; ") : "";

  const replacements: Record<string, string> = {
    "{{BUSINESS_NAME}}": businessName || "",
    "{{BUSINESS_ADDRESS}}": businessAddress || "",
    "{{BUSINESS_PHONE}}": businessPhone || "",
    "{{BUSINESS_LICENCE}}": businessLicenceNo || "",
    "{{BUSINESS_SHOP_NO}}": businessShopNo || "",
    "{{SERIAL_NUMBER}}": String(sg.serialNumber),
    "{{BILL_BOOK_NUMBER}}": String(sg.billBookNumber || 1),
    "{{DATE}}": sg.date || format(new Date(), "yyyy-MM-dd"),
    "{{FARMER_NAME}}": farmer.name,
    "{{FARMER_PHONE}}": farmer.phone || "",
    "{{FARMER_VILLAGE}}": farmer.village || "",
    "{{FARMER_TEHSIL}}": farmer.tehsil || "",
    "{{FARMER_DISTRICT}}": farmer.district || "",
    "{{FARMER_BANK_ACCOUNT}}": farmer.bankAccountNumber || "",
    "{{FARMER_IFSC}}": farmer.ifscCode || "",
    "{{FARMER_BANK_NAME}}": farmer.bankName || "",
    "{{FARMER_BANK_ROW}}": farmerBankRow,
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
    "{{CROP_BAGS_LABEL}}": `(${firstLot?.crop || ""} - ${sg.totalBags})`,
    "{{TXN_ROWS_HTML}}": txnRowsHtml,
  };
  return Object.entries(replacements).reduce((html, [token, val]) => html.split(token).join(val), tmpl);
}

export function applyBuyerTemplate(tmpl: string, lot: Lot, farmer: Farmer, tx: TransactionWithDetails, businessName?: string, businessAddress?: string, businessInitials?: string, businessPhone?: string, businessLicenceNo?: string, businessShopNo?: string, hideAadhat?: boolean): string {
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
    "{{AADHAT}}": hideAadhat ? "" : aadhatBuyer.toFixed(2),
    "{{AADHAT_PCT}}": hideAadhat ? "" : (tx.aadhatBuyerPercent || "0"),
    "{{MANDI_CHARGES}}": hideAadhat ? "" : mandiBuyer.toFixed(2),
    "{{MANDI_PCT}}": hideAadhat ? "" : (tx.mandiBuyerPercent || "0"),
    "{{TOTAL_RECEIVABLE}}": hideAadhat ? "" : parseFloat(tx.totalReceivableFromBuyer || "0").toFixed(2),
  };
  return Object.entries(replacements).reduce((html, [token, val]) => html.split(token).join(val), tmpl);
}

export function generateCombinedBuyerReceiptHtml(entries: BuyerLotEntry[], serialNumber: number, date: string, businessName?: string, businessAddress?: string, businessPhone?: string, hideAadhat?: boolean, receiptHeaderImage?: string | null): string {
  const firstTx = entries[0].tx;
  const crop = entries[0].lot.crop;
  const aadhatPct = parseFloat(firstTx.aadhatBuyerPercent || "0");
  const mandiPct = parseFloat(firstTx.mandiBuyerPercent || "0");
  const muddatAnyaPct = parseFloat(firstTx.muddatAnyaBuyerPercent || "0");

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
  const totalMuddatAnya = totalGross * muddatAnyaPct / 100;
  const grandTotal = totalGross + totalHammali + totalExtra + totalAadhat + totalMandi + totalMuddatAnya;

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
${receiptHeaderImage ? letterheadHtml(receiptHeaderImage) : `<div style="display:flex;justify-content:flex-end;font-size:12px;margin-bottom:1px">${businessPhone ? `&#9742; ${businessPhone}` : ""}</div>
<div class="header">
${businessName ? `<div style="font-weight:bold;font-size:1.05em;margin-bottom:1px">${businessName}</div>` : ""}
${businessAddress ? `<p style="font-size:0.82em;color:#555;margin:1px 0">${businessAddress}</p>` : ""}
<h3 style="margin:2px 0 3px 0;font-size:1.05em">Buyer Receipt</h3>
</div>`}
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
${!hideAadhat && totalAadhat > 0 ? `<div class="summary-row"><span>Aadhat:</span><span>Rs.${totalAadhat.toFixed(2)}</span></div>` : ""}
${!hideAadhat && totalMuddatAnya > 0 ? `<div class="summary-row"><span>Muddat + Anya:</span><span>Rs.${totalMuddatAnya.toFixed(2)}</span></div>` : ""}
${!hideAadhat && totalMandi > 0 ? `<div class="summary-row"><span>Mandi (${mandiPct}%):</span><span>Rs.${totalMandi.toFixed(2)}</span></div>` : ""}
${!hideAadhat ? `<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${grandTotal.toFixed(2)}</span></div>` : ""}
</div>
</body></html>`;
}

export function generateAllBuyerReceiptHtml(entries: BuyerLotEntry[], businessName?: string, businessAddress?: string, receiptSerialNumber?: number, hideAadhat?: boolean, businessPhone?: string, receiptHeaderImage?: string | null, billBookNumber?: number): string {
  if (entries.length === 0) return "";
  const firstTx = entries[0].tx;
  const buyer = firstTx.buyer;
  const aadhatPct = parseFloat(firstTx.aadhatBuyerPercent || "0");
  const mandiPct = parseFloat(firstTx.mandiBuyerPercent || "0");
  const muddatAnyaPct = parseFloat(firstTx.muddatAnyaBuyerPercent || "0");

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
  const totalMuddatAnya = totalGross * muddatAnyaPct / 100;
  const grandTotal = totalGross + totalHammali + totalExtra + totalAadhat + totalMandi + totalMuddatAnya;

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
${receiptHeaderImage ? letterheadHtml(receiptHeaderImage) : `<div style="display:flex;justify-content:flex-end;font-size:12px;margin-bottom:1px">${businessPhone ? `&#9742; ${businessPhone}` : ""}</div>
<div class="header">
${businessName ? `<div style="font-weight:bold;font-size:1.05em;margin-bottom:1px">${businessName}</div>` : ""}
${businessAddress ? `<p style="font-size:0.82em;color:#555;margin:1px 0">${businessAddress}</p>` : ""}
</div>`}
<div style="text-align:center;font-weight:bold;font-size:1.05em;text-decoration:underline;margin-bottom:4px">व्यापारी बुक</div>
<table class="info-table" style="margin-bottom:6px">
<tr><td>${receiptSerialNumber ? `<strong>Bill no.:</strong> ${receiptSerialNumber}` : ""}</td><td style="text-align:center">${billBookNumber ? `<strong>Bill Book No.:</strong> ${billBookNumber}` : ""}</td><td style="text-align:right"><strong>Licence No:</strong> ${buyer.licenceNo || "-"}</td></tr>
<tr><td><strong>Buyer:</strong> ${buyer.name}</td><td></td><td style="text-align:right"><strong>Date:</strong> ${format(new Date(), "dd/MM/yyyy")}</td></tr>
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
${!hideAadhat && totalAadhat > 0 ? `<div class="summary-row"><span>Aadhat:</span><span>Rs.${totalAadhat.toFixed(2)}</span></div>` : ""}
${!hideAadhat && totalMuddatAnya > 0 ? `<div class="summary-row"><span>Muddat + Anya:</span><span>Rs.${totalMuddatAnya.toFixed(2)}</span></div>` : ""}
${!hideAadhat && totalMandi > 0 ? `<div class="summary-row"><span>Mandi (${mandiPct}%):</span><span>Rs.${totalMandi.toFixed(2)}</span></div>` : ""}
${!hideAadhat ? `<div class="summary-row total"><span>Total Receivable from Buyer:</span><span>Rs.${grandTotal.toFixed(2)}</span></div>` : ""}
</div>
<div style="text-align:right;margin-top:32px;font-size:13px;color:#333">
  <div style="display:inline-block;border-top:1px solid #555;padding-top:4px;min-width:150px;text-align:center">Signature</div>
</div>
</body></html>`;
}

export function applyCombinedBuyerTemplate(tmpl: string, entries: BuyerLotEntry[], serialNumber: number, date: string, businessName?: string, businessAddress?: string, businessInitials?: string, businessPhone?: string, businessLicenceNo?: string, businessShopNo?: string, receiptSerialNumber?: number, farmer?: { name: string; village?: string | null }, hideAadhat?: boolean): string {
  const firstTx = entries[0].tx;
  const firstLot = entries[0].lot;
  const aadhatPct = parseFloat(firstTx.aadhatBuyerPercent || "0");
  const mandiPct = parseFloat(firstTx.mandiBuyerPercent || "0");
  const muddatAnyaPct = parseFloat(firstTx.muddatAnyaBuyerPercent || "0");

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
  const totalMuddatAnya = totalGross * muddatAnyaPct / 100;
  const grandTotal = totalGross + totalHammali + totalExtra + totalAadhat + totalMandi + totalMuddatAnya;
  const firstRatePerQuintal = rows[0].rate * 100;

  const txnRowsHtml = rows.map(r =>
    `<tr><td style="text-align:left">${r.crop}</td><td>${r.bags}</td><td>${r.nw.toFixed(2)}</td><td>${(r.rate * 100).toFixed(2)}</td><td>${r.gross.toFixed(2)}</td></tr>`
  ).join("");
  const txnRowsFullHtml = rows.map(r => {
    const rowAadhat = r.gross * aadhatPct / 100;
    const rowMuddatAnya = r.gross * muddatAnyaPct / 100;
    return `<tr><td style="text-align:left">${r.crop}</td><td>KHUD</td><td>${r.bags}</td><td>${r.nw.toFixed(2)}</td><td>${(r.rate * 100).toFixed(2)}</td><td>${r.gross.toFixed(2)}</td><td>${hideAadhat ? "" : rowAadhat.toFixed(2)}</td><td>${hideAadhat ? "" : rowMuddatAnya.toFixed(2)}</td></tr>`;
  }).join("");
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
    "{{FARMER_NAME}}": [...new Set(entries.map(e => (e.tx as any).farmer?.name).filter(Boolean))].join(", ") || farmer?.name || "",
    "{{FARMER_VILLAGE}}": [...new Set(entries.map(e => (e.tx as any).farmer?.village).filter(Boolean))].join(", ") || farmer?.village || "",
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
    "{{AADHAT}}": hideAadhat ? "" : totalAadhat.toFixed(2),
    "{{AADHAT_PCT}}": hideAadhat ? "" : String(aadhatPct),
    "{{MANDI_CHARGES}}": hideAadhat ? "" : totalMandi.toFixed(2),
    "{{MANDI_PCT}}": hideAadhat ? "" : String(mandiPct),
    "{{MUDDAT_ANYA}}": hideAadhat ? "" : totalMuddatAnya.toFixed(2),
    "{{MUDDAT_ANYA_PCT}}": hideAadhat ? "" : String(muddatAnyaPct),
    "{{TOTAL_RECEIVABLE}}": hideAadhat ? "" : grandTotal.toFixed(2),
    "{{TXN_ROWS_HTML}}": txnRowsHtml,
    "{{TXN_ROWS_FULL_HTML}}": txnRowsFullHtml,
    "{{SUMMARY_ROWS_HTML}}": summaryRowsHtml,
  };
  return Object.entries(replacements).reduce((html, [token, val]) => html.split(token).join(val), tmpl);
}

export type AadhatNakalBid = {
  buyerName: string;
  buyerId?: number;
  crop: string;
  srNumber: string;
  bags: number;
  netWeight: number;
  pricePerKg: number;
  grossAmount: number;
  paymentType: string;
  aadhatBuyerPercent: number;
  muddatAnyaBuyerPercent: number;
  mandiBuyerPercent: number;
  buyerReceivable: number;
  licenceNo: string;
  haste: string;
  farmerName: string;
  farmerPayable: number;
  hammaliFarmerAmount: number;
  tulaiFarmerAmount: number;
  bharaiFarmerAmount: number;
  khadiKaraiFarmerAmount: number;
  thelaBhadaFarmerAmount: number;
  freightAmount: number;
  savedAadhatCharges: number;
  savedMuddatAnyaCharges: number;
};

export function generateAadhatNakalHtml(
  bids: AadhatNakalBid[],
  businessName: string,
  dateStr: string,
): string {
  const [yr, mo, dy] = dateStr.split("-");
  const dateObj = new Date(parseInt(yr), parseInt(mo) - 1, parseInt(dy));
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const dayName = dayNames[dateObj.getDay()];
  const dateDisplay = `${dy}/${mo}/${yr}`;
  const fullDateDisplay = `${dayName}, ${parseInt(dy)} ${monthNames[parseInt(mo)-1]}, ${yr}`;

  const td = "padding:4px 6px;border:1px solid #555;vertical-align:top;font-size:11px;";
  const tdNb = "padding:4px 6px;border:none;vertical-align:top;font-size:11px;";

  type FarmerSR = {
    srNumber: string;
    bags: number;
    netWeight: number;
    farmerPayable: number;
  };
  type FarmerSection = {
    farmerName: string;
    srEntries: Map<string, FarmerSR>;
    totalBags: number;
    totalWeight: number;
    totalPayable: number;
  };

  const farmerMap = new Map<string, FarmerSection>();
  let expCommission = 0;
  let expMuddat = 0;
  let expHammali = 0;
  let expTulai = 0;
  let expBharai = 0;
  let expKhadiKarai = 0;
  let expThelaBhada = 0;
  let expMotorBhada = 0;

  for (const b of bids) {
    const fKey = b.farmerName.toLowerCase();
    if (!farmerMap.has(fKey)) {
      farmerMap.set(fKey, { farmerName: b.farmerName, srEntries: new Map(), totalBags: 0, totalWeight: 0, totalPayable: 0 });
    }
    const fs = farmerMap.get(fKey)!;
    const srKey = b.srNumber;
    if (!fs.srEntries.has(srKey)) {
      fs.srEntries.set(srKey, { srNumber: srKey, bags: 0, netWeight: 0, farmerPayable: 0 });
    }
    const sr = fs.srEntries.get(srKey)!;
    sr.bags += b.bags;
    sr.netWeight += b.netWeight;
    sr.farmerPayable += b.farmerPayable;
    fs.totalBags += b.bags;
    fs.totalWeight += b.netWeight;
    fs.totalPayable += b.farmerPayable;

    expCommission += b.savedAadhatCharges;
    expMuddat += b.savedMuddatAnyaCharges;
    expHammali += b.hammaliFarmerAmount;
    expTulai += b.tulaiFarmerAmount;
    expBharai += b.bharaiFarmerAmount;
    expKhadiKarai += b.khadiKaraiFarmerAmount;
    expThelaBhada += b.thelaBhadaFarmerAmount;
    expMotorBhada += b.freightAmount;
  }

  const farmers = Array.from(farmerMap.values()).sort((a, b) => a.farmerName.localeCompare(b.farmerName));

  let creditFarmerBags = 0;
  let creditFarmerWeight = 0;
  let creditFarmerPayable = 0;

  const farmerRows = farmers.map(fs => {
    creditFarmerBags += fs.totalBags;
    creditFarmerWeight += fs.totalWeight;
    creditFarmerPayable += fs.totalPayable;

    const srList = Array.from(fs.srEntries.values());
    const firstSR = srList[0];
    const remainingSRs = srList.slice(1).map(sr =>
      `<tr>
        <td style="${tdNb}font-weight:bold;">${fs.farmerName}</td>
        <td style="${tdNb}">BN #${sr.srNumber} Qty ${sr.bags} Bags Wght ${sr.netWeight.toFixed(2)}</td>
        <td style="${tdNb}text-align:right;">${sr.farmerPayable.toFixed(2)}</td>
      </tr>`
    ).join("");

    return `<tr>
      <td style="${tdNb}font-weight:bold;">${fs.farmerName}</td>
      <td style="${tdNb}">BN #${firstSR.srNumber} Qty ${firstSR.bags} Bags Wght ${firstSR.netWeight.toFixed(2)}</td>
      <td style="${tdNb}text-align:right;">${firstSR.farmerPayable.toFixed(2)}</td>
    </tr>
    ${remainingSRs}`;
  }).join("");

  const farmerGrandTotalRow = `<tr style="background:#e8e8e8;font-weight:bold;">
    <td style="${td}font-weight:bold;">Farmer Total</td>
    <td style="${td}font-weight:bold;">Qty: ${creditFarmerBags} Bags &nbsp;&nbsp;&nbsp; Weight: ${creditFarmerWeight.toFixed(2)}</td>
    <td style="${td}text-align:right;font-weight:bold;">${creditFarmerPayable.toFixed(2)}</td>
  </tr>`;

  const expTotal = expCommission + expMuddat + expHammali + expTulai + expBharai + expKhadiKarai + expThelaBhada + expMotorBhada;

  const expenseRows = `<tr>
      <td style="${tdNb}font-weight:bold;" colspan="3">EXPENSES</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Commission</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expCommission.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Muddat</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expMuddat.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Hammali</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expHammali.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Tulai</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expTulai.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Bharai</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expBharai.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Khadi Karai</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expKhadiKarai.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Thela Bhada</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expThelaBhada.toFixed(2)}</td>
    </tr>
    <tr>
      <td style="${tdNb}font-weight:bold;">Motor Bhada</td>
      <td style="${tdNb}">&nbsp;</td>
      <td style="${tdNb}text-align:right;">${expMotorBhada.toFixed(2)}</td>
    </tr>
    <tr style="background:#f0f0f0;font-weight:bold;">
      <td style="${td}">&nbsp;</td>
      <td style="${td}">Qty 0 &nbsp;&nbsp;&nbsp; Weight 0.0</td>
      <td style="${td}text-align:right;">${expTotal.toFixed(2)}</td>
    </tr>`;

  const creditTotal = creditFarmerPayable + expTotal;
  const creditTotalRow = `<tr style="border-top:3px double #333;font-weight:bold;font-size:12px;background:#e0e0e0;">
    <td style="${td}font-weight:bold;">Credit Total</td>
    <td style="${td}font-weight:bold;">Qty ${creditFarmerBags} Bags &nbsp;&nbsp;&nbsp; Weight ${creditFarmerWeight.toFixed(2)}</td>
    <td style="${td}text-align:right;font-weight:bold;">${creditTotal.toFixed(2)}</td>
  </tr>`;

  type DebitSection = {
    buyerLabel: string;
    sortKey: string;
    licenceNo: string;
    isCash: boolean;
    crop: string;
    rows: { srNumber: string; bags: number; netWeight: number; pricePerKg: number; grossAmount: number; buyerReceivable: number }[];
    totalBags: number;
    totalWeight: number;
    totalGross: number;
    totalReceivable: number;
    aadhatTotal: number;
    muddatAnyaTotal: number;
    srNumbers: string[];
  };

  const sectionMap = new Map<string, DebitSection>();
  for (const b of bids) {
    const isCash = b.paymentType === "Cash";
    const displayName = isCash ? `${b.buyerName} (Cash)` : b.buyerName;
    const key = `${b.buyerName.toLowerCase()}__${b.crop}__${isCash ? "cash" : "credit"}`;
    if (!sectionMap.has(key)) {
      sectionMap.set(key, {
        buyerLabel: displayName,
        sortKey: b.buyerName.toLowerCase(),
        licenceNo: isCash ? "" : (b.licenceNo || ""),
        isCash,
        crop: b.crop,
        rows: [],
        totalBags: 0,
        totalWeight: 0,
        totalGross: 0,
        totalReceivable: 0,
        aadhatTotal: 0,
        muddatAnyaTotal: 0,
        srNumbers: [],
      });
    }
    const sec = sectionMap.get(key)!;
    sec.rows.push({ srNumber: b.srNumber, bags: b.bags, netWeight: b.netWeight, pricePerKg: b.pricePerKg, grossAmount: b.grossAmount, buyerReceivable: b.buyerReceivable });
    sec.totalBags += b.bags;
    sec.totalWeight += b.netWeight;
    sec.totalGross += b.grossAmount;
    sec.totalReceivable += b.buyerReceivable;
    sec.aadhatTotal += (b.grossAmount * b.aadhatBuyerPercent) / 100;
    sec.muddatAnyaTotal += (b.grossAmount * (b.muddatAnyaBuyerPercent + b.mandiBuyerPercent)) / 100;
    if (!sec.srNumbers.includes(b.srNumber)) sec.srNumbers.push(b.srNumber);
  }

  const sections = Array.from(sectionMap.values()).sort((a, b) => {
    if (a.isCash !== b.isCash) return a.isCash ? 1 : -1;
    return a.sortKey.localeCompare(b.sortKey) || a.crop.localeCompare(b.crop);
  });

  let grandTotalBags = 0;
  let grandTotalWeight = 0;
  let grandTotalReceivable = 0;

  const sectionRows = sections.map(sec => {
    grandTotalBags += sec.totalBags;
    grandTotalWeight += sec.totalWeight;
    grandTotalReceivable += sec.totalReceivable;

    const headerLabel = sec.licenceNo
      ? `${sec.buyerLabel} (LN- ${sec.licenceNo})`
      : `${sec.buyerLabel} (LN- )`;

    const firstRow = sec.rows[0];
    const remainingRows = sec.rows.slice(1).map(r =>
      `<tr>
        <td style="${tdNb}">&nbsp;</td>
        <td style="${tdNb}">${sec.crop} - ${r.bags} Bags x ${r.netWeight.toFixed(2)} x ${r.pricePerKg.toFixed(2)}</td>
        <td style="${tdNb}text-align:right;">${r.buyerReceivable.toFixed(2)}</td>
      </tr>`
    ).join("");

    const chargeRows = `<tr>
        <td style="${tdNb}">&nbsp;</td>
        <td style="${tdNb}">Add Aadhat</td>
        <td style="${tdNb}text-align:right;">${sec.aadhatTotal.toFixed(2)}</td>
      </tr>
      ${sec.muddatAnyaTotal > 0 ? `<tr>
        <td style="${tdNb}">&nbsp;</td>
        <td style="${tdNb}">Add Muddat + Anya</td>
        <td style="${tdNb}text-align:right;">${sec.muddatAnyaTotal.toFixed(2)}</td>
      </tr>` : ""}`;

    const totalRow = `<tr style="background:#f0f0f0;font-weight:bold;">
      <td style="${td}">Total</td>
      <td style="${td}">Qty: ${sec.totalBags} Bags &nbsp;&nbsp;&nbsp; Weight: ${sec.totalWeight.toFixed(2)}</td>
      <td style="${td}text-align:right;">${sec.totalReceivable.toFixed(2)}</td>
    </tr>`;

    return `<tr>
      <td style="${tdNb}font-weight:bold;">${headerLabel}</td>
      <td style="${tdNb}">${sec.crop} - ${firstRow.bags} Bags x ${firstRow.netWeight.toFixed(2)} x ${firstRow.pricePerKg.toFixed(2)}</td>
      <td style="${tdNb}text-align:right;">${firstRow.buyerReceivable.toFixed(2)}</td>
    </tr>
    ${remainingRows}
    ${chargeRows}
    ${totalRow}`;
  }).join("");

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Aadhat Nakal</title>
<style>
@page { size: A4 portrait; margin: 10mm 10mm 15mm 10mm; }
body { font-family: Arial, sans-serif; margin: 10px 15px; color: #111; font-size: 11px; }
table { width: 100%; border-collapse: collapse; }
@media print { body { margin: 6mm; } .no-print { display: none !important; } }
</style></head><body>
<div style="text-align:center;margin-bottom:10px;">
  <div style="font-size:16px;font-weight:bold;text-decoration:underline;">${businessName}</div>
</div>
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;font-size:11px;">
  <div>Date : ${fullDateDisplay}</div>
  <div>(${dateDisplay})</div>
  <div style="font-weight:bold;">AADHAT NAKAL</div>
  <div>Page 1 of Total</div>
</div>

<table>
  <thead>
    <tr style="background:#e8e8e8;">
      <th style="${td}text-align:left;font-weight:bold;width:30%;">Particulars</th>
      <th style="${td}text-align:left;font-weight:bold;width:45%;">Remarks</th>
      <th style="${td}text-align:right;font-weight:bold;width:25%;">Amount</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="${tdNb}font-weight:bold;" colspan="3">BILLS (FARMERS/GENERAL CREDITORS)-Baaki</td>
    </tr>
    ${farmerRows}
    ${farmerGrandTotalRow}
    ${expenseRows}
    ${creditTotalRow}
    ${sectionRows}
    <tr style="border-top:3px double #333;font-weight:bold;font-size:12px;background:#e0e0e0;">
      <td style="${td}font-weight:bold;">Debit Total</td>
      <td style="${td}font-weight:bold;">Total Qty: ${grandTotalBags} Bags &nbsp;&nbsp;&nbsp; Total Weight: ${grandTotalWeight.toFixed(2)}</td>
      <td style="${td}text-align:right;font-weight:bold;">${grandTotalReceivable.toFixed(2)}</td>
    </tr>
  </tbody>
</table>
</body></html>`;
}
