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

/** One farmer card's freight position, as `GET /api/bhada-breakdown` returns it. */
export type BhadaCardRow = {
  farmerId: number;
  farmerName: string;
  date: string;
  totalBhada: number;
  paidBhada: number;
  dueBhada: number;
};

/**
 * The Stock register's view of every card's freight position, settled cards included.
 *
 * The Cash page reads the same endpoint without `includePaid`, so its picker keeps offering only cards
 * that still owe something. Both come from one calculation, so the badge, this dialog and the Cash page
 * can never disagree about what a card owes.
 */
export const BHADA_STATUS_KEY = "/api/bhada-breakdown?includePaid=1";

/** A card is treated as settled below this, so sub-rupee dust never keeps the Pay button live. */
export const BHADA_PAY_MIN_DUE = 1;

/**
 * Look one farmer card up by farmer + stock date — the pair that identifies a card exactly.
 *
 * Reads the query rather than the stock card's own loaded copy, which is what keeps the answer right
 * after a payment is recorded on another screen; an open stock card never re-reads itself.
 */
export function useBhadaCard(farmerId: number | undefined, date: string | undefined) {
  const { data } = useQuery<BhadaCardRow[]>({ queryKey: [BHADA_STATUS_KEY] });
  return useMemo(() => {
    if (!farmerId || !date || !data) return undefined;
    return data.find(r => r.farmerId === farmerId && r.date === date);
  }, [data, farmerId, date]);
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Pay a farmer card's outstanding freight without leaving the Stock register.
 *
 * Posts the identical body the Cash page posts for a Freight/Bhada payout, to the same route, so the
 * server follows one path and the entry this creates is reversible from the Cash page like any other.
 * Any divergence here would eventually put the Cash page's totals, exports and reversals out of step
 * with what actually happened.
 */
export function BhadaPayDialog({
  open, onOpenChange, farmerId, farmerName, stockDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  farmerId: number;
  farmerName: string;
  /** The card's stock register date. Together with the farmer it identifies the card being settled. */
  stockDate: string;
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

  const card = useBhadaCard(farmerId, stockDate);
  const totalDue = card?.dueBhada ?? 0;

  useEffect(() => {
    if (!open) return;
    setPaymentMode("Cash");
    setBankAccountId("");
    setNotes("");
    setAmount("");
    setPaidOn(format(new Date(), "yyyy-MM-dd"));
    setSeeded(false);
  }, [open]);

  // Default the amount to the full due once, so a user who edits or clears the field does not have
  // their value overwritten by a background refetch.
  useEffect(() => {
    if (!open || seeded) return;
    if (totalDue > 0) {
      setAmount(totalDue.toFixed(2));
      setSeeded(true);
    }
  }, [open, seeded, totalDue]);

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
      toast({ title: t("common.error"), description: t("cash.selectAccount"), variant: "destructive" });
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: t("common.error"), description: t("stock.bhadaPayEnterAmount"), variant: "destructive" });
      return;
    }
    // The same ceiling the Cash page applies, so neither route can overpay a card.
    if (parseFloat(amount) > totalDue + 0.01) {
      toast({
        title: t("common.error"),
        description: t("cash.bhadaAmountExceedsDue", { due: totalDue.toLocaleString("en-IN") }),
        variant: "destructive",
      });
      return;
    }

    // Identical body to the Cash page's Freight/Bhada submit — same type, same stamp of farmer and
    // stock date — so the server takes the same path and every downstream effect behaves the same.
    mutation.mutate({
      category: "outward",
      type: "cash_out",
      outflowType: "Freight/Bhada",
      farmerId,
      stockDate,
      partyName: null,
      amount,
      date: paidOn,
      paymentMode,
      bankAccountId: paymentMode !== "Cash" ? parseInt(bankAccountId) : null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-bhada-pay">
        <DialogHeader>
          <DialogTitle className="text-base">{t("stock.bhadaPay")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Fixed context — the card this payment settles, already decided by the card it opened from. */}
          <div className="rounded-lg border bg-muted/50 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm truncate" data-testid="text-bhada-pay-farmer">{farmerName}</span>
              <Badge variant="secondary" className="text-[10px] shrink-0">Freight/Bhada</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-muted-foreground" data-testid="text-bhada-pay-stock-date">{stockDate}</span>
              {card && (
                <span className="text-muted-foreground">
                  {t("stock.bhadaTotal")} {inr(card.totalBhada)} · {t("stock.bhadaPaidAmount")} {inr(card.paidBhada)}
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("cash.paymentMode")}</Label>
            {hasBankAccounts ? (
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger className="h-9 text-sm" data-testid="bhada-pay-payment-mode"><SelectValue /></SelectTrigger>
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
                <SelectTrigger className="h-9 text-sm" data-testid="bhada-pay-bank-account"><SelectValue placeholder={t("cash.selectAccount")} /></SelectTrigger>
                <SelectContent>
                  {bankAccountsList.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t("dash.due")}</Label>
              <Input value={inr(totalDue)} readOnly className="h-9 text-sm bg-muted" data-testid="bhada-pay-due" />
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
                data-testid="bhada-pay-amount"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("cash.paidOn")}</Label>
            <Input type="date" value={paidOn} onChange={e => setPaidOn(e.target.value)} className="h-9 text-sm" data-testid="bhada-pay-date" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">{t("cash.remarks")}</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder={t("cash.remarksPlaceholder")} className="h-9 text-sm" data-testid="bhada-pay-notes" />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-9 text-sm" onClick={() => onOpenChange(false)} data-testid="button-bhada-pay-cancel">
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1 h-9 text-sm"
              onClick={submit}
              disabled={mutation.isPending || totalDue < BHADA_PAY_MIN_DUE}
              data-testid="button-bhada-pay-submit"
            >
              {mutation.isPending ? t("common.saving") : t("cash.submit")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
