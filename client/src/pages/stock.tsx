import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
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
  Archive, History, Save,
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
  id: string;
  bidOpen: boolean;
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
  bids: BidRow[];
};

type ChangeRecord =
  | { kind: "field"; path: string; oldVal: string; newVal: string }
  | { kind: "deleted"; path: string; detail?: string }
  | { kind: "added"; path: string };

type EditEntry = { timestamp: string; username: string; changes: ChangeRecord[]; label?: string };

type CropGroup = {
  id: string; crop: string; srNumber: string; groupOpen: boolean; lots: LotRow[];
  archived: boolean;
  editHistory: EditEntry[];
};

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
  archived: boolean;
  savedAt: string | null;
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

// ─── Archive dialog ───────────────────────────────────────────────────────────

function ArchiveDialog({ open, title, description, onConfirm, onCancel }: {
  open: boolean; title: string; description: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <Archive className="w-5 h-5 shrink-0" /> {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction autoFocus onClick={onCancel} className="bg-amber-600 hover:bg-amber-700 text-white">
            Cancel
          </AlertDialogAction>
          <AlertDialogCancel onClick={onConfirm} className="border-border text-foreground hover:bg-muted">
            Yes, Archive
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Edit history dialog ───────────────────────────────────────────────────────

function ChangeRecordLine({ c }: { c: ChangeRecord }) {
  if (c.kind === "field") {
    return (
      <div className="flex flex-wrap items-baseline gap-1 text-xs" data-testid="change-field">
        <span className="text-muted-foreground font-medium">{c.path}:</span>
        <span className="line-through text-red-500">{c.oldVal}</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-green-600 font-medium">{c.newVal}</span>
      </div>
    );
  }
  if (c.kind === "deleted") {
    return (
      <div className="flex items-baseline gap-1 text-xs" data-testid="change-deleted">
        <span className="text-red-500 font-medium">{c.path}</span>
        {c.detail && <span className="text-muted-foreground">({c.detail})</span>}
        <Badge variant="outline" className="text-[10px] px-1 py-0 border-red-300 text-red-500 h-4">deleted</Badge>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-1 text-xs" data-testid="change-added">
      <span className="text-green-600 font-medium">{c.path}</span>
      <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-300 text-green-600 h-4">added</Badge>
    </div>
  );
}

function EditHistoryDialog({ open, crop, history, onClose }: {
  open: boolean; crop: string; history: EditEntry[]; onClose: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-500" /> Edit History — {crop}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 mt-2 max-h-[28rem] overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">No changes recorded yet. History is tracked after the first Save Entry.</p>
              ) : (
                [...history].reverse().map((entry, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 overflow-hidden" data-testid={`history-entry-${i}`}>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b">
                      <History className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{entry.timestamp}</span>
                      {entry.username && <span className="text-[11px] font-medium text-foreground">by {entry.username}</span>}
                    </div>
                    <div className="px-3 py-2 space-y-1">
                      {Array.isArray(entry.changes) && entry.changes.length > 0
                        ? entry.changes.map((c, j) => <ChangeRecordLine key={j} c={c} />)
                        : entry.label
                          ? <span className="text-xs text-foreground">{entry.label}</span>
                          : <span className="text-xs text-muted-foreground italic">Entry saved</span>
                      }
                    </div>
                  </div>
                ))
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>Close</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Unsaved changes dialog ───────────────────────────────────────────────────

function UnsavedChangesDialog({ open, farmerName, onSave, onDiscard, onKeep }: {
  open: boolean; farmerName: string; onSave: () => void; onDiscard: () => void; onKeep: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onKeep(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5 text-blue-500" /> Unsaved Changes
          </AlertDialogTitle>
          <AlertDialogDescription>
            {farmerName
              ? `"${farmerName}" has unsaved changes.`
              : "This entry has unsaved changes."} What would you like to do?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onKeep}>Keep Editing</AlertDialogCancel>
          <AlertDialogAction autoFocus onClick={onDiscard} className="bg-muted text-foreground hover:bg-muted/80 border border-border">
            Discard & Close
          </AlertDialogAction>
          <AlertDialogAction onClick={onSave} className="bg-primary text-primary-foreground">
            Save & Close
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Payment badge ────────────────────────────────────────────────────────────

const PAYMENT_COLORS: Record<string, string> = {
  Due: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800",
  Paid: "bg-green-100 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-400 dark:border-green-800",
  "Partial Paid": "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800",
};

function PaymentBadge({ status = "Due" }: { status?: "Due" | "Paid" | "Partial Paid" }) {
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0 h-4 leading-none ${PAYMENT_COLORS[status] || PAYMENT_COLORS.Due}`}>
      {status}
    </Badge>
  );
}

// ─── Summary line (shared across lot, crop, farmer) ──────────────────────────

function CollapsedSummary({ totalBags, remainingBags, farmerPayable, buyerReceivable, hasData }: {
  totalBags: number; remainingBags: number;
  farmerPayable: number; buyerReceivable: number; hasData: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="text-muted-foreground font-medium">Total Bags: {totalBags}</span>
      <span className={`font-medium ${remainingBags > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
        Remaining: {remainingBags}
      </span>
      {hasData && (
        <>
          <span className="text-green-700 dark:text-green-400 font-medium">Farmer: ₹{farmerPayable.toFixed(0)}</span>
          <PaymentBadge status="Due" />
          <span className="text-blue-700 dark:text-blue-400 font-medium">Buyer: ₹{buyerReceivable.toFixed(0)}</span>
          <PaymentBadge status="Due" />
        </>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 8);

const emptyBid = (date?: string): BidRow => ({
  id: uid(),
  bidOpen: true,
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
  bids: [emptyBid(date)],
});

const hasLotUserData = (lot: LotRow): boolean =>
  [lot.numberOfBags, lot.variety, lot.bagMarka,
    ...lot.bids.flatMap(b => [b.buyerName, b.pricePerKg, b.numberOfBags, b.txn.netWeightInput]),
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
  archived: false,
  savedAt: null,
});

const emptyCropGroup = (crop: string, date?: string): CropGroup => ({
  id: uid(), crop, srNumber: "XX", groupOpen: true,
  lots: [emptyLot(date)], archived: false, editHistory: [],
});

// ─── Data fingerprint (for dirty detection, strips UI-only flags) ─────────────

function getDataFingerprint(card: FarmerCard): string {
  const stripBid = ({ id, bidOpen, txn, ...b }: BidRow) => ({
    ...b,
    txn: (({ showWeightCalc, showExtraBreakdown, ...t }) => t)(txn),
  });
  const stripLot = ({ id, lotOpen, bids, ...l }: LotRow) => ({ ...l, bids: bids.map(stripBid) });
  const stripGroup = ({ groupOpen, editHistory, lots, ...g }: CropGroup) => ({
    ...g, lots: lots.map(stripLot),
  });
  const { cardOpen, farmerOpen, vehicleOpen, savedAt, cropGroups, ...rest } = card;
  return JSON.stringify({ ...rest, cropGroups: cropGroups.map(stripGroup) });
}

function diffCropGroup(saved: CropGroup, current: CropGroup): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const savedLotMap = new Map(saved.lots.map(l => [l.id, l]));

  const lotFields: { key: keyof Omit<LotRow, "id" | "lotOpen" | "bids">; label: string }[] = [
    { key: "numberOfBags", label: "Bags" },
    { key: "size", label: "Size" },
    { key: "variety", label: "Variety" },
    { key: "bagMarka", label: "Bag Marka" },
  ];
  const bidFields: { key: keyof Omit<BidRow, "id" | "bidOpen" | "txn" | "txnDate">; label: string }[] = [
    { key: "buyerName", label: "Buyer Name" },
    { key: "pricePerKg", label: "Price/kg" },
    { key: "numberOfBags", label: "Bags" },
    { key: "paymentType", label: "Payment Type" },
    { key: "advanceAmount", label: "Advance" },
  ];
  const txnFields: { key: keyof TxnState; label: string }[] = [
    { key: "netWeightInput", label: "Net Weight" },
    { key: "extraChargesFarmer", label: "Extra Charges (Farmer)" },
    { key: "extraChargesBuyer", label: "Extra Charges (Buyer)" },
    { key: "extraPerKgFarmer", label: "Extra/kg (Farmer)" },
    { key: "extraPerKgBuyer", label: "Extra/kg (Buyer)" },
    { key: "extraTulai", label: "Tulai" },
    { key: "extraBharai", label: "Bharai" },
    { key: "extraKhadiKarai", label: "Khadi Karai" },
    { key: "extraThelaBhada", label: "Thela Bhada" },
    { key: "extraOthers", label: "Others" },
  ];

  current.lots.forEach((cLot, lotIdx) => {
    const lotLabel = `Lot ${lotIdx + 1}`;
    const sLot = savedLotMap.get(cLot.id);
    if (!sLot) {
      changes.push({ kind: "added", path: lotLabel });
      return;
    }
    for (const f of lotFields) {
      const ov = sLot[f.key]; const nv = cLot[f.key];
      if (ov !== nv) changes.push({ kind: "field", path: `${lotLabel} > ${f.label}`, oldVal: ov || "(empty)", newVal: nv || "(empty)" });
    }
    const savedBidMap = new Map(sLot.bids.map(b => [b.id, b]));

    cLot.bids.forEach((cBid, bidIdx) => {
      const bidLabel = `${lotLabel} > Bid ${bidIdx + 1}`;
      const sBid = savedBidMap.get(cBid.id);
      if (!sBid) {
        changes.push({ kind: "added", path: bidLabel });
        return;
      }
      for (const f of bidFields) {
        const ov = sBid[f.key]; const nv = cBid[f.key];
        if (ov !== nv) changes.push({ kind: "field", path: `${bidLabel} > ${f.label}`, oldVal: ov || "(empty)", newVal: nv || "(empty)" });
      }
      for (const f of txnFields) {
        const ov = sBid.txn[f.key]; const nv = cBid.txn[f.key];
        if (typeof ov === "string" && typeof nv === "string" && ov !== nv)
          changes.push({ kind: "field", path: `${bidLabel} > ${f.label}`, oldVal: ov || "0", newVal: nv || "0" });
      }
    });

    sLot.bids.forEach((sBid, bidIdx) => {
      if (!cLot.bids.some(b => b.id === sBid.id)) {
        changes.push({ kind: "deleted", path: `${lotLabel} > Bid ${bidIdx + 1}`, detail: sBid.buyerName.trim() || undefined });
      }
    });
  });

  saved.lots.forEach((sLot, lotIdx) => {
    if (!current.lots.some(l => l.id === sLot.id)) {
      changes.push({ kind: "deleted", path: `Lot ${lotIdx + 1}` });
    }
  });

  return changes;
}

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

// ─── Bid & lot totals calculators ─────────────────────────────────────────────

function calcBidTotals(bid: BidRow, cs: ChargeSettings, vehicleBhadaRate: number, totalBagsInVehicle: number) {
  const bidBags = parseInt(bid.numberOfBags) || 0;
  const pricePerKg = parseFloat(bid.pricePerKg) || 0;
  const txn = bid.txn;
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
  const freight = totalBagsInVehicle > 0 ? (vehicleBhadaRate * bidBags) / totalBagsInVehicle : 0;
  const farmerDed = hfRate * bidBags + extraFarmer + (farmerGross * aadhatFPct) / 100 + (farmerGross * mandiFPct) / 100 + freight;
  const buyerAdd = hbRate * bidBags + extraBuyer + (buyerGross * aadhatBPct) / 100 + (buyerGross * mandiBPct) / 100;
  return {
    bidBags,
    farmerPayable: farmerGross - farmerDed,
    buyerReceivable: buyerGross + buyerAdd,
    hasData: nw > 0 && pricePerKg > 0,
  };
}

function calcLotTotals(lot: LotRow, cs: ChargeSettings, vehicleBhadaRate: number, totalBagsInVehicle: number) {
  const lotBags = parseInt(lot.numberOfBags) || 0;
  const bidTotals = lot.bids.map(b => calcBidTotals(b, cs, vehicleBhadaRate, totalBagsInVehicle));
  return {
    lotBags,
    bidBags: bidTotals.reduce((s, t) => s + t.bidBags, 0),
    farmerPayable: bidTotals.reduce((s, t) => s + t.farmerPayable, 0),
    buyerReceivable: bidTotals.reduce((s, t) => s + t.buyerReceivable, 0),
    hasData: bidTotals.some(t => t.hasData),
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

      {nw > 0 && pricePerKg > 0 && (epkFarmer > 0 || epkBuyer > 0) && (
        <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-1" data-testid="txn-bid-rate-header">
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

function BidSection({ bid, bidIndex, onChange, onRemove, canRemove, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate, overBag }: {
  bid: BidRow;
  bidIndex: number;
  onChange: (b: BidRow) => void;
  onRemove?: () => void;
  canRemove: boolean;
  vehicleBhadaRate: number;
  totalBagsInVehicle: number;
  cs: ChargeSettings;
  farmerDate: string;
  overBag: boolean;
}) {
  const isNewBuyer = bid.buyerName.trim().length > 0 && !MOCK_BUYERS.includes(bid.buyerName.trim());
  const bags = parseInt(bid.numberOfBags) || 0;
  const pricePerKg = parseFloat(bid.pricePerKg) || 0;
  const totals = calcBidTotals(bid, cs, vehicleBhadaRate, totalBagsInVehicle);
  const buyerLabel = bid.buyerName.trim() || "Bid";

  return (
    <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/40 overflow-hidden">
      <div className="flex items-center bg-blue-100/60 border-b border-blue-200">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 px-3 py-1.5 hover:bg-blue-100 transition-colors text-left"
          onClick={() => onChange({ ...bid, bidOpen: !bid.bidOpen })}
          data-testid={`button-toggle-bid-${bidIndex}`}
        >
          {bid.bidOpen
            ? <ChevronDown className="w-3.5 h-3.5 text-blue-500" />
            : <ChevronRight className="w-3.5 h-3.5 text-blue-500" />}
          <span className="text-xs font-semibold text-blue-600 uppercase tracking-wide">
            {buyerLabel} {bags > 0 && `· ${bags} bags`}
          </span>
          {!bid.bidOpen && totals.hasData && (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-green-700 dark:text-green-400 font-medium">Farmer: ₹{totals.farmerPayable.toFixed(0)}</span>
              <span className="text-blue-700 dark:text-blue-400 font-medium">Buyer: ₹{totals.buyerReceivable.toFixed(0)}</span>
            </span>
          )}
        </button>
        {canRemove && onRemove && (
          <button
            type="button"
            data-testid={`button-remove-bid-${bidIndex}`}
            onClick={onRemove}
            className="h-7 w-7 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0 mr-1 rounded"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {bid.bidOpen && (
        <div className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              Bid & Transaction Details
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Txn Date:</label>
              <input
                type="date"
                data-testid={`input-txn-date-${bidIndex}`}
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

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2 sm:col-span-1">
              <Label className="text-xs text-muted-foreground">Buyer</Label>
              <div className="relative">
                <Input
                  data-testid={`input-buyer-name-${bidIndex}`}
                  list={`buyer-list-${bid.id}`}
                  placeholder="Select or type buyer…"
                  value={bid.buyerName}
                  onChange={e => onChange({ ...bid, buyerName: e.target.value })}
                  className="h-8 text-sm pr-7"
                />
                <datalist id={`buyer-list-${bid.id}`}>
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
                data-testid={`input-price-per-kg-${bidIndex}`}
                type="number" placeholder="0.00"
                value={bid.pricePerKg}
                onChange={e => onChange({ ...bid, pricePerKg: e.target.value })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground"># Bags</Label>
              <Input
                data-testid={`input-bid-bags-${bidIndex}`}
                type="number" placeholder="0"
                value={bid.numberOfBags}
                onChange={e => onChange({ ...bid, numberOfBags: e.target.value })}
                className={`h-8 text-sm ${overBag ? "border-red-400 focus-visible:ring-red-400" : ""}`}
              />
              {overBag && (
                <p className="text-xs text-red-500 font-medium mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> Exceeds lot bags
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Payment</Label>
              <Select value={bid.paymentType} onValueChange={v => onChange({ ...bid, paymentType: v })}>
                <SelectTrigger data-testid={`select-payment-type-${bidIndex}`} className="h-8 text-sm">
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
                data-testid={`input-advance-amount-${bidIndex}`}
                type="number"
                value={bid.advanceAmount}
                onChange={e => onChange({ ...bid, advanceAmount: e.target.value })}
                className="h-7 w-24 text-sm"
              />
            </div>
          )}

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
      )}
    </div>
  );
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

function LotCard({ lot, index, onChange, onRemove, onRemoveBid, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate }: {
  lot: LotRow; index: number;
  onChange: (l: LotRow) => void; onRemove: () => void;
  onRemoveBid?: (lotIndex: number, bidIndex: number) => void;
  vehicleBhadaRate: number; totalBagsInVehicle: number;
  cs: ChargeSettings; farmerDate: string;
}) {
  const [pendingDeleteBidIdx, setPendingDeleteBidIdx] = useState<number | null>(null);

  const setField = (f: keyof Omit<LotRow, "id" | "bids" | "lotOpen">, v: string) => onChange({ ...lot, [f]: v });
  const totals = calcLotTotals(lot, cs, vehicleBhadaRate, totalBagsInVehicle);
  const lotBags = parseInt(lot.numberOfBags) || 0;

  const updateBid = (idx: number, bid: BidRow) =>
    onChange({ ...lot, bids: lot.bids.map((b, i) => (i === idx ? bid : b)) });
  const confirmRemoveBid = () => {
    if (pendingDeleteBidIdx !== null) {
      if (onRemoveBid) {
        onRemoveBid(index, pendingDeleteBidIdx);
      } else {
        onChange({ ...lot, bids: lot.bids.filter((_, i) => i !== pendingDeleteBidIdx) });
      }
    }
    setPendingDeleteBidIdx(null);
  };
  const addBid = () =>
    onChange({ ...lot, bids: [...lot.bids, emptyBid(farmerDate)] });

  let runningBags = 0;
  const bidOverFlags = lot.bids.map(b => {
    runningBags += parseInt(b.numberOfBags) || 0;
    return lotBags > 0 && runningBags > lotBags;
  });

  const pendingBid = pendingDeleteBidIdx !== null ? lot.bids[pendingDeleteBidIdx] : null;
  const pendingBidLabel = pendingBid?.buyerName.trim() || `Bid #${(pendingDeleteBidIdx ?? 0) + 1}`;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center bg-muted/30 border-b border-border">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
          onClick={() => onChange({ ...lot, lotOpen: !lot.lotOpen })}
          data-testid={`button-toggle-lot-${index}`}
        >
          {lot.lotOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #{index + 1}</span>
          {!lot.lotOpen && (
            <CollapsedSummary
              totalBags={totals.lotBags} remainingBags={totals.lotBags - totals.bidBags}
              farmerPayable={totals.farmerPayable} buyerReceivable={totals.buyerReceivable}
              hasData={totals.hasData}
            />
          )}
        </button>
        <button
          type="button"
          data-testid={`button-remove-lot-${index}`}
          onClick={onRemove}
          className="h-8 w-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors shrink-0 mr-1 rounded"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {lot.lotOpen && (
        <div className="p-3 space-y-3">
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

          <div className="ml-4 space-y-1">
            {lot.bids.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-3 py-2">No bids. Add one below.</p>
            )}
            {lot.bids.map((bid, bidIdx) => (
              <BidSection
                key={bid.id}
                bid={bid}
                bidIndex={bidIdx}
                onChange={b => updateBid(bidIdx, b)}
                onRemove={() => setPendingDeleteBidIdx(bidIdx)}
                canRemove={true}
                vehicleBhadaRate={vehicleBhadaRate}
                totalBagsInVehicle={totalBagsInVehicle}
                cs={cs}
                farmerDate={farmerDate}
                overBag={bidOverFlags[bidIdx]}
              />
            ))}
            <Button
              type="button" variant="outline" size="sm"
              onClick={addBid}
              className="w-full h-7 text-xs gap-1.5 border-dashed mt-2"
              data-testid="button-add-bid"
            >
              <Plus className="w-3 h-3" /> Add Bid
            </Button>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={pendingDeleteBidIdx !== null}
        title={`Delete ${pendingBidLabel}?`}
        description={`This bid will be permanently removed from Lot #${index + 1}. The lot itself will remain.`}
        onConfirm={confirmRemoveBid}
        onCancel={() => setPendingDeleteBidIdx(null)}
      />
    </div>
  );
}

// ─── Crop group ───────────────────────────────────────────────────────────────

function CropGroupSection({ group, onChange, onArchive, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate, farmerName }: {
  group: CropGroup;
  onChange: (g: CropGroup) => void; onArchive: () => void;
  vehicleBhadaRate: number; totalBagsInVehicle: number;
  cs: ChargeSettings; farmerDate: string; farmerName: string;
}) {
  const [pendingDeleteLotIdx, setPendingDeleteLotIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const headerCls = CROP_HEADER[group.crop] || "bg-muted border-border";
  const badgeCls = CROP_COLORS[group.crop] || "bg-muted border-border text-foreground";
  const farmerLabel = farmerName.trim() || "this farmer";

  const addLot = () => onChange({ ...group, lots: [...group.lots, emptyLot(farmerDate)] });
  const updateLot = (idx: number, lot: LotRow) =>
    onChange({ ...group, lots: group.lots.map((l, i) => (i === idx ? lot : l)) });
  const isLastLot = group.lots.length === 1;

  const removeLot = (idx: number) => {
    const lot = group.lots[idx];
    if (isLastLot || hasLotUserData(lot)) { setPendingDeleteLotIdx(idx); return; }
    onChange({ ...group, lots: group.lots.filter((_, i) => i !== idx) });
  };
  const handleRemoveBid = (lotIndex: number, bidIndex: number) => {
    onChange({
      ...group,
      lots: group.lots.map((l, i) => i === lotIndex ? { ...l, bids: l.bids.filter((_, j) => j !== bidIndex) } : l),
    });
  };

  const confirmDeleteLot = () => {
    if (pendingDeleteLotIdx !== null) {
      onChange({
        ...group,
        lots: group.lots.filter((_, i) => i !== pendingDeleteLotIdx),
      });
    }
    setPendingDeleteLotIdx(null);
  };

  const allTotals = group.lots.map(l => calcLotTotals(l, cs, vehicleBhadaRate, totalBagsInVehicle));
  const totalBags = allTotals.reduce((s, t) => s + t.lotBags, 0);
  const totalBidBags = allTotals.reduce((s, t) => s + t.bidBags, 0);
  const remainingBags = totalBags - totalBidBags;
  const totalFarmerPayable = allTotals.reduce((s, t) => s + t.farmerPayable, 0);
  const totalBuyerReceivable = allTotals.reduce((s, t) => s + t.buyerReceivable, 0);
  const hasAnyData = allTotals.some(t => t.hasData);

  if (group.archived) {
    return (
      <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30">
          <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium opacity-60">
            <Archive className="w-3.5 h-3.5 shrink-0" />
            <Wheat className="w-3.5 h-3.5 shrink-0" />
            <span>SR# {group.srNumber} {group.crop}</span>
            <span className="italic font-normal">— Archived</span>
          </div>
          <Button type="button" variant="outline" size="sm"
            onClick={() => onChange({ ...group, archived: false, groupOpen: true })}
            className="h-6 px-2 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/60"
            data-testid={`button-reinstate-${group.crop.toLowerCase()}`}>
            Reinstate
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${headerCls} overflow-hidden`}>
      {/* Header — click to collapse/expand */}
      <button
        type="button"
        className={`w-full flex items-center justify-between px-4 py-2 ${headerCls} border-b hover:brightness-95 transition-all`}
        onClick={() => onChange({ ...group, groupOpen: !group.groupOpen })}
        data-testid={`button-toggle-group-${group.crop.toLowerCase()}`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
          {group.groupOpen ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
          <Wheat className="w-4 h-4 shrink-0" />
          <span className="font-semibold text-sm">SR# {group.srNumber} {group.crop}</span>
          <Badge variant="outline" className={`text-xs ${badgeCls} shrink-0`}>
            {group.lots.length} lot{group.lots.length !== 1 ? "s" : ""}
          </Badge>
          {!group.groupOpen && (
            <CollapsedSummary
              totalBags={totalBags} remainingBags={remainingBags}
              farmerPayable={totalFarmerPayable} buyerReceivable={totalBuyerReceivable}
              hasData={hasAnyData}
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button" variant="ghost" size="sm"
            onClick={e => { e.stopPropagation(); setShowHistory(true); }}
            className="h-7 px-2 gap-1 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            title="Edit History"
            data-testid={`button-history-${group.crop.toLowerCase()}`}
          >
            <History className="w-3.5 h-3.5" /> History
          </Button>
          <Button
            type="button" variant="ghost" size="sm"
            onClick={e => { e.stopPropagation(); onArchive(); }}
            className="h-7 w-7 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 shrink-0"
            title="Archive this crop group"
            data-testid={`button-archive-${group.crop.toLowerCase()}`}
          >
            <Archive className="w-3.5 h-3.5" />
          </Button>
        </div>
      </button>

      {group.groupOpen && (
        <div className="p-3 space-y-3 bg-background/60">
          {group.lots.map((lot, idx) => (
            <LotCard
              key={lot.id} lot={lot} index={idx}
              onChange={lot => updateLot(idx, lot)}
              onRemove={() => removeLot(idx)}
              onRemoveBid={handleRemoveBid}
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
        description={
          isLastLot
            ? `This is the only lot for ${farmerLabel}'s ${group.crop}. Deleting it will permanently remove this lot. The ${group.crop} group will remain.`
            : `Lot #${(pendingDeleteLotIdx ?? 0) + 1} of ${farmerLabel}'s ${group.crop} has data that will be permanently lost. This action cannot be undone.`
        }
        onConfirm={confirmDeleteLot}
        onCancel={() => setPendingDeleteLotIdx(null)}
      />

      <EditHistoryDialog
        open={showHistory}
        crop={`${group.crop} (SR# ${group.srNumber})`}
        history={group.editHistory}
        onClose={() => setShowHistory(false)}
      />
    </div>
  );
}

// ─── Farmer card ──────────────────────────────────────────────────────────────

function FarmerCardComp({ card, savedCard, onChange, onSave, onSaveAndClose, onCancel, onArchive, cs }: {
  card: FarmerCard;
  savedCard: FarmerCard | null;
  onChange: (c: FarmerCard) => void;
  onSave: () => void;
  onSaveAndClose: () => void;
  onCancel: () => void;
  onArchive: () => void;
  cs: ChargeSettings;
}) {
  const [pendingArchiveGroupIdx, setPendingArchiveGroupIdx] = useState<number | null>(null);
  const [showArchiveFarmer, setShowArchiveFarmer] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);

  const set = (f: keyof FarmerCard, v: any) => onChange({ ...card, [f]: v });
  const usedCrops = card.cropGroups.filter(g => !g.archived).map(g => g.crop);
  const availableCrops = CROPS.filter(c => !usedCrops.includes(c));

  const vehicleBhadaRate = parseFloat(card.vehicleBhadaRate) || 0;
  const totalBagsInVehicle = parseInt(card.totalBagsInVehicle) || 0;

  const hasAnyInput = !!(
    card.farmerName.trim() || card.farmerPhone || card.village ||
    card.vehicleNumber || card.advanceAmount ||
    card.cropGroups.some(g => g.lots.some(hasLotUserData))
  );

  const isDirty = savedCard
    ? getDataFingerprint(card) !== getDataFingerprint(savedCard)
    : hasAnyInput;

  const handleCardToggle = () => {
    if (card.cardOpen && isDirty) {
      setShowUnsaved(true);
      return;
    }
    set("cardOpen", !card.cardOpen);
  };

  const addCrop = (crop: string) => onChange({
    ...card, cropGroups: [...card.cropGroups, emptyCropGroup(crop, card.date)],
  });
  const updateGroup = (idx: number, g: CropGroup) =>
    onChange({ ...card, cropGroups: card.cropGroups.map((gg, i) => (i === idx ? g : gg)) });
  const archiveGroup = (idx: number) => setPendingArchiveGroupIdx(idx);
  const confirmArchiveGroup = () => {
    if (pendingArchiveGroupIdx !== null)
      onChange({ ...card, cropGroups: card.cropGroups.map((g, i) => i === pendingArchiveGroupIdx ? { ...g, archived: true } : g) });
    setPendingArchiveGroupIdx(null);
  };
  const pendingGroupName = pendingArchiveGroupIdx !== null ? card.cropGroups[pendingArchiveGroupIdx]?.crop : "";

  const allLotTotals = card.cropGroups
    .filter(g => !g.archived)
    .flatMap(g => g.lots.map(l => calcLotTotals(l, cs, vehicleBhadaRate, totalBagsInVehicle)));
  const grandTotalBags = allLotTotals.reduce((s, t) => s + t.lotBags, 0);
  const grandBidBags = allLotTotals.reduce((s, t) => s + t.bidBags, 0);
  const grandRemainingBags = grandTotalBags - grandBidBags;
  const grandFarmerPayable = allLotTotals.reduce((s, t) => s + t.farmerPayable, 0);
  const grandBuyerReceivable = allLotTotals.reduce((s, t) => s + t.buyerReceivable, 0);
  const grandHasData = allLotTotals.some(t => t.hasData);

  return (
    <Card className={`border-2 shadow-md overflow-hidden transition-all ${card.archived ? "opacity-50 border-amber-300 dark:border-amber-700" : "border-border"}`}>
      {/* Archived banner */}
      {card.archived && (
        <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-xs font-medium">
            <Archive className="w-3.5 h-3.5 shrink-0" />
            Archived — excluded from all calculations
          </div>
          <Button type="button" variant="outline" size="sm"
            onClick={() => onChange({ ...card, archived: false, cardOpen: true })}
            className="h-6 px-2 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/60"
            data-testid="button-reinstate-farmer">
            Reinstate
          </Button>
        </div>
      )}

      {/* Header */}
      <button
        type="button"
        className={`w-full flex items-center justify-between px-4 py-3 transition-colors border-b border-border ${card.archived ? "bg-muted/20 cursor-default" : "bg-muted/40 hover:bg-muted/60"}`}
        onClick={handleCardToggle}
        data-testid="button-toggle-farmer-card"
      >
        <div className="flex items-center gap-3 min-w-0 flex-wrap">
          {card.cardOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
          <User className="w-4 h-4 text-primary shrink-0" />
          <span className="font-semibold text-sm">
            {card.farmerName.trim() || <span className="text-muted-foreground italic">New Farmer Entry</span>}
          </span>
          {card.farmerPhone && <span className="text-xs text-muted-foreground">· {card.farmerPhone}</span>}
          {card.village && <span className="text-xs text-muted-foreground">· {card.village}</span>}
          {isDirty && card.savedAt !== null && (
            <span className="text-[10px] font-medium text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded px-1.5 py-0.5">
              Unsaved changes
            </span>
          )}
          {!card.cardOpen && !card.archived && (
            <CollapsedSummary
              totalBags={grandTotalBags} remainingBags={grandRemainingBags}
              farmerPayable={grandFarmerPayable} buyerReceivable={grandBuyerReceivable}
              hasData={grandHasData}
            />
          )}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="date" value={card.date}
            onChange={e => { e.stopPropagation(); set("date", e.target.value); }}
            onClick={e => e.stopPropagation()}
            className="text-xs border border-border rounded px-2 py-1 bg-background"
            data-testid="input-farmer-date"
            disabled={card.archived}
          />
          {!card.archived && (
            <Button type="button" variant="ghost" size="sm"
              onClick={e => { e.stopPropagation(); setShowArchiveFarmer(true); }}
              className="h-7 w-7 p-0 text-amber-500 hover:text-amber-700"
              title="Archive this farmer entry"
              data-testid="button-archive-farmer">
              <Archive className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </button>

      {card.cardOpen && !card.archived && (
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
                onArchive={() => archiveGroup(idx)}
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
            {card.cropGroups.filter(g => !g.archived).length === 0 && (
              <p className="text-xs text-muted-foreground italic text-center py-2">
                Select a crop above to begin adding lots
              </p>
            )}
          </div>

          {/* Footer: Cancel + Save */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm"
              onClick={onCancel}
              className="h-8 text-sm gap-1.5 text-muted-foreground"
              data-testid="button-cancel-entry">
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
            <div className="flex items-center gap-2">
              {card.savedAt && (
                <span className="text-[10px] text-muted-foreground">Last saved: {card.savedAt}</span>
              )}
              <Button type="button"
                onClick={onSave}
                disabled={!isDirty}
                className={`h-8 gap-1.5 text-sm transition-all ${isDirty ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                data-testid="button-save-entry">
                <Save className="w-3.5 h-3.5" /> Save Entry
              </Button>
            </div>
          </div>
        </CardContent>
      )}

      {/* Archive farmer dialog */}
      <ArchiveDialog
        open={showArchiveFarmer}
        title={`Archive ${card.farmerName.trim() || "this farmer"}?`}
        description="This farmer entry will be archived and excluded from all calculations."
        onConfirm={() => { setShowArchiveFarmer(false); onArchive(); }}
        onCancel={() => setShowArchiveFarmer(false)}
      />

      {/* Archive crop group dialog */}
      <ArchiveDialog
        open={pendingArchiveGroupIdx !== null}
        title={`Archive "${pendingGroupName}" group?`}
        description={`This crop group will be archived and excluded from all calculations.`}
        onConfirm={confirmArchiveGroup}
        onCancel={() => setPendingArchiveGroupIdx(null)}
      />

      {/* Unsaved changes on collapse */}
      <UnsavedChangesDialog
        open={showUnsaved}
        farmerName={card.farmerName.trim()}
        onSave={() => { setShowUnsaved(false); onSaveAndClose(); }}
        onDiscard={() => { setShowUnsaved(false); onCancel(); }}
        onKeep={() => setShowUnsaved(false)}
      />
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const [cards, setCards] = useState<FarmerCard[]>([emptyCard()]);
  const [savedCardMap, setSavedCardMap] = useState<Map<string, FarmerCard>>(new Map());
  const { user } = useAuth();
  const currentUsername = user?.name || user?.username || "Unknown";

  const { data: chargeSettings } = useQuery<ChargeSettings>({
    queryKey: ["/api/charge-settings"],
  });

  const cs = chargeSettings || DEFAULT_CS;

  const anyDirty = cards.some(c => {
    if (c.archived) return false;
    const saved = savedCardMap.get(c.id) ?? null;
    return saved ? getDataFingerprint(c) !== getDataFingerprint(saved) : true;
  });

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (anyDirty) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const addCard = () => setCards(prev => [emptyCard(), ...prev]);
  const updateCard = (idx: number, card: FarmerCard) =>
    setCards(prev => prev.map((c, i) => (i === idx ? card : c)));

  const saveCard = (idx: number, collapseAfter = false) => {
    const card = cards[idx];
    const savedCard = savedCardMap.get(card.id);
    const isFirstSave = !savedCard;
    const now = format(new Date(), "dd/MM/yyyy HH:mm");
    const updatedCard: FarmerCard = {
      ...card,
      cardOpen: collapseAfter ? false : card.cardOpen,
      savedAt: now,
      cropGroups: card.cropGroups.map(g => {
        if (isFirstSave) return g;
        const savedGroup = savedCard.cropGroups.find(sg => sg.id === g.id);
        if (!savedGroup) return g;
        const changes = diffCropGroup(savedGroup, g);
        if (changes.length === 0) return g;
        return { ...g, editHistory: [...g.editHistory, { timestamp: now, username: currentUsername, changes }] };
      }),
    };
    setCards(prev => prev.map((c, i) => (i === idx ? updatedCard : c)));
    setSavedCardMap(prev => new Map(prev).set(card.id, updatedCard));
  };

  const cancelCard = (idx: number) => {
    const card = cards[idx];
    const saved = savedCardMap.get(card.id);
    if (saved) {
      setCards(prev => prev.map((c, i) =>
        i === idx ? { ...saved, cardOpen: false, farmerOpen: c.farmerOpen, vehicleOpen: c.vehicleOpen } : c
      ));
    } else {
      setCards(prev => prev.filter((_, i) => i !== idx));
    }
  };

  const archiveCard = (idx: number) =>
    setCards(prev => prev.map((c, i) => (i === idx ? { ...c, archived: true, cardOpen: false } : c)));

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
            savedCard={savedCardMap.get(card.id) ?? null}
            onChange={c => updateCard(idx, c)}
            onSave={() => saveCard(idx)}
            onSaveAndClose={() => saveCard(idx, true)}
            onCancel={() => cancelCard(idx)}
            onArchive={() => archiveCard(idx)}
            cs={cs}
          />
        ))}
      </div>
    </div>
  );
}
