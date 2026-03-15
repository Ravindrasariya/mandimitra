import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Plus, Trash2, ChevronDown, ChevronRight, Truck, User,
  AlertTriangle, Scale, Wheat, ChevronsUpDown, X, Calculator,
} from "lucide-react";
import { format } from "date-fns";
import { CROPS, SIZES } from "@shared/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type ChargeSettings = {
  mandiCommissionFarmerPercent: string;
  mandiCommissionBuyerPercent: string;
  aadhatCommissionFarmerPercent: string;
  aadhatCommissionBuyerPercent: string;
  hammaliFarmerPerBag: string;
  hammaliBuyerPerBag: string;
};

const DEFAULT_CS: ChargeSettings = {
  mandiCommissionFarmerPercent: "0",
  mandiCommissionBuyerPercent: "1",
  aadhatCommissionFarmerPercent: "0",
  aadhatCommissionBuyerPercent: "2",
  hammaliFarmerPerBag: "0",
  hammaliBuyerPerBag: "0",
};

type TxnState = {
  netWeightInput: string;
  showWeightCalc: boolean;
  sampleWeights: string[];
  extraChargesFarmer: string;
  extraChargesBuyer: string;
  extraPerKgFarmer: string;
  extraPerKgBuyer: string;
  showExtraBreakdown: boolean;
  extraTulai: string;
  extraBharai: string;
  extraKhadiKarai: string;
  extraThelaBhada: string;
  extraOthers: string;
};

const emptyTxn = (): TxnState => ({
  netWeightInput: "",
  showWeightCalc: false,
  sampleWeights: ["", "", ""],
  extraChargesFarmer: "0",
  extraChargesBuyer: "0",
  extraPerKgFarmer: "0",
  extraPerKgBuyer: "0",
  showExtraBreakdown: false,
  extraTulai: "0",
  extraBharai: "0",
  extraKhadiKarai: "0",
  extraThelaBhada: "0",
  extraOthers: "0",
});

type BidRow = {
  buyerName: string;
  pricePerKg: string;
  numberOfBags: string;
  paymentType: string;
  advanceAmount: string;
  txnDate: string;
  txn: TxnState;
};

type LotRow = {
  id: string;
  lotOpen: boolean;
  numberOfBags: string;
  size: string;
  variety: string;
  bagMarka: string;
  bid: BidRow;
};

type CropGroup = { id: string; crop: string; srNumber: string; groupOpen: boolean; lots: LotRow[] };

type FarmerCard = {
  id: string;
  date: string;
  farmerName: string;
  farmerPhone: string;
  village: string;
  tehsil: string;
  district: string;
  vehicleNumber: string;
  driverName: string;
  vehicleBhadaRate: string;
  totalBagsInVehicle: string;
  freightType: string;
  advanceAmount: string;
  advanceMode: string;
  cropGroups: CropGroup[];
  cardOpen: boolean;
  farmerOpen: boolean;
  vehicleOpen: boolean;
};

// ─── Confirm delete dialog ────────────────────────────────────────────────────

function ConfirmDeleteDialog({ open, title, description, onConfirm, onCancel }: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
          >
            Yes, Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 8);

const emptyBid = (date?: string): BidRow => ({
  buyerName: "",
  pricePerKg: "",
  numberOfBags: "",
  paymentType: "Credit",
  advanceAmount: "500",
  txnDate: date || format(new Date(), "yyyy-MM-dd"),
  txn: emptyTxn(),
});

const emptyLot = (date?: string): LotRow => ({
  id: uid(),
  lotOpen: true,
  numberOfBags: "",
  size: "None",
  variety: "",
  bagMarka: "",
  bid: emptyBid(date),
});

const hasLotUserData = (lot: LotRow): boolean =>
  [lot.numberOfBags, lot.variety, lot.bagMarka,
    lot.bid.buyerName, lot.bid.pricePerKg, lot.bid.numberOfBags,
    lot.bid.txn.netWeight, lot.bid.txn.calcWeight,
  ].some(v => (v ?? "").trim() !== "" && (v ?? "").trim() !== "0");

const emptyCard = (): FarmerCard => ({
  id: uid(),
  date: format(new Date(), "yyyy-MM-dd"),
  farmerName: "",
  farmerPhone: "",
  village: "",
  tehsil: "",
  district: "",
  vehicleNumber: "",
  driverName: "",
  vehicleBhadaRate: "",
  totalBagsInVehicle: "",
  freightType: "",
  advanceAmount: "",
  advanceMode: "",
  cropGroups: [],
  cardOpen: true,
  farmerOpen: true,
  vehicleOpen: false,
});

const MOCK_BUYERS = ["Ramesh Traders", "Suresh & Sons", "Patel Bros", "Kishan Vyapari"];

const CROP_HEADER: Record<string, string> = {
  Potato: "bg-violet-100 border-violet-300",
  Onion: "bg-rose-100 border-rose-300",
  Garlic: "bg-amber-100 border-amber-300",
};
const CROP_COLORS: Record<string, string> = {
  Potato: "bg-violet-50 border-violet-300 text-violet-700",
  Onion: "bg-rose-50 border-rose-300 text-rose-700",
  Garlic: "bg-amber-50 border-amber-300 text-amber-700",
};

// ─── Lot totals calculator ─────────────────────────────────────────────────────

function calcLotTotals(lot: LotRow, cs: ChargeSettings, vehicleBhadaRate: number, totalBagsInVehicle: number) {
  const bags = parseInt(lot.bid.numberOfBags) || 0;
  const pricePerKg = parseFloat(lot.bid.pricePerKg) || 0;
  const txn = lot.bid.txn;
  const nw = parseFloat(txn.netWeightInput) || 0;
  const epkFarmer = parseFloat(txn.extraPerKgFarmer) || 0;
  const epkBuyer = parseFloat(txn.extraPerKgBuyer) || 0;
  const farmerGross = nw * (pricePerKg + epkFarmer);
  const buyerGross = nw * (pricePerKg + epkBuyer);
  const hfRate = parseFloat(cs.hammaliFarmerPerBag) || 0;
  const hbRate = parseFloat(cs.hammaliBuyerPerBag) || 0;
  const extraFarmer = parseFloat(txn.extraChargesFarmer) || 0;
  const extraBuyer = parseFloat(txn.extraChargesBuyer) || 0;
  const aadhatFPct = parseFloat(cs.aadhatCommissionFarmerPercent) || 0;
  const aadhatBPct = parseFloat(cs.aadhatCommissionBuyerPercent) || 0;
  const mandiFPct = parseFloat(cs.mandiCommissionFarmerPercent) || 0;
  const mandiBPct = parseFloat(cs.mandiCommissionBuyerPercent) || 0;
  const freight = totalBagsInVehicle > 0 ? (vehicleBhadaRate * bags) / totalBagsInVehicle : 0;
  const farmerDed = hfRate * bags + extraFarmer + (farmerGross * aadhatFPct) / 100 + (farmerGross * mandiFPct) / 100 + freight;
  const buyerAdd = hbRate * bags + extraBuyer + (buyerGross * aadhatBPct) / 100 + (buyerGross * mandiBPct) / 100;
  return {
    bags,
    farmerPayable: farmerGross - farmerDed,
    buyerReceivable: buyerGross + buyerAdd,
    hasData: nw > 0 && pricePerKg > 0,
  };
}

// ─── Section toggle ───────────────────────────────────────────────────────────

function SectionToggle({ open, onToggle, icon, label, count }: {
  open: boolean; onToggle: () => void; icon: React.ReactNode; label: string; count?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-left"
    >
      {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
      {icon}
      <span>{label}</span>
      {count && <Badge variant="secondary" className="ml-auto text-xs">{count}</Badge>}
    </button>
  );
}

// ─── Transaction / Charges section ───────────────────────────────────────────

function TxnSection({ txn, onChange, bags, pricePerKg, vehicleBhadaRate, totalBagsInVehicle, cs }: {
  txn: TxnState;
  onChange: (t: TxnState) => void;
  bags: number;
  pricePerKg: number;
  vehicleBhadaRate: number;
  totalBagsInVehicle: number;
  cs: ChargeSettings;
}) {
  const set = (field: keyof TxnState, val: any) => onChange({ ...txn, [field]: val });

  // ── Weight calc ──
  const updateSample = (idx: number, val: string) => {
    const updated = [...txn.sampleWeights];
    updated[idx] = val;
    const nzw = updated.map(s => parseFloat(s) || 0).filter(w => w > 0);
    const avg = nzw.length > 0 ? nzw.reduce((a, b) => a + b, 0) / nzw.length : 0;
    onChange({ ...txn, sampleWeights: updated, netWeightInput: avg > 0 ? (avg * bags).toFixed(2) : txn.netWeightInput });
  };
  const addSample = () => set("sampleWeights", [...txn.sampleWeights, ""]);
  const removeSample = (idx: number) => {
    if (txn.sampleWeights.length <= 1) return;
    const updated = txn.sampleWeights.filter((_, i) => i !== idx);
    const nzw = updated.map(s => parseFloat(s) || 0).filter(w => w > 0);
    const avg = nzw.length > 0 ? nzw.reduce((a, b) => a + b, 0) / nzw.length : 0;
    onChange({ ...txn, sampleWeights: updated, netWeightInput: avg > 0 ? (avg * bags).toFixed(2) : txn.netWeightInput });
  };
  const nonZero = txn.sampleWeights.map(s => parseFloat(s) || 0).filter(w => w > 0);
  const average = nonZero.length > 0 ? nonZero.reduce((a, b) => a + b, 0) / nonZero.length : 0;

  // ── Calculations ──
  const nw = parseFloat(txn.netWeightInput) || 0;
  const epkFarmer = parseFloat(txn.extraPerKgFarmer) || 0;
  const epkBuyer = parseFloat(txn.extraPerKgBuyer) || 0;
  const farmerGross = nw * (pricePerKg + epkFarmer);
  const buyerGross = nw * (pricePerKg + epkBuyer);

  const hammaliFarmerRate = parseFloat(cs.hammaliFarmerPerBag) || 0;
  const hammaliBuyerRate = parseFloat(cs.hammaliBuyerPerBag) || 0;
  const extraFarmer = parseFloat(txn.extraChargesFarmer) || 0;
  const extraBuyer = parseFloat(txn.extraChargesBuyer) || 0;
  const aadhatFarmerPct = parseFloat(cs.aadhatCommissionFarmerPercent) || 0;
  const aadhatBuyerPct = parseFloat(cs.aadhatCommissionBuyerPercent) || 0;
  const mandiFarmerPct = parseFloat(cs.mandiCommissionFarmerPercent) || 0;
  const mandiBuyerPct = parseFloat(cs.mandiCommissionBuyerPercent) || 0;

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

  const updateExtraBreakdown = (field: string, val: string) => {
    const next = {
      extraTulai: field === "extraTulai" ? val : txn.extraTulai,
      extraBharai: field === "extraBharai" ? val : txn.extraBharai,
      extraKhadiKarai: field === "extraKhadiKarai" ? val : txn.extraKhadiKarai,
      extraThelaBhada: field === "extraThelaBhada" ? val : txn.extraThelaBhada,
      extraOthers: field === "extraOthers" ? val : txn.extraOthers,
    };
    const sum = Object.values(next).reduce((a, v) => a + (parseFloat(v) || 0), 0);
    onChange({ ...txn, ...next, [field]: val, extraChargesFarmer: sum.toFixed(2) });
  };

  return (
    <div className="ml-8 mt-2 rounded-lg border border-green-200 bg-green-50/30 p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        <Scale className="w-3.5 h-3.5" />
        Weight & Charges
      </div>

      {/* ── Net Weight ── */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Net Weight (kg)</Label>
        <div className="flex gap-2">
          <Input
            data-testid="input-net-weight"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={txn.netWeightInput}
            onChange={e => set("netWeightInput", e.target.value)}
            onFocus={e => e.currentTarget.select()}
            className="h-8 text-sm flex-1"
          />
          <Button
            type="button"
            size="sm"
            variant={txn.showWeightCalc ? "default" : "outline"}
            className="h-8 whitespace-nowrap text-xs gap-1"
            onClick={() => set("showWeightCalc", !txn.showWeightCalc)}
            data-testid="button-calc-weight"
          >
            <Calculator className="w-3.5 h-3.5" /> Calc Wt
          </Button>
        </div>
        {bags > 0 && <p className="text-xs text-muted-foreground">Total — {bags} bags</p>}

        {/* ── Weight calculator ── */}
        {txn.showWeightCalc && (
          <div className="bg-muted/50 rounded-md p-2 space-y-2 mt-1" data-testid="weight-calculator">
            <p className="text-xs font-semibold text-muted-foreground">Sample Bag Weights (kg)</p>
            <div className="grid grid-cols-2 gap-2">
              {txn.sampleWeights.map((w, idx) => (
                <div key={idx} className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                    <Input
                      data-testid={`input-sample-weight-${idx}`}
                      type="text"
                      inputMode="decimal"
                      value={w}
                      onChange={e => updateSample(idx, e.target.value)}
                      onFocus={e => e.currentTarget.select()}
                      placeholder="0.00"
                      className="h-7 text-xs flex-1"
                    />
                    {txn.sampleWeights.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => removeSample(idx)}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  {(parseFloat(w) || 0) > 100 && (
                    <p className="text-xs text-orange-500 font-medium ml-6 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Over 100kg
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={addSample}>
              <Plus className="h-3 w-3 mr-1" /> Add Sample
            </Button>
            <div className="border-t pt-1 flex justify-between text-xs font-medium">
              <span>Average ({nonZero.length} samples):</span>
              <span>{average > 0 ? `${average.toFixed(2)} kg` : "—"}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Net Weight ({average.toFixed(2)} × {bags} bags):</span>
              <span>{average > 0 ? `${(average * bags).toFixed(2)} kg` : "—"}</span>
            </div>
          </div>
        )}
      </div>

      {nw > 0 && pricePerKg > 0 && (
        <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-1" data-testid="txn-bid-rate-header">
          <div className="flex justify-between">
            <span>Bid Rate:</span>
            <span className="font-medium">₹{pricePerKg.toFixed(2)}/kg</span>
          </div>
          {epkFarmer > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Farmer Rate ({pricePerKg.toFixed(2)} + {epkFarmer.toFixed(2)}):</span>
              <span className="font-medium">₹{(pricePerKg + epkFarmer).toFixed(2)}/kg</span>
            </div>
          )}
          {epkBuyer > 0 && (
            <div className="flex justify-between text-blue-600">
              <span>Buyer Rate ({pricePerKg.toFixed(2)} + {epkBuyer.toFixed(2)}):</span>
              <span className="font-medium">₹{(pricePerKg + epkBuyer).toFixed(2)}/kg</span>
            </div>
          )}
        </div>
      )}

      {/* ── Farmer + Buyer: charges & summary side-by-side ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" data-testid="charge-rates-display">
        {/* ── Farmer column ── */}
        <div className="bg-background rounded border border-border p-2 space-y-1">
          <p className="font-semibold text-muted-foreground">Farmer Charges</p>
          <div className="flex justify-between"><span>Aadhat:</span><span>{aadhatFarmerPct}%</span></div>
          <div className="flex justify-between"><span>Mandi:</span><span>{mandiFarmerPct}%</span></div>
          <div className="flex justify-between"><span>Hammali:</span><span>₹{hammaliFarmerRate}/bag</span></div>
          {freightFarmerTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>Freight (auto):</span><span>₹{freightFarmerTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs hover:text-foreground text-muted-foreground"
              onClick={() => set("showExtraBreakdown", !txn.showExtraBreakdown)}
            >
              {txn.showExtraBreakdown ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              Extra:
            </button>
            <Input
              data-testid="input-extra-charges-farmer"
              type="text" inputMode="decimal"
              value={txn.extraChargesFarmer}
              onChange={e => set("extraChargesFarmer", e.target.value)}
              onFocus={e => e.currentTarget.select()}
              className="w-16 h-6 text-xs text-right p-1"
            />
          </div>
          {txn.showExtraBreakdown && (
            <div className="ml-2 border-l-2 border-muted pl-2 space-y-1">
              {([
                ["Tulai", "extraTulai", txn.extraTulai],
                ["Bharai", "extraBharai", txn.extraBharai],
                ["Khadi Karai", "extraKhadiKarai", txn.extraKhadiKarai],
                ["Thela Bhada", "extraThelaBhada", txn.extraThelaBhada],
                ["Others", "extraOthers", txn.extraOthers],
              ] as [string, string, string][]).map(([label, field, val]) => (
                <div key={field} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{label}:</span>
                  <Input
                    data-testid={`input-${field}`}
                    type="text" inputMode="decimal"
                    value={val}
                    onChange={e => updateExtraBreakdown(field, e.target.value)}
                    onFocus={e => e.currentTarget.select()}
                    className="w-16 h-6 text-xs text-right p-1"
                  />
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between border-t pt-1 mt-1">
            <span className="font-semibold">Extra ₹/Kg:</span>
            <Input
              data-testid="input-extra-per-kg-farmer"
              type="text" inputMode="decimal"
              value={txn.extraPerKgFarmer}
              onChange={e => set("extraPerKgFarmer", e.target.value)}
              onFocus={e => e.currentTarget.select()}
              className="w-16 h-6 text-xs text-right p-1"
            />
          </div>

          {nw > 0 && pricePerKg > 0 && (
            <div className="border-t pt-1.5 mt-1.5 bg-green-50 dark:bg-green-950/30 rounded-md p-2 -mx-0.5 space-y-0.5">
              <div className="flex justify-between">
                <span>Gross ({nw.toFixed(0)} × ₹{(pricePerKg + epkFarmer).toFixed(2)}):</span>
                <span className="font-medium">₹{farmerGross.toFixed(2)}</span>
              </div>
              <p className="text-muted-foreground font-semibold mt-0.5">Deductions:</p>
              {hammaliFarmerRate > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Hammali ({bags}×₹{hammaliFarmerRate}):</span>
                  <span>-₹{hammaliFarmerTotal.toFixed(2)}</span>
                </div>
              )}
              {extraFarmer > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Extra:</span>
                  <span>-₹{extraFarmer.toFixed(2)}</span>
                </div>
              )}
              {aadhatFarmerPct > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Aadhat ({aadhatFarmerPct}%):</span>
                  <span>-₹{aadhatFarmer.toFixed(2)}</span>
                </div>
              )}
              {mandiFarmerPct > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Mandi ({mandiFarmerPct}%):</span>
                  <span>-₹{mandiFarmer.toFixed(2)}</span>
                </div>
              )}
              {freightFarmerTotal > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Freight:</span>
                  <span>-₹{freightFarmerTotal.toFixed(2)}</span>
                </div>
              )}
              {farmerDeductions === 0 && <div className="text-muted-foreground italic pl-2">No deductions</div>}
              <div className="flex justify-between font-bold text-green-700 border-t pt-1 mt-0.5">
                <span>Farmer Payable:</span>
                <span>₹{farmerPayable.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Buyer column ── */}
        <div className="bg-background rounded border border-border p-2 space-y-1">
          <p className="font-semibold text-muted-foreground">Buyer Charges</p>
          <div className="flex justify-between"><span>Aadhat:</span><span>{aadhatBuyerPct}%</span></div>
          <div className="flex justify-between"><span>Mandi:</span><span>{mandiBuyerPct}%</span></div>
          <div className="flex justify-between"><span>Hammali:</span><span>₹{hammaliBuyerRate}/bag</span></div>
          <div className="flex items-center justify-between">
            <span>Extra:</span>
            <Input
              data-testid="input-extra-charges-buyer"
              type="text" inputMode="decimal"
              value={txn.extraChargesBuyer}
              onChange={e => set("extraChargesBuyer", e.target.value)}
              onFocus={e => e.currentTarget.select()}
              className="w-16 h-6 text-xs text-right p-1"
            />
          </div>
          <div className="flex items-center justify-between border-t pt-1 mt-1">
            <span className="font-semibold">Extra ₹/Kg:</span>
            <Input
              data-testid="input-extra-per-kg-buyer"
              type="text" inputMode="decimal"
              value={txn.extraPerKgBuyer}
              onChange={e => set("extraPerKgBuyer", e.target.value)}
              onFocus={e => e.currentTarget.select()}
              className="w-16 h-6 text-xs text-right p-1"
            />
          </div>

          {nw > 0 && pricePerKg > 0 && (
            <div className="border-t pt-1.5 mt-1.5 bg-blue-50 dark:bg-blue-950/30 rounded-md p-2 -mx-0.5 space-y-0.5">
              <div className="flex justify-between">
                <span>Gross ({nw.toFixed(0)} × ₹{(pricePerKg + epkBuyer).toFixed(2)}):</span>
                <span className="font-medium">₹{buyerGross.toFixed(2)}</span>
              </div>
              <p className="text-muted-foreground font-semibold mt-0.5">Additions:</p>
              {hammaliBuyerRate > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Hammali ({bags}×₹{hammaliBuyerRate}):</span>
                  <span>+₹{hammaliBuyerTotal.toFixed(2)}</span>
                </div>
              )}
              {extraBuyer > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Extra:</span>
                  <span>+₹{extraBuyer.toFixed(2)}</span>
                </div>
              )}
              {aadhatBuyerPct > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Aadhat ({aadhatBuyerPct}%):</span>
                  <span>+₹{aadhatBuyer.toFixed(2)}</span>
                </div>
              )}
              {mandiBuyerPct > 0 && (
                <div className="flex justify-between text-muted-foreground pl-2">
                  <span>Mandi ({mandiBuyerPct}%):</span>
                  <span>+₹{mandiBuyer.toFixed(2)}</span>
                </div>
              )}
              {buyerAdditions === 0 && <div className="text-muted-foreground italic pl-2">No additions</div>}
              <div className="flex justify-between font-bold text-blue-700 border-t pt-1 mt-0.5">
                <span>Buyer Receivable:</span>
                <span>₹{buyerReceivable.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Bid section (row 2) ──────────────────────────────────────────────────────

function BidSection({ bid, onChange, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate }: {
  bid: BidRow;
  onChange: (b: BidRow) => void;
  vehicleBhadaRate: number;
  totalBagsInVehicle: number;
  cs: ChargeSettings;
  farmerDate: string;
}) {
  const isNewBuyer = bid.buyerName.trim().length > 0 && !MOCK_BUYERS.includes(bid.buyerName.trim());
  const bags = parseInt(bid.numberOfBags) || 0;
  const pricePerKg = parseFloat(bid.pricePerKg) || 0;

  return (
    <div className="ml-4 mt-2 rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 uppercase tracking-wide">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
          Bid & Transaction Details
        </div>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-muted-foreground whitespace-nowrap">Txn Date:</label>
          <input
            type="date"
            data-testid="input-txn-date"
            value={bid.txnDate || farmerDate}
            onChange={e => onChange({ ...bid, txnDate: e.target.value })}
            className="text-xs border border-border rounded px-2 py-1 bg-background h-7"
          />
          {bid.txnDate && bid.txnDate !== farmerDate && (
            <button
              type="button"
              onClick={() => onChange({ ...bid, txnDate: farmerDate })}
              className="text-xs text-muted-foreground hover:text-foreground underline whitespace-nowrap"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Buyer + Price + Bags + Payment */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-xs text-muted-foreground">Buyer</Label>
          <div className="relative">
            <Input
              data-testid="input-buyer-name"
              list="buyer-list"
              placeholder="Select or type buyer…"
              value={bid.buyerName}
              onChange={e => onChange({ ...bid, buyerName: e.target.value })}
              className="h-8 text-sm pr-7"
            />
            <datalist id="buyer-list">
              {MOCK_BUYERS.map(b => <option key={b} value={b} />)}
            </datalist>
            <ChevronsUpDown className="w-3.5 h-3.5 absolute right-2 top-2 text-muted-foreground pointer-events-none" />
          </div>
          {isNewBuyer && (
            <div className="flex items-center gap-1 mt-1 text-orange-600 text-xs">
              <AlertTriangle className="w-3 h-3" /> New buyer will be added
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Price / kg (₹)</Label>
          <Input
            data-testid="input-price-per-kg"
            type="number" placeholder="0.00"
            value={bid.pricePerKg}
            onChange={e => onChange({ ...bid, pricePerKg: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground"># Bags</Label>
          <Input
            data-testid="input-bid-bags"
            type="number" placeholder="0"
            value={bid.numberOfBags}
            onChange={e => onChange({ ...bid, numberOfBags: e.target.value })}
            className="h-8 text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Payment</Label>
          <Select value={bid.paymentType} onValueChange={v => onChange({ ...bid, paymentType: v })}>
            <SelectTrigger data-testid="select-payment-type" className="h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Credit">Credit</SelectItem>
              <SelectItem value="Cash">Cash</SelectItem>
              <SelectItem value="UPI">UPI</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {bid.paymentType === "Cash" && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-1.5">
          <span className="text-xs text-yellow-700 font-medium">Cash advance ₹</span>
          <Input
            data-testid="input-advance-amount"
            type="number"
            value={bid.advanceAmount}
            onChange={e => onChange({ ...bid, advanceAmount: e.target.value })}
            className="h-7 w-24 text-sm"
          />
        </div>
      )}

      {/* Row 3 — Weight + Charges + Calculations */}
      <TxnSection
        txn={bid.txn}
        onChange={txn => onChange({ ...bid, txn })}
        bags={bags}
        pricePerKg={pricePerKg}
        vehicleBhadaRate={vehicleBhadaRate}
        totalBagsInVehicle={totalBagsInVehicle}
        cs={cs}
      />
    </div>
  );
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

function LotCard({ lot, index, onChange, onRemove, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate }: {
  lot: LotRow; index: number;
  onChange: (l: LotRow) => void; onRemove: () => void;
  vehicleBhadaRate: number; totalBagsInVehicle: number;
  cs: ChargeSettings; farmerDate: string;
}) {
  const setField = (f: keyof Omit<LotRow, "id" | "bid" | "lotOpen">, v: string) => onChange({ ...lot, [f]: v });
  const totals = calcLotTotals(lot, cs, vehicleBhadaRate, totalBagsInVehicle);

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/30 hover:bg-muted/50 transition-colors border-b border-border"
        onClick={() => onChange({ ...lot, lotOpen: !lot.lotOpen })}
        data-testid={`button-toggle-lot-${index}`}
      >
        <div className="flex items-center gap-2">
          {lot.lotOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #{index + 1}</span>
          {!lot.lotOpen && (
            <div className="flex items-center gap-3 text-xs ml-1">
              <span className="text-muted-foreground">{totals.bags} bags</span>
              {totals.hasData && (
                <>
                  <span className="text-green-700 font-medium">Farmer: ₹{totals.farmerPayable.toFixed(0)}</span>
                  <span className="text-blue-700 font-medium">Buyer: ₹{totals.buyerReceivable.toFixed(0)}</span>
                </>
              )}
            </div>
          )}
        </div>
        <Button
          type="button" variant="ghost" size="sm"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </button>

      {lot.lotOpen && (
        <div className="p-3 space-y-3">
          {/* Row 1 — Lot info */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground"># Bags *</Label>
              <Input
                data-testid={`input-lot-bags-${index}`}
                type="number" placeholder="0"
                value={lot.numberOfBags}
                onChange={e => setField("numberOfBags", e.target.value.replace(/\D/g, ""))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Size</Label>
              <Select value={lot.size} onValueChange={v => setField("size", v)}>
                <SelectTrigger data-testid={`select-size-${index}`} className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">None</SelectItem>
                  {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Variety</Label>
              <Input
                data-testid={`input-variety-${index}`}
                placeholder="e.g. Lal Pyaaz"
                value={lot.variety}
                onChange={e => setField("variety", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Bag Marka</Label>
              <Input
                data-testid={`input-bag-marka-${index}`}
                placeholder="e.g. ABC"
                value={lot.bagMarka}
                onChange={e => setField("bagMarka", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          {/* Row 2+3 — Bid + Txn */}
          <BidSection
            bid={lot.bid}
            onChange={bid => onChange({ ...lot, bid })}
            vehicleBhadaRate={vehicleBhadaRate}
            totalBagsInVehicle={totalBagsInVehicle}
            cs={cs}
            farmerDate={farmerDate}
          />
        </div>
      )}
    </div>
  );
}

// ─── Crop group ───────────────────────────────────────────────────────────────

function CropGroupSection({ group, onChange, onRemove, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate, farmerName }: {
  group: CropGroup;
  onChange: (g: CropGroup) => void; onRemove: () => void;
  vehicleBhadaRate: number; totalBagsInVehicle: number;
  cs: ChargeSettings; farmerDate: string; farmerName: string;
}) {
  const [pendingDeleteLotIdx, setPendingDeleteLotIdx] = useState<number | null>(null);

  const headerCls = CROP_HEADER[group.crop] || "bg-muted border-border";
  const badgeCls = CROP_COLORS[group.crop] || "bg-muted border-border text-foreground";
  const farmerLabel = farmerName.trim() || "this farmer";

  const addLot = () => onChange({ ...group, lots: [...group.lots, emptyLot(farmerDate)] });
  const updateLot = (idx: number, lot: LotRow) =>
    onChange({ ...group, lots: group.lots.map((l, i) => (i === idx ? lot : l)) });
  const removeLot = (idx: number) => {
    if (group.lots.length === 1) return;           // can't remove the only lot — use group × instead
    const lot = group.lots[idx];
    if (hasLotUserData(lot)) { setPendingDeleteLotIdx(idx); return; }
    onChange({ ...group, lots: group.lots.filter((_, i) => i !== idx) });
  };
  const confirmDeleteLot = () => {
    if (pendingDeleteLotIdx !== null)
      onChange({ ...group, lots: group.lots.filter((_, i) => i !== pendingDeleteLotIdx) });
    setPendingDeleteLotIdx(null);
  };

  const allTotals = group.lots.map(l => calcLotTotals(l, cs, vehicleBhadaRate, totalBagsInVehicle));
  const totalBags = allTotals.reduce((s, t) => s + t.bags, 0);
  const totalFarmerPayable = allTotals.reduce((s, t) => s + t.farmerPayable, 0);
  const totalBuyerReceivable = allTotals.reduce((s, t) => s + t.buyerReceivable, 0);
  const hasAnyData = allTotals.some(t => t.hasData);

  return (
    <div className={`rounded-xl border-2 ${headerCls} overflow-hidden`}>
      {/* Header — click to collapse/expand */}
      <button
        type="button"
        className={`w-full flex items-center justify-between px-4 py-2 ${headerCls} border-b hover:brightness-95 transition-all`}
        onClick={() => onChange({ ...group, groupOpen: !group.groupOpen })}
        data-testid={`button-toggle-group-${group.crop.toLowerCase()}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {group.groupOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <Wheat className="w-4 h-4 shrink-0" />
          <span className="font-semibold text-sm">SR# {group.srNumber} {group.crop}</span>
          <Badge variant="outline" className={`text-xs ${badgeCls} shrink-0`}>
            {group.lots.length} lot{group.lots.length !== 1 ? "s" : ""}
          </Badge>
          {!group.groupOpen && (
            <div className="flex items-center gap-3 text-xs ml-1">
              <span className="text-muted-foreground">{totalBags} bags</span>
              {hasAnyData && (
                <>
                  <span className="text-green-700 font-medium">Farmer: ₹{totalFarmerPayable.toFixed(0)}</span>
                  <span className="text-blue-700 font-medium">Buyer: ₹{totalBuyerReceivable.toFixed(0)}</span>
                </>
              )}
            </div>
          )}
        </div>
        <Button
          type="button" variant="ghost" size="sm"
          onClick={e => { e.stopPropagation(); onRemove(); }}
          className="h-7 w-7 p-0 text-red-400 hover:text-red-600 shrink-0"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </button>

      {group.groupOpen && (
        <div className="p-3 space-y-3 bg-background/60">
          {group.lots.map((lot, idx) => (
            <LotCard
              key={lot.id} lot={lot} index={idx}
              onChange={lot => updateLot(idx, lot)}
              onRemove={() => removeLot(idx)}
              vehicleBhadaRate={vehicleBhadaRate}
              totalBagsInVehicle={totalBagsInVehicle}
              cs={cs}
              farmerDate={farmerDate}
            />
          ))}
          <Button type="button" variant="outline" size="sm" onClick={addLot} className="w-full h-8 text-xs gap-1.5 border-dashed">
            <Plus className="w-3.5 h-3.5" /> Add Lot under {group.crop}
          </Button>
        </div>
      )}

      <ConfirmDeleteDialog
        open={pendingDeleteLotIdx !== null}
        title="Delete this lot?"
        description={`Lot #${(pendingDeleteLotIdx ?? 0) + 1} of ${farmerLabel}'s ${group.crop} has data that will be permanently lost. This action cannot be undone.`}
        onConfirm={confirmDeleteLot}
        onCancel={() => setPendingDeleteLotIdx(null)}
      />
    </div>
  );
}

// ─── Farmer card ──────────────────────────────────────────────────────────────

function FarmerCardComp({ card, onChange, onRemove, cs }: {
  card: FarmerCard;
  onChange: (c: FarmerCard) => void; onRemove: () => void;
  cs: ChargeSettings;
}) {
  const [pendingDeleteGroupIdx, setPendingDeleteGroupIdx] = useState<number | null>(null);

  const set = (f: keyof FarmerCard, v: any) => onChange({ ...card, [f]: v });
  const usedCrops = card.cropGroups.map(g => g.crop);
  const availableCrops = CROPS.filter(c => !usedCrops.includes(c));

  const vehicleBhadaRate = parseFloat(card.vehicleBhadaRate) || 0;
  const totalBagsInVehicle = parseInt(card.totalBagsInVehicle) || 0;

  const addCrop = (crop: string) => onChange({
    ...card, cropGroups: [...card.cropGroups, { id: uid(), crop, srNumber: "XX", groupOpen: true, lots: [emptyLot(card.date)] }],
  });
  const updateGroup = (idx: number, g: CropGroup) =>
    onChange({ ...card, cropGroups: card.cropGroups.map((gg, i) => (i === idx ? g : gg)) });
  const removeGroup = (idx: number) => {
    const group = card.cropGroups[idx];
    const hasData = group.lots.some(hasLotUserData);
    if (hasData) { setPendingDeleteGroupIdx(idx); return; }
    onChange({ ...card, cropGroups: card.cropGroups.filter((_, i) => i !== idx) });
  };
  const confirmDeleteGroup = () => {
    if (pendingDeleteGroupIdx !== null)
      onChange({ ...card, cropGroups: card.cropGroups.filter((_, i) => i !== pendingDeleteGroupIdx) });
    setPendingDeleteGroupIdx(null);
  };
  const pendingGroupName = pendingDeleteGroupIdx !== null ? card.cropGroups[pendingDeleteGroupIdx]?.crop : "";

  return (
    <Card className="border-2 border-border shadow-md overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors border-b border-border"
        onClick={() => set("cardOpen", !card.cardOpen)}
        data-testid="button-toggle-farmer-card"
      >
        <div className="flex items-center gap-3">
          {card.cardOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
          <User className="w-4 h-4 text-primary" />
          <span className="font-semibold text-sm">
            {card.farmerName.trim() || <span className="text-muted-foreground italic">New Farmer Entry</span>}
          </span>
          {card.farmerPhone && <span className="text-xs text-muted-foreground">· {card.farmerPhone}</span>}
          {card.village && <span className="text-xs text-muted-foreground">· {card.village}</span>}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date" value={card.date}
            onChange={e => { e.stopPropagation(); set("date", e.target.value); }}
            onClick={e => e.stopPropagation()}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
            data-testid="input-farmer-date"
          />
          <Button type="button" variant="ghost" size="sm"
            onClick={e => { e.stopPropagation(); onRemove(); }}
            className="h-7 w-7 p-0 text-red-400 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </button>

      {card.cardOpen && (
        <CardContent className="p-4 space-y-3">

          {/* Farmer details */}
          <SectionToggle open={card.farmerOpen} onToggle={() => set("farmerOpen", !card.farmerOpen)}
            icon={<User className="w-3.5 h-3.5" />} label="Farmer Details" />
          {card.farmerOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pl-2">
              <div>
                <Label className="text-xs text-muted-foreground">Name *</Label>
                <Input data-testid="input-farmer-name" placeholder="Farmer name" value={card.farmerName} onChange={e => set("farmerName", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Phone</Label>
                <Input data-testid="input-farmer-phone" placeholder="10-digit mobile" value={card.farmerPhone} onChange={e => set("farmerPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Village</Label>
                <Input data-testid="input-village" placeholder="Village" value={card.village} onChange={e => set("village", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Tehsil</Label>
                <Input data-testid="input-tehsil" placeholder="Tehsil" value={card.tehsil} onChange={e => set("tehsil", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">District</Label>
                <Input data-testid="input-district" placeholder="District" value={card.district} onChange={e => set("district", e.target.value)} className="h-8 text-sm" />
              </div>
            </div>
          )}

          {/* Advance */}
          <div className="flex items-center gap-3 pl-2">
            <div>
              <Label className="text-xs text-muted-foreground">Farmer Advance ₹</Label>
              <Input data-testid="input-farmer-advance" type="number" placeholder="0" value={card.advanceAmount} onChange={e => set("advanceAmount", e.target.value)} className="h-8 w-32 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Mode</Label>
              <Select value={card.advanceMode} onValueChange={v => set("advanceMode", v)}>
                <SelectTrigger data-testid="select-advance-mode" className="h-8 w-28 text-sm">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="UPI">UPI</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Vehicle info */}
          <SectionToggle open={card.vehicleOpen} onToggle={() => set("vehicleOpen", !card.vehicleOpen)}
            icon={<Truck className="w-3.5 h-3.5" />} label="Vehicle Info"
            count={card.vehicleNumber || undefined} />
          {card.vehicleOpen && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pl-2">
              <div>
                <Label className="text-xs text-muted-foreground">Vehicle #</Label>
                <Input data-testid="input-vehicle-number" placeholder="MP09XX0000" value={card.vehicleNumber} onChange={e => set("vehicleNumber", e.target.value.toUpperCase())} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Driver Name</Label>
                <Input data-testid="input-driver-name" placeholder="Driver name" value={card.driverName} onChange={e => set("driverName", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Bhada Rate (₹)</Label>
                <Input data-testid="input-bhada-rate" type="number" placeholder="0" value={card.vehicleBhadaRate} onChange={e => set("vehicleBhadaRate", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Total Bags in Vehicle</Label>
                <Input data-testid="input-total-bags-vehicle" type="number" placeholder="0" value={card.totalBagsInVehicle} onChange={e => set("totalBagsInVehicle", e.target.value)} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Freight Type</Label>
                <Select value={card.freightType} onValueChange={v => set("freightType", v)}>
                  <SelectTrigger data-testid="select-freight-type" className="h-8 text-sm">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Per Bag">Per Bag</SelectItem>
                    <SelectItem value="Fixed">Fixed Amount</SelectItem>
                    <SelectItem value="None">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Crop groups */}
          <div className="space-y-3 pt-1">
            {card.cropGroups.map((group, idx) => (
              <CropGroupSection
                key={group.id} group={group}
                onChange={g => updateGroup(idx, g)}
                onRemove={() => removeGroup(idx)}
                vehicleBhadaRate={vehicleBhadaRate}
                totalBagsInVehicle={totalBagsInVehicle}
                cs={cs}
                farmerDate={card.date}
                farmerName={card.farmerName}
              />
            ))}
            {availableCrops.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-1">
                {availableCrops.map(crop => (
                  <Button key={crop} type="button" variant="outline" size="sm"
                    onClick={() => addCrop(crop)}
                    className={`h-8 gap-1.5 text-sm border-dashed font-medium ${
                      crop === "Potato" ? "border-violet-400 text-violet-600 hover:bg-violet-50" :
                      crop === "Onion"  ? "border-rose-400 text-rose-600 hover:bg-rose-50" :
                      "border-amber-400 text-amber-600 hover:bg-amber-50"
                    }`}
                    data-testid={`button-add-crop-${crop.toLowerCase()}`}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    {crop}
                  </Button>
                ))}
              </div>
            )}
            {card.cropGroups.length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-2">
                Select a crop above to begin adding lots
              </p>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t border-border">
            <Button type="button" disabled className="gap-2 opacity-50" title="Wiring coming soon">
              Save Entry
            </Button>
          </div>
        </CardContent>
      )}

      <ConfirmDeleteDialog
        open={pendingDeleteGroupIdx !== null}
        title={`Delete ${card.farmerName.trim() || "this farmer"}'s "${pendingGroupName}" group?`}
        description={`All lots and data for ${card.farmerName.trim() || "this farmer"}'s "${pendingGroupName}" crop will be permanently lost. This action cannot be undone.`}
        onConfirm={confirmDeleteGroup}
        onCancel={() => setPendingDeleteGroupIdx(null)}
      />
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const [cards, setCards] = useState<FarmerCard[]>([emptyCard()]);

  const { data: chargeSettings } = useQuery<ChargeSettings>({
    queryKey: ["/api/charge-settings"],
  });

  const cs = chargeSettings || DEFAULT_CS;

  const addCard = () => setCards(prev => [emptyCard(), ...prev]);
  const updateCard = (idx: number, card: FarmerCard) =>
    setCards(prev => prev.map((c, i) => (i === idx ? card : c)));
  const removeCard = (idx: number) =>
    setCards(prev => prev.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
        <div>
          <h1 className="text-lg font-bold">Stock Entry</h1>
          <p className="text-xs text-muted-foreground">Add farmers, lots, bids and weights in one place</p>
        </div>
        <Button type="button" onClick={addCard} data-testid="button-add-farmer-entry" className="gap-2">
          <Plus className="w-4 h-4" /> New Farmer Entry
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {cards.map((card, idx) => (
          <FarmerCardComp
            key={card.id} card={card}
            onChange={c => updateCard(idx, c)}
            onRemove={() => removeCard(idx)}
            cs={cs}
          />
        ))}
      </div>
    </div>
  );
}
