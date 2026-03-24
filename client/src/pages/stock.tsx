import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";
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
  AlertTriangle, AlertCircle, Scale, Wheat, ChevronsUpDown, X, Calculator,
  Archive, History, Save, Check, Printer, Share2, Loader2,
  Layers, Landmark, ShoppingBag, Calendar, Search, Filter, RotateCcw, Download, ClipboardList,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { CROPS, SIZES, DISTRICTS } from "@shared/schema";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup } from "@/components/ui/command";
import { printReceipt, shareReceiptAsImage, generateBidCopyHtml, type BidCropSection } from "@/lib/receiptUtils";
import {
  generateFarmerReceiptHtml, generateBuyerReceiptHtml, generateCombinedBuyerReceiptHtml,
  generateAllBuyerReceiptHtml,
  applyFarmerTemplate, applyBuyerTemplate, applyCombinedBuyerTemplate,
  type UnifiedSerialGroup, type UnifiedLotGroup, type BuyerLotEntry, type TransactionWithDetails,
} from "@/lib/receiptGenerators";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useLanguage } from "@/lib/language";
import type { Lot, Farmer, Transaction, Bid, Buyer, ReceiptTemplate } from "@shared/schema";

const capFirst = (s: string) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
const toNum = (v: string) => v.replace(/[^0-9.]/g, "");

// ─── Types ────────────────────────────────────────────────────────────────────

type ChargeSettings = {
  mandiCommissionFarmerPercent: string;
  mandiCommissionBuyerPercent: string;
  aadhatCommissionFarmerPercent: string;
  aadhatCommissionBuyerPercent: string;
  muddatAnyaFarmerPercent: string;
  muddatAnyaBuyerPercent: string;
  hammaliFarmerPerBag: string;
  hammaliBuyerPerBag: string;
};

const DEFAULT_CS: ChargeSettings = {
  mandiCommissionFarmerPercent: "0",
  mandiCommissionBuyerPercent: "1",
  aadhatCommissionFarmerPercent: "0",
  aadhatCommissionBuyerPercent: "2",
  muddatAnyaFarmerPercent: "0",
  muddatAnyaBuyerPercent: "0",
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
  savedCharges?: ChargeSettings;
  paymentStatus?: "due" | "paid" | "partial";
  farmerPaymentStatus?: "due" | "paid" | "partial";
  farmerPaidAmount?: string;
  savedBuyerReceivable?: number;
  savedFarmerPayable?: number;
  paidAmount?: string;
};

type LotRow = {
  id: string;
  dbId?: number;
  lotId?: string;
  lotOpen: boolean;
  isArchived?: boolean;
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

const LOT_FIELD_LABELS: Record<string, string> = {
  numberOfBags: "Bags",
  actualNumberOfBags: "Actual Bags",
  crop: "Crop",
  variety: "Variety",
  size: "Size",
  bagMarka: "Bag Marka",
  vehicleNumber: "Vehicle No.",
  vehicleBhadaRate: "Bhada Rate",
  farmerAdvanceAmount: "Farmer Advance",
  farmerAdvanceMode: "Advance Mode",
};

function dbRecordToEditEntry(rec: { fieldChanged: string; oldValue: string | null; newValue: string | null; changedBy: string | null; createdAt: string }): EditEntry {
  const timestamp = format(new Date(rec.createdAt), "dd/MM/yyyy HH:mm");
  const username = rec.changedBy || "";
  if (rec.fieldChanged === "bid_deleted") {
    let detail = "";
    try {
      const data = JSON.parse(rec.oldValue || "{}");
      const parts: string[] = [];
      if (data.buyerName) parts.push(String(data.buyerName));
      if (data.numberOfBags) parts.push(`${data.numberOfBags} bags`);
      if (data.pricePerKg) parts.push(`₹${parseFloat(data.pricePerKg)}/kg`);
      if (data.totalPayableToFarmer != null) parts.push(`Farmer: ₹${parseFloat(data.totalPayableToFarmer).toLocaleString("en-IN")}`);
      if (data.totalReceivableFromBuyer != null) parts.push(`Buyer: ₹${parseFloat(data.totalReceivableFromBuyer).toLocaleString("en-IN")}`);
      detail = parts.join(" — ");
    } catch {}
    return { timestamp, username, changes: [{ kind: "deleted", path: "Bid", detail: detail || undefined }] };
  }
  const path = LOT_FIELD_LABELS[rec.fieldChanged] || rec.fieldChanged;
  if (rec.oldValue !== null && rec.newValue !== null) {
    return { timestamp, username, changes: [{ kind: "field", path, oldVal: rec.oldValue, newVal: rec.newValue }] };
  }
  return { timestamp, username, changes: [], label: path };
}

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
  const { t } = useLanguage();
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
          <AlertDialogCancel autoFocus onClick={onCancel}>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-red-600 hover:bg-red-700 focus:ring-red-600 text-white"
          >
            {t("stock.yesDelete")}
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
  const { t } = useLanguage();
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
            {t("common.cancel")}
          </AlertDialogAction>
          <AlertDialogCancel onClick={onConfirm} className="border-border text-foreground hover:bg-muted">
            {t("stock.yesArchive")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function ReinstateDialog({ open, title, description, onConfirm, onCancel }: {
  open: boolean; title: string; description: string; onConfirm: () => void; onCancel: () => void;
}) {
  const { t } = useLanguage();
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
            {t("common.cancel")}
          </AlertDialogCancel>
          <AlertDialogAction autoFocus onClick={onConfirm} className="bg-green-600 hover:bg-green-700 text-white">
            {t("stock.yesReinstate")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Edit history dialog ───────────────────────────────────────────────────────

function ChangeRecordLine({ c }: { c: ChangeRecord }) {
  const { t } = useLanguage();
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
        <Badge variant="outline" className="text-[10px] px-1 py-0 border-red-300 text-red-500 h-4">{t("stock.deleted")}</Badge>
      </div>
    );
  }
  return (
    <div className="flex items-baseline gap-1 text-xs" data-testid="change-added">
      <span className="text-green-600 font-medium">{c.path}</span>
      <Badge variant="outline" className="text-[10px] px-1 py-0 border-green-300 text-green-600 h-4">{t("stock.added")}</Badge>
    </div>
  );
}

function EditHistoryDialog({ open, crop, history, onClose }: {
  open: boolean; crop: string; history: EditEntry[]; onClose: () => void;
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-blue-500" /> {t("stock.editHistory")} — {crop}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 mt-2 max-h-[28rem] overflow-y-auto">
              {history.length === 0 ? (
                <p className="text-sm text-muted-foreground italic">{t("stock.noChangesYet")}</p>
              ) : (
                [...history].reverse().map((entry, i) => (
                  <div key={i} className="rounded-lg border bg-muted/30 overflow-hidden" data-testid={`history-entry-${i}`}>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 border-b">
                      <History className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground">{entry.timestamp}</span>
                      {entry.username && <span className="text-[11px] font-medium text-foreground">{t("stock.by")} {entry.username}</span>}
                    </div>
                    <div className="px-3 py-2 space-y-1">
                      {Array.isArray(entry.changes) && entry.changes.length > 0
                        ? entry.changes.map((c, j) => <ChangeRecordLine key={j} c={c} />)
                        : entry.label
                          ? <span className="text-xs text-foreground">{entry.label}</span>
                          : <span className="text-xs text-muted-foreground italic">{t("stock.entrySaved")}</span>
                      }
                    </div>
                  </div>
                ))
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={onClose}>{t("stock.close")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Unsaved changes dialog ───────────────────────────────────────────────────

function UnsavedChangesDialog({ open, farmerName, onSave, onDiscard, onKeep }: {
  open: boolean; farmerName: string; onSave: () => void; onDiscard: () => void; onKeep: () => void;
}) {
  const { t } = useLanguage();
  return (
    <AlertDialog open={open} onOpenChange={v => { if (!v) onKeep(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Save className="w-5 h-5 text-blue-500" /> {t("stock.unsavedChanges")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {farmerName
              ? `"${farmerName}" ${t("stock.hasUnsavedChanges")}`
              : t("stock.thisEntryUnsaved")} {t("stock.whatToDo")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col sm:flex-row gap-2">
          <AlertDialogCancel onClick={onKeep}>{t("stock.keepEditing")}</AlertDialogCancel>
          <AlertDialogAction autoFocus onClick={onDiscard} className="bg-muted text-foreground hover:bg-muted/80 border border-border">
            {t("stock.discardClose")}
          </AlertDialogAction>
          <AlertDialogAction onClick={onSave} className="bg-primary text-primary-foreground">
            {t("stock.saveClose")}
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
  const { t } = useLanguage();
  const labels: Record<string, string> = { Due: t("stock.due"), Paid: t("stock.paid"), "Partial Paid": t("stock.partialPaid") };
  return (
    <Badge variant="outline" className={`text-[10px] font-semibold px-1.5 py-0 h-4 leading-none ${PAYMENT_COLORS[status] || PAYMENT_COLORS.Due}`}>
      {labels[status] || labels.Due}
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
  const { t } = useLanguage();
  return (
    <div className="flex items-center gap-2 text-xs flex-wrap">
      <span className="text-foreground font-bold">{t("stock.totalBags")}: {totalBags}</span>
      <span className={`font-bold ${remainingBags > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"}`}>
        {t("stock.remaining")}: {remainingBags}
      </span>
      {hasData && (
        <>
          <span className="text-green-700 dark:text-green-400 font-bold">{t("stock.farmer")}: ₹{farmerPayable.toFixed(0)}</span>
          <PaymentBadge status={farmerPaymentStatus || "Due"} />
          <span className="text-blue-700 dark:text-blue-400 font-bold">{t("stock.buyer")}: ₹{buyerReceivable.toFixed(0)}</span>
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
  bidOpen: false,
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
  freightType: "Advance",
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
  id: uid(), crop, srNumber: "—", groupOpen: true,
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

function diffCropGroup(saved: CropGroup, current: CropGroup, tr: (key: string) => string): ChangeRecord[] {
  const changes: ChangeRecord[] = [];
  const savedLotMap = new Map(saved.lots.map(l => [l.id, l]));

  const lotFields: { key: keyof Omit<LotRow, "id" | "dbId" | "lotOpen" | "bids">; label: string }[] = [
    { key: "numberOfBags", label: tr("stock.bags") },
    { key: "size", label: tr("stock.size") },
    { key: "variety", label: tr("stock.variety") },
    { key: "bagMarka", label: tr("stock.bagMarka") },
  ];
  const bidFields: { key: keyof Omit<BidRow, "id" | "bidOpen" | "txn" | "txnDate">; label: string }[] = [
    { key: "buyerName", label: tr("stock.buyerName") },
    { key: "buyerId", label: tr("stock.buyerIdLabel") },
    { key: "bidDbId", label: tr("stock.bidDbId") },
    { key: "txnDbId", label: tr("stock.txnDbId") },
    { key: "pricePerKg", label: tr("stock.pricePerKg") },
    { key: "numberOfBags", label: tr("stock.bags") },
    { key: "paymentType", label: tr("stock.paymentType") },
    { key: "advanceAmount", label: tr("stock.advance") },
  ];
  const txnFields: { key: keyof TxnState; label: string }[] = [
    { key: "netWeightInput", label: tr("stock.netWeight") },
    { key: "extraChargesFarmer", label: tr("stock.extraChargesFarmer") },
    { key: "extraChargesBuyer", label: tr("stock.extraChargesBuyer") },
    { key: "extraPerKgFarmer", label: tr("stock.extraPerKgFarmer") },
    { key: "extraPerKgBuyer", label: tr("stock.extraPerKgBuyer") },
    { key: "extraTulai", label: tr("stock.tulai") },
    { key: "extraBharai", label: tr("stock.bharai") },
    { key: "extraKhadiKarai", label: tr("stock.khadiKarai") },
    { key: "extraThelaBhada", label: tr("stock.thelaBhada") },
    { key: "extraOthers", label: tr("stock.others") },
  ];

  current.lots.forEach((cLot, lotIdx) => {
    const lotLabel = `${tr("stock.lot")} ${lotIdx + 1}`;
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
      const bidLabel = `${lotLabel} > ${tr("stock.bid")} ${bidIdx + 1}`;
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
        changes.push({ kind: "deleted", path: `${lotLabel} > ${tr("stock.bid")} ${bidIdx + 1}`, detail: sBid.buyerName.trim() || undefined });
      }
    });
  });

  saved.lots.forEach((sLot, lotIdx) => {
    if (!current.lots.some(l => l.id === sLot.id)) {
      changes.push({ kind: "deleted", path: `${tr("stock.lot")} ${lotIdx + 1}` });
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

function calcBidTotals(bid: BidRow, cs: ChargeSettings, vehicleBhadaRate: number, totalBagsInVehicle: number, buyerAadhatOverride?: number | null) {
  const bidBags = parseInt(bid.numberOfBags) || 0;
  const pricePerKg = parseFloat(bid.pricePerKg) || 0;
  const txn = bid.txn;
  const nw = parseFloat(txn.netWeightInput) || 0;
  const epkFarmer = parseFloat(txn.extraPerKgFarmer) || 0;
  const epkBuyer = parseFloat(txn.extraPerKgBuyer) || 0;
  const farmerGross = nw * (pricePerKg + epkFarmer);
  const buyerGross = nw * (pricePerKg + epkBuyer);
  const ecs = bid.savedCharges || cs;
  const hfRate = parseFloat(ecs.hammaliFarmerPerBag) || 0;
  const hbRate = parseFloat(ecs.hammaliBuyerPerBag) || 0;
  const extraFarmer = parseFloat(txn.extraChargesFarmer) || 0;
  const extraBuyer = parseFloat(txn.extraChargesBuyer) || 0;
  const aadhatFPct = parseFloat(ecs.aadhatCommissionFarmerPercent) || 0;
  const aadhatBPct = bid.savedCharges
    ? parseFloat(ecs.aadhatCommissionBuyerPercent) || 0
    : (buyerAadhatOverride != null ? buyerAadhatOverride : parseFloat(cs.aadhatCommissionBuyerPercent) || 0);
  const mandiFPct = parseFloat(ecs.mandiCommissionFarmerPercent) || 0;
  const mandiBPct = parseFloat(ecs.mandiCommissionBuyerPercent) || 0;
  const muddatAnyaFPct = parseFloat(ecs.muddatAnyaFarmerPercent) || 0;
  const muddatAnyaBPct = parseFloat(ecs.muddatAnyaBuyerPercent) || 0;
  const freight = totalBagsInVehicle > 0 ? (vehicleBhadaRate * bidBags) / totalBagsInVehicle : 0;
  const muddatAnyaBuyer = (buyerGross * muddatAnyaBPct) / 100;
  const farmerDed = hfRate * bidBags + extraFarmer + (farmerGross * aadhatFPct) / 100 + (farmerGross * mandiFPct) / 100 + (farmerGross * muddatAnyaFPct) / 100 + freight;
  const buyerAdd = hbRate * bidBags + extraBuyer + (buyerGross * aadhatBPct) / 100 + (buyerGross * mandiBPct) / 100 + muddatAnyaBuyer;
  const aadhatBuyer = (buyerGross * aadhatBPct) / 100;
  return {
    bidBags,
    farmerPayable: farmerGross - farmerDed,
    buyerReceivable: buyerGross + buyerAdd,
    aadhatBuyer,
    muddatAnyaBuyer,
    hasData: nw > 0 && pricePerKg > 0,
  };
}

function calcLotTotals(lot: LotRow, cs: ChargeSettings, vehicleBhadaRate: number, totalBagsInVehicle: number, buyersData: any[] = []) {
  const lotBags = parseInt(lot.numberOfBags) || 0;
  const bidTotals = lot.bids.map(b => {
    const buyerData = buyersData.find((buyer: any) => buyer.id === b.buyerId);
    const buyerAadhat = buyerData?.aadhatCommissionPercent != null && buyerData.aadhatCommissionPercent !== ""
      ? parseFloat(buyerData.aadhatCommissionPercent) || 0
      : null;
    return calcBidTotals(b, cs, vehicleBhadaRate, totalBagsInVehicle, buyerAadhat);
  });
  return {
    lotBags,
    bidBags: bidTotals.reduce((s, t) => s + t.bidBags, 0),
    farmerPayable: bidTotals.reduce((s, t) => s + t.farmerPayable, 0),
    buyerReceivable: bidTotals.reduce((s, t) => s + t.buyerReceivable, 0),
    aadhatBuyer: bidTotals.reduce((s, t) => s + t.aadhatBuyer, 0),
    muddatAnyaBuyer: bidTotals.reduce((s, t) => s + t.muddatAnyaBuyer, 0),
    hasData: bidTotals.some(t => t.hasData),
  };
}

// ─── Section toggle ───────────────────────────────────────────────────────────

function SectionToggle({ open, onToggle, icon, label, count, summary }: {
  open: boolean; onToggle: () => void; icon: React.ReactNode; label: string; count?: string; summary?: string[];
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-start gap-2 px-3 py-2 rounded-md bg-muted/50 hover:bg-muted transition-colors text-sm font-medium text-left"
    >
      {open ? <ChevronDown className="w-5 h-5 shrink-0 mt-0.5 text-muted-foreground" strokeWidth={3} /> : <ChevronRight className="w-5 h-5 shrink-0 mt-0.5 text-muted-foreground" strokeWidth={3} />}
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span>{label}</span>
      {!open && summary && summary.length > 0 && (
        <span className="flex items-center gap-1.5 flex-wrap ml-1">
          {summary.map((s, i) => (
            <Badge key={i} variant="secondary" className="text-xs font-normal px-1.5 py-0.5">{s}</Badge>
          ))}
        </span>
      )}
      {count && <Badge variant="secondary" className="ml-auto text-xs">{count}</Badge>}
    </button>
  );
}

// ─── Transaction / Charges section ───────────────────────────────────────────

function TxnSection({ txn, onChange, bags, pricePerKg, vehicleBhadaRate, totalBagsInVehicle, cs, buyerAadhatOverride }: {
  txn: TxnState;
  onChange: (t: TxnState) => void;
  bags: number;
  pricePerKg: number;
  vehicleBhadaRate: number;
  totalBagsInVehicle: number;
  cs: ChargeSettings;
  buyerAadhatOverride?: number | null;
}) {
  const { t } = useLanguage();
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
  const aadhatBuyerPct = buyerAadhatOverride != null ? buyerAadhatOverride : parseFloat(cs.aadhatCommissionBuyerPercent) || 0;
  const mandiFarmerPct = parseFloat(cs.mandiCommissionFarmerPercent) || 0;
  const mandiBuyerPct = parseFloat(cs.mandiCommissionBuyerPercent) || 0;
  const muddatAnyaFarmerPct = parseFloat(cs.muddatAnyaFarmerPercent) || 0;
  const muddatAnyaBuyerPct = parseFloat(cs.muddatAnyaBuyerPercent) || 0;

  const freightFarmerTotal = totalBagsInVehicle > 0 ? (vehicleBhadaRate * bags) / totalBagsInVehicle : 0;

  const hammaliFarmerTotal = hammaliFarmerRate * bags;
  const hammaliBuyerTotal = hammaliBuyerRate * bags;
  const aadhatFarmer = (farmerGross * aadhatFarmerPct) / 100;
  const aadhatBuyer = (buyerGross * aadhatBuyerPct) / 100;
  const mandiFarmer = (farmerGross * mandiFarmerPct) / 100;
  const mandiBuyer = (buyerGross * mandiBuyerPct) / 100;
  const muddatAnyaFarmer = (farmerGross * muddatAnyaFarmerPct) / 100;
  const muddatAnyaBuyer = (buyerGross * muddatAnyaBuyerPct) / 100;

  const farmerDeductions = hammaliFarmerTotal + extraFarmer + aadhatFarmer + mandiFarmer + muddatAnyaFarmer + freightFarmerTotal;
  const buyerAdditions = hammaliBuyerTotal + extraBuyer + aadhatBuyer + mandiBuyer + muddatAnyaBuyer;
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
    <div className="ml-0 sm:ml-8 mt-2 rounded-lg border border-green-200 bg-green-50/30 p-3 space-y-3">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-green-700 uppercase tracking-wide">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        <Scale className="w-3.5 h-3.5" />
        {t("stock.weightCharges")}
      </div>

      {/* ── Net Weight ── */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{t("stock.netWeight")}</Label>
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
            <Calculator className="w-3.5 h-3.5" /> {t("stock.calcWt")}
          </Button>
        </div>
        {bags > 0 && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t("stock.total")} — {bags} {t("common.bags")}</p>
            {nw > 0 && <p data-testid="text-net-wt-avg" className="text-xs font-medium text-orange-500 dark:text-orange-400">{t("stock.avgWeight")}: {(nw / bags).toFixed(2)} kg</p>}
          </div>
        )}

        {/* ── Weight calculator ── */}
        {txn.showWeightCalc && (
          <div className="bg-muted/50 rounded-md p-2 space-y-2 mt-1" data-testid="weight-calculator">
            <p className="text-xs font-semibold text-muted-foreground">{t("stock.sampleBagWeights")}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
              {txn.sampleWeights.map((w, idx) => (
                <div key={idx} className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground w-4">{idx + 1}.</span>
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
                      <AlertTriangle className="h-3 w-3" /> {t("stock.over100kg")}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs w-full" onClick={addSample}>
              <Plus className="h-3 w-3 mr-1" /> {t("stock.addSample")}
            </Button>
            <div className="border-t pt-1 flex justify-between text-xs font-medium">
              <span>{t("stock.average")} ({nonZero.length} {t("stock.samples")}):</span>
              <span>{average > 0 ? `${average.toFixed(2)} kg` : "—"}</span>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t("stock.netWeight")} ({average.toFixed(2)} × {bags}):</span>
              <span>{average > 0 ? `${(average * bags).toFixed(2)} kg` : "—"}</span>
            </div>
          </div>
        )}
      </div>

      {nw > 0 && pricePerKg > 0 && (epkFarmer > 0 || epkBuyer > 0) && (
        <div className="bg-muted/40 rounded-md px-3 py-2 text-xs space-y-1" data-testid="txn-bid-rate-header">
          {epkFarmer > 0 && (
            <div className="flex justify-between gap-1 text-green-600">
              <span className="min-w-0 flex-1">{t("stock.farmerRate")} ({pricePerKg.toFixed(2)} + {epkFarmer.toFixed(2)}):</span>
              <span className="shrink-0 font-medium">₹{(pricePerKg + epkFarmer).toFixed(2)}/kg</span>
            </div>
          )}
          {epkBuyer > 0 && (
            <div className="flex justify-between gap-1 text-blue-600">
              <span className="min-w-0 flex-1">{t("stock.buyerRate")} ({pricePerKg.toFixed(2)} + {epkBuyer.toFixed(2)}):</span>
              <span className="shrink-0 font-medium">₹{(pricePerKg + epkBuyer).toFixed(2)}/kg</span>
            </div>
          )}
        </div>
      )}

      {/* ── Farmer + Buyer: charges & summary side-by-side ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs" data-testid="charge-rates-display">
        {/* ── Farmer column ── */}
        <div className="bg-background rounded border border-border p-2 space-y-1">
          <p className="font-semibold text-muted-foreground">{t("stock.farmerCharges")}</p>
          <div className="flex justify-between"><span>{t("stock.aadhat")}:</span><span>{aadhatFarmerPct}%</span></div>
          <div className="flex justify-between"><span>{t("stock.muddatAnya")}:</span><span>{muddatAnyaFarmerPct}%</span></div>
          <div className="flex justify-between"><span>{t("stock.mandi")}:</span><span>{mandiFarmerPct}%</span></div>
          <div className="flex justify-between"><span>{t("stock.hammali")}:</span><span>₹{hammaliFarmerRate}/bag</span></div>
          {freightFarmerTotal > 0 && (
            <div className="flex justify-between text-muted-foreground">
              <span>{t("stock.freightAuto")}:</span><span>₹{freightFarmerTotal.toFixed(2)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="flex items-center gap-0.5 text-xs hover:text-foreground text-muted-foreground"
              onClick={() => set("showExtraBreakdown", !txn.showExtraBreakdown)}
            >
              {txn.showExtraBreakdown ? <ChevronDown className="w-4 h-4" strokeWidth={3} /> : <ChevronRight className="w-4 h-4" strokeWidth={3} />}
              {t("stock.extra")}:
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
                [t("stock.tulai"), "extraTulai", txn.extraTulai],
                [t("stock.bharai"), "extraBharai", txn.extraBharai],
                [t("stock.khadiKarai"), "extraKhadiKarai", txn.extraKhadiKarai],
                [t("stock.thelaBhada"), "extraThelaBhada", txn.extraThelaBhada],
                [t("stock.others"), "extraOthers", txn.extraOthers],
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
            <span className="font-semibold">{t("stock.extraPerKg")}:</span>
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
              <div className="flex justify-between gap-1">
                <span className="min-w-0 flex-1">{t("stock.gross")} ({nw.toFixed(0)} × ₹{(pricePerKg + epkFarmer).toFixed(2)}):</span>
                <span className="shrink-0 font-medium">₹{farmerGross.toFixed(2)}</span>
              </div>
              <p className="text-muted-foreground font-semibold mt-0.5">{t("stock.deductions")}:</p>
              {hammaliFarmerRate > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.hammali")} ({bags}×₹{hammaliFarmerRate}):</span>
                  <span className="shrink-0">-₹{hammaliFarmerTotal.toFixed(2)}</span>
                </div>
              )}
              {extraFarmer > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.extra")}:</span>
                  <span className="shrink-0">-₹{extraFarmer.toFixed(2)}</span>
                </div>
              )}
              {aadhatFarmerPct > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.aadhat")} ({aadhatFarmerPct}%):</span>
                  <span className="shrink-0">-₹{aadhatFarmer.toFixed(2)}</span>
                </div>
              )}
              {muddatAnyaFarmerPct > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.muddatAnya")} ({muddatAnyaFarmerPct}%):</span>
                  <span className="shrink-0">-₹{muddatAnyaFarmer.toFixed(2)}</span>
                </div>
              )}
              {mandiFarmerPct > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.mandi")} ({mandiFarmerPct}%):</span>
                  <span className="shrink-0">-₹{mandiFarmer.toFixed(2)}</span>
                </div>
              )}
              {freightFarmerTotal > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.freight")}:</span>
                  <span className="shrink-0">-₹{freightFarmerTotal.toFixed(2)}</span>
                </div>
              )}
              {farmerDeductions === 0 && <div className="text-muted-foreground italic pl-2">{t("stock.noDeductions")}</div>}
              <div className="flex justify-between gap-1 font-bold text-green-700 border-t pt-1 mt-0.5">
                <span className="min-w-0 flex-1">{t("stock.farmerPayable")}:</span>
                <span className="shrink-0">₹{farmerPayable.toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Buyer column ── */}
        <div className="bg-background rounded border border-border p-2 space-y-1">
          <p className="font-semibold text-muted-foreground">{t("stock.buyerCharges")}</p>
          <div className="flex justify-between"><span>{t("stock.aadhat")}:</span><span>{aadhatBuyerPct}%</span></div>
          <div className="flex justify-between"><span>{t("stock.muddatAnya")}:</span><span>{muddatAnyaBuyerPct}%</span></div>
          <div className="flex justify-between"><span>{t("stock.mandi")}:</span><span>{mandiBuyerPct}%</span></div>
          <div className="flex justify-between"><span>{t("stock.hammali")}:</span><span>₹{hammaliBuyerRate}/bag</span></div>
          <div className="flex items-center justify-between">
            <span>{t("stock.extra")}:</span>
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
            <span className="font-semibold">{t("stock.extraPerKg")}:</span>
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
              <div className="flex justify-between gap-1">
                <span className="min-w-0 flex-1">{t("stock.gross")} ({nw.toFixed(0)} × ₹{(pricePerKg + epkBuyer).toFixed(2)}):</span>
                <span className="shrink-0 font-medium">₹{buyerGross.toFixed(2)}</span>
              </div>
              <p className="text-muted-foreground font-semibold mt-0.5">{t("stock.additions")}:</p>
              {hammaliBuyerRate > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.hammali")} ({bags}×₹{hammaliBuyerRate}):</span>
                  <span className="shrink-0">+₹{hammaliBuyerTotal.toFixed(2)}</span>
                </div>
              )}
              {extraBuyer > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.extra")}:</span>
                  <span className="shrink-0">+₹{extraBuyer.toFixed(2)}</span>
                </div>
              )}
              {aadhatBuyerPct > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.aadhat")} ({aadhatBuyerPct}%):</span>
                  <span className="shrink-0">+₹{aadhatBuyer.toFixed(2)}</span>
                </div>
              )}
              {muddatAnyaBuyerPct > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.muddatAnya")} ({muddatAnyaBuyerPct}%):</span>
                  <span className="shrink-0">+₹{muddatAnyaBuyer.toFixed(2)}</span>
                </div>
              )}
              {mandiBuyerPct > 0 && (
                <div className="flex justify-between gap-1 text-muted-foreground pl-2">
                  <span className="min-w-0 flex-1">{t("stock.mandi")} ({mandiBuyerPct}%):</span>
                  <span className="shrink-0">+₹{mandiBuyer.toFixed(2)}</span>
                </div>
              )}
              {buyerAdditions === 0 && <div className="text-muted-foreground italic pl-2">{t("stock.noAdditions")}</div>}
              <div className="flex justify-between gap-1 font-bold text-blue-700 border-t pt-1 mt-0.5">
                <span className="min-w-0 flex-1">{t("stock.buyerReceivable")}:</span>
                <span className="shrink-0">₹{buyerReceivable.toFixed(2)}</span>
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
  buyersList: { id: number; name: string; phone?: string; aadhatCommissionPercent?: string | null; overallDue?: string; limitAmount?: number | null }[];
}) {
  const { t } = useLanguage();
  const [showBuyerSuggestions, setShowBuyerSuggestions] = useState(false);
  const filteredBuyers = buyersList.filter(
    b => bid.buyerName.length >= 1 && b.name.toLowerCase().includes(bid.buyerName.toLowerCase())
  ).slice(0, 10);
  const buyerKb = useKeyboardNav(filteredBuyers, b => String(b.id));
  const noBuyerSelected = bid.buyerName.trim().length > 0 && !bid.buyerId;
  const bags = parseInt(bid.numberOfBags) || 0;
  const pricePerKg = parseFloat(bid.pricePerKg) || 0;
  const bidBuyerData = buyersList.find(b => b.id === bid.buyerId);
  const bidBuyerAadhat = bidBuyerData?.aadhatCommissionPercent != null && bidBuyerData.aadhatCommissionPercent !== ""
    ? parseFloat(bidBuyerData.aadhatCommissionPercent) || 0
    : null;
  const totals = calcBidTotals(bid, cs, vehicleBhadaRate, totalBagsInVehicle, bidBuyerAadhat);
  const buyerLimit = bidBuyerData?.limitAmount ?? null;
  const existingDue = parseFloat(bidBuyerData?.overallDue ?? "0");
  const projectedDue = existingDue - (bid.savedBuyerReceivable ?? 0) + totals.buyerReceivable;
  const limitExceeded = bid.buyerId != null && buyerLimit !== null && projectedDue > buyerLimit;
  const buyerLabel = bid.buyerName.trim() || t("stock.buyer");

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
            ? <ChevronDown className="w-[18px] h-[18px] text-blue-500" strokeWidth={3} />
            : <ChevronRight className="w-[18px] h-[18px] text-blue-500" strokeWidth={3} />}
          <span className="text-xs font-bold text-blue-600 uppercase tracking-wide">
            {buyerLabel} {bags > 0 && `· ${bags} ${t("common.bags")}`}
          </span>
          {!bid.bidOpen && totals.hasData && (
            <span className="flex items-center gap-2 text-xs">
              <span className="text-green-700 dark:text-green-400 font-bold">{t("stock.farmer")}: ₹{totals.farmerPayable.toFixed(0)}</span>
              <span className="text-blue-700 dark:text-blue-400 font-bold">{t("stock.buyer")}: ₹{totals.buyerReceivable.toFixed(0)}</span>
            </span>
          )}
          {!bid.bidOpen && bid.paymentType === "Cash" && parseFloat(bid.advanceAmount || "0") > 0 && (
            <span className="text-xs font-semibold bg-yellow-100 text-yellow-800 border border-yellow-300 rounded px-1.5 py-0.5">
              {t("stock.cash")} · ₹{parseFloat(bid.advanceAmount).toLocaleString("en-IN")}
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
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 uppercase tracking-wide">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 inline-block" />
              {t("stock.bidTxnDetails")}
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-xs text-muted-foreground whitespace-nowrap">{t("stock.txnDate")}:</label>
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
                  {t("stock.reset")}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div className="col-span-2 sm:col-span-1 relative">
              <Label className="text-xs text-muted-foreground">{t("stock.buyer")}</Label>
              <div className="relative">
                <Input
                  data-testid={`input-buyer-name-${bidIndex}`}
                  placeholder={t("stock.selectBuyer")}
                  value={bid.buyerName}
                  onChange={e => {
                    onChange({ ...bid, buyerName: e.target.value.toUpperCase(), buyerId: undefined });
                    setShowBuyerSuggestions(true);
                  }}
                  onFocus={() => setShowBuyerSuggestions(true)}
                  onBlur={() => setTimeout(() => { setShowBuyerSuggestions(false); buyerKb.reset(); }, 150)}
                  onKeyDown={e => {
                    if (showBuyerSuggestions && filteredBuyers.length > 0 && !bid.buyerId) {
                      buyerKb.handleKeyDown(e, (b) => { onChange({ ...bid, buyerName: b.name, buyerId: b.id }); setShowBuyerSuggestions(false); buyerKb.reset(); }, () => { setShowBuyerSuggestions(false); buyerKb.reset(); });
                    }
                  }}
                  className="h-8 text-sm pr-7"
                  autoComplete="off"
                />
                <ChevronsUpDown className="w-3.5 h-3.5 absolute right-2 top-2 text-muted-foreground pointer-events-none" />
              </div>
              {showBuyerSuggestions && filteredBuyers.length > 0 && !bid.buyerId && (
                <div ref={buyerKb.listRef} className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto top-full mt-1">
                  {filteredBuyers.map((b, i) => (
                    <button
                      key={b.id}
                      data-testid={`suggestion-buyer-${b.id}`}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === buyerKb.activeIndex ? "bg-accent" : "hover:bg-muted"}`}
                      onMouseEnter={() => buyerKb.setActiveIndex(i)}
                      onMouseDown={() => {
                        onChange({ ...bid, buyerName: b.name, buyerId: b.id });
                        setShowBuyerSuggestions(false); buyerKb.reset();
                      }}
                    >
                      <div className="font-medium">{b.name}</div>
                    </button>
                  ))}
                </div>
              )}
              {noBuyerSelected && (
                <div className="flex items-center gap-1 mt-1 text-orange-600 text-xs">
                  <AlertTriangle className="w-3 h-3" /> {t("stock.selectFromList")}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("stock.pricePerKg")}</Label>
              <Input
                data-testid={`input-price-per-kg-${bidIndex}`}
                type="number" placeholder="0.00"
                value={bid.pricePerKg}
                onChange={e => onChange({ ...bid, pricePerKg: toNum(e.target.value) })}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("stock.numBags")}</Label>
              <Input
                data-testid={`input-bid-bags-${bidIndex}`}
                type="number" placeholder="0"
                value={bid.numberOfBags}
                onChange={e => onChange({ ...bid, numberOfBags: e.target.value.replace(/\D/g, "") })}
                className={`h-8 text-sm ${overBag ? "border-red-400 focus-visible:ring-red-400" : ""}`}
              />
              {overBag && (
                <p className="text-xs text-red-500 font-medium mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> {t("stock.exceedsLotBags")}
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("stock.payment")}</Label>
              <Select value={bid.paymentType} onValueChange={v => onChange({ ...bid, paymentType: v })}>
                <SelectTrigger data-testid={`select-payment-type-${bidIndex}`} className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Credit">{t("stock.credit")}</SelectItem>
                  <SelectItem value="Cash">{t("stock.cash")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {limitExceeded && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700 font-medium" data-testid="buyer-limit-warning">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
              <span>Buyer limit exceeded — Limit: ₹{buyerLimit!.toLocaleString("en-IN")}, Projected Due: ₹{Math.round(projectedDue).toLocaleString("en-IN")}</span>
            </div>
          )}

          {bid.paymentType === "Cash" && (
            <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-md px-3 py-1.5">
              <span className="text-xs text-yellow-700 font-medium">{t("stock.cashAdvance")}</span>
              <Input
                data-testid={`input-advance-amount-${bidIndex}`}
                type="number"
                value={bid.advanceAmount}
                onChange={e => onChange({ ...bid, advanceAmount: toNum(e.target.value) })}
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
            cs={bid.savedCharges || cs}
            buyerAadhatOverride={bid.savedCharges ? undefined : bidBuyerAadhat}
          />
        </div>
      )}
    </div>
  );
}

// ─── Lot card ─────────────────────────────────────────────────────────────────

function LotCard({ lot, index, onChange, onRemove, onRemoveBid, vehicleBhadaRate, totalBagsInVehicle, cs, farmerDate, buyersList }: {
  lot: LotRow; index: number;
  onChange: (l: LotRow) => void; onRemove: () => void;
  onRemoveBid?: (lotIndex: number, bidIndex: number) => void;
  vehicleBhadaRate: number; totalBagsInVehicle: number;
  cs: ChargeSettings; farmerDate: string;
  buyersList: { id: number; name: string; phone?: string; aadhatCommissionPercent?: string | null; overallDue?: string; limitAmount?: number | null }[];
}) {
  const { t } = useLanguage();
  const [pendingDeleteBidIdx, setPendingDeleteBidIdx] = useState<number | null>(null);

  const setField = (f: keyof Omit<LotRow, "id" | "dbId" | "bids" | "lotOpen">, v: string) => onChange({ ...lot, [f]: v });
  const totals = calcLotTotals(lot, cs, vehicleBhadaRate, totalBagsInVehicle, buyersList);
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
  const totalBidBags = lot.bids.reduce((s, b) => s + (parseInt(b.numberOfBags) || 0), 0);
  const addBidDisabled = lotBags > 0 && totalBidBags >= lotBags;

  const pendingBid = pendingDeleteBidIdx !== null ? lot.bids[pendingDeleteBidIdx] : null;
  const pendingBidLabel = pendingBid?.buyerName.trim() || `Bid #${(pendingDeleteBidIdx ?? 0) + 1}`;
  const pendingBidHasTxn = !!pendingBid?.txnDbId;

  return (
    <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
      <div className="flex items-center bg-muted/30 border-b border-border">
        <button
          type="button"
          className="flex-1 flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors text-left"
          onClick={() => onChange({ ...lot, lotOpen: !lot.lotOpen })}
          data-testid={`button-toggle-lot-${index}`}
        >
          {lot.lotOpen ? <ChevronDown className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={3} /> : <ChevronRight className="w-[18px] h-[18px] text-muted-foreground" strokeWidth={3} />}
          <span className="text-xs font-bold text-foreground uppercase tracking-wide">{t("stock.lot")} #{index + 1}</span>
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
          <button
            type="button"
            data-testid={`button-remove-lot-${index}`}
            onClick={onRemove}
            className="h-8 w-8 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors rounded"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {lot.lotOpen && (
        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground">{t("stock.numBagsReq")}</Label>
              <Input
                data-testid={`input-lot-bags-${index}`}
                type="number" placeholder="0"
                value={lot.numberOfBags}
                onChange={e => setField("numberOfBags", e.target.value.replace(/\D/g, ""))}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("stock.size")}</Label>
              <Select value={lot.size} onValueChange={v => setField("size", v)}>
                <SelectTrigger data-testid={`select-size-${index}`} className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="None">{t("stock.none")}</SelectItem>
                  {SIZES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("stock.variety")}</Label>
              <Input
                data-testid={`input-variety-${index}`}
                placeholder={t("stock.varietyPlaceholder")}
                value={lot.variety}
                onChange={e => setField("variety", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">{t("stock.bagMarka")}</Label>
              <Input
                data-testid={`input-bag-marka-${index}`}
                placeholder={t("stock.bagMarkaPlaceholder")}
                value={lot.bagMarka}
                onChange={e => setField("bagMarka", e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>

          <div className="ml-4 space-y-1">
            {lot.bids.length === 0 && (
              <p className="text-xs text-muted-foreground italic px-3 py-2">{t("stock.noBids")}</p>
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
              disabled={addBidDisabled}
              title={addBidDisabled ? t("stock.lotBagsFullyAllocated") : undefined}
              className="w-full h-7 text-xs gap-1.5 border-dashed mt-2"
              data-testid="button-add-bid"
            >
              <Plus className="w-3 h-3" /> {t("stock.addBid")}
            </Button>
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={pendingDeleteBidIdx !== null}
        title={`${t("stock.delete")} ${pendingBidLabel}?`}
        description={pendingBidHasTxn ? t("stock.deleteBidWithTxnDesc") : t("stock.deleteBidDesc")}
        onConfirm={confirmRemoveBid}
        onCancel={() => setPendingDeleteBidIdx(null)}
      />
    </div>
  );
}

// ─── Crop group ───────────────────────────────────────────────────────────────

function CropGroupSection({ group, onChange, onArchive, onDelete, isPersisted, vehicleBhadaRate, totalBagsInVehicle, totalAllocatedAllGroups, cs, farmerDate, farmerName, currentUsername, onSyncSaved, buyersList, farmerCard }: {
  group: CropGroup;
  onChange: (g: CropGroup) => void; onArchive: () => void; onDelete: () => void;
  isPersisted: boolean;
  vehicleBhadaRate: number; totalBagsInVehicle: number; totalAllocatedAllGroups: number;
  cs: ChargeSettings; farmerDate: string; farmerName: string;
  currentUsername: string;
  onSyncSaved?: (updatedGroup: CropGroup) => void;
  buyersList: { id: number; name: string; phone?: string; aadhatCommissionPercent?: string | null; overallDue?: string; limitAmount?: number | null }[];
  farmerCard?: FarmerCard;
}) {
  const { t } = useLanguage();
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
  const farmerLabel = farmerName.trim() || t("stock.farmer");

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
    const now = format(new Date(), "dd/MM/yyyy HH:mm");
    const parts: string[] = [];
    const buyerName = deletedBid?.buyerName?.trim() || "";
    const bags = parseInt(deletedBid?.numberOfBags || "0");
    const price = parseFloat(deletedBid?.pricePerKg || "0");
    if (buyerName) parts.push(buyerName);
    if (bags > 0) parts.push(`${bags} bags`);
    if (price > 0) parts.push(`₹${price}/kg`);
    if (deletedBid?.txnDbId) {
      if (deletedBid.savedFarmerPayable != null) parts.push(`Farmer: ₹${deletedBid.savedFarmerPayable.toLocaleString("en-IN")}`);
      if (deletedBid.savedBuyerReceivable != null) parts.push(`Buyer: ₹${deletedBid.savedBuyerReceivable.toLocaleString("en-IN")}`);
    }
    const entry: EditEntry = {
      timestamp: now,
      username: currentUsername,
      changes: [{ kind: "deleted", path: `Lot ${lotIndex + 1} > Bid ${bidIndex + 1}`, detail: parts.join(" — ") || undefined }],
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
      const deletedLot = group.lots[pendingDeleteLotIdx];
      const lotNum = pendingDeleteLotIdx + 1;
      const changes: ChangeRecord[] = [];
      const lotParts: string[] = [];
      const bags = parseInt(deletedLot?.numberOfBags || "0");
      if (bags > 0) lotParts.push(`${bags} bags`);
      if (deletedLot?.variety?.trim()) lotParts.push(deletedLot.variety.trim());
      if (deletedLot?.size?.trim()) lotParts.push(deletedLot.size.trim());
      changes.push({ kind: "deleted", path: `Lot ${lotNum}`, detail: lotParts.join(", ") || undefined });
      if (deletedLot?.bids) {
        deletedLot.bids.forEach((bid, bi) => {
          const bidParts: string[] = [];
          const bn = bid.buyerName?.trim() || "";
          const bb = parseInt(bid.numberOfBags || "0");
          const bp = parseFloat(bid.pricePerKg || "0");
          if (bn) bidParts.push(bn);
          if (bb > 0) bidParts.push(`${bb} bags`);
          if (bp > 0) bidParts.push(`₹${bp}/kg`);
          if (bid.txnDbId) {
            if (bid.savedFarmerPayable != null) bidParts.push(`Farmer: ₹${bid.savedFarmerPayable.toLocaleString("en-IN")}`);
            if (bid.savedBuyerReceivable != null) bidParts.push(`Buyer: ₹${bid.savedBuyerReceivable.toLocaleString("en-IN")}`);
          }
          if (bidParts.length > 0) {
            changes.push({ kind: "deleted", path: `Lot ${lotNum} > Bid ${bi + 1}`, detail: bidParts.join(" — ") });
          }
        });
      }
      const entry: EditEntry = { timestamp: now, username: currentUsername, changes };
      onChange({
        ...group,
        lots: group.lots.filter((_, i) => i !== pendingDeleteLotIdx),
        editHistory: [...group.editHistory, entry],
      });
    }
    setPendingDeleteLotIdx(null);
  };

  const allTotals = group.lots.map(l => calcLotTotals(l, cs, vehicleBhadaRate, totalBagsInVehicle, buyersList));
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
      const res = await apiRequest("GET", `/api/transactions`);
      const allTxns: (Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid })[] = await res.json();
      const groupTxns = allTxns.filter(t => lotDbIds.includes(t.lotId) && !t.isReversed);
      if (groupTxns.length === 0) return null;

      const farmer: Farmer = groupTxns[0].farmer;

      const lotGroups: UnifiedLotGroup[] = [];
      const lotMap = new Map<number, UnifiedLotGroup>();
      for (const tx of groupTxns) {
        const key = tx.lotId;
        if (!lotMap.has(key)) {
          lotMap.set(key, { lotId: tx.lot.lotId, lot: tx.lot, farmer, pendingBids: [], completedTxns: [] });
        }
        lotMap.get(key)!.completedTxns.push(tx);
      }
      lotGroups.push(...Array.from(lotMap.values()));

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
      toast({ title: t("stock.receiptError"), description: err?.message, variant: "destructive" });
      return null;
    }
  };

  const handleFarmerReceipt = async (action: "print" | "share") => {
    setReceiptLoading(true);
    try {
      const data = await fetchReceiptData();
      if (!data) { toast({ title: t("stock.noTxnDataFound"), variant: "destructive" }); return; }
      const crop = data.sg.lotGroups[0]?.lot?.crop || "";
      const customTmpl = receiptTemplates.find(tmpl => tmpl.templateType === "farmer" && tmpl.crop === crop)
        || receiptTemplates.find(tmpl => tmpl.templateType === "farmer" && tmpl.crop === "");
      const html = customTmpl
        ? applyFarmerTemplate(customTmpl.templateHtml, data.sg, user?.businessName, user?.businessAddress, user?.businessPhone, user?.businessLicenceNo, user?.businessShopNo)
        : generateFarmerReceiptHtml(data.sg, user?.businessName, user?.businessAddress, user?.businessPhone);
      const firstName = farmerName.trim().split(/\s+/)[0] || farmerName.trim();
      const [, mo, dy] = farmerDate.split("-");
      const day = parseInt(dy, 10);
      const ordinal = (n: number) => {
        if (n >= 11 && n <= 13) return `${n}th`;
        switch (n % 10) { case 1: return `${n}st`; case 2: return `${n}nd`; case 3: return `${n}rd`; default: return `${n}th`; }
      };
      const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      const monthName = monthNames[parseInt(mo, 10) - 1] || mo;
      const farmerFileName = `${firstName} Ji - ${crop}-${ordinal(day)}${monthName}.pdf`;
      if (action === "print") {
        await printReceipt(html, farmerFileName);
      } else {
        await shareReceiptAsImage(html, farmerFileName);
      }
    } catch (err: any) {
      toast({ title: t("stock.receiptError"), description: err?.message, variant: "destructive" });
    } finally { setReceiptLoading(false); }
  };

  const handleBuyerReceipt = async (buyerId: number, buyerName: string, action: "print" | "share") => {
    setReceiptLoading(true);
    try {
      const data = await fetchReceiptData();
      if (!data) { toast({ title: t("stock.noTxnDataFound"), variant: "destructive" }); return; }
      const entries = data.txnsByBuyerId.get(buyerId);
      if (!entries || entries.length === 0) { toast({ title: t("stock.noTxnForBuyer"), variant: "destructive" }); return; }
      const crop = entries[0].lot.crop;
      const customTmpl = receiptTemplates.find(tmpl => tmpl.templateType === "buyer" && tmpl.crop === crop)
        || receiptTemplates.find(tmpl => tmpl.templateType === "buyer" && tmpl.crop === "");
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
      const safeName = buyerName.replace(/[^a-zA-Z0-9]/g, "_");
      const buyerFileName = `Buyer_Receipt_${safeName}_${crop}_${farmerDate}.pdf`;
      if (action === "print") {
        await printReceipt(html, buyerFileName);
      } else {
        await shareReceiptAsImage(html, buyerFileName);
      }
    } catch (err: any) {
      toast({ title: t("stock.receiptError"), description: err?.message, variant: "destructive" });
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
              <span className="italic font-normal">— {t("stock.archived")}</span>
            </div>
            <Button type="button" variant="outline" size="sm"
              onClick={() => setShowReinstateConfirm(true)}
              className="h-6 px-2 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/60"
              data-testid={`button-reinstate-${group.crop.toLowerCase()}`}>
              {t("stock.reinstate")}
            </Button>
          </div>
        </div>
        <ReinstateDialog
          open={showReinstateConfirm}
          title={`${t("stock.reinstate")} ${group.crop} (SR# ${group.srNumber})?`}
          description={t("stock.reinstateDesc")}
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
                queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
                queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
                queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
                queryClient.invalidateQueries({ predicate: (query) => {
                  const key = query.queryKey[0];
                  return typeof key === "string" && key.startsWith("/api/buyers");
                }});
              }
              const updatedGroup = { ...group, archived: false, groupOpen: true };
              onChange(updatedGroup);
              onSyncSaved?.(updatedGroup);
              toast({ title: t("stock.cropGroupReinstated"), variant: "success" });
            } catch (err: any) {
              toast({ title: t("stock.reinstateFailedCrop"), description: err?.message, variant: "destructive" });
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
        className={`w-full flex flex-col gap-1 px-4 py-2 ${headerCls} border-b hover:brightness-95 transition-all text-left`}
        onClick={() => onChange({ ...group, groupOpen: !group.groupOpen })}
        data-testid={`button-toggle-group-${group.crop.toLowerCase()}`}
      >
        {/* Top row: title + action buttons */}
        <div className="flex items-center justify-between gap-1 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            {group.groupOpen ? <ChevronDown className="w-5 h-5 shrink-0" strokeWidth={3} /> : <ChevronRight className="w-5 h-5 shrink-0" strokeWidth={3} />}
            <Wheat className="w-4 h-4 shrink-0" />
            <span className="font-bold text-sm truncate">SR# {group.srNumber} {group.crop}</span>
            <Badge variant="outline" className={`text-xs ${badgeCls} shrink-0`}>
              {group.lots.length} {t("stock.lots")}
            </Badge>
          </div>
          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {hasTransactions && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button" variant="ghost" size="sm"
                    onClick={e => e.stopPropagation()}
                    disabled={receiptLoading}
                    className="h-7 w-7 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950/40 shrink-0"
                    title={t("stock.printShareReceipt")}
                    data-testid={`button-receipt-${group.crop.toLowerCase()}`}
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={e => e.stopPropagation()}>
                  <DropdownMenuItem onClick={() => handleFarmerReceipt("print")} data-testid="receipt-print-farmer">
                    <Printer className="w-3.5 h-3.5 mr-2" /> {t("stock.printFarmerReceipt")}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleFarmerReceipt("share")} data-testid="receipt-share-farmer">
                    <Share2 className="w-3.5 h-3.5 mr-2" /> {t("stock.shareFarmerReceipt")}
                  </DropdownMenuItem>
                  {uniqueBuyers.length > 0 && <DropdownMenuSeparator />}
                  {uniqueBuyers.map(b => (
                    <div key={b.id}>
                      <DropdownMenuItem onClick={() => handleBuyerReceipt(b.id, b.name, "print")} data-testid={`receipt-print-buyer-${b.id}`}>
                        <Printer className="w-3.5 h-3.5 mr-2" /> {t("stock.printReceipt")} {b.name} {t("stock.receipt")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleBuyerReceipt(b.id, b.name, "share")} data-testid={`receipt-share-buyer-${b.id}`}>
                        <Share2 className="w-3.5 h-3.5 mr-2" /> {t("stock.shareReceipt")} {b.name} {t("stock.receipt")}
                      </DropdownMenuItem>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button
              type="button" variant="ghost" size="sm"
              onClick={e => { e.stopPropagation(); setShowHistory(true); }}
              className="h-7 w-7 p-0 text-blue-500 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40"
              title={t("stock.editHistory")}
              data-testid={`button-history-${group.crop.toLowerCase()}`}
            >
              <History className="w-3.5 h-3.5" />
            </Button>
            {isPersisted ? (
              <Button
                type="button" variant="ghost" size="sm"
                onClick={e => { e.stopPropagation(); onArchive(); }}
                className="h-7 w-7 p-0 text-amber-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 shrink-0"
                title={t("stock.archiveCropGroup")}
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
                title={t("stock.deleteCropGroup")}
                data-testid={`button-delete-${group.crop.toLowerCase()}`}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
        {/* Collapsed summary row */}
        {!group.groupOpen && (
          <div className="pl-6">
            <CollapsedSummary
              totalBags={totalBags} remainingBags={remainingBags}
              farmerPayable={totalFarmerPayable} buyerReceivable={totalBuyerReceivable}
              hasData={hasAnyData}
              farmerPaymentStatus={aggregatePaymentStatus(group.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.farmerPaymentStatus || "due")))}
              buyerPaymentStatus={aggregatePaymentStatus(group.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.paymentStatus || "due")))}
            />
          </div>
        )}
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
            />
          ))}
          {(() => {
            const addLotDisabled = totalBagsInVehicle > 0 && totalAllocatedAllGroups >= totalBagsInVehicle;
            return (
              <Button
                type="button" variant="outline" size="sm"
                onClick={addLot}
                disabled={addLotDisabled}
                title={addLotDisabled ? t("stock.vehicleCapacityReached") : undefined}
                className="w-full h-8 text-xs gap-1.5 border-dashed"
                data-testid={`button-add-lot-${group.crop.toLowerCase()}`}
              >
                <Plus className="w-3.5 h-3.5" /> {t("stock.addLotUnder")} {group.crop}
              </Button>
            );
          })()}
        </div>
      )}

      <ConfirmDeleteDialog
        open={pendingDeleteLotIdx !== null}
        title={t("stock.deleteThisLot")}
        description={
          isLastLot
            ? `${t("stock.deleteLotOnlyDesc")}`
            : `${t("stock.lot")} #${(pendingDeleteLotIdx ?? 0) + 1} ${t("stock.deleteLotDataDesc")}`
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
        title={`${t("stock.deleteCropGroup")} "${group.crop}"?`}
        description={t("stock.deleteGroupConfirm")}
        onConfirm={() => { setShowDeleteConfirm(false); onDelete(); }}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  );
}

// ─── Farmer card ──────────────────────────────────────────────────────────────

function FarmerCardComp({ card, savedCard, onChange, onSave, onSaveAndClose, onCancel, onArchive, onSyncSaved, cs, currentUsername, saving, allCards }: {
  card: FarmerCard;
  savedCard: FarmerCard | null;
  onChange: (c: FarmerCard) => void;
  onSave: () => void;
  onSaveAndClose: () => void;
  saving?: boolean;
  onCancel: () => void;
  onArchive: () => void;
  onSyncSaved: (c: FarmerCard) => void;
  cs: ChargeSettings;
  currentUsername: string;
  allCards: FarmerCard[];
}) {
  const { t } = useLanguage();
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
    queryKey: ["/api/buyers?withDues=true"],
  });
  const buyersList = buyersData.map((b: any) => ({ id: b.id, name: b.name, phone: b.phone || "", aadhatCommissionPercent: b.aadhatCommissionPercent || null, overallDue: b.overallDue ?? "0", limitAmount: b.limitAmount ?? null }));

  const filteredVillages = (locationData?.villages || []).filter(
    (v) => card.village.length >= 1 && v.toLowerCase().includes(card.village.toLowerCase()) && v.toLowerCase() !== card.village.toLowerCase()
  );
  const filteredTehsils = (locationData?.tehsils || []).filter(
    (th) => card.tehsil.length >= 1 && th.toLowerCase().includes(card.tehsil.toLowerCase()) && th.toLowerCase() !== card.tehsil.toLowerCase()
  );
  const farmerKb = useKeyboardNav(farmerSuggestions, f => String(f.id));
  const villageKb = useKeyboardNav(filteredVillages);
  const tehsilKb = useKeyboardNav(filteredTehsils);

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
    farmerKb.reset();
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
    ? (() => {
        const visibleGroupIds = new Set(card.cropGroups.map(g => g.id));
        const comparableSaved = { ...savedCard, cropGroups: savedCard.cropGroups.filter(g => visibleGroupIds.has(g.id)) };
        return getDataFingerprint(card) !== getDataFingerprint(comparableSaved);
      })()
    : hasAnyInput;

  const conflictCard = (card.savedAt === null && card.farmerId)
    ? allCards.find(c =>
        c.id !== card.id &&
        c.farmerId === card.farmerId &&
        c.date === card.date &&
        c.cropGroups.some(g => g.lots.some(l => !!l.dbId))
      )
    : undefined;
  const conflictType: "warning" | "error" | null = conflictCard
    ? (conflictCard.vehicleNumber?.trim() ? "warning" : "error")
    : null;

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
          queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
          queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
          queryClient.invalidateQueries({ predicate: (query) => {
            const key = query.queryKey[0];
            return typeof key === "string" && key.startsWith("/api/buyers");
          }});
        }
        const updatedCard = { ...card, cropGroups: card.cropGroups.map((g, i) => i === pendingArchiveGroupIdx ? { ...g, archived: true } : g) };
        onChange(updatedCard);
        onSyncSaved(updatedCard);
        toast({ title: t("stock.cropGroupArchived"), variant: "success" });
      } catch (err: any) {
        toast({ title: t("stock.archiveFailedCrop"), description: err?.message, variant: "destructive" });
      }
    }
    setPendingArchiveGroupIdx(null);
  };
  const pendingGroupName = pendingArchiveGroupIdx !== null ? card.cropGroups[pendingArchiveGroupIdx]?.crop : "";

  const allLotTotals = card.cropGroups
    .filter(g => !g.archived)
    .flatMap(g => g.lots.map(l => calcLotTotals(l, cs, vehicleBhadaRate, totalBagsInVehicle, buyersList)));
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
            {t("stock.archivedExcluded")}
          </div>
          <Button type="button" variant="outline" size="sm"
            onClick={() => setShowReinstateConfirm(true)}
            className="h-6 px-2 text-[11px] border-amber-400 text-amber-700 hover:bg-amber-100 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950/60"
            data-testid="button-reinstate-farmer">
            {t("stock.reinstate")}
          </Button>
        </div>
      )}

      {/* Header */}
      <button
        type="button"
        className={`w-full flex flex-col gap-1 px-4 py-3 transition-colors border-b border-border text-left ${card.archived ? "bg-muted/20 cursor-default" : "bg-muted/40 hover:bg-muted/60"}`}
        onClick={handleCardToggle}
        data-testid="button-toggle-farmer-card"
      >
        {/* Top row: chevron + icon + name + date + archive */}
        <div className="flex items-center justify-between gap-2 w-full min-w-0">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {card.cardOpen ? <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" strokeWidth={3} /> : <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" strokeWidth={3} />}
            <User className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-sm truncate">
              {card.farmerName.trim() || <span className="text-muted-foreground italic">{t("stock.newFarmerEntry")}</span>}
            </span>
            {card.farmerPhone && (
              <span className="hidden sm:inline text-xs text-muted-foreground font-normal shrink-0">· {card.farmerPhone}</span>
            )}
            {card.village && (
              <span className="hidden sm:inline text-xs text-muted-foreground font-normal shrink-0">· {card.village}</span>
            )}
            {parseFloat(card.advanceAmount || "0") > 0 && (
              <span className="hidden sm:inline-flex text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5 shrink-0">
                {t("stock.advance")} ₹{parseFloat(card.advanceAmount).toLocaleString("en-IN")}{card.advanceMode ? ` · ${card.advanceMode}` : ""}
              </span>
            )}
            {isDirty && card.savedAt !== null && (
              <span className="hidden sm:inline-flex text-[10px] font-medium text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded px-1.5 py-0.5 shrink-0">
                {t("stock.unsavedChanges")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
                title={t("stock.archiveFarmerEntry")}
                data-testid="button-archive-farmer">
                <Archive className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
        {/* Second row (mobile only): phone, village, advance, unsaved badge */}
        {(card.farmerPhone || card.village || parseFloat(card.advanceAmount || "0") > 0 || (isDirty && card.savedAt !== null)) && (
          <div className="flex items-center gap-2 pl-6 flex-wrap sm:hidden">
            {card.farmerPhone && <span className="text-xs text-muted-foreground">· {card.farmerPhone}</span>}
            {card.village && <span className="text-xs text-muted-foreground">· {card.village}</span>}
            {parseFloat(card.advanceAmount || "0") > 0 && (
              <span className="text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded px-1.5 py-0.5" data-testid="badge-farmer-advance">
                {t("stock.advance")} ₹{parseFloat(card.advanceAmount).toLocaleString("en-IN")}{card.advanceMode ? ` · ${card.advanceMode}` : ""}
              </span>
            )}
            {isDirty && card.savedAt !== null && (
              <span className="text-[10px] font-medium text-orange-500 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 rounded px-1.5 py-0.5">
                {t("stock.unsavedChanges")}
              </span>
            )}
          </div>
        )}
        {/* Row 2: collapsed summary */}
        {!card.cardOpen && !card.archived && (
          <div className="pl-6">
            <CollapsedSummary
              totalBags={grandTotalBags} remainingBags={grandRemainingBags}
              farmerPayable={grandFarmerPayable} buyerReceivable={grandBuyerReceivable}
              hasData={grandHasData}
              farmerPaymentStatus={aggregatePaymentStatus(card.cropGroups.flatMap(g => g.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.farmerPaymentStatus || "due"))))}
              buyerPaymentStatus={aggregatePaymentStatus(card.cropGroups.flatMap(g => g.lots.flatMap(l => l.bids.filter(b => b.txnDbId).map(b => b.paymentStatus || "due"))))}
            />
          </div>
        )}
      </button>

      {card.cardOpen && !card.archived && (
        <CardContent className="p-4 space-y-3">

          {/* Farmer details */}
          <SectionToggle open={card.farmerOpen} onToggle={() => set("farmerOpen", !card.farmerOpen)}
            icon={<User className="w-3.5 h-3.5" />} label={t("stock.farmerDetails")} />
          {card.farmerOpen && (
            <div className="space-y-3 pl-2">
              {conflictType === "error" && conflictCard && (
                <div className="flex items-start gap-2 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-400" data-testid="banner-conflict-error">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{t("stock.conflictForFarmer")} <strong>{conflictCard.farmerName}</strong> {t("stock.conflictNoVehicleDetail").replace("{date}", card.date)}</span>
                </div>
              )}
              {conflictType === "warning" && conflictCard && (
                <div className="flex items-start gap-2 rounded-md border border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/40 px-3 py-2 text-xs text-orange-700 dark:text-orange-400" data-testid="banner-conflict-warning">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span>{t("stock.conflictForFarmer")} <strong>{conflictCard.farmerName}</strong> {t("stock.conflictHasVehicleDetail").replace("{date}", card.date).replace("{vehicle}", conflictCard.vehicleNumber || "")}</span>
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="relative">
                  <Label className="text-xs text-muted-foreground">{t("stock.farmerName")}</Label>
                  <Input data-testid="input-farmer-name" placeholder={t("stock.farmerNamePlaceholder")} value={card.farmerName}
                    onChange={e => {
                      const val = e.target.value.replace(/\b\w/g, c => c.toUpperCase());
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
                    onBlur={() => setTimeout(() => { setShowFarmerSuggestions(false); farmerKb.reset(); }, 150)}
                    onKeyDown={e => {
                      if (showFarmerSuggestions && farmerSuggestions.length > 0 && !card.farmerId) {
                        farmerKb.handleKeyDown(e, (f) => { selectFarmer(f); farmerKb.reset(); }, () => { setShowFarmerSuggestions(false); farmerKb.reset(); });
                      }
                    }}
                    className="h-8 text-sm" autoComplete="off" />
                  {showFarmerSuggestions && farmerSuggestions.length > 0 && !card.farmerId && (
                    <div ref={farmerKb.listRef} className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto top-full mt-1">
                      {farmerSuggestions.map((f: any, i: number) => (
                        <button
                          key={f.id}
                          data-testid={`suggestion-farmer-${f.id}`}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === farmerKb.activeIndex ? "bg-accent" : "hover:bg-muted"}`}
                          onMouseEnter={() => farmerKb.setActiveIndex(i)}
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
                  <Label className="text-xs text-muted-foreground">{t("stock.phone")}</Label>
                  <Input data-testid="input-farmer-phone" type="tel" inputMode="numeric" placeholder={t("stock.phonePlaceholder")} value={card.farmerPhone} onChange={e => set("farmerPhone", e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-8 text-sm" />
                  {card.farmerPhone.length > 0 && card.farmerPhone.length < 10 && (
                    <p data-testid="text-phone-warning" className="text-[11px] mt-0.5 text-destructive font-medium">{t("stock.phoneWarning")}</p>
                  )}
                </div>
                <div className="relative">
                  <Label className="text-xs text-muted-foreground">{t("stock.village")}</Label>
                  <Input data-testid="input-village" placeholder={t("stock.village")} value={card.village}
                    onChange={e => { set("village", capFirst(e.target.value)); setShowVillageSuggestions(true); }}
                    onFocus={() => setShowVillageSuggestions(true)}
                    onBlur={() => setTimeout(() => { setShowVillageSuggestions(false); villageKb.reset(); }, 150)}
                    onKeyDown={e => {
                      if (showVillageSuggestions && filteredVillages.length > 0) {
                        villageKb.handleKeyDown(e, (v) => { set("village", v); setShowVillageSuggestions(false); villageKb.reset(); }, () => { setShowVillageSuggestions(false); villageKb.reset(); });
                      }
                    }}
                    className="h-8 text-sm" autoComplete="off" />
                  {showVillageSuggestions && filteredVillages.length > 0 && (
                    <div ref={villageKb.listRef} className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto top-full">
                      {filteredVillages.map((v, i) => (
                        <button key={v} type="button" data-testid={`suggestion-village-${v}`}
                          className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === villageKb.activeIndex ? "bg-accent" : "hover:bg-muted"}`}
                          onMouseEnter={() => villageKb.setActiveIndex(i)}
                          onMouseDown={() => { set("village", v); setShowVillageSuggestions(false); villageKb.reset(); }}>
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <Label className="text-xs text-muted-foreground">{t("stock.tehsil")}</Label>
                  <Input data-testid="input-tehsil" placeholder={t("stock.tehsil")} value={card.tehsil}
                    onChange={e => { set("tehsil", capFirst(e.target.value)); setShowTehsilSuggestions(true); }}
                    onFocus={() => setShowTehsilSuggestions(true)}
                    onBlur={() => setTimeout(() => { setShowTehsilSuggestions(false); tehsilKb.reset(); }, 150)}
                    onKeyDown={e => {
                      if (showTehsilSuggestions && filteredTehsils.length > 0) {
                        tehsilKb.handleKeyDown(e, (th) => { set("tehsil", th); setShowTehsilSuggestions(false); tehsilKb.reset(); }, () => { setShowTehsilSuggestions(false); tehsilKb.reset(); });
                      }
                    }}
                    className="h-8 text-sm" autoComplete="off" />
                  {showTehsilSuggestions && filteredTehsils.length > 0 && (
                    <div ref={tehsilKb.listRef} className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto top-full">
                      {filteredTehsils.map((th, i) => (
                        <button key={th} type="button" data-testid={`suggestion-tehsil-${th}`}
                          className={`w-full text-left px-3 py-2 text-sm border-b last:border-b-0 ${i === tehsilKb.activeIndex ? "bg-accent" : "hover:bg-muted"}`}
                          onMouseEnter={() => tehsilKb.setActiveIndex(i)}
                          onMouseDown={() => { set("tehsil", th); setShowTehsilSuggestions(false); tehsilKb.reset(); }}>
                          {th}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">{t("stock.district")}</Label>
                  <Popover open={districtOpen} onOpenChange={setDistrictOpen}>
                    <PopoverTrigger asChild>
                      <Button data-testid="select-district" variant="outline" role="combobox" aria-expanded={districtOpen} className="h-8 w-full justify-between text-sm font-normal">
                        {card.district || <span className="text-muted-foreground">{t("stock.selectDistrict")}</span>}
                        <ChevronsUpDown className="ml-1 h-3.5 w-3.5 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[200px] p-0" align="start">
                      <Command>
                        <CommandInput placeholder={t("stock.searchDistrict")} className="h-9 text-sm" />
                        <CommandList>
                          <CommandEmpty className="py-3 text-xs">{t("stock.noDistrictFound")}</CommandEmpty>
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
                  <Label className="text-xs text-muted-foreground">{t("stock.state")}</Label>
                  <Select value={card.state} onValueChange={v => set("state", v)}>
                    <SelectTrigger data-testid="select-state" className="h-8 text-sm pl-1">
                      <SelectValue placeholder={t("stock.selectState")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Madhya Pradesh">Madhya Pradesh</SelectItem>
                      <SelectItem value="Gujarat">Gujarat</SelectItem>
                      <SelectItem value="Uttar Pradesh">Uttar Pradesh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("stock.farmerAdvance")}</Label>
                  <Input data-testid="input-farmer-advance" type="number" placeholder="0" value={card.advanceAmount} onChange={e => set("advanceAmount", e.target.value)} className="h-8 text-sm" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">{t("stock.mode")}</Label>
                  <Select value={card.advanceMode} onValueChange={v => set("advanceMode", v)}>
                    <SelectTrigger data-testid="select-advance-mode" className="h-8 text-sm">
                      <SelectValue placeholder={t("stock.selectMode")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">{t("stock.cash")}</SelectItem>
                      <SelectItem value="Account">{t("stock.account")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Vehicle info */}
          <SectionToggle open={card.vehicleOpen} onToggle={() => set("vehicleOpen", !card.vehicleOpen)}
            icon={<Truck className="w-3.5 h-3.5" />} label={t("stock.vehicleInfo")}
            summary={[
              card.vehicleNumber && `# ${card.vehicleNumber}`,
              card.driverName && card.driverName,
              card.vehicleBhadaRate && `₹${card.vehicleBhadaRate}`,
              card.freightType && card.freightType,
              card.totalBagsInVehicle && `${card.totalBagsInVehicle} ${t("common.bags")}`,
            ].filter(Boolean) as string[]} />
          {card.vehicleOpen && (
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3 pl-2">
              <div>
                <Label className="text-xs text-muted-foreground">{t("stock.vehicleNumber")}</Label>
                <Input data-testid="input-vehicle-number" placeholder={t("stock.vehiclePlaceholder")} value={card.vehicleNumber} onChange={e => set("vehicleNumber", e.target.value.toUpperCase())} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("stock.driverName")}</Label>
                <Input data-testid="input-driver-name" placeholder={t("stock.optional")} value={card.driverName} onChange={e => set("driverName", capFirst(e.target.value))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("stock.driverContact")}</Label>
                <Input data-testid="input-driver-contact" type="tel" inputMode="numeric" placeholder={t("stock.optional")} value={card.driverContact} onChange={e => set("driverContact", e.target.value.replace(/\D/g, "").slice(0, 10))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] sm:text-xs text-muted-foreground">{t("stock.freightBhada")} <span className="text-destructive">*</span></Label>
                <Input data-testid="input-bhada-rate" type="text" inputMode="decimal" placeholder="0.00" value={card.vehicleBhadaRate} onChange={e => set("vehicleBhadaRate", toNum(e.target.value))} onFocus={e => e.target.select()} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-[10px] sm:text-xs text-muted-foreground">{t("stock.advanceCredit")} <span className="text-destructive">*</span></Label>
                <Select value={card.freightType} onValueChange={v => set("freightType", v)}>
                  <SelectTrigger data-testid="select-freight-type" className="h-8 text-sm">
                    <SelectValue placeholder={t("stock.selectType")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Advance">{t("stock.advance")}</SelectItem>
                    <SelectItem value="Credit">{t("stock.credit")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] sm:text-xs text-muted-foreground">{t("stock.totalBagsInVehicle")} <span className="text-destructive">*</span></Label>
                <Input data-testid="input-total-bags-vehicle" type="text" inputMode="numeric" placeholder="0" value={card.totalBagsInVehicle} onChange={e => set("totalBagsInVehicle", e.target.value.replace(/\D/g, ""))} onFocus={e => e.target.select()} className="h-8 text-sm" />
                {(() => {
                  const allocated = card.cropGroups.reduce((sum, g) => sum + g.lots.reduce((s, l) => s + (parseInt(l.numberOfBags) || 0), 0), 0);
                  const total = parseInt(card.totalBagsInVehicle) || 0;
                  const over = allocated > total;
                  return (
                    <span data-testid="text-allocated-bags" className={`text-[11px] mt-0.5 block font-medium ${over ? "text-destructive font-semibold" : "text-green-600 dark:text-green-500"}`}>
                      {t("stock.allocated")} {allocated} / {total || "—"} {t("common.bags")}
                    </span>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Crop groups — sorted ascending by SR# (unsaved/sentinel last) */}
          <div className="space-y-3 pt-1">
            {(() => {
              return card.cropGroups.map((group, idx) => ({ group, idx }))
              .sort((a, b) => {
                const srA = parseInt(a.group.srNumber); const srB = parseInt(b.group.srNumber);
                const nA = isNaN(srA) ? Infinity : srA;
                const nB = isNaN(srB) ? Infinity : srB;
                return nA - nB;
              })
              .map(({ group, idx }) => (
              <CropGroupSection
                key={group.id} group={group}
                onChange={g => updateGroup(idx, g)}
                onArchive={() => archiveGroup(idx)}
                onDelete={() => deleteGroup(idx)}
                isPersisted={group.persisted}
                vehicleBhadaRate={vehicleBhadaRate}
                totalBagsInVehicle={totalBagsInVehicle}
                totalAllocatedAllGroups={grandTotalBags}
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
              />
            ));
            })()}
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
                {t("stock.selectCropToBegin")}
              </p>
            )}
          </div>

          {/* Footer: Cancel + Save */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <Button type="button" variant="outline" size="sm"
              onClick={onCancel}
              className="h-8 text-sm gap-1.5 border-amber-500 text-amber-600 hover:bg-amber-50 hover:text-amber-700 dark:hover:bg-amber-950"
              data-testid="button-cancel-entry">
              <X className="w-3.5 h-3.5" /> {t("common.cancel")}
            </Button>
            <div className="flex items-center gap-2">
              {card.savedAt && (
                <span className="text-[10px] text-muted-foreground">{t("stock.lastSaved")}: {card.savedAt}</span>
              )}
              <Button type="button"
                onClick={onSave}
                disabled={!isDirty || saving || conflictType === "error"}
                className={`h-8 gap-1.5 text-sm transition-all ${isDirty && !saving && conflictType !== "error" ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                data-testid="button-save-entry">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {saving ? t("stock.saving") || "Saving..." : t("stock.saveEntry")}
              </Button>
            </div>
          </div>
        </CardContent>
      )}

      {/* Archive farmer dialog */}
      <ArchiveDialog
        open={showArchiveFarmer}
        title={`${t("stock.archive")} ${card.farmerName.trim() || t("stock.thisFarmer")}?`}
        description={t("stock.archiveFarmerDesc")}
        onConfirm={() => { setShowArchiveFarmer(false); onArchive(); }}
        onCancel={() => setShowArchiveFarmer(false)}
      />

      {/* Archive crop group dialog */}
      <ArchiveDialog
        open={pendingArchiveGroupIdx !== null}
        title={`${t("stock.archive")} "${pendingGroupName}"?`}
        description={t("stock.archiveCropGroupDesc")}
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
        title={`${t("stock.reinstate")} ${card.farmerName.trim() || t("stock.thisFarmer")}?`}
        description={t("stock.reinstateFarmerDesc")}
        onConfirm={async () => {
          setShowReinstateConfirm(false);
          if (card.farmerId) {
            try {
              await apiRequest("PATCH", `/api/farmers/${card.farmerId}`, { isArchived: false });
              queryClient.invalidateQueries({ queryKey: ["/api/stock-cards"] });
              queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
              queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
              queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
              queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
              queryClient.invalidateQueries({ predicate: (query) => {
                const key = query.queryKey[0];
                return typeof key === "string" && key.startsWith("/api/buyers");
              }});
              const updatedCard = { ...card, archived: false, cardOpen: true };
              onChange(updatedCard);
              onSyncSaved(updatedCard);
              toast({ title: t("stock.farmerReinstated"), variant: "success" });
            } catch (err: any) {
              toast({ title: t("stock.reinstateFailedFarmer"), description: err?.message, variant: "destructive" });
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
        srNumber: cg.srNumber || "—",
        groupOpen: false,
        lots: (cg.lots || []).map((lot: any) => ({
          id: uid(),
          dbId: lot.dbId,
          lotId: lot.lotId || "",
          lotOpen: false,
          isArchived: lot.isArchived || false,
          numberOfBags: lot.numberOfBags?.toString() || "",
          size: lot.size || "None",
          variety: lot.variety || "",
          bagMarka: lot.bagMarka || "",
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
              savedCharges: txn ? {
                mandiCommissionFarmerPercent: txn.mandiFarmerPercent || "0",
                mandiCommissionBuyerPercent: txn.mandiBuyerPercent || "0",
                aadhatCommissionFarmerPercent: txn.aadhatFarmerPercent || "0",
                aadhatCommissionBuyerPercent: txn.aadhatBuyerPercent || "0",
                muddatAnyaFarmerPercent: txn.muddatAnyaFarmerPercent || "0",
                muddatAnyaBuyerPercent: txn.muddatAnyaBuyerPercent || "0",
                hammaliFarmerPerBag: txn.hammaliFarmerPerBag || "0",
                hammaliBuyerPerBag: txn.hammaliBuyerPerBag || "0",
              } : undefined,
              savedBuyerReceivable: txn?.totalReceivableFromBuyer != null ? parseFloat(txn.totalReceivableFromBuyer) : undefined,
              savedFarmerPayable: txn?.totalPayableToFarmer != null ? parseFloat(txn.totalPayableToFarmer) : undefined,
              paymentStatus: txn?.paymentStatus || "due",
              farmerPaymentStatus: txn?.farmerPaymentStatus || "due",
              farmerPaidAmount: txn?.farmerPaidAmount?.toString() || "0",
              paidAmount: txn?.paidAmount?.toString() || "0",
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

// ─── Draft persistence helpers ────────────────────────────────────────────────

const DRAFT_KEY_PREFIX = "mandi_draft_";
const getDraftKey = (businessId: number) => `${DRAFT_KEY_PREFIX}${businessId}`;

function saveDraftsToStorage(cards: FarmerCard[], savedCardMap: Map<string, FarmerCard>, businessId: number) {
  const drafts = cards.filter(c => {
    if (c.archived) return false;
    const saved = savedCardMap.get(c.id);
    if (saved) {
      return getDataFingerprint(c) !== getDataFingerprint(saved);
    }
    return !!(c.farmerName.trim() || c.farmerPhone || c.village || c.vehicleNumber || c.advanceAmount || c.cropGroups.some(g => g.lots.some(hasLotUserData)));
  });
  try {
    if (drafts.length > 0) {
      localStorage.setItem(getDraftKey(businessId), JSON.stringify(drafts));
    } else {
      localStorage.removeItem(getDraftKey(businessId));
    }
  } catch (_) {}
}

function loadDraftsFromStorage(businessId: number): FarmerCard[] {
  try {
    const raw = localStorage.getItem(getDraftKey(businessId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FarmerCard[];
    return parsed.map(c => ({ ...c, cardOpen: true, farmerOpen: true, vehicleOpen: false }));
  } catch (_) {
    return [];
  }
}

const fmtInr = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(2)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
};

const MONTH_LABELS_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_LABELS_HI = ["जन","फर","मार्च","अप्रै","मई","जून","जुल","अग","सित","अक्टू","नव","दिस"];

function StockFilterBar({
  cards,
  dateMode, setDateMode,
  yearFilter, setYearFilter,
  selectedMonths, setSelectedMonths,
  selectedDays, setSelectedDays,
  farmerFilter, setFarmerFilter,
  farmerFilterId, setFarmerFilterId,
  buyerFilter, setBuyerFilter,
  cropFilter, setCropFilter,
  buyersList,
  onExportStockCsv, onExportTxnCsv,
  canPrintOverallBill, onPrintAllBuyerReceipt,
  canPrintBidCopy, onPrintBidCopy,
}: {
  cards: FarmerCard[];
  dateMode: "stock" | "txn";
  setDateMode: (v: "stock" | "txn") => void;
  yearFilter: string;
  setYearFilter: (v: string) => void;
  selectedMonths: string[];
  setSelectedMonths: (v: string[] | ((p: string[]) => string[])) => void;
  selectedDays: string[];
  setSelectedDays: (v: string[] | ((p: string[]) => string[])) => void;
  farmerFilter: string;
  setFarmerFilter: (v: string) => void;
  farmerFilterId: number | null;
  setFarmerFilterId: (v: number | null) => void;
  buyerFilter: string;
  setBuyerFilter: (v: string) => void;
  cropFilter: string;
  setCropFilter: (v: string) => void;
  buyersList: { id: number; name: string; phone?: string; aadhatCommissionPercent?: string | null }[];
  onExportStockCsv: () => void;
  onExportTxnCsv: () => void;
  canPrintOverallBill: boolean;
  onPrintAllBuyerReceipt: (action: "print" | "share") => void;
  canPrintBidCopy: boolean;
  onPrintBidCopy: () => void;
}) {
  const { t, language } = useLanguage();
  const MONTH_LABELS = language === "hi" ? MONTH_LABELS_HI : MONTH_LABELS_EN;
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);
  const [farmerDropOpen, setFarmerDropOpen] = useState(false);
  const [buyerDropOpen, setBuyerDropOpen] = useState(false);
  const farmerRef = useRef<HTMLDivElement>(null);
  const buyerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (farmerRef.current && !farmerRef.current.contains(e.target as Node)) { setFarmerDropOpen(false); filterFarmerKb.reset(); }
      if (buyerRef.current && !buyerRef.current.contains(e.target as Node)) { setBuyerDropOpen(false); filterBuyerKb.reset(); }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const years = useMemo(() => {
    const yearSet = new Set<string>();
    for (const card of cards) {
      if (card.archived) continue;
      if (dateMode === "stock") {
        if (card.date) yearSet.add(card.date.substring(0, 4));
      } else {
        for (const g of card.cropGroups) {
          if (g.archived) continue;
          for (const lot of g.lots) {
            for (const bid of lot.bids) {
              if (bid.txnDate) yearSet.add(bid.txnDate.substring(0, 4));
            }
          }
        }
      }
    }
    yearSet.add(String(new Date().getFullYear()));
    return Array.from(yearSet).sort().reverse();
  }, [cards, dateMode]);

  const daysInMonths = useMemo(() => {
    if (selectedMonths.length === 0) return 31;
    const year = yearFilter !== "all" ? parseInt(yearFilter) : new Date().getFullYear();
    return Math.max(...selectedMonths.map(m => new Date(year, parseInt(m), 0).getDate()));
  }, [selectedMonths, yearFilter]);

  const toggleMonth = (month: string) => {
    setSelectedMonths((prev: string[]) => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);
    setSelectedDays([]);
  };
  const selectAllMonths = () => { setSelectedMonths([]); setSelectedDays([]); setMonthPopoverOpen(false); };
  const toggleDay = (day: string) => {
    setSelectedDays((prev: string[]) => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };
  const selectAllDays = () => { setSelectedDays([]); setDayPopoverOpen(false); };

  const monthLabel = selectedMonths.length === 0
    ? t("stock.allMonths")
    : selectedMonths.length === 1
      ? MONTH_LABELS[parseInt(selectedMonths[0]) - 1]
      : `${selectedMonths.length} ${t("stock.months")}`;

  const dayLabel = selectedDays.length === 0
    ? t("stock.allDays")
    : selectedDays.length === 1
      ? selectedDays[0]
      : `${selectedDays.length} ${t("stock.days")}`;

  const farmerSuggestions = useMemo(() => {
    const seen = new Set<number | string>();
    const list: { id: number | undefined; name: string; phone: string; village: string }[] = [];
    for (const card of cards) {
      if (card.archived || !card.farmerName.trim()) continue;
      const key = card.farmerId ?? card.farmerName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push({ id: card.farmerId, name: card.farmerName, phone: card.farmerPhone || "", village: card.village || "" });
    }
    return list;
  }, [cards]);

  const filteredFarmerSuggestions = farmerFilter.trim()
    ? farmerSuggestions.filter(f => f.name.toLowerCase().includes(farmerFilter.toLowerCase()))
    : farmerSuggestions;

  const buyerSuggestions = useMemo(() => {
    return buyersList.map(b => ({ id: b.id, name: b.name, phone: b.phone || "" }));
  }, [buyersList]);

  const filteredBuyerSuggestions = buyerFilter.trim()
    ? buyerSuggestions.filter(b => b.name.toLowerCase().includes(buyerFilter.toLowerCase()))
    : buyerSuggestions;

  const filterFarmerKb = useKeyboardNav(filteredFarmerSuggestions, f => f.name);
  const filterBuyerKb = useKeyboardNav(filteredBuyerSuggestions, b => String(b.id));

  const currentYear = String(new Date().getFullYear());
  const defaultMonth = String(new Date().getMonth() + 1);
  const defaultDay = String(new Date().getDate());
  const anyActive = dateMode !== "stock"
    || yearFilter !== currentYear
    || !(selectedMonths.length === 1 && selectedMonths[0] === defaultMonth)
    || !(selectedDays.length === 1 && selectedDays[0] === defaultDay)
    || farmerFilter !== "" || buyerFilter !== "" || cropFilter !== "all";

  const clearAll = () => {
    setDateMode("stock");
    setYearFilter(currentYear);
    setSelectedMonths([defaultMonth]);
    setSelectedDays([defaultDay]);
    setFarmerFilter("");
    setBuyerFilter("");
    setCropFilter("all");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="stock-filter-bar">
      <Filter className="w-4 h-4 text-muted-foreground shrink-0" />

      <Select value={dateMode} onValueChange={(v) => setDateMode(v as "stock" | "txn")}>
        <SelectTrigger className="w-[80px] h-8 text-xs" data-testid="select-date-mode">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="stock">{t("stock.stock")}</SelectItem>
          <SelectItem value="txn">{t("stock.txn")}</SelectItem>
        </SelectContent>
      </Select>

      <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSelectedMonths([]); setSelectedDays([]); }}>
        <SelectTrigger className="w-[90px] h-8 text-xs" data-testid="select-year-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("stock.allYears")}</SelectItem>
          {years.map(y => (
            <SelectItem key={y} value={y}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="stk-select-month-filter">
            {monthLabel}
            <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <button
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
            data-testid="stk-month-select-all"
            onClick={selectAllMonths}
          >
            <Checkbox checked={selectedMonths.length === 0} />
            <span>{t("stock.allMonths")}</span>
          </button>
          <div className="grid grid-cols-4 gap-0.5">
            {MONTH_LABELS.map((m, i) => {
              const val = String(i + 1);
              return (
                <button
                  key={val}
                  className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedMonths.includes(val) ? "bg-primary text-primary-foreground" : ""}`}
                  data-testid={`stk-month-option-${val}`}
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
          <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="stk-select-day-filter">
            <Calendar className="w-3 h-3 mr-1" />
            {dayLabel}
            <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-2" align="start">
          <button
            className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
            data-testid="stk-day-select-all"
            onClick={selectAllDays}
          >
            <Checkbox checked={selectedDays.length === 0} />
            <span>{t("stock.allDays")}</span>
          </button>
          <div className="grid grid-cols-7 gap-0.5">
            {Array.from({ length: daysInMonths }, (_, i) => String(i + 1)).map(d => (
              <button
                key={d}
                className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedDays.includes(d) ? "bg-primary text-primary-foreground" : ""}`}
                data-testid={`stk-day-option-${d}`}
                onClick={() => toggleDay(d)}
              >
                {d}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <div className="relative" ref={farmerRef}>
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          data-testid="input-farmer-filter"
          value={farmerFilter}
          onChange={(e) => { setFarmerFilter(e.target.value); setFarmerFilterId(null); setFarmerDropOpen(true); }}
          onFocus={() => setFarmerDropOpen(true)}
          onKeyDown={e => {
            if (farmerDropOpen && filteredFarmerSuggestions.length > 0) {
              filterFarmerKb.handleKeyDown(e, (f) => { setFarmerFilter(f.name); setFarmerFilterId(f.id ?? null); setFarmerDropOpen(false); filterFarmerKb.reset(); }, () => { setFarmerDropOpen(false); filterFarmerKb.reset(); });
            }
          }}
          placeholder={t("stock.farmer")}
          className="pl-7 w-[140px] h-8 text-xs"
        />
        {farmerFilter && (
          <button className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => { setFarmerFilter(""); setFarmerFilterId(null); setFarmerDropOpen(false); filterFarmerKb.reset(); }}>
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {farmerDropOpen && filteredFarmerSuggestions.length > 0 && (
          <div ref={filterFarmerKb.listRef} className="absolute top-full left-0 z-50 mt-1 w-[280px] max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
            {filteredFarmerSuggestions.map((f, i) => (
              <button
                key={i}
                className={`w-full text-left px-3 py-2 text-xs border-b last:border-b-0 ${i === filterFarmerKb.activeIndex ? "bg-accent" : "hover:bg-accent"}`}
                data-testid={`farmer-suggestion-${i}`}
                onMouseEnter={() => filterFarmerKb.setActiveIndex(i)}
                onClick={() => { setFarmerFilter(f.name); setFarmerFilterId(f.id ?? null); setFarmerDropOpen(false); filterFarmerKb.reset(); }}
              >
                <div className="font-medium">{f.name}</div>
                {(f.phone || f.village) && (
                  <div className="text-muted-foreground mt-0.5">
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

      <div className="relative" ref={buyerRef}>
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          data-testid="input-buyer-filter"
          value={buyerFilter}
          onChange={(e) => { setBuyerFilter(e.target.value); setBuyerDropOpen(true); }}
          onFocus={() => setBuyerDropOpen(true)}
          onKeyDown={e => {
            if (buyerDropOpen && filteredBuyerSuggestions.length > 0) {
              filterBuyerKb.handleKeyDown(e, (b) => { setBuyerFilter(b.name); setBuyerDropOpen(false); filterBuyerKb.reset(); }, () => { setBuyerDropOpen(false); filterBuyerKb.reset(); });
            }
          }}
          placeholder={t("stock.buyer")}
          className="pl-7 w-[140px] h-8 text-xs"
        />
        {buyerFilter && (
          <button className="absolute right-1.5 top-1/2 -translate-y-1/2" onClick={() => { setBuyerFilter(""); setBuyerDropOpen(false); filterBuyerKb.reset(); }}>
            <X className="w-3 h-3 text-muted-foreground" />
          </button>
        )}
        {buyerDropOpen && filteredBuyerSuggestions.length > 0 && (
          <div ref={filterBuyerKb.listRef} className="absolute top-full left-0 z-50 mt-1 w-[220px] max-h-48 overflow-y-auto rounded-md border bg-popover shadow-md">
            {filteredBuyerSuggestions.map((b, i) => (
              <button
                key={i}
                className={`w-full text-left px-3 py-2 text-xs truncate ${i === filterBuyerKb.activeIndex ? "bg-accent" : "hover:bg-accent"}`}
                data-testid={`buyer-suggestion-${i}`}
                onMouseEnter={() => filterBuyerKb.setActiveIndex(i)}
                onClick={() => { setBuyerFilter(b.name); setBuyerDropOpen(false); filterBuyerKb.reset(); }}
              >
                <span className="font-medium">{b.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <Select value={cropFilter} onValueChange={setCropFilter}>
        <SelectTrigger className="w-[100px] h-8 text-xs" data-testid="select-crop-filter">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("stock.allCrops")}</SelectItem>
          {CROPS.map(c => (
            <SelectItem key={c} value={c}>{c}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {anyActive && (
        <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-muted-foreground" onClick={clearAll} data-testid="button-clear-filters">
          <RotateCcw className="w-3 h-3" /> {t("stock.clear")}
        </Button>
      )}

      {canPrintOverallBill && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              data-testid="button-print-all-buyer-receipt"
              title={`${t("stock.printOverallBill")} ${buyerFilter.trim()} (${cropFilter})`}
            >
              <Printer className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onPrintAllBuyerReceipt("print")} data-testid="receipt-print-overall">
              <Printer className="w-3.5 h-3.5 mr-2" /> {t("stock.printOverallBill")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onPrintAllBuyerReceipt("share")} data-testid="receipt-share-overall">
              <Share2 className="w-3.5 h-3.5 mr-2" /> {t("stock.shareOverallBill")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <Button
        variant="outline"
        size="icon"
        className={`h-8 w-8 ${!canPrintBidCopy ? "opacity-40 cursor-not-allowed" : ""}`}
        data-testid="button-print-bid-copy"
        title={t("stock.printBidCopy")}
        onClick={canPrintBidCopy ? onPrintBidCopy : undefined}
        disabled={!canPrintBidCopy}
      >
        <ClipboardList className="w-3.5 h-3.5" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1 px-2" data-testid="button-csv-download">
            <Download className="w-3.5 h-3.5" />
            <ChevronDown className="w-3 h-3 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onExportStockCsv} data-testid="menu-stock-csv">
            {t("stock.stockCsv")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onExportTxnCsv} data-testid="menu-txn-csv">
            {t("stock.txnCsv")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function StockSummaryBar({ cards, savedCardMap, cs, buyersList }: {
  cards: FarmerCard[];
  savedCardMap: Map<string, FarmerCard>;
  cs: ChargeSettings;
  buyersList: { id: number; name: string; phone?: string; aadhatCommissionPercent?: string | null; overallDue?: string; limitAmount?: number | null }[];
}) {
  const { t } = useLanguage();
  let distinctFarmers = 0, totalLots = 0, totalTxns = 0;
  let farmerPayableTotal = 0, farmerDue = 0;
  let buyerReceivableTotal = 0, buyerDue = 0;
  let aadhatTotal = 0;

  for (const card of cards) {
    if (card.archived || !savedCardMap.has(card.id)) continue;
    distinctFarmers++;
    const vbr = parseFloat(card.vehicleBhadaRate) || 0;
    const tbi = parseInt(card.totalBagsInVehicle) || 0;
    let cardFarmerDue = 0;
    for (const g of card.cropGroups) {
      if (g.archived) continue;
      for (const lot of g.lots) {
        totalLots++;
        const lt = calcLotTotals(lot, cs, vbr, tbi, buyersList);
        farmerPayableTotal += lt.farmerPayable;
        buyerReceivableTotal += lt.buyerReceivable;
        aadhatTotal += lt.aadhatBuyer;
        for (const bid of lot.bids) {
          totalTxns++;
          const buyerData = buyersList.find(b => b.id === bid.buyerId);
          const buyerAadhat = buyerData?.aadhatCommissionPercent != null && buyerData.aadhatCommissionPercent !== ""
            ? parseFloat(buyerData.aadhatCommissionPercent) || 0 : null;
          const bt = calcBidTotals(bid, cs, vbr, tbi, buyerAadhat);
          if (bid.farmerPaymentStatus !== "paid") {
            const farmerPaid = parseFloat(bid.farmerPaidAmount || "0");
            cardFarmerDue += Math.max(0, bt.farmerPayable - farmerPaid);
          }
          if (bid.paymentStatus !== "paid") {
            const buyerPaid = parseFloat(bid.paidAmount || "0");
            buyerDue += Math.max(0, bt.buyerReceivable - buyerPaid);
          }
        }
      }
    }
    farmerDue += cardFarmerDue;
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-2" data-testid="stock-summary-bar">
      <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">
          <Layers className="w-3.5 h-3.5" /> {t("stock.farmerLotsTxns")}
        </div>
        <div className="text-sm font-bold text-blue-700 dark:text-blue-300" data-testid="text-lots-txns">
          {distinctFarmers} / {totalLots} / {totalTxns}
        </div>
      </div>

      <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400 mb-1">
          <User className="w-3.5 h-3.5" /> {t("stock.farmerPayable")}
        </div>
        <div className="text-sm font-bold text-green-700 dark:text-green-300" data-testid="text-farmer-payable">
          ₹{Math.round(farmerPayableTotal).toLocaleString("en-IN")}
        </div>
        <div className="text-xs text-red-500 dark:text-red-400 font-medium">{t("stock.due")}: ₹{Math.round(farmerDue).toLocaleString("en-IN")}</div>
      </div>

      <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950/30 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-cyan-600 dark:text-cyan-400 mb-1">
          <ShoppingBag className="w-3.5 h-3.5" /> {t("stock.buyerReceivable")}
        </div>
        <div className="text-sm font-bold text-cyan-700 dark:text-cyan-300" data-testid="text-buyer-receivable">
          ₹{Math.round(buyerReceivableTotal).toLocaleString("en-IN")}
        </div>
        <div className="text-xs text-red-500 dark:text-red-400 font-medium">{t("stock.due")}: ₹{Math.round(buyerDue).toLocaleString("en-IN")}</div>
      </div>

      <div className="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/30 px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">
          <Landmark className="w-3.5 h-3.5" /> {t("stock.aadhatComm")}
        </div>
        <div className="text-sm font-bold text-orange-700 dark:text-orange-300" data-testid="text-aadhat-comm">
          ₹{Math.round(aadhatTotal).toLocaleString("en-IN")}
        </div>
        <div className="text-xs text-green-600 dark:text-green-400 font-medium">{t("stock.earnedViaBuyer")}</div>
      </div>
    </div>
  );
}

function sortCardsByMaxSr(cards: FarmerCard[]): FarmerCard[] {
  return [...cards].sort((a, b) => {
    const maxSr = (c: FarmerCard) => Math.max(0, ...c.cropGroups.map(g => parseInt(g.srNumber) || 0));
    const srA = maxSr(a);
    const srB = maxSr(b);
    if (srA === 0 && srB === 0) return 0;
    if (srA === 0) return -1;
    if (srB === 0) return 1;
    return srB - srA;
  });
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StockPage() {
  const { t } = useLanguage();
  const [cards, setCards] = useState<FarmerCard[]>([]);
  const [savedCardMap, setSavedCardMap] = useState<Map<string, FarmerCard>>(new Map());
  const [savingCardId, setSavingCardId] = useState<string | null>(null);
  const savingRef = useRef<string | null>(null);
  const dbLoaded = useRef(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const currentUsername = user?.name || user?.username || "Unknown";
  const businessId = user?.businessId || 0;

  const { data: stockCardsData, isLoading: loadingCards } = useQuery<any[]>({
    queryKey: ["/api/stock-cards"],
  });

  const { data: chargeSettings } = useQuery<ChargeSettings>({
    queryKey: ["/api/charge-settings"],
  });

  const { data: pageBuyersData = [] } = useQuery<any[]>({
    queryKey: ["/api/buyers?withDues=true"],
  });
  const pageBuyersList = pageBuyersData.map((b: any) => ({ id: b.id, name: b.name, phone: b.phone || "", aadhatCommissionPercent: b.aadhatCommissionPercent || null, licenceNo: b.licenceNo || "", overallDue: b.overallDue ?? "0", limitAmount: b.limitAmount ?? null }));

  const { data: stockPageReceiptTemplates = [] } = useQuery<ReceiptTemplate[]>({
    queryKey: ["/api/receipt-templates"],
  });

  const cs = chargeSettings || DEFAULT_CS;

  const [dateMode, setDateMode] = useState<"stock" | "txn">("stock");
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [selectedMonths, setSelectedMonths] = useState<string[]>([String(new Date().getMonth() + 1)]);
  const [selectedDays, setSelectedDays] = useState<string[]>([String(new Date().getDate())]);
  const [farmerFilter, setFarmerFilter] = useState("");
  const [farmerFilterId, setFarmerFilterId] = useState<number | null>(null);
  const [buyerFilter, setBuyerFilter] = useState("");
  const [cropFilter, setCropFilter] = useState("all");

  const filteredCards = useMemo(() => {
    const anyDateFilter = yearFilter !== "all" || selectedMonths.length > 0 || selectedDays.length > 0;

    const dateMatchesValue = (dateStr: string) => {
      if (!dateStr) return false;
      const [y, m, d] = dateStr.split("-");
      if (yearFilter !== "all" && y !== yearFilter) return false;
      if (selectedMonths.length > 0 && !selectedMonths.includes(String(parseInt(m)))) return false;
      if (selectedDays.length > 0 && !selectedDays.includes(String(parseInt(d)))) return false;
      return true;
    };

    const dateMatchesCard = (card: FarmerCard) => {
      if (!anyDateFilter) return true;
      if (dateMode === "stock") {
        return dateMatchesValue(card.date);
      } else {
        for (const g of card.cropGroups) {
          if (g.archived) continue;
          for (const lot of g.lots) {
            for (const bid of lot.bids) {
              if (dateMatchesValue(bid.txnDate)) return true;
            }
          }
        }
        return false;
      }
    };

    const farmerMatchesCard = (card: FarmerCard) => {
      if (farmerFilterId !== null) return card.farmerId === farmerFilterId;
      if (!farmerFilter.trim()) return true;
      return card.farmerName.toLowerCase().includes(farmerFilter.toLowerCase());
    };

    const buyerMatchesCard = (card: FarmerCard) => {
      if (!buyerFilter.trim()) return true;
      const q = buyerFilter.toLowerCase();
      const matchingBuyerIds = new Set(
        pageBuyersList.filter(b => b.name.toLowerCase().includes(q)).map(b => b.id)
      );
      for (const g of card.cropGroups) {
        if (g.archived) continue;
        for (const lot of g.lots) {
          for (const bid of lot.bids) {
            if (bid.buyerName.toLowerCase().includes(q)) return true;
            if (bid.buyerId && matchingBuyerIds.has(bid.buyerId)) return true;
          }
        }
      }
      return false;
    };

    const cropMatchesCard = (card: FarmerCard) => {
      if (cropFilter === "all") return true;
      return card.cropGroups.some(g => !g.archived && g.crop === cropFilter);
    };

    const applyCropFilter = (card: FarmerCard): FarmerCard => {
      if (cropFilter === "all") return card;
      return { ...card, cropGroups: card.cropGroups.filter(g => g.archived || g.crop === cropFilter) };
    };

    const sorted = sortCardsByMaxSr(
      cards
        .filter(dateMatchesCard)
        .filter(farmerMatchesCard)
        .filter(buyerMatchesCard)
        .filter(cropMatchesCard)
        .map(applyCropFilter)
    );
    const unsaved = sorted.filter(c => !savedCardMap.has(c.id));
    const saved = sorted.filter(c => savedCardMap.has(c.id));
    return [...unsaved, ...saved];
  }, [cards, savedCardMap, dateMode, yearFilter, selectedMonths, selectedDays, farmerFilter, farmerFilterId, buyerFilter, cropFilter, pageBuyersList]);

  useEffect(() => {
    if (!stockCardsData || !businessId || dbLoaded.current) return;
    dbLoaded.current = true;
    const loaded = stockCardsToFarmerCards(stockCardsData);
    const map = new Map<string, FarmerCard>();
    loaded.forEach(c => map.set(c.id, JSON.parse(JSON.stringify(c))));
    const drafts = loadDraftsFromStorage(businessId);
    const loadedIds = new Set(loaded.map(c => c.id));
    const newDrafts = drafts.filter(d => !loadedIds.has(d.id));
    const dirtyDrafts = drafts.filter(d => loadedIds.has(d.id));
    const mergedLoaded = loaded.map(c => {
      const dirty = dirtyDrafts.find(d => d.id === c.id);
      return dirty ? { ...dirty, cardOpen: true, farmerOpen: true, vehicleOpen: false } : c;
    });
    const allCards = sortCardsByMaxSr([...newDrafts, ...mergedLoaded]);
    setCards(allCards.length > 0 ? allCards : [emptyCard()]);
    setSavedCardMap(map);

    const allLotIds = loaded.flatMap(c =>
      c.cropGroups.flatMap(g => g.lots.map(l => l.dbId).filter((id): id is number => typeof id === "number"))
    );
    if (allLotIds.length > 0) {
      fetch(`/api/lot-edit-history-bulk?lotIds=${allLotIds.join(",")}`, { credentials: "include" })
        .then(r => r.json())
        .then((historyRecords: any[]) => {
          const historyByLotId = new Map<number, any[]>();
          for (const rec of historyRecords) {
            if (rec.lotId == null) continue;
            if (!historyByLotId.has(rec.lotId)) historyByLotId.set(rec.lotId, []);
            historyByLotId.get(rec.lotId)!.push(rec);
          }
          const applyHistory = (groups: CropGroup[]): CropGroup[] =>
            groups.map(g => {
              const dbEntries: any[] = g.lots.flatMap(l =>
                l.dbId ? (historyByLotId.get(l.dbId) || []) : []
              );
              if (dbEntries.length === 0) return g;
              const dbHistory = dbEntries.map(dbRecordToEditEntry);
              return { ...g, editHistory: [...dbHistory, ...g.editHistory] };
            });
          setCards(prev => prev.map(card => ({ ...card, cropGroups: applyHistory(card.cropGroups) })));
          setSavedCardMap(prev => {
            const next = new Map(prev);
            for (const [id, saved] of Array.from(next.entries())) {
              next.set(id, { ...saved, cropGroups: applyHistory(saved.cropGroups) });
            }
            return next;
          });
        })
        .catch(() => {});
    }
  }, [stockCardsData, businessId]);

  useEffect(() => {
    if (!dbLoaded.current || !businessId) return;
    saveDraftsToStorage(cards, savedCardMap, businessId);
  }, [cards, savedCardMap, businessId]);

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
    let card = cards[idx];
    if (!card.farmerName.trim()) {
      toast({ title: t("stock.error"), description: t("stock.farmerNameRequired"), variant: "destructive" });
      return;
    }

    const vehicleBags = parseInt(card.totalBagsInVehicle) || 0;
    const allocatedBags = card.cropGroups.reduce((sum, g) => sum + g.lots.reduce((s, l) => s + (parseInt(l.numberOfBags) || 0), 0), 0);
    if (allocatedBags > vehicleBags) {
      toast({ title: t("stock.error"), description: `${t("stock.bagsExceedCapacity")} (${allocatedBags} > ${vehicleBags})`, variant: "destructive" });
      return;
    }

    for (const g of card.cropGroups.filter(gg => !gg.archived)) {
      for (let li = 0; li < g.lots.length; li++) {
        const lot = g.lots[li];
        const lotBags = parseInt(lot.numberOfBags) || 0;
        const totalBidBagsForLot = lot.bids.reduce((s, b) => s + (parseInt(b.numberOfBags) || 0), 0);
        if (totalBidBagsForLot > lotBags) {
          toast({ title: t("stock.error"), description: `${g.crop} ${t("stock.lot")} #${li + 1}: ${t("stock.bidBagsExceedLot")} (${totalBidBagsForLot} > ${lotBags})`, variant: "destructive" });
          return;
        }
      }
    }

    const unmatchedBuyer = card.cropGroups
      .filter(g => !g.archived)
      .flatMap(g => g.lots.flatMap(l => l.bids))
      .find(b => b.buyerName.trim() && !b.buyerId);
    if (unmatchedBuyer) {
      toast({ title: t("stock.buyerNotSelected"), description: `"${unmatchedBuyer.buyerName}" — ${t("stock.buyerNotSelectedDesc")}`, variant: "destructive" });
      return;
    }

    if (savingRef.current) return;
    savingRef.current = card.id;
    setSavingCardId(card.id);
    try {
      const originalFarmerId = savedCardMap.get(card.id)?.farmerId;
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

      const farmerChanged = !!originalFarmerId && originalFarmerId !== currentFarmerId;
      if (farmerChanged) {
        const existingLotDbIds = card.cropGroups
          .flatMap(g => g.lots.map(l => l.dbId))
          .filter((id): id is number => id != null);
        const conflictRes = await apiRequest("POST", "/api/lots/check-card-conflict", {
          farmerId: currentFarmerId,
          date: card.date,
          vehicleNumber: card.vehicleNumber ? card.vehicleNumber.toUpperCase() : null,
          excludeLotIds: existingLotDbIds,
        });
        const conflictData = await conflictRes.json();
        if (conflictData.conflict) {
          toast({ title: t("stock.saveFailed"), description: t("stock.duplicateCard"), variant: "destructive" });
          return;
        }
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
        toast({ title: t("stock.buyerNotSelected"), description: `${t("stock.buyerNotSelectedDesc")}: ${unmatchedBuyers.join(", ")}`, variant: "destructive" });
      }

      const newLots: { groupIdx: number; lotIdx: number; lotData: any }[] = [];
      const existingLots: { dbId: number; lotData: any }[] = [];
      const dbIdUpdates: { groupIdx: number; lotIdx: number; dbId: number; srNumber?: string }[] = [];

      for (let gIdx = 0; gIdx < card.cropGroups.length; gIdx++) {
        const group = card.cropGroups[gIdx];
        for (let lIdx = 0; lIdx < group.lots.length; lIdx++) {
          const lot = group.lots[lIdx];
          const lotPayload: {
            crop: string; variety: string | null; numberOfBags: number;
            size: string | null; bagMarka: string | null; vehicleNumber: string | null;
            vehicleBhadaRate: string | null; driverName: string | null; driverContact: string | null;
            freightType: string | null; totalBagsInVehicle: number | null;
            farmerAdvanceAmount: string | null; farmerAdvanceMode: string | null;
            isArchived: boolean; farmerId?: number;
          } = {
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
            ...(farmerChanged && { farmerId: currentFarmerId }),
          };

          if (lot.dbId) {
            existingLots.push({ dbId: lot.dbId, lotData: lotPayload });
          } else if (!group.archived && parseInt(lot.numberOfBags) > 0) {
            newLots.push({ groupIdx: gIdx, lotIdx: lIdx, lotData: lotPayload });
          }
        }
      }

      const prevSavedCard = savedCardMap.get(card.id);

      // Phase 0: delete removed lots (hard delete via new endpoint).
      // On failure, restore the lot back into the current card state so UI stays in sync.
      if (prevSavedCard) {
        const currentLotDbIds = new Set(
          card.cropGroups.flatMap(g => g.lots.map(l => l.dbId)).filter(Boolean)
        );
        for (const savedGroup of prevSavedCard.cropGroups) {
          for (const savedLot of savedGroup.lots) {
            if (savedLot.dbId && !currentLotDbIds.has(savedLot.dbId)) {
              try {
                await apiRequest("DELETE", `/api/lots/${savedLot.dbId}`);
              } catch (err: any) {
                toast({ title: t("stock.warning"), description: `Failed to delete lot: ${err.message}`, variant: "destructive" });
                // Restore the lot into the current card state to keep UI in sync with DB.
                // If the entire crop group was also removed, recreate it.
                const groupExists = card.cropGroups.some(g => g.id === savedGroup.id);
                if (!groupExists) {
                  card = { ...card, cropGroups: [...card.cropGroups, { ...savedGroup, lots: [savedLot] }] };
                } else {
                  card = {
                    ...card,
                    cropGroups: card.cropGroups.map(g => {
                      if (g.id !== savedGroup.id) return g;
                      const alreadyPresent = g.lots.some(l => l.dbId === savedLot.dbId);
                      if (alreadyPresent) return g;
                      return { ...g, lots: [...g.lots, savedLot] };
                    }),
                  };
                }
              }
            }
          }
        }
      }

      // Delete removed bids BEFORE patching lots so the PATCH bag-count validation
      // does not see bids that are about to be removed.
      const restoredBidsMap = new Map<string, BidRow[]>();
      for (const group of card.cropGroups) {
        for (const lot of group.lots) {
          if (!lot.dbId) continue;
          const savedGroup = prevSavedCard?.cropGroups.find(sg => sg.id === group.id);
          const savedLot = savedGroup?.lots.find(sl => sl.id === lot.id);
          const savedBidMap = new Map((savedLot?.bids || []).filter(b => b.bidDbId).map(b => [b.bidDbId!, b]));
          const currentBidDbIds = new Set(lot.bids.filter(b => b.bidDbId).map(b => b.bidDbId!));
          const restoredBids: BidRow[] = [];
          for (const [deletedBidDbId, deletedBid] of Array.from(savedBidMap.entries())) {
            if (!currentBidDbIds.has(deletedBidDbId)) {
              try {
                await apiRequest("DELETE", `/api/bids/${deletedBidDbId}`);
              } catch (err: any) {
                toast({ title: t("stock.warning"), description: `${t("stock.failedDeleteBid")}: ${err.message}`, variant: "destructive" });
                restoredBids.push(deletedBid);
              }
            }
          }
          restoredBidsMap.set(lot.id, restoredBids);
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
          isAddingToExistingCard: existingLots.length > 0,
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
          if ((updatedSrNumber === "—" || updatedSrNumber === "XX") && groupUpdates[0]?.srNumber) {
            updatedSrNumber = groupUpdates[0].srNumber;
          }
        }
        return { ...g, lots: updatedLots, srNumber: updatedSrNumber };
      });

      for (let gIdx = 0; gIdx < finalGroups.length; gIdx++) {
        const group = finalGroups[gIdx];
        for (let lIdx = 0; lIdx < group.lots.length; lIdx++) {
          const lot = group.lots[lIdx];
          if (!lot.dbId) continue;

          const savedGroup = prevSavedCard?.cropGroups.find(sg => sg.id === group.id);
          const savedLot = savedGroup?.lots.find(sl => sl.id === lot.id);
          const savedBidMap = new Map((savedLot?.bids || []).filter(b => b.bidDbId).map(b => [b.bidDbId!, b]));

          const updatedBids: BidRow[] = [...(restoredBidsMap.get(lot.id) || [])];
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
                toast({ title: t("stock.warning"), description: `${t("stock.failedCreateBid")}: ${err.message}`, variant: "destructive" });
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
                  toast({ title: t("stock.warning"), description: `${t("stock.failedUpdateBid")}: ${err.message}`, variant: "destructive" });
                }
              }
            }

            let txnDbId = bid.txnDbId;
            const nw = parseFloat(bid.txn.netWeightInput) || 0;

            if (txnDbId) {
              const ppkCheck = parseFloat(bid.pricePerKg) || 0;
              const bagsCheck = parseInt(bid.numberOfBags) || 0;
              if (ppkCheck <= 0) {
                toast({ title: t("stock.saveBlocked"), description: `${t("stock.priceCannotBeZero")} (${bid.buyerName})`, variant: "destructive" });
                throw new Error("Price per kg cannot be 0 for a bid with an existing transaction.");
              }
              if (bagsCheck <= 0) {
                toast({ title: t("stock.saveBlocked"), description: `${t("stock.bagsCannotBeZero")} (${bid.buyerName})`, variant: "destructive" });
                throw new Error("Number of bags cannot be 0 for a bid with an existing transaction.");
              }
              if (nw <= 0) {
                toast({ title: t("stock.saveBlocked"), description: `${t("stock.weightCannotBeZero")} (${bid.buyerName})`, variant: "destructive" });
                throw new Error("Net weight cannot be 0 for a bid with an existing transaction.");
              }
            }

            let savedBuyerReceivableAfterSave = bid.savedBuyerReceivable;
            let savedFarmerPayableAfterSave = bid.savedFarmerPayable;
            if (bidDbId && nw > 0) {
              const vehicleBR = parseFloat(card.vehicleBhadaRate) || 0;
              const totalBIV = parseInt(card.totalBagsInVehicle) || 0;
              const bidBags = parseInt(bid.numberOfBags) || 0;
              const ppk = parseFloat(bid.pricePerKg) || 0;
              const epkF = parseFloat(bid.txn.extraPerKgFarmer) || 0;
              const epkB = parseFloat(bid.txn.extraPerKgBuyer) || 0;
              const farmerGross = nw * (ppk + epkF);
              const buyerGross = nw * (ppk + epkB);
              const effectiveCs = bid.savedCharges || cs;
              const hfRate = parseFloat(effectiveCs.hammaliFarmerPerBag) || 0;
              const hbRate = parseFloat(effectiveCs.hammaliBuyerPerBag) || 0;
              const extraF = parseFloat(bid.txn.extraChargesFarmer) || 0;
              const extraB = parseFloat(bid.txn.extraChargesBuyer) || 0;
              const aadhatFPct = parseFloat(effectiveCs.aadhatCommissionFarmerPercent) || 0;
              const bidBuyerData = pageBuyersData.find((b: any) => b.id === bid.buyerId);
              const aadhatBPct = bid.savedCharges
                ? parseFloat(effectiveCs.aadhatCommissionBuyerPercent) || 0
                : bidBuyerData?.aadhatCommissionPercent != null && bidBuyerData.aadhatCommissionPercent !== ""
                  ? parseFloat(bidBuyerData.aadhatCommissionPercent) || 0
                  : parseFloat(cs.aadhatCommissionBuyerPercent) || 0;
              const mandiFPct = parseFloat(effectiveCs.mandiCommissionFarmerPercent) || 0;
              const mandiBPct = parseFloat(effectiveCs.mandiCommissionBuyerPercent) || 0;
              const muddatAnyaFPct = parseFloat(effectiveCs.muddatAnyaFarmerPercent) || 0;
              const muddatAnyaBPct = parseFloat(effectiveCs.muddatAnyaBuyerPercent) || 0;
              const freight = totalBIV > 0 ? (vehicleBR * bidBags) / totalBIV : 0;
              const hammaliFarmerTotal = hfRate * bidBags;
              const hammaliBuyerTotal = hbRate * bidBags;
              const aadhatFarmer = (farmerGross * aadhatFPct) / 100;
              const mandiFarmer = (farmerGross * mandiFPct) / 100;
              const muddatAnyaFarmer = (farmerGross * muddatAnyaFPct) / 100;
              const aadhatBuyer = (buyerGross * aadhatBPct) / 100;
              const mandiBuyer = (buyerGross * mandiBPct) / 100;
              const muddatAnyaBuyer = (buyerGross * muddatAnyaBPct) / 100;
              const farmerDed = hammaliFarmerTotal + extraF + aadhatFarmer + mandiFarmer + muddatAnyaFarmer + freight;
              const buyerAdd = hammaliBuyerTotal + extraB + aadhatBuyer + mandiBuyer + muddatAnyaBuyer;
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
                aadhatCharges: aadhatBuyer.toFixed(2),
                mandiCharges: mandiBuyer.toFixed(2),
                muddatAnyaCharges: muddatAnyaBuyer.toFixed(2),
                aadhatFarmerPercent: aadhatFPct.toFixed(2),
                mandiFarmerPercent: mandiFPct.toFixed(2),
                muddatAnyaFarmerPercent: muddatAnyaFPct.toFixed(2),
                aadhatBuyerPercent: aadhatBPct.toFixed(2),
                mandiBuyerPercent: mandiBPct.toFixed(2),
                muddatAnyaBuyerPercent: muddatAnyaBPct.toFixed(2),
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
                  savedBuyerReceivableAfterSave = buyerReceivable;
                  savedFarmerPayableAfterSave = farmerPayable;
                } catch (err: any) {
                  toast({ title: t("stock.warning"), description: `${t("stock.failedCreateTxn")}: ${err.message}`, variant: "destructive" });
                }
              } else {
                try {
                  await apiRequest("PATCH", `/api/transactions/${txnDbId}`, txnPayload);
                  savedBuyerReceivableAfterSave = buyerReceivable;
                  savedFarmerPayableAfterSave = farmerPayable;
                } catch (err: any) {
                  toast({ title: t("stock.warning"), description: `${t("stock.failedUpdateTxn")}: ${err.message}`, variant: "destructive" });
                }
              }
            }

            const savedChargesAfterSave = (bidDbId && nw > 0) ? {
              mandiCommissionFarmerPercent: (bid.savedCharges || cs).mandiCommissionFarmerPercent,
              mandiCommissionBuyerPercent: (bid.savedCharges || cs).mandiCommissionBuyerPercent,
              aadhatCommissionFarmerPercent: (bid.savedCharges || cs).aadhatCommissionFarmerPercent,
              aadhatCommissionBuyerPercent: bid.savedCharges
                ? bid.savedCharges.aadhatCommissionBuyerPercent
                : (() => {
                    const bd = pageBuyersData.find((b: any) => b.id === bid.buyerId);
                    return bd?.aadhatCommissionPercent != null && bd.aadhatCommissionPercent !== ""
                      ? bd.aadhatCommissionPercent
                      : cs.aadhatCommissionBuyerPercent;
                  })(),
              muddatAnyaFarmerPercent: (bid.savedCharges || cs).muddatAnyaFarmerPercent,
              muddatAnyaBuyerPercent: (bid.savedCharges || cs).muddatAnyaBuyerPercent,
              hammaliFarmerPerBag: (bid.savedCharges || cs).hammaliFarmerPerBag,
              hammaliBuyerPerBag: (bid.savedCharges || cs).hammaliBuyerPerBag,
            } : bid.savedCharges;
            updatedBids.push({ ...bid, bidDbId, txnDbId, savedCharges: savedChargesAfterSave, savedBuyerReceivable: savedBuyerReceivableAfterSave, savedFarmerPayable: savedFarmerPayableAfterSave });
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
          const allDiffChanges = diffCropGroup(savedGroup, g, t);
          const alreadyLogged = new Set(
            g.editHistory
              .slice(savedGroup.editHistory.length)
              .flatMap(e => e.changes?.filter(c => c.kind === "deleted").map(c => c.path) ?? [])
          );
          const changes = allDiffChanges.filter(c => !(c.kind === "deleted" && alreadyLogged.has(c.path)));
          if (changes.length === 0) return { ...withPersisted, editHistory: g.editHistory };
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

      setCards(prev => sortCardsByMaxSr([...prev]));
      toast({ title: t("stock.saved"), description: `${card.farmerName.trim()} ${t("stock.entrySavedSuccess")}`, variant: "success" });
    } catch (err: any) {
      toast({ title: t("stock.saveFailed"), description: err.message, variant: "destructive" });
    } finally {
      savingRef.current = null;
      setSavingCardId(null);
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
      setCards(prev => {
        const next = prev.filter((_, i) => i !== idx);
        if (businessId) {
          saveDraftsToStorage(next, savedCardMap, businessId);
        }
        return next;
      });
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
        queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
        queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
        queryClient.invalidateQueries({ predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/buyers");
        }});
      } catch (err: any) {
        toast({ title: t("stock.archiveFailed"), description: err.message, variant: "destructive" });
        return;
      }
    }
    setCards(prev => prev.map((c, i) => (i === idx ? { ...c, archived: true, cardOpen: false } : c)));
  };

  const isSingleDateFilter = selectedMonths.length === 1 && selectedDays.length === 1;
  const canPrintOverallBill = isSingleDateFilter && buyerFilter.trim() !== "" && cropFilter !== "all";
  const canPrintBidCopy = isSingleDateFilter && yearFilter !== "all" && cropFilter !== "all";

  const handlePrintAllBuyerReceipt = async (action: "print" | "share" = "print") => {
    if (!canPrintOverallBill) {
      toast({ title: t("stock.selectSingleDateBuyerCrop"), variant: "destructive" });
      return;
    }
    const buyerNameStr = buyerFilter.trim().toLowerCase();

    const entries: BuyerLotEntry[] = [];
    for (const card of filteredCards) {
      if (card.archived || !savedCardMap.has(card.id)) continue;
      const vbr = parseFloat(card.vehicleBhadaRate) || 0;
      const tbi = parseInt(card.totalBagsInVehicle) || 0;
      for (const g of card.cropGroups) {
        if (g.archived) continue;
        if (cropFilter !== "all" && g.crop !== cropFilter) continue;
        for (const lot of g.lots) {
          for (const bid of lot.bids) {
            if (!bid.txnDbId) continue;
            if (!bid.buyerName.toLowerCase().includes(buyerNameStr)) continue;
            const buyerData = pageBuyersList.find(b => b.id === bid.buyerId);
            const buyerAadhat = buyerData?.aadhatCommissionPercent != null && buyerData.aadhatCommissionPercent !== ""
              ? parseFloat(buyerData.aadhatCommissionPercent) || 0 : null;
            const bt = calcBidTotals(bid, cs, vbr, tbi, buyerAadhat);
            const bidBags = parseInt(bid.numberOfBags) || 0;
            const ecs = bid.savedCharges || cs;
            const aadhatBPct = bid.savedCharges
              ? parseFloat(ecs.aadhatCommissionBuyerPercent) || 0
              : (buyerAadhat != null ? buyerAadhat : parseFloat(cs.aadhatCommissionBuyerPercent) || 0);
            const fakeLot = {
              crop: g.crop,
              serialNumber: parseInt(g.srNumber) || 0,
              size: lot.size || "",
              variety: lot.variety || "",
            } as any;
            const fakeBuyer = {
              name: bid.buyerName,
              licenceNo: buyerData?.licenceNo || "",
            } as any;
            const fakeFarmer = {
              name: card.farmerName,
              village: card.village || "",
            } as any;
            const fakeTx = {
              netWeight: bid.txn.netWeightInput || "0",
              pricePerKg: bid.pricePerKg,
              extraPerKgBuyer: bid.txn.extraPerKgBuyer || "0",
              numberOfBags: bidBags,
              hammaliBuyerPerBag: ecs.hammaliBuyerPerBag || "0",
              extraChargesBuyer: bid.txn.extraChargesBuyer || "0",
              aadhatBuyerPercent: String(aadhatBPct),
              mandiBuyerPercent: ecs.mandiCommissionBuyerPercent || "0",
              muddatAnyaBuyerPercent: ecs.muddatAnyaBuyerPercent || "0",
              totalReceivableFromBuyer: bt.buyerReceivable.toFixed(2),
              buyer: fakeBuyer,
              farmer: fakeFarmer,
            } as any;
            entries.push({ lot: fakeLot, tx: fakeTx });
          }
        }
      }
    }

    if (entries.length === 0) {
      toast({ title: t("stock.noTxnForBuyerCropDate"), variant: "destructive" });
      return;
    }

    const buyerId = pageBuyersList.find(b => b.name.toLowerCase().includes(buyerNameStr))?.id;
    const mm = String(selectedMonths[0]).padStart(2, "0");
    const dd = String(selectedDays[0]).padStart(2, "0");
    const receiptDate = `${yearFilter}-${mm}-${dd}`;

    let receiptSerialNumber: number | undefined;
    if (buyerId) {
      try {
        const res = await apiRequest("POST", "/api/buyer-receipt-serial", { buyerId, date: receiptDate, crop: cropFilter });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();
        receiptSerialNumber = data.serialNumber;
      } catch {
        toast({ title: t("stock.receiptSerialFailed"), variant: "destructive" });
        return;
      }
    }

    const safeBuyerName = buyerFilter.trim().replace(/[^a-zA-Z0-9]/g, "_");
    const buyerFileName = `Overall_Receipt_${safeBuyerName}_${cropFilter}_${receiptDate}.pdf`;

    const overallTmpl = stockPageReceiptTemplates.find(tmpl => tmpl.templateType === "buyer-overall");
    const fullHtml = overallTmpl
      ? applyCombinedBuyerTemplate(overallTmpl.templateHtml, entries, 0, receiptDate, user?.businessName, user?.businessAddress, user?.businessInitials, user?.businessPhone, user?.businessLicenceNo, user?.businessShopNo, receiptSerialNumber)
      : generateAllBuyerReceiptHtml(entries, user?.businessName, user?.businessAddress, receiptSerialNumber, false, user?.businessPhone);

    if (action === "share") {
      await shareReceiptAsImage(fullHtml, buyerFileName);
    } else {
      await printReceipt(fullHtml, buyerFileName);
    }
  };

  const handlePrintBidCopy = async () => {
    const [y0, m0, d0] = (yearFilter !== "all" && selectedMonths.length === 1 && selectedDays.length === 1)
      ? [yearFilter, selectedMonths[0].padStart(2, "0"), selectedDays[0].padStart(2, "0")]
      : ["", "", ""];
    const dateMatchesCard = (card: FarmerCard) => {
      const [cy, cm, cd] = (card.date || "").split("-");
      if (yearFilter !== "all" && cy !== yearFilter) return false;
      if (selectedMonths.length > 0 && !selectedMonths.includes(String(parseInt(cm)))) return false;
      if (selectedDays.length > 0 && !selectedDays.includes(String(parseInt(cd)))) return false;
      return true;
    };
    const cropEntries = new Map<string, Array<{ serialNumber: number; farmerName: string; village: string; totalBags: number; lotBags: number; cardTotalBags: number }>>();
    for (const card of cards) {
      if (card.archived || !savedCardMap.has(card.id)) continue;
      if (!dateMatchesCard(card)) continue;
      for (const g of card.cropGroups) {
        if (g.archived) continue;
        if (cropFilter !== "all" && g.crop !== cropFilter) continue;
        const srNum = parseInt(g.srNumber) || 0;
        if (!srNum) continue;
        const cardTotalBags = g.lots.reduce((s, l) => s + (parseInt(l.numberOfBags) || 0), 0);
        for (const l of g.lots) {
          const lotBags = parseInt(l.numberOfBags) || 0;
          if (lotBags === 0) continue;
          const bidBags = l.bids.reduce((bs, b) => bs + (parseInt(b.numberOfBags) || 0), 0);
          const remaining = Math.max(0, lotBags - bidBags);
          if (remaining === 0) continue;
          if (!cropEntries.has(g.crop)) cropEntries.set(g.crop, []);
          cropEntries.get(g.crop)!.push({
            serialNumber: srNum,
            farmerName: card.farmerName,
            village: card.village || "",
            totalBags: remaining,
            lotBags,
            cardTotalBags,
          });
        }
      }
    }
    if (cropEntries.size === 0) {
      toast({ title: t("stock.noBidCopyData"), variant: "destructive" });
      return;
    }
    let dateStr = format(new Date(), "dd-MMM-yyyy");
    if (y0 && m0 && d0) {
      try { dateStr = format(new Date(`${y0}-${m0}-${d0}`), "dd-MMM-yyyy"); } catch {}
    }
    const cropSections: BidCropSection[] = Array.from(cropEntries.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([crop, lots]) => ({
        crop,
        groups: [...lots].sort((a, b) => a.serialNumber - b.serialNumber),
      }));
    const html = generateBidCopyHtml(cropSections, user?.businessName || "", dateStr);
    await printReceipt(html, `bid-copy-${dateStr}.pdf`);
  };

  const escCSV = (val: any) => {
    let s = String(val ?? "");
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const exportStockCsv = () => {
    const headers = [
      "SR#", "Lot ID", "Date", "Crop", "Variety", "Size", "Bag Marka",
      "Farmer Name", "Phone", "Village", "Tehsil", "District",
      "Vehicle #", "Driver Name", "Driver Contact", "Advance/Credit", "Total # of Bags",
      "# Bags", "Proportionate Freight (₹)",
      "Farmer Advance (₹)", "Advance Mode",
    ];
    const rows: string[] = [];
    for (const card of filteredCards) {
      if (card.archived || !savedCardMap.has(card.id)) continue;
      const vbr = parseFloat(card.vehicleBhadaRate) || 0;
      const tbi = parseInt(card.totalBagsInVehicle) || 0;
      for (const g of card.cropGroups) {
        if (g.archived) continue;
        for (const lot of g.lots) {
          if (!lot.dbId) continue;
          const lotBags = parseInt(lot.numberOfBags) || 0;
          const freight = tbi > 0 ? ((vbr * lotBags) / tbi).toFixed(2) : "0";
          rows.push([
            g.srNumber, lot.lotId || lot.dbId?.toString() || "", card.date, g.crop, lot.variety || "", lot.size || "None", lot.bagMarka || "",
            card.farmerName, card.farmerPhone, card.village, card.tehsil, card.district,
            card.vehicleNumber, card.driverName, card.driverContact, card.freightType || "", card.totalBagsInVehicle || "",
            lot.numberOfBags, freight,
            card.advanceAmount || "", card.advanceMode || "",
          ].map(escCSV).join(","));
        }
      }
    }
    if (rows.length === 0) { toast({ title: t("stock.noDataExport"), variant: "destructive" }); return; }
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTxnCsv = () => {
    const headers = [
      "Transaction ID", "Date", "Lot ID", "SR#", "Crop", "Variety",
      "Farmer Name", "Phone", "Village",
      "Buyer Name",
      "Vehicle #", "Driver Name", "Driver Contact", "Advance/Credit",
      "# Bags", "Price/kg (₹)", "Net Weight (kg)",
      "Extra Charges (Farmer)", "Extra Charges (Buyer)",
      "Extra/kg (Farmer)", "Extra/kg (Buyer)",
      "Proportionate Freight (₹)",
      "Payable to Farmer (₹)", "Receivable from Buyer (₹)",
      "Farmer Payment Status", "Buyer Payment Status",
      "Status",
    ];
    const rows: string[] = [];
    for (const card of filteredCards) {
      if (!savedCardMap.has(card.id)) continue;
      const vbr = parseFloat(card.vehicleBhadaRate) || 0;
      const tbi = parseInt(card.totalBagsInVehicle) || 0;
      for (const g of card.cropGroups) {
        for (const lot of g.lots) {
          for (const bid of lot.bids) {
            if (!bid.txnDbId) continue;
            const buyerData = pageBuyersList.find(b => b.id === bid.buyerId);
            const buyerAadhat = buyerData?.aadhatCommissionPercent != null && buyerData.aadhatCommissionPercent !== ""
              ? parseFloat(buyerData.aadhatCommissionPercent) || 0 : null;
            const bt = calcBidTotals(bid, cs, vbr, tbi, buyerAadhat);
            const bidBags = parseInt(bid.numberOfBags) || 0;
            const freight = tbi > 0 ? ((vbr * bidBags) / tbi).toFixed(2) : "0";
            const fStat = bid.farmerPaymentStatus === "paid" ? "Paid" : bid.farmerPaymentStatus === "partial" ? "Partial" : "Due";
            const bStat = bid.paymentStatus === "paid" ? "Paid" : bid.paymentStatus === "partial" ? "Partial" : "Due";
            const archiveStatus = (card.archived || g.archived || lot.isArchived) ? "Archived" : "Active";
            rows.push([
              bid.txnDbId, bid.txnDate, lot.lotId || lot.dbId?.toString() || "", g.srNumber, g.crop, lot.variety || "",
              card.farmerName, card.farmerPhone, card.village,
              bid.buyerName,
              card.vehicleNumber, card.driverName, card.driverContact, card.freightType || "",
              bid.numberOfBags, bid.pricePerKg, bid.txn.netWeightInput || "0",
              bid.txn.extraChargesFarmer || "0", bid.txn.extraChargesBuyer || "0",
              bid.txn.extraPerKgFarmer || "0", bid.txn.extraPerKgBuyer || "0",
              freight,
              bt.farmerPayable.toFixed(2), bt.buyerReceivable.toFixed(2),
              fStat, bStat,
              archiveStatus,
            ].map(escCSV).join(","));
          }
        }
      }
    }
    if (rows.length === 0) { toast({ title: t("stock.noDataExport"), variant: "destructive" }); return; }
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
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border bg-background sticky top-0 z-10">
        <h1 className="text-lg font-bold">{t("stock.mandiStock")}</h1>
        <p className="text-xs text-muted-foreground">{t("stock.mandiStockDesc")}</p>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingCards && (
          <div className="flex items-center justify-center py-12">
            <div className="text-sm text-muted-foreground">{t("stock.loadingStockEntries")}</div>
          </div>
        )}
        {!loadingCards && (
          <StockFilterBar
            cards={cards}
            dateMode={dateMode} setDateMode={setDateMode}
            yearFilter={yearFilter} setYearFilter={setYearFilter}
            selectedMonths={selectedMonths} setSelectedMonths={setSelectedMonths}
            selectedDays={selectedDays} setSelectedDays={setSelectedDays}
            farmerFilter={farmerFilter} setFarmerFilter={setFarmerFilter}
            farmerFilterId={farmerFilterId} setFarmerFilterId={setFarmerFilterId}
            buyerFilter={buyerFilter} setBuyerFilter={setBuyerFilter}
            cropFilter={cropFilter} setCropFilter={setCropFilter}
            buyersList={pageBuyersList}
            onExportStockCsv={exportStockCsv}
            onExportTxnCsv={exportTxnCsv}
            canPrintOverallBill={canPrintOverallBill}
            onPrintAllBuyerReceipt={handlePrintAllBuyerReceipt}
            canPrintBidCopy={canPrintBidCopy}
            onPrintBidCopy={handlePrintBidCopy}
          />
        )}
        {!loadingCards && <StockSummaryBar cards={filteredCards} savedCardMap={savedCardMap} cs={cs} buyersList={pageBuyersList} />}
        {!loadingCards && (
          <div className="flex justify-start">
            <Button type="button" onClick={addCard} data-testid="button-add-farmer-entry" className="gap-2">
              <Plus className="w-4 h-4" /> {t("stock.newFarmerEntry")}
            </Button>
          </div>
        )}
        {filteredCards.map((card) => {
          const idx = cards.findIndex(c => c.id === card.id);
          const mergeBack = (edited: FarmerCard) => {
            if (cropFilter === "all") return updateCard(idx, edited);
            const original = cards[idx];
            const hiddenGroups = original.cropGroups.filter(g => !g.archived && g.crop !== cropFilter);
            updateCard(idx, { ...edited, cropGroups: [...edited.cropGroups, ...hiddenGroups] });
          };
          return (
            <FarmerCardComp
              key={card.id} card={card}
              savedCard={savedCardMap.get(card.id) ?? null}
              onChange={mergeBack}
              onSave={() => saveCard(idx)}
              onSaveAndClose={() => saveCard(idx, true)}
              onCancel={() => cancelCard(idx)}
              onArchive={() => archiveCard(idx)}
              onSyncSaved={c => setSavedCardMap(prev => new Map(prev).set(c.id, JSON.parse(JSON.stringify(c))))}
              cs={cs}
              currentUsername={currentUsername}
              saving={savingCardId === card.id}
              allCards={cards}
            />
          );
        })}
      </div>
    </div>
  );
}
