import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  Archive, History, Save, Check, Printer, Share2,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { CROPS, SIZES, DISTRICTS } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { printReceipt, shareReceiptAsPdf } from "@/lib/receiptUtils";
import {
  generateFarmerReceiptHtml, generateBuyerReceiptHtml, generateCombinedBuyerReceiptHtml,
  applyFarmerTemplate, applyBuyerTemplate, applyCombinedBuyerTemplate,
  type UnifiedSerialGroup, type UnifiedLotGroup, type BuyerLotEntry, type TransactionWithDetails,
} from "@/lib/receiptGenerators";
import type { Lot, Farmer, Transaction, Bid, Buyer, ReceiptTemplate } from "@shared/schema";

const capFirst = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const toNum = (v: string) => v.replace(/[^0-9.]/g, "");

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
  bidDbId?: number;
  buyerId?: number;
  txnDbId?: number;
  bidOpen: boolean;
  buyerName: string;
  pricePerKg: string;
  numberOfBags: string;
  paymentType: string;
  advanceAmount: string;
  txnDate: string;
  txn: TxnState;
  paymentStatus?: "due" | "paid" | "partial";
  farmerPaymentStatus?: "due" | "paid" | "partial";
};

type LotRow = {
  id: string;
  dbId?: number;
  lotOpen: boolean;
  numberOfBags: string;
  size: string;
  variety: string;
  bagMarka: string;
  isReturned?: boolean;
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
  persisted: boolean;
  editHistory: EditEntry[];
};

type FarmerCard = {
  id: string;
  farmerId?: number;
  date: string;
  farmerName: string;
  farmerPhone: string;
  village: string;
  tehsil: string;
  district: string;
  state: string;
  vehicleNumber: string;
  driverName: string;
  driverContact: string;
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

function ReinstateDialog({ open, title, description, onConfirm, onCancel }: {
  open: boolean; title: string; description: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-green-700 dark:text-green-400">
            <Archive className="w-5 h-5 shrink-0" /> {title}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground">{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel} className="border-border text-foreground hover:bg-muted">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction autoFocus onClick={onConfirm} className="bg-green-600 hover:bg-green-700 text-white">
            Yes, Reinstate
          </AlertDialogAction>
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

function aggregatePaymentStatus(statuses: string[]): "Due" | "Paid" | "Partial Paid" {
  const set = new Set(statuses.filter(Boolean));
  if (set.size === 0) return "Due";
  if (set.size === 1 && set.has("paid")) return "Paid";
  if (set.has("paid") || set.has("partial")) return "Partial Paid";
  return "Due";
}

function CollapsedSummary({ totalBags, remainingBags, farmerPayable, buyerReceivable, hasData, farmerPaymentStatus, buyerPaymentStatus }: {
  totalBags: number; remainingBags: number;
  farmerPayable: number; buyerReceivable: number; hasData: boolean;
  farmerPaymentStatus?: "Due" | "Paid" | "Partial Paid";
  buyerPaymentStatus?: "Due" | "Paid" | "Partial Paid";
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
          <PaymentBadge status={farmerPaymentStatus || "Due"} />
          <span className="text-blue-700 dark:text-blue-400 font-medium">Buyer: ₹{buyerReceivable.toFixed(0)}</span>
          <PaymentBadge status={buyerPaymentStatus || "Due"} />
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
  state: "Madhya Pradesh",
  vehicleNumber: "",
  driverName: "",
  driverContact: "",
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
  lots: [emptyLot(date)], archived: false, persisted: false, editHistory: [],
});

// ─── Data fingerprint (for dirty detection, strips UI-only flags) ─────────────

function getDataFingerprint(card: FarmerCard): string {
  const stripBid = ({ id, bidDbId, buyerId, txnDbId, bidOpen, txn, ...b }: BidRow) => ({
    ...b,
    bidDbId, buyerId, txnDbId,
    txn: (({ showWeightCalc, showExtraBreakdown, ...t }) => t)(txn),
  });
  const stripLot = ({ id, dbId, lotOpen, bids, ...l }: LotRow) => ({ ...l, bids: bids.map(stripBid) });
  const stripGroup = ({ groupOpen, editHistory, persisted, lots, ...g }: CropGroup) => ({
    ...g, lots: lots.map(stripLot),
  });
  const { cardOpen, farmerOpen, vehicleOpen, savedAt, farmerId, cropGroups, ...rest } = card;
  return JSON.stringify({ ...rest, cropGroups: cropGroups.map(stripGroup) });
}

function diffCropGroup(saved: CropGroup, current: CropGroup): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const savedLotMap = new Map(saved.lots.map(l => [l.id, l]));

  const lotFields: { key: keyof Omit<LotRow, "id" | "dbId" | "lotOpen" | "bids">; label: string }[] = [
    { key: "numberOfBags", label: "Bags" },
    { key: "size", label: "Size" },
    { key: "variety", label: "Variety" },
    { key: "bagMarka", label: "Bag Marka" },
  ];
  const bidFields: { key: keyof Omit<BidRow, "id" | "bidOpen" | "txn" | "txnDate">; label: string }[] = [
    { key: "buyerName", label: "Buyer Name" },
    { key: "buyerId", label: "Buyer ID" },
    { key: "bidDbId", label: "Bid DB ID" },
    { key: "txnDbId", label: "Txn DB ID" },
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
      if (ov !== nv) changes.push({ kind: "field", path: `${lotLabel} > ${f.label}`, oldVal: String(ov || "(empty)"), newVal: String(nv || "(empty)") });
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
        if (ov !== nv) changes.push({ kind: "field", path: `${bidLabel} > ${f.label}`, oldVal: String(ov || "(empty)"), newVal: String(nv || "(empty)") });
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
            onChange={e => set("netWeightInput", toNum(e.target.value))}
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
                      onChange={e => updateSample(idx, toNum(e.target.value))}
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
              onChange={e => set("extraChargesFarmer", toNum(e.target.value))}
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
                    onChange={e => updateExtraBreakdown(field, toNum(e.target.value))}
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
              onChange={e => set("extraPerKgFarmer", toNum(e.target.value))}
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
              onChange={e => set("extraChargesBuyer", toNum(e.target.value))}
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
              onChange={e => set("extraPerKgBuyer", toNum(e.target.value))}
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

function BidSection({ bid, bidIndex, onChange, onRemove, canRemove, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate, overBag, buyersList }: {
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
  buyersList: { id: number; name: string; phone?: string }[];
}) {
  const [showBuyerSuggestions, setShowBuyerSuggestions] = useState(false);
  const filteredBuyers = buyersList.filter(
    b => bid.buyerName.length >= 1 && b.name.toLowerCase().includes(bid.buyerName.toLowerCase())
  ).slice(0, 10);
  const noBuyerSelected = bid.buyerName.trim().length > 0 && !bid.buyerId;
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
            <div className="col-span-2 sm:col-span-1 relative">
              <Label className="text-xs text-muted-foreground">Buyer</Label>
              <div className="relative">
                <Input
                  data-testid={`input-buyer-name-${bidIndex}`}
                  placeholder="Select buyer…"
                  value={bid.buyerName}
                  onChange={e => {
                    onChange({ ...bid, buyerName: e.target.value, buyerId: undefined });
                    setShowBuyerSuggestions(true);
                  }}
                  onFocus={() => setShowBuyerSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowBuyerSuggestions(false), 150)}
                  className="h-8 text-sm pr-7"
                  autoComplete="off"
                />
                <ChevronsUpDown className="w-3.5 h-3.5 absolute right-2 top-2 text-muted-foreground pointer-events-none" />
              </div>
              {showBuyerSuggestions && filteredBuyers.length > 0 && !bid.buyerId && (
                <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto top-full mt-1">
                  {filteredBuyers.map(b => (
                    <button
                      key={b.id}
                      data-testid={`suggestion-buyer-${b.id}`}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                      onMouseDown={() => {
                        onChange({ ...bid, buyerName: b.name, buyerId: b.id });
                        setShowBuyerSuggestions(false);
                      }}
                    >
                      <div className="font-medium">{b.name}</div>
                      {b.phone && <div className="text-xs text-muted-foreground">{b.phone}</div>}
                    </button>
                  ))}
                </div>
              )}
              {noBuyerSelected && (
                <div className="flex items-center gap-1 mt-1 text-orange-600 text-xs">
                  <AlertTriangle className="w-3 h-3" /> Select a buyer from the list
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

function LotCard({ lot, index, onChange, onRemove, onRemoveBid, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate, buyersList, onReturnLot }: {
  lot: LotRow; index: number;
  onChange: (l: LotRow) => void; onRemove: () => void;
  onRemoveBid?: (lotIndex: number, bidIndex: number) => void;
  vehicleBhadaRate: number; totalBagsInVehicle: number;
  cs: ChargeSettings; farmerDate: string;
  buyersList: { id: number; name: string; phone?: string }[];
  onReturnLot?: () => void;
}) {
  const [pendingDeleteBidIdx, setPendingDeleteBidIdx] = useState<number | null>(null);

  const setField = (f: keyof Omit<LotRow, "id" | "dbId" | "bids" | "lotOpen">, v: string) => onChange({ ...lot, [f]: v });
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

  const [showReturnConfirm, setShowReturnConfirm] = useState(false);

  return (
    <div className={`rounded-lg border ${lot.isReturned ? "border-orange-300 bg-orange-50/30 dark:border-orange-700 dark:bg-orange-950/20" : "border-border bg-card"} shadow-sm overflow-hidden`}>
      <div className="flex items-center bg-muted/30 border-b border-border">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
          onClick={() => onChange({ ...lot, lotOpen: !lot.lotOpen })}
          data-testid={`button-toggle-lot-${index}`}
        >
          {lot.lotOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Lot #{index + 1}</span>
          {lot.isReturned && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-orange-300 text-orange-600 dark:border-orange-700 dark:text-orange-400">
              Returned
            </Badge>
          )}
          {!lot.lotOpen && (
            <CollapsedSummary
              totalBags={totals.lotBags} remainingBags={totals.lotBags - totals.bidBags}
              farmerPayable={totals.farmerPayable} buyerReceivable={totals.buyerReceivable}
              hasData={totals.hasData}
              farmerPaymentStatus={aggregatePaymentStatus(lot.bids.filter(b => b.txnDbId).map(b => b.farmerPaymentStatus || "due"))}
              buyerPaymentStatus={aggregatePaymentStatus(lot.bids.filter(b => b.txnDbId).map(b => b.paymentStatus || "due"))}
            />
          )}
        </button>
        <div className="flex items-center gap-0.5 shrink-0 mr-1">
          {lot.dbId && !lot.isReturned && onReturnLot && (
            <button
              type="button"
              data-testid={`button-return-lot-${index}`}
              onClick={() => setShowReturnConfirm(true)}
              className="h-8 w-8 flex items-center justify-center text-orange-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors rounded"
              title="Return lot to farmer"
            >
              <Truck className="w-3.5 h-3.5" />
            </button>
          )}
          {!lot.isReturned && (
            <button
              type="button"
              data-testid={`button-remove-lot-${index}`}
              onClick={onRemove}
              className="h-8 w-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors rounded"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      <ConfirmDeleteDialog
        open={showReturnConfirm}
        title="Return this lot to farmer?"
        description={`Lot #${index + 1} will be marked as returned. Any unsold bags will be returned to the farmer. This cannot be undone.`}
        onConfirm={() => { setShowReturnConfirm(false); onReturnLot?.(); }}
        onCancel={() => setShowReturnConfirm(false)}
      />

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
                buyersList={buyersList}
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

function CropGroupSection({ group, onChange, onArchive, onDelete, isPersisted, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate, farmerName, currentUsername, onSyncSaved, buyersList, onReturnLot, farmerCard }: {
  group: CropGroup;
  onChange: (g: CropGroup) => void; onArchive: () => void; onDelete: () => void;
  isPersisted: boolean;
  vehicleBhadaRate: number; totalBagsInVehicle: number;
  cs: ChargeSettings; farmerDate: string; farmerName: string;
  currentUsername: string;
  onSyncSaved?: (updatedGroup: CropGroup) => void;
  buyersList: { id: number; name: string; phone?: string }[];
  onReturnLot?: (lotIdx: number) => void;
  farmerCard?: FarmerCard;
}) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [pendingDeleteLotIdx, setPendingDeleteLotIdx] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showReinstateConfirm, setShowReinstateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const { data: receiptTemplates = [] } = useQuery<ReceiptTemplate[]>({
    queryKey: ["/api/receipt-templates"],
  });

  const hasTransactions = isPersisted && group.lots.some(l => l.bids.some(b => b.txnDbId));

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
    const lot = group.lots[lotIndex];
    if (!lot) return;
    const deletedBid = lot.bids[bidIndex];
    const buyerName = deletedBid?.buyerName?.trim() || "";
    const now = format(new Date(), "dd/MM/yyyy HH:mm");
    const entry: EditEntry = {
      timestamp: now,
      username: currentUsername,
      changes: [{ kind: "deleted", path: `Lot ${lotIndex + 1} > Bid ${bidIndex + 1}`, detail: buyerName || undefined }],
    };
    onChange({
      ...group,
      lots: group.lots.map((l, i) => i === lotIndex ? { ...l, bids: l.bids.filter((_, j) => j !== bidIndex) } : l),
      editHistory: [...group.editHistory, entry],
    });
  };

  const confirmDeleteLot = () => {
    if (pendingDeleteLotIdx !== null) {
      const now = format(new Date(), "dd/MM/yyyy HH:mm");
      const entry: EditEntry = {
        timestamp: now,
        username: currentUsername,
        changes: [{ kind: "deleted", path: `Lot ${pendingDeleteLotIdx + 1}` }],
      };
      onChange({
        ...group,
        lots: group.lots.filter((_, i) => i !== pendingDeleteLotIdx),
        editHistory: [...group.editHistory, entry],
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

  const uniqueBuyers = (() => {
    if (!hasTransactions) return [];
    const map = new Map<number, string>();
    for (const lot of group.lots) {
      for (const bid of lot.bids) {
        if (bid.txnDbId && bid.buyerId) map.set(bid.buyerId, bid.buyerName);
      }
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  })();

  const fetchReceiptData = async (): Promise<{ sg: UnifiedSerialGroup; txnsByBuyerId: Map<number, BuyerLotEntry[]> } | null> => {
    if (!farmerCard) return null;
    const lotDbIds = group.lots.filter(l => l.dbId).map(l => l.dbId!);
    if (lotDbIds.length === 0) return null;
    try {
      const res = await apiRequest("GET", `/api/transactions?dateFrom=${farmerCard.date}&dateTo=${farmerCard.date}`);
      const allTxns: (Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid })[] = await res.json();
      const groupTxns = allTxns.filter(t => lotDbIds.includes(t.lotId) && !t.isReversed);
      if (groupTxns.length === 0) return null;

      const farmer: Farmer = {
        id: farmerCard.farmerId || 0,
        businessId: user?.businessId || 0,
        name: farmerCard.farmerName,
        phone: farmerCard.farmerPhone || null,
        village: farmerCard.village || null,
        tehsil: farmerCard.tehsil || null,
        district: farmerCard.district || null,
        state: farmerCard.state || null,
        isActive: true,
        isArchived: false,
      };

      const lotGroups: UnifiedLotGroup[] = [];
      const lotMap = new Map<number, UnifiedLotGroup>();
      for (const tx of groupTxns) {
        const key = tx.lotId;
        if (!lotMap.has(key)) {
          lotMap.set(key, { lotId: tx.lot.lotId, lot: tx.lot, farmer, pendingBids: [], completedTxns: [] });
        }
        lotMap.get(key)!.completedTxns.push(tx);
      }
      lotGroups.push(...lotMap.values());

      const sg: UnifiedSerialGroup = {
        serialNumber: parseInt(group.srNumber) || 0,
        date: farmerCard.date,
        farmer,
        lotGroups,
        allPendingBids: [],
        allCompletedTxns: groupTxns,
        totalBags: group.lots.reduce((s, l) => s + (parseInt(l.numberOfBags) || 0), 0),
      };

      const txnsByBuyerId = new Map<number, BuyerLotEntry[]>();
      for (const tx of groupTxns) {
        const buyerId = tx.buyerId;
        if (!txnsByBuyerId.has(buyerId)) txnsByBuyerId.set(buyerId, []);
        txnsByBuyerId.get(buyerId)!.push({ lot: tx.lot, tx });
      }

      return { sg, txnsByBuyerId };
    } catch (err: any) {
      toast({ title: "Failed to load receipt data", description: err?.message || "Please try again", variant: "destructive" });
      return null;
    }
  };

  const handleFarmerReceipt = async (action: "print" | "share") => {
    setReceiptLoading(true);
    try {
      const data = await fetchReceiptData();
      if (!data) { toast({ title: "No transaction data found", variant: "destructive" }); return; }
      const crop = data.sg.lotGroups[0]?.lot?.crop || "";
      const customTmpl = receiptTemplates.find(t => t.templateType === "farmer" && t.crop === crop)
        || receiptTemplates.find(t => t.templateType === "farmer" && t.crop === "");
      const html = customTmpl
        ? applyFarmerTemplate(customTmpl.templateHtml, data.sg, user?.businessName, user?.businessAddress, user?.businessPhone, user?.businessLicenceNo, user?.businessShopNo)
        : generateFarmerReceiptHtml(data.sg, user?.businessName, user?.businessAddress);
      if (action === "print") {
        await printReceipt(html);
      } else {
        const shortName = farmerName.trim().split(/\s+/).slice(0, 2).join("");
        await shareReceiptAsPdf(html, `Farmer_Receipt_${shortName}_${farmerDate}.pdf`);
      }
    } catch (err: any) {
      toast({ title: "Receipt error", description: err?.message || "Failed to generate receipt", variant: "destructive" });
    } finally { setReceiptLoading(false); }
  };

  const handleBuyerReceipt = async (buyerId: number, buyerName: string, action: "print" | "share") => {
    setReceiptLoading(true);
    try {
      const data = await fetchReceiptData();
      if (!data) { toast({ title: "No transaction data found", variant: "destructive" }); return; }
      const entries = data.txnsByBuyerId.get(buyerId);
      if (!entries || entries.length === 0) { toast({ title: "No transactions found for this buyer", variant: "destructive" }); return; }
      const crop = entries[0].lot.crop;
      const customTmpl = receiptTemplates.find(t => t.templateType === "buyer" && t.crop === crop)
        || receiptTemplates.find(t => t.templateType === "buyer" && t.crop === "");
      let html: string;
      if (entries.length === 1) {
        html = customTmpl
          ? applyBuyerTemplate(customTmpl.templateHtml, entries[0].lot, data.sg.farmer, entries[0].tx, user?.businessName, user?.businessAddress, user?.businessInitials, user?.businessPhone, user?.businessLicenceNo, user?.businessShopNo)
          : generateBuyerReceiptHtml(entries[0].lot, data.sg.farmer, entries[0].tx, user?.businessName, user?.businessAddress);
      } else {
        html = customTmpl
          ? applyCombinedBuyerTemplate(customTmpl.templateHtml, entries, data.sg.serialNumber, data.sg.date, user?.businessName, user?.businessAddress, user?.businessInitials, user?.businessPhone, user?.businessLicenceNo, user?.businessShopNo)
          : generateCombinedBuyerReceiptHtml(entries, data.sg.serialNumber, data.sg.date, user?.businessName, user?.businessAddress, user?.businessPhone);
      }
      if (action === "print") {
        await printReceipt(html);
      } else {
        const safeName = buyerName.replace(/[^a-zA-Z0-9]/g, "_");
        await shareReceiptAsPdf(html, `Buyer_Receipt_${safeName}_${crop}_${farmerDate}.pdf`);
      }
    } catch (err: any) {
      toast({ title: "Receipt error", description: err?.message || "Failed to generate receipt", variant: "destructive" });
    } finally { setReceiptLoading(false); }
  };

  if (group.archived) {
    return (
      <>
        <div className="rounded-xl border-2 border-amber-200 dark:border-amber-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 font-medium opacity-60">
              <Archive className="w-3.5 h-3.5 shrink-0" />
              <Wheat className="w-3.5 h-3.5 shrink-0" />
              <span>SR# {group.srNumber} {group.crop}</span>
              <span className="italic font-normal">— Archived</span>
            </div>
            <Button type="button" variant="outline" size="sm"
              onClick={() => setShowReinstateConfirm(true)}
              className="h-6 px-2 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/60"
              data-testid={`button-reinstate-${group.crop.toLowerCase()}`}>
              Reinstate
            </Button>
          </div>
        </div>
        <ReinstateDialog
          open={showReinstateConfirm}
          title={`Reinstate ${group.crop} (SR# ${group.srNumber})?`}
          description="All lots, bids, and payment details for this crop group will be included in calculations again, including dues and payments."
          onConfirm={async () => {
            setShowReinstateConfirm(false);
            const dbLots = group.lots.filter(l => l.dbId);
            try {
              for (const lot of dbLots) {
                await apiRequest("PATCH", `/api/lots/${lot.dbId}`, { isArchived: false });
              }
              if (dbLots.length > 0) {
                queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
                queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
                queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
                queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
              }
              const updatedGroup = { ...group, archived: false, groupOpen: true };
              onChange(updatedGroup);
              onSyncSaved?.(updatedGroup);
              toast({ title: "Crop group reinstated" });
            } catch (err: any) {
              toast({ title: "Failed to reinstate crop group", description: err?.message || "Please try again", variant: "destructive" });
            }
          }}
          onCancel={() => setShowReinstateConfirm(false)}
        />
      </>
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
              farmerPaymentStatus={aggregatePaymentStatus(group.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.farmerPaymentStatus || "due")))}
              buyerPaymentStatus={aggregatePaymentStatus(group.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.paymentStatus || "due")))}
            />
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {hasTransactions && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button" variant="ghost" size="sm"
                  onClick={e => e.stopPropagation()}
                  disabled={receiptLoading}
                  className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/40 shrink-0"
                  title="Print / Share Receipt"
                  data-testid={`button-receipt-${group.crop.toLowerCase()}`}
                >
                  <Printer className="w-3.5 h-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                <DropdownMenuItem onClick={() => handleFarmerReceipt("print")} data-testid="receipt-print-farmer">
                  <Printer className="w-3.5 h-3.5 mr-2" /> Print किसान रसीद
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleFarmerReceipt("share")} data-testid="receipt-share-farmer">
                  <Share2 className="w-3.5 h-3.5 mr-2" /> Share किसान रसीद
                </DropdownMenuItem>
                {uniqueBuyers.length > 0 && <DropdownMenuSeparator />}
                {uniqueBuyers.map(b => (
                  <div key={b.id}>
                    <DropdownMenuItem onClick={() => handleBuyerReceipt(b.id, b.name, "print")} data-testid={`receipt-print-buyer-${b.id}`}>
                      <Printer className="w-3.5 h-3.5 mr-2" /> Print {b.name} Receipt
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleBuyerReceipt(b.id, b.name, "share")} data-testid={`receipt-share-buyer-${b.id}`}>
                      <Share2 className="w-3.5 h-3.5 mr-2" /> Share {b.name} Receipt
                    </DropdownMenuItem>
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            type="button" variant="ghost" size="sm"
            onClick={e => { e.stopPropagation(); setShowHistory(true); }}
            className="h-7 px-2 gap-1 text-xs text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
            title="Edit History"
            data-testid={`button-history-${group.crop.toLowerCase()}`}
          >
            <History className="w-3.5 h-3.5" /> History
          </Button>
          {isPersisted ? (
            <Button
              type="button" variant="ghost" size="sm"
              onClick={e => { e.stopPropagation(); onArchive(); }}
              className="h-7 w-7 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 shrink-0"
              title="Archive this crop group"
              data-testid={`button-archive-${group.crop.toLowerCase()}`}
            >
              <Archive className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button
              type="button" variant="ghost" size="sm"
              onClick={e => {
                e.stopPropagation();
                if (group.lots.some(hasLotUserData)) { setShowDeleteConfirm(true); return; }
                onDelete();
              }}
              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
              title="Delete this crop group"
              data-testid={`button-delete-${group.crop.toLowerCase()}`}
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          )}
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
              buyersList={buyersList}
              onReturnLot={onReturnLot ? () => onReturnLot(idx) : undefined}
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

      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        title={`Delete "${group.crop}" group?`}
        description={`This crop group has data that will be permanently lost. This action cannot be undone.`}
        onConfirm={() => { setShowDeleteConfirm(false); onDelete(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// ─── Farmer card ──────────────────────────────────────────────────────────────

function FarmerCardComp({ card, savedCard, onChange, onSave, onSaveAndClose, onCancel, onArchive, onSyncSaved, cs, currentUsername }: {
  card: FarmerCard;
  savedCard: FarmerCard | null;
  onChange: (c: FarmerCard) => void;
  onSave: () => void;
  onSaveAndClose: () => void;
  onCancel: () => void;
  onArchive: () => void;
  onSyncSaved: (c: FarmerCard) => void;
  cs: ChargeSettings;
  currentUsername: string;
}) {
  const { toast } = useToast();
  const [pendingArchiveGroupIdx, setPendingArchiveGroupIdx] = useState<number | null>(null);
  const [showArchiveFarmer, setShowArchiveFarmer] = useState(false);
  const [showReinstateConfirm, setShowReinstateConfirm] = useState(false);
  const [showUnsaved, setShowUnsaved] = useState(false);
  const [districtOpen, setDistrictOpen] = useState(false);
  const [showFarmerSuggestions, setShowFarmerSuggestions] = useState(false);
  const [farmerSearchText, setFarmerSearchText] = useState("");
  const [showVillageSuggestions, setShowVillageSuggestions] = useState(false);
  const [showTehsilSuggestions, setShowTehsilSuggestions] = useState(false);

  const { data: farmerSuggestions = [] } = useQuery<any[]>({
    queryKey: ["/api/farmers", `?search=${farmerSearchText}`],
    enabled: farmerSearchText.length >= 1 && !card.farmerId,
  });

  const { data: locationData } = useQuery<{ villages: string[]; tehsils: string[] }>({
    queryKey: ["/api/farmers/locations"],
  });

  const { data: buyersData = [] } = useQuery<any[]>({
    queryKey: ["/api/buyers"],
  });
  const buyersList = buyersData.map((b: any) => ({ id: b.id, name: b.name, phone: b.phone || "" }));

  const filteredVillages = (locationData?.villages || []).filter(
    (v) => card.village.length >= 1 && v.toLowerCase().includes(card.village.toLowerCase()) && v.toLowerCase() !== card.village.toLowerCase()
  );
  const filteredTehsils = (locationData?.tehsils || []).filter(
    (t) => card.tehsil.length >= 1 && t.toLowerCase().includes(card.tehsil.toLowerCase()) && t.toLowerCase() !== card.tehsil.toLowerCase()
  );

  const selectFarmer = (f: any) => {
    onChange({
      ...card,
      farmerId: f.id,
      farmerName: f.name || "",
      farmerPhone: f.phone || "",
      village: f.village || "",
      tehsil: f.tehsil || "",
      district: f.district || "",
      state: f.state || "Madhya Pradesh",
    });
    setShowFarmerSuggestions(false);
    setFarmerSearchText("");
  };

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
  const deleteGroup = (idx: number) =>
    onChange({ ...card, cropGroups: card.cropGroups.filter((_, i) => i !== idx) });
  const archiveGroup = (idx: number) => setPendingArchiveGroupIdx(idx);
  const confirmArchiveGroup = async () => {
    if (pendingArchiveGroupIdx !== null) {
      const group = card.cropGroups[pendingArchiveGroupIdx];
      const dbLots = group.lots.filter(l => l.dbId);
      try {
        for (const lot of dbLots) {
          await apiRequest("PATCH", `/api/lots/${lot.dbId}`, { isArchived: true });
        }
        if (dbLots.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
          queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
        }
        const updatedCard = { ...card, cropGroups: card.cropGroups.map((g, i) => i === pendingArchiveGroupIdx ? { ...g, archived: true } : g) };
        onChange(updatedCard);
        onSyncSaved(updatedCard);
        toast({ title: "Crop group archived" });
      } catch (err: any) {
        toast({ title: "Failed to archive crop group", description: err?.message || "Please try again", variant: "destructive" });
      }
    }
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
            onClick={() => setShowReinstateConfirm(true)}
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
              farmerPaymentStatus={aggregatePaymentStatus(card.cropGroups.flatMap(g => g.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.farmerPaymentStatus || "due"))))}
              buyerPaymentStatus={aggregatePaymentStatus(card.cropGroups.flatMap(g => g.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.paymentStatus || "due"))))}
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
          {!card.archived && card.savedAt !== null && (
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
            <div className="space-y-3 pl-2">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="relative">
                  <Label className="text-xs text-muted-foreground">Name *</Label>
                  <Input data-testid="input-farmer-name" placeholder="Farmer name" value={card.farmerName}
                    onChange={e => {
                      const val = capFirst(e.target.value);
                      set("farmerName", val);
                      if (card.farmerId) {
                        set("farmerId", undefined);
                      }
                      if (val.length >= 1) {
                        setFarmerSearchText(val);
                        setShowFarmerSuggestions(true);
                      } else {
                        setShowFarmerSuggestions(false);
                      }
                    }}
                    onFocus={() => {
                      if (card.farmerName.length >= 1 && !card.farmerId) {
                        setFarmerSearchText(card.farmerName);
                        setShowFarmerSuggestions(true);
                      }
                    }}
                    onBlur={() => setTimeout(() => setShowFarmerSuggestions(false), 150)}
                    className="h-8 text-sm" autoComplete="off" />
                  {showFarmerSuggestions && farmerSuggestions.length > 0 && !card.farmerId && (
                    <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto top-full mt-1">
                      {farmerSuggestions.map((f: any) => (
                        <button
                          key={f.id}
                          data-testid={`suggestion-farmer-${f.id}`}
                          type="button"
                          className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                          onMouseDown={() => selectFarmer(f)}
                        >
                          <div className="font-medium">{f.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {f.phone && <span>{f.phone}</span>}
                            {f.village && <span> · {f.village}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Phone</Label>
                  <Input data-testid="input-farmer-phone" type="tel" inputMode="numeric" placeholder="10-digit mobile" value={card.farmerPhone} onChange={e => set("farmerPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-8 text-sm" />
                </div>
                <div className="relative">
                  <Label className="text-xs text-muted-foreground">Village</Label>
                  <Input data-testid="input-village" placeholder="Village" value={card.village}
                    onChange={e => { set("village", capFirst(e.target.value)); setShowVillageSuggestions(true); }}
                    onFocus={() => setShowVillageSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowVillageSuggestions(false), 150)}
                    className="h-8 text-sm" autoComplete="off" />
                  {showVillageSuggestions && filteredVillages.length > 0 && (
                    <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto top-full">
                      {filteredVillages.map((v) => (
                        <button key={v} type="button" data-testid={`suggestion-village-${v}`}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                          onMouseDown={() => { set("village", v); setShowVillageSuggestions(false); }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Label className="text-xs text-muted-foreground">Tehsil</Label>
                  <Input data-testid="input-tehsil" placeholder="Tehsil" value={card.tehsil}
                    onChange={e => { set("tehsil", capFirst(e.target.value)); setShowTehsilSuggestions(true); }}
                    onFocus={() => setShowTehsilSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTehsilSuggestions(false), 150)}
                    className="h-8 text-sm" autoComplete="off" />
                  {showTehsilSuggestions && filteredTehsils.length > 0 && (
                    <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto top-full">
                      {filteredTehsils.map((t) => (
                        <button key={t} type="button" data-testid={`suggestion-tehsil-${t}`}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                          onMouseDown={() => { set("tehsil", t); setShowTehsilSuggestions(false); }}>
                          {t}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">District</Label>
                  <Popover open={districtOpen} onOpenChange={setDistrictOpen}>
                    <PopoverTrigger asChild>
                      <Button data-testid="select-district" variant="outline" role="combobox" aria-expanded={districtOpen} className="h-8 w-full justify-between text-sm font-normal">
                        {card.district || <span className="text-muted-foreground">Select district</span>}
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
                              <CommandItem key={d} value={d} onSelect={() => { set("district", d); setDistrictOpen(false); }} className="text-sm">
                                <Check className={`mr-2 h-3.5 w-3.5 ${card.district === d ? "opacity-100" : "opacity-0"}`} />
                                {d}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">State</Label>
                  <Select value={card.state} onValueChange={v => set("state", v)}>
                    <SelectTrigger data-testid="select-state" className="h-8 text-sm">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Madhya Pradesh">Madhya Pradesh</SelectItem>
                      <SelectItem value="Gujarat">Gujarat</SelectItem>
                      <SelectItem value="Uttar Pradesh">Uttar Pradesh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Farmer Advance ₹</Label>
                  <Input data-testid="input-farmer-advance" type="number" placeholder="0" value={card.advanceAmount} onChange={e => set("advanceAmount", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Mode</Label>
                  <Select value={card.advanceMode} onValueChange={v => set("advanceMode", v)}>
                    <SelectTrigger data-testid="select-advance-mode" className="h-8 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Account">Account</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Vehicle info */}
          <SectionToggle open={card.vehicleOpen} onToggle={() => set("vehicleOpen", !card.vehicleOpen)}
            icon={<Truck className="w-3.5 h-3.5" />} label="Vehicle Info"
            count={card.vehicleNumber || undefined} />
          {card.vehicleOpen && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 pl-2">
              <div>
                <Label className="text-xs text-muted-foreground">Vehicle #</Label>
                <Input data-testid="input-vehicle-number" placeholder="E.G. MP09AB1234" value={card.vehicleNumber} onChange={e => set("vehicleNumber", e.target.value.toUpperCase())} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Driver Name</Label>
                <Input data-testid="input-driver-name" placeholder="Optional" value={card.driverName} onChange={e => set("driverName", capFirst(e.target.value))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Driver Contact</Label>
                <Input data-testid="input-driver-contact" type="tel" inputMode="numeric" placeholder="Optional" value={card.driverContact} onChange={e => set("driverContact", e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Freight/Bhada (₹) <span className="text-destructive">*</span></Label>
                <Input data-testid="input-bhada-rate" type="text" inputMode="decimal" placeholder="0.00" value={card.vehicleBhadaRate} onChange={e => set("vehicleBhadaRate", toNum(e.target.value))} onFocus={e => e.target.select()} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Advance / Credit <span className="text-destructive">*</span></Label>
                <Select value={card.freightType} onValueChange={v => set("freightType", v)}>
                  <SelectTrigger data-testid="select-freight-type" className="h-8 text-sm">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Advance">Advance</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Total # of Bags <span className="text-destructive">*</span></Label>
                <Input data-testid="input-total-bags-vehicle" type="text" inputMode="numeric" placeholder="0" value={card.totalBagsInVehicle} onChange={e => set("totalBagsInVehicle", e.target.value.replace(/\D/g, ""))} onFocus={e => e.target.select()} className="h-8 text-sm" />
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
                onDelete={() => deleteGroup(idx)}
                isPersisted={group.persisted}
                vehicleBhadaRate={vehicleBhadaRate}
                totalBagsInVehicle={totalBagsInVehicle}
                cs={cs}
                farmerDate={card.date}
                farmerName={card.farmerName}
                currentUsername={currentUsername}
                farmerCard={card}
                onSyncSaved={(updatedGroup) => {
                  const updatedCard = { ...card, cropGroups: card.cropGroups.map((g, i) => i === idx ? updatedGroup : g) };
                  onSyncSaved(updatedCard);
                }}
                buyersList={buyersList}
                onReturnLot={async (lotIdx) => {
                  const lot = group.lots[lotIdx];
                  if (!lot?.dbId) return;
                  try {
                    await apiRequest("POST", `/api/lots/${lot.dbId}/return`);
                    const updatedLots = group.lots.map((l, i) => i === lotIdx ? { ...l, isReturned: true } : l);
                    const updatedGroup = { ...group, lots: updatedLots };
                    updateGroup(idx, updatedGroup);
                    onSyncSaved({ ...card, cropGroups: card.cropGroups.map((g, i) => i === idx ? updatedGroup : g) });
                    queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/transaction-edit-history"] });
                    queryClient.invalidateQueries({ predicate: (query) => {
                      const key = query.queryKey[0];
                      return typeof key === "string" && key.startsWith("/api/buyers");
                    }});
                    queryClient.invalidateQueries({ predicate: (query) => {
                      const key = query.queryKey[0];
                      return typeof key === "string" && key.startsWith("/api/farmers");
                    }});
                    queryClient.invalidateQueries({ predicate: (query) => {
                      const key = query.queryKey[0];
                      return typeof key === "string" && key.startsWith("/api/cash-entries");
                    }});
                    toast({ title: "Lot returned", description: `Lot #${lotIdx + 1} has been returned to farmer` });
                  } catch (err: any) {
                    toast({ title: "Failed to return lot", description: err?.message || "Please try again", variant: "destructive" });
                  }
                }}
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
              className="h-8 text-sm gap-1.5 border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950"
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

      {/* Reinstate confirmation */}
      <ReinstateDialog
        open={showReinstateConfirm}
        title={`Reinstate ${card.farmerName.trim() || "this farmer"}?`}
        description="This farmer entry and all its crop groups, lots, and bids will be included in all calculations again, including dues and payments."
        onConfirm={async () => {
          setShowReinstateConfirm(false);
          if (card.farmerId) {
            try {
              await apiRequest("PATCH", `/api/farmers/${card.farmerId}`, { isArchived: false });
              queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
              queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
              queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
              queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
              const updatedCard = { ...card, archived: false, cardOpen: true };
              onChange(updatedCard);
              onSyncSaved(updatedCard);
              toast({ title: "Farmer reinstated" });
            } catch (err: any) {
              toast({ title: "Failed to reinstate farmer", description: err?.message || "Please try again", variant: "destructive" });
            }
          } else {
            onChange({ ...card, archived: false, cardOpen: true });
          }
        }}
        onCancel={() => setShowReinstateConfirm(false)}
      />
    </Card>
  );
}

// ─── Convert API stock-card response into FarmerCard[] ────────────────────────

function stockCardsToFarmerCards(apiCards: any[]): FarmerCard[] {
  return apiCards.map((c: any) => {
    const farmer = c.farmer || {};
    const card: FarmerCard = {
      id: c.cardKey || uid(),
      farmerId: farmer.id,
      date: c.date,
      farmerName: farmer.name || "",
      farmerPhone: farmer.phone || "",
      village: farmer.village || "",
      tehsil: farmer.tehsil || "",
      district: farmer.district || "",
      state: farmer.state || "Madhya Pradesh",
      vehicleNumber: c.vehicleNumber || "",
      driverName: c.driverName || "",
      driverContact: c.driverContact || "",
      vehicleBhadaRate: c.vehicleBhadaRate || "",
      totalBagsInVehicle: c.totalBagsInVehicle?.toString() || "",
      freightType: c.freightType || "",
      advanceAmount: c.farmerAdvanceAmount || "",
      advanceMode: c.farmerAdvanceMode || "",
      cropGroups: (c.cropGroups || []).map((cg: any) => ({
        id: uid(),
        crop: cg.crop,
        srNumber: cg.srNumber || "XX",
        groupOpen: false,
        lots: (cg.lots || []).map((lot: any) => ({
          id: uid(),
          dbId: lot.dbId,
          lotOpen: false,
          numberOfBags: lot.numberOfBags?.toString() || "",
          size: lot.size || "None",
          variety: lot.variety || "",
          bagMarka: lot.bagMarka || "",
          isReturned: lot.isReturned || false,
          bids: (lot.bids || []).map((b: any) => {
            const txn = b.transaction;
            return {
              id: uid(),
              bidDbId: b.bidId,
              buyerId: b.buyerId,
              txnDbId: txn?.txnId,
              bidOpen: false,
              buyerName: b.buyerName || "",
              pricePerKg: b.pricePerKg?.toString() || "",
              numberOfBags: b.numberOfBags?.toString() || "",
              paymentType: b.paymentType || "Credit",
              advanceAmount: b.advanceAmount?.toString() || "0",
              txnDate: txn?.date || lot.date || c.date || format(new Date(), "yyyy-MM-dd"),
              txn: txn ? {
                netWeightInput: txn.netWeight?.toString() || "",
                showWeightCalc: false,
                sampleWeights: ["", "", ""],
                extraChargesFarmer: txn.extraChargesFarmer?.toString() || "0",
                extraChargesBuyer: txn.extraChargesBuyer?.toString() || "0",
                extraPerKgFarmer: txn.extraPerKgFarmer?.toString() || "0",
                extraPerKgBuyer: txn.extraPerKgBuyer?.toString() || "0",
                showExtraBreakdown: false,
                extraTulai: txn.extraTulaiFarmer?.toString() || "0",
                extraBharai: txn.extraBharaiFarmer?.toString() || "0",
                extraKhadiKarai: txn.extraKhadiKaraiFarmer?.toString() || "0",
                extraThelaBhada: txn.extraThelaBhadaFarmer?.toString() || "0",
                extraOthers: txn.extraOthersFarmer?.toString() || "0",
              } : emptyTxn(),
              paymentStatus: txn?.paymentStatus || "due",
              farmerPaymentStatus: txn?.farmerPaymentStatus || "due",
            } as BidRow;
          }),
        })),
        archived: cg.isArchived || false,
        persisted: true,
        editHistory: [],
      })),
      cardOpen: false,
      farmerOpen: false,
      vehicleOpen: false,
      archived: farmer.isArchived || false,
      savedAt: c.latestCreatedAt ? format(new Date(c.latestCreatedAt), "dd/MM/yyyy HH:mm") : "loaded",
    };
    return card;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const [cards, setCards] = useState<FarmerCard[]>([]);
  const [savedCardMap, setSavedCardMap] = useState<Map<string, FarmerCard>>(new Map());
  const [saving, setSaving] = useState(false);
  const dbLoaded = useRef(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const currentUsername = user?.name || user?.username || "Unknown";

  const { data: stockCardsData, isLoading: loadingCards } = useQuery<any[]>({
    queryKey: ["/api/stock-cards"],
  });

  const { data: chargeSettings } = useQuery<ChargeSettings>({
    queryKey: ["/api/charge-settings"],
  });

  const cs = chargeSettings || DEFAULT_CS;

  useEffect(() => {
    if (!stockCardsData || dbLoaded.current) return;
    dbLoaded.current = true;
    const loaded = stockCardsToFarmerCards(stockCardsData);
    const map = new Map<string, FarmerCard>();
    loaded.forEach(c => map.set(c.id, JSON.parse(JSON.stringify(c))));
    setCards(loaded.length > 0 ? loaded : [emptyCard()]);
    setSavedCardMap(map);
  }, [stockCardsData]);

  const anyDirty = cards.some(c => {
    if (c.archived) return false;
    const saved = savedCardMap.get(c.id) ?? null;
    return saved ? getDataFingerprint(c) !== getDataFingerprint(saved) : !!(c.farmerName.trim() || c.farmerPhone || c.village || c.vehicleNumber || c.advanceAmount || c.cropGroups.some(g => g.lots.some(hasLotUserData)));
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

  const saveCard = async (idx: number, collapseAfter = false) => {
    const card = cards[idx];
    if (!card.farmerName.trim()) {
      toast({ title: "Error", description: "Farmer name is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      let currentFarmerId = card.farmerId;

      if (!currentFarmerId) {
        const dupRes = await apiRequest("POST", "/api/farmers/check-duplicate", {
          name: card.farmerName.trim(),
          phone: card.farmerPhone.trim(),
          village: card.village.trim(),
        });
        const dupData = await dupRes.json();
        if (dupData.duplicate) {
          currentFarmerId = dupData.duplicate.id;
        } else {
          const createRes = await apiRequest("POST", "/api/farmers", {
            name: capFirst(card.farmerName.trim()),
            phone: card.farmerPhone.trim(),
            village: capFirst(card.village.trim()),
            tehsil: capFirst(card.tehsil.trim()),
            district: card.district,
            state: card.state,
          });
          const newFarmer = await createRes.json();
          currentFarmerId = newFarmer.id;
        }
      } else {
        await apiRequest("PATCH", `/api/farmers/${currentFarmerId}`, {
          name: capFirst(card.farmerName.trim()),
          phone: card.farmerPhone.trim(),
          village: capFirst(card.village.trim()),
          tehsil: capFirst(card.tehsil.trim()),
          district: card.district,
          state: card.state,
        });
      }

      const unmatchedBuyers: string[] = [];
      for (const group of card.cropGroups) {
        for (const lot of group.lots) {
          for (const bid of lot.bids) {
            if (bid.buyerName.trim() && !bid.buyerId) {
              unmatchedBuyers.push(bid.buyerName.trim());
            }
          }
        }
      }
      if (unmatchedBuyers.length > 0) {
        toast({ title: "Buyer not selected", description: `Please select a buyer from the dropdown for: ${unmatchedBuyers.join(", ")}. Bids without a matched buyer will not be saved.`, variant: "destructive" });
      }

      const newLots: { groupIdx: number; lotIdx: number; lotData: any }[] = [];
      const existingLots: { dbId: number; lotData: any }[] = [];
      const dbIdUpdates: { groupIdx: number; lotIdx: number; dbId: number; srNumber?: string }[] = [];

      for (let gIdx = 0; gIdx < card.cropGroups.length; gIdx++) {
        const group = card.cropGroups[gIdx];
        for (let lIdx = 0; lIdx < group.lots.length; lIdx++) {
          const lot = group.lots[lIdx];
          const lotPayload = {
            crop: group.crop,
            variety: lot.variety || null,
            numberOfBags: parseInt(lot.numberOfBags) || 0,
            size: lot.size === "None" ? null : lot.size || null,
            bagMarka: lot.bagMarka || null,
            vehicleNumber: card.vehicleNumber ? card.vehicleNumber.toUpperCase() : null,
            vehicleBhadaRate: card.vehicleBhadaRate || null,
            driverName: card.driverName || null,
            driverContact: card.driverContact || null,
            freightType: card.freightType || null,
            totalBagsInVehicle: card.totalBagsInVehicle ? parseInt(card.totalBagsInVehicle) : null,
            farmerAdvanceAmount: card.advanceAmount || null,
            farmerAdvanceMode: card.advanceMode || null,
            isArchived: group.archived,
          };

          if (lot.dbId) {
            existingLots.push({ dbId: lot.dbId, lotData: lotPayload });
          } else if (!group.archived && parseInt(lot.numberOfBags) > 0) {
            newLots.push({ groupIdx: gIdx, lotIdx: lIdx, lotData: lotPayload });
          }
        }
      }

      for (const { dbId, lotData } of existingLots) {
        await apiRequest("PATCH", `/api/lots/${dbId}`, lotData);
      }

      if (newLots.length > 0) {
        const batchRes = await apiRequest("POST", "/api/lots/batch", {
          farmerId: currentFarmerId,
          date: card.date,
          vehicleNumber: card.vehicleNumber ? card.vehicleNumber.toUpperCase() : null,
          driverName: card.driverName || null,
          driverContact: card.driverContact || null,
          vehicleBhadaRate: card.vehicleBhadaRate || null,
          freightType: card.freightType || null,
          totalBagsInVehicle: card.totalBagsInVehicle ? parseInt(card.totalBagsInVehicle) : null,
          farmerAdvanceAmount: card.advanceAmount || null,
          farmerAdvanceMode: card.advanceMode || null,
          lots: newLots.map(nl => ({
            crop: nl.lotData.crop,
            variety: nl.lotData.variety,
            numberOfBags: nl.lotData.numberOfBags,
            size: nl.lotData.size,
            bagMarka: nl.lotData.bagMarka,
          })),
        });
        const createdLots = await batchRes.json();

        newLots.forEach((nl, i) => {
          if (createdLots[i]) {
            dbIdUpdates.push({
              groupIdx: nl.groupIdx,
              lotIdx: nl.lotIdx,
              dbId: createdLots[i].id,
              srNumber: createdLots[i].serialNumber?.toString(),
            });
          }
        });
      }

      let finalGroups = card.cropGroups.map((g, gIdx) => {
        let updatedLots = g.lots;
        let updatedSrNumber = g.srNumber;
        const groupUpdates = dbIdUpdates.filter(u => u.groupIdx === gIdx);
        if (groupUpdates.length > 0) {
          updatedLots = g.lots.map((lot, lIdx) => {
            const update = groupUpdates.find(u => u.lotIdx === lIdx);
            return update ? { ...lot, dbId: update.dbId } : lot;
          });
          if (updatedSrNumber === "XX" && groupUpdates[0]?.srNumber) {
            updatedSrNumber = groupUpdates[0].srNumber;
          }
        }
        return { ...g, lots: updatedLots, srNumber: updatedSrNumber };
      });

      const prevSavedCard = savedCardMap.get(card.id);

      for (let gIdx = 0; gIdx < finalGroups.length; gIdx++) {
        const group = finalGroups[gIdx];
        for (let lIdx = 0; lIdx < group.lots.length; lIdx++) {
          const lot = group.lots[lIdx];
          if (!lot.dbId || lot.isReturned) continue;

          const savedGroup = prevSavedCard?.cropGroups.find(sg => sg.id === group.id);
          const savedLot = savedGroup?.lots.find(sl => sl.id === lot.id);
          const savedBidMap = new Map((savedLot?.bids || []).filter(b => b.bidDbId).map(b => [b.bidDbId!, b]));

          const currentBidDbIds = new Set(lot.bids.filter(b => b.bidDbId).map(b => b.bidDbId!));
          const restoredBids: BidRow[] = [];
          for (const [deletedBidDbId, deletedBid] of Array.from(savedBidMap.entries())) {
            if (!currentBidDbIds.has(deletedBidDbId)) {
              if (deletedBid.txnDbId) {
                toast({ title: "Warning", description: `Cannot delete bid for ${deletedBid.buyerName} — it has an active transaction. Restoring bid.`, variant: "destructive" });
                restoredBids.push(deletedBid);
                continue;
              }
              try {
                await apiRequest("DELETE", `/api/bids/${deletedBidDbId}`);
              } catch (err: any) {
                toast({ title: "Warning", description: `Failed to delete bid: ${err.message}`, variant: "destructive" });
                restoredBids.push(deletedBid);
              }
            }
          }

          const updatedBids: BidRow[] = [...restoredBids];
          for (const bid of lot.bids) {
            if (!bid.buyerId || !bid.pricePerKg || !(parseInt(bid.numberOfBags) > 0)) {
              updatedBids.push(bid);
              continue;
            }

            let bidDbId = bid.bidDbId;

            if (!bidDbId) {
              try {
                const bidRes = await apiRequest("POST", "/api/bids", {
                  lotId: lot.dbId,
                  buyerId: bid.buyerId,
                  pricePerKg: bid.pricePerKg,
                  numberOfBags: parseInt(bid.numberOfBags),
                  paymentType: bid.paymentType || "Credit",
                  advanceAmount: bid.advanceAmount || "0",
                });
                const createdBid = await bidRes.json();
                bidDbId = createdBid.id;
              } catch (err: any) {
                toast({ title: "Warning", description: `Failed to create bid: ${err.message}`, variant: "destructive" });
                updatedBids.push(bid);
                continue;
              }
            } else {
              const savedBid = savedBidMap.get(bidDbId);
              const changed = !savedBid ||
                savedBid.buyerId !== bid.buyerId ||
                savedBid.pricePerKg !== bid.pricePerKg ||
                savedBid.numberOfBags !== bid.numberOfBags ||
                savedBid.paymentType !== bid.paymentType ||
                savedBid.advanceAmount !== bid.advanceAmount;
              if (changed) {
                try {
                  await apiRequest("PATCH", `/api/bids/${bidDbId}`, {
                    buyerId: bid.buyerId,
                    pricePerKg: bid.pricePerKg,
                    numberOfBags: parseInt(bid.numberOfBags),
                    paymentType: bid.paymentType || "Credit",
                    advanceAmount: bid.advanceAmount || "0",
                  });
                } catch (err: any) {
                  toast({ title: "Warning", description: `Failed to update bid: ${err.message}`, variant: "destructive" });
                }
              }
            }

            let txnDbId = bid.txnDbId;
            const nw = parseFloat(bid.txn.netWeightInput) || 0;

            if (txnDbId) {
              const ppkCheck = parseFloat(bid.pricePerKg) || 0;
              const bagsCheck = parseInt(bid.numberOfBags) || 0;
              if (ppkCheck <= 0) {
                toast({ title: "Save blocked", description: `Price per kg cannot be 0 for a bid with an existing transaction (buyer: ${bid.buyerName}). Please enter a valid price.`, variant: "destructive" });
                throw new Error("Price per kg cannot be 0 for a bid with an existing transaction.");
              }
              if (bagsCheck <= 0) {
                toast({ title: "Save blocked", description: `Number of bags cannot be 0 for a bid with an existing transaction (buyer: ${bid.buyerName}). Please enter a valid bag count.`, variant: "destructive" });
                throw new Error("Number of bags cannot be 0 for a bid with an existing transaction.");
              }
              if (nw <= 0) {
                toast({ title: "Save blocked", description: `Net weight cannot be 0 for a bid with an existing transaction (buyer: ${bid.buyerName}). Please enter a valid weight.`, variant: "destructive" });
                throw new Error("Net weight cannot be 0 for a bid with an existing transaction.");
              }
            }

            if (bidDbId && nw > 0) {
              const vehicleBR = parseFloat(card.vehicleBhadaRate) || 0;
              const totalBIV = parseInt(card.totalBagsInVehicle) || 0;
              const bidBags = parseInt(bid.numberOfBags) || 0;
              const ppk = parseFloat(bid.pricePerKg) || 0;
              const epkF = parseFloat(bid.txn.extraPerKgFarmer) || 0;
              const epkB = parseFloat(bid.txn.extraPerKgBuyer) || 0;
              const farmerGross = nw * (ppk + epkF);
              const buyerGross = nw * (ppk + epkB);
              const hfRate = parseFloat(cs.hammaliFarmerPerBag) || 0;
              const hbRate = parseFloat(cs.hammaliBuyerPerBag) || 0;
              const extraF = parseFloat(bid.txn.extraChargesFarmer) || 0;
              const extraB = parseFloat(bid.txn.extraChargesBuyer) || 0;
              const aadhatFPct = parseFloat(cs.aadhatCommissionFarmerPercent) || 0;
              const aadhatBPct = parseFloat(cs.aadhatCommissionBuyerPercent) || 0;
              const mandiFPct = parseFloat(cs.mandiCommissionFarmerPercent) || 0;
              const mandiBPct = parseFloat(cs.mandiCommissionBuyerPercent) || 0;
              const freight = totalBIV > 0 ? (vehicleBR * bidBags) / totalBIV : 0;
              const hammaliFarmerTotal = hfRate * bidBags;
              const hammaliBuyerTotal = hbRate * bidBags;
              const aadhatFarmer = (farmerGross * aadhatFPct) / 100;
              const mandiFarmer = (farmerGross * mandiFPct) / 100;
              const aadhatBuyer = (buyerGross * aadhatBPct) / 100;
              const mandiBuyer = (buyerGross * mandiBPct) / 100;
              const farmerDed = hammaliFarmerTotal + extraF + aadhatFarmer + mandiFarmer + freight;
              const buyerAdd = hammaliBuyerTotal + extraB + aadhatBuyer + mandiBuyer;
              const farmerPayable = farmerGross - farmerDed;
              const buyerReceivable = buyerGross + buyerAdd;

              const txnPayload: Record<string, string | number | null> = {
                lotId: lot.dbId,
                bidId: bidDbId,
                buyerId: bid.buyerId,
                farmerId: currentFarmerId!,
                netWeight: nw.toFixed(2),
                totalWeight: nw.toFixed(2),
                numberOfBags: bidBags,
                pricePerKg: ppk.toFixed(2),
                extraChargesFarmer: extraF.toFixed(2),
                extraChargesBuyer: extraB.toFixed(2),
                extraPerKgFarmer: epkF.toFixed(2),
                extraPerKgBuyer: epkB.toFixed(2),
                extraTulaiFarmer: (parseFloat(bid.txn.extraTulai) || 0).toFixed(2),
                extraBharaiFarmer: (parseFloat(bid.txn.extraBharai) || 0).toFixed(2),
                extraKhadiKaraiFarmer: (parseFloat(bid.txn.extraKhadiKarai) || 0).toFixed(2),
                extraThelaBhadaFarmer: (parseFloat(bid.txn.extraThelaBhada) || 0).toFixed(2),
                extraOthersFarmer: (parseFloat(bid.txn.extraOthers) || 0).toFixed(2),
                hammaliCharges: hammaliFarmerTotal.toFixed(2),
                freightCharges: freight.toFixed(2),
                aadhatCharges: aadhatFarmer.toFixed(2),
                mandiCharges: mandiFarmer.toFixed(2),
                aadhatFarmerPercent: aadhatFPct.toFixed(2),
                mandiFarmerPercent: mandiFPct.toFixed(2),
                aadhatBuyerPercent: aadhatBPct.toFixed(2),
                mandiBuyerPercent: mandiBPct.toFixed(2),
                hammaliFarmerPerBag: hfRate.toFixed(2),
                hammaliBuyerPerBag: hbRate.toFixed(2),
                totalPayableToFarmer: farmerPayable.toFixed(2),
                totalReceivableFromBuyer: buyerReceivable.toFixed(2),
                date: bid.txnDate || card.date,
              };

              if (!txnDbId) {
                try {
                  const txnRes = await apiRequest("POST", "/api/transactions", txnPayload);
                  const createdTxn = await txnRes.json();
                  txnDbId = createdTxn.id;
                } catch (err: any) {
                  toast({ title: "Warning", description: `Failed to create transaction: ${err.message}`, variant: "destructive" });
                }
              } else {
                try {
                  await apiRequest("PATCH", `/api/transactions/${txnDbId}`, txnPayload);
                } catch (err: any) {
                  toast({ title: "Warning", description: `Failed to update transaction: ${err.message}`, variant: "destructive" });
                }
              }
            }

            updatedBids.push({ ...bid, bidDbId, txnDbId });
          }

          finalGroups = finalGroups.map((fg, gi) =>
            gi === gIdx ? { ...fg, lots: fg.lots.map((fl, li) => li === lIdx ? { ...fl, bids: updatedBids } : fl) } : fg
          );
        }
      }

      const savedCard = savedCardMap.get(card.id);
      const isFirstSave = !savedCard;
      const now = format(new Date(), "dd/MM/yyyy HH:mm");
      const updatedCard: FarmerCard = {
        ...card,
        farmerId: currentFarmerId,
        cardOpen: collapseAfter ? false : card.cardOpen,
        savedAt: now,
        cropGroups: finalGroups.map(g => {
          const withPersisted = { ...g, persisted: true };
          if (isFirstSave) return withPersisted;
          const savedGroup = savedCard!.cropGroups.find(sg => sg.id === g.id);
          if (!savedGroup) return withPersisted;
          const allDiffChanges = diffCropGroup(savedGroup, g);
          const alreadyLogged = new Set(
            g.editHistory
              .slice(savedGroup.editHistory.length)
              .flatMap(e => e.changes?.filter(c => c.kind === "deleted").map(c => c.path) ?? [])
          );
          const changes = allDiffChanges.filter(c => !(c.kind === "deleted" && alreadyLogged.has(c.path)));
          if (changes.length === 0) return withPersisted;
          return { ...withPersisted, editHistory: [...g.editHistory, { timestamp: now, username: currentUsername, changes }] };
        }),
      };

      setCards(prev => prev.map((c, i) => (i === idx ? updatedCard : c)));
      setSavedCardMap(prev => new Map(prev).set(card.id, JSON.parse(JSON.stringify(updatedCard))));

      queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers/locations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transaction-edit-history"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/farmers");
      }});
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/cash-entries");
      }});

      toast({ title: "Saved", description: `${card.farmerName.trim()} entry saved successfully` });
    } catch (err: any) {
      toast({ title: "Save Failed", description: err.message || "An error occurred while saving", variant: "destructive" });
    } finally {
      setSaving(false);
    }
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

  const archiveCard = async (idx: number) => {
    const card = cards[idx];
    if (card.farmerId) {
      try {
        await apiRequest("PATCH", `/api/farmers/${card.farmerId}`, { isArchived: true });
        queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
        queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      } catch (err: any) {
        toast({ title: "Archive Failed", description: err.message, variant: "destructive" });
        return;
      }
    }
    setCards(prev => prev.map((c, i) => (i === idx ? { ...c, archived: true, cardOpen: false } : c)));
  };

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
        {loadingCards && (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-muted-foreground">Loading stock entries...</div>
          </div>
        )}
        {cards.map((card, idx) => (
          <FarmerCardComp
            key={card.id} card={card}
            savedCard={savedCardMap.get(card.id) ?? null}
            onChange={c => updateCard(idx, c)}
            onSave={() => saveCard(idx)}
            onSaveAndClose={() => saveCard(idx, true)}
            onCancel={() => cancelCard(idx)}
            onArchive={() => archiveCard(idx)}
            onSyncSaved={c => setSavedCardMap(prev => new Map(prev).set(c.id, JSON.parse(JSON.stringify(c))))}
            cs={cs}
            currentUsername={currentUsername}
          />
        ))}
      </div>
    </div>
  );
}
