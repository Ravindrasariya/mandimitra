import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { invalidateCashQueries } from "@/lib/cashQueries";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import type { BankAccount } from "@shared/schema";

/** Shape returned by `GET /api/farmers/:id/pending-transactions` — one entry per BB#/SR#/date group. */
export type FarmerPendingGroup = {
  groupKey: string;
  serialNumber: number;
  billBookNumber: number;
  date: string;
  numberOfBags: number;
  crops: string;
  totalPayableToFarmer: string;
  farmerPaidAmount: string;
  due: string;
  transactionIds: { id: number; due: number }[];
};

/**
 * Sum the outstanding due across a card's own transactions, straight from its saved values.
 *
 * The card already holds each transaction's saved payable and paid amount, which is exactly what
 * the server subtracts to produce a due. Computing it locally lets the Farmer Pay button decide
 * whether it is live without every card firing its own request. Per-transaction dues below a
 * paisa are dropped so this matches the server's own filter.
 */
export function sumBillDue(entries: { payable?: number; paid?: string }[]): number {
  return entries.reduce((sum, e) => {
    const due = (e.payable ?? 0) - parseFloat(e.paid || "0");
    return due > 0.005 ? sum + due : sum;
  }, 0);
}

/** A bill is treated as settled below this, so sub-rupee rounding dust never keeps the button live. */
export const FARMER_PAY_MIN_DUE = 1;

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function FarmerPayDialog({
  open, onOpenChange, farmerId, farmerName, billBookNumber, serialNumber, crop, transactionIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  farmerId: number;
  farmerName: string;
  billBookNumber: number;
  serialNumber: number;
  crop?: string;
  /** The saved transaction ids on this card — the only rows this shortcut is ever allowed to pay. */
  transactionIds: number[];
}) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [paymentMode, setPaymentMode] = useState("Cash");
  const [bankAccountId, setBankAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState("");
  const [notes, setNotes] = useState("");
  const [seeded, setSeeded] = useState(false);

  const { data: bankAccountsList = [] } = useQuery<BankAccount[]>({ queryKey: ["/api/bank-accounts"] });
  const hasBankAccounts = bankAccountsList.length > 0;

  // Same key shape the Cash page uses, so both share one cache entry and one invalidation.
  const { data: pendingGroups = [], isLoading } = useQuery<FarmerPendingGroup[]>({
    queryKey: ["/api/farmers", String(farmerId), "pending-transactions"],
    queryFn: () => fetch(`/api/farmers/${farmerId}/pending-transactions`, { credentials: "include" }).then(r => r.json()),
    enabled: open && !!farmerId,
  });

  const idsKey = transactionIds.join(",");
  const cardTxnIds = useMemo(() => new Set(transactionIds), [idsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Narrow the farmer's pending groups down to this card's own transactions.
   *
   * BB#/SR# is not a safe key on its own: the duplicate guard only makes it unique within a
   * financial year, so an unpaid bill from an earlier year can carry the same numbers and would
   * be swept into the same payment. Intersecting on transaction id pins the dialog to this card
   * exactly, while still tolerating a bill that the server split across several date groups
   * because one of its bids carried its own transaction date.
   */
  const matched = useMemo(
    () => pendingGroups
      .filter(g => g.groupKey !== "PY_OPENING")
      .map(g => ({ ...g, transactionIds: g.transactionIds.filter(t => cardTxnIds.has(t.id)) }))
      .filter(g => g.transactionIds.length > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [pendingGroups, cardTxnIds],
  );
  // Sum the surviving transactions rather than the group's own due, which may cover rows this
  // card does not own.
  const totalDue = useMemo(
    () => matched.reduce((s, g) => s + g.transactionIds.reduce((gs, t) => gs + t.due, 0), 0),
    [matched],
  );

  useEffect(() => {
    if (!open) return;
    setPaymentMode("Cash");
    setBankAccountId("");
    setNotes("");
    setAmount("");
    setPaidOn(format(new Date(), "yyyy-MM-dd"));
    setSeeded(false);
  }, [open]);

  // Default the amount to the full due once it has actually loaded, and only once, so a user
  // who clears or edits the field does not have it overwritten by a background refetch.
  useEffect(() => {
    if (!open || seeded || isLoading) return;
    if (totalDue > 0) {
      setAmount(totalDue.toFixed(2));
      setSeeded(true);
    }
  }, [open, seeded, isLoading, totalDue]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/cash-entries", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateCashQueries();
      toast({ title: t("common.saved"), variant: "success" });
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const submit = () => {
    if (paymentMode !== "Cash" && !bankAccountId) {
      toast({ title: t("common.error"), description: "Select bank account", variant: "destructive" });
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: t("common.error"), description: "Enter the total amount paid", variant: "destructive" });
      return;
    }
    if (matched.length === 0) {
      toast({ title: t("common.error"), description: "Select at least one transaction to allocate payment", variant: "destructive" });
      return;
    }
    if (parseFloat(amount) > totalDue + 0.01) {
      toast({ title: t("common.error"), description: "Amount cannot exceed due for any transaction", variant: "destructive" });
      return;
    }

    // Fill the bill's groups oldest-first, in paise, so the allocations always add back up to the
    // amount entered rather than drifting by a rounding unit.
    let remaining = Math.round(parseFloat(amount) * 100);
    const allocations: { transactionIds: { id: number; due: number }[]; amount: string; discount: string; pettyAdj: string }[] = [];
    for (const g of matched) {
      if (remaining <= 0) break;
      const groupDuePaise = g.transactionIds.reduce((s, t) => s + Math.round(t.due * 100), 0);
      const take = Math.min(remaining, groupDuePaise);
      if (take <= 0) continue;
      allocations.push({
        transactionIds: g.transactionIds,
        amount: (take / 100).toFixed(2),
        discount: "0",
        pettyAdj: "0",
      });
      remaining -= take;
    }

    // Identical body to the Cash page's Farmer-Harvest Sale submit, so the server takes the
    // same path and every downstream effect (and reversal) behaves the same way.
    mutation.mutate({
      category: "outward",
      type: "cash_out",
      outflowType: "Farmer-Harvest Sale",
      farmerId,
      amount,
      date: paidOn,
      paymentMode,
      bankAccountId: paymentMode !== "Cash" ? parseInt(bankAccountId) : null,
      notes: notes || null,
      allocations,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-farmer-pay">
        <DialogHeader>
          <DialogTitle className="text-base">{t("stock.farmerPay")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Fixed context — everything the card already decided for this payment. */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate" data-testid="text-farmer-pay-farmer">{farmerName}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">Farmer-Harvest Sale</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="text-[10px]" data-testid="text-farmer-pay-bbsr">
                BB#{billBookNumber} SR#{serialNumber}
              </Badge>
              {crop && <span className="text-muted-foreground">{crop}</span>}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("cash.paymentMode")}</Label>
            {hasBankAccounts ? (
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="h-9 text-sm" data-testid="farmer-pay-payment-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Online">Account/Online</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <Input value="Cash" readOnly className="h-9 text-sm bg-muted" />
            )}
          </div>

          {paymentMode !== "Cash" && hasBankAccounts && (
            <div className="space-y-1">
              <Label className="text-xs">{t("cash.selectAccount")}</Label>
              <Select value={bankAccountId} onValueChange={setBankAccountId}>
                <SelectTrigger className="h-9 text-sm" data-testid="farmer-pay-bank-account"><SelectValue placeholder={t("cash.selectAccount")} /></SelectTrigger>
                <SelectContent>
                  {bankAccountsList.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("dash.due")}</Label>
              <Input
                value={isLoading ? "..." : inr(totalDue)}
                readOnly
                className="h-9 text-sm bg-muted"
                data-testid="farmer-pay-due"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t("cash.amount")}</Label>
              <Input
                type="number" inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                onFocus={e => e.target.select()}
                placeholder="0"
                className="h-9 text-sm"
                data-testid="farmer-pay-amount"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("cash.paidOn")}</Label>
            <Input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className="h-9 text-sm" data-testid="farmer-pay-date" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("cash.remarks")}</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("cash.remarksPlaceholder")} className="h-9 text-sm" data-testid="farmer-pay-notes" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => onOpenChange(false)} data-testid="button-farmer-pay-cancel">
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1 h-9 text-sm"
              onClick={submit}
              disabled={mutation.isPending || isLoading || totalDue < FARMER_PAY_MIN_DUE}
              data-testid="button-farmer-pay-submit"
            >
              {mutation.isPending ? t("common.saving") : t("cash.submit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
