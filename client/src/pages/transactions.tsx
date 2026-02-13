import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Bid, Buyer, Lot, Farmer, Transaction } from "@shared/schema";
import { Receipt, Calculator, ArrowRight } from "lucide-react";
import { format } from "date-fns";

type BidWithDetails = Bid & { buyer: Buyer; lot: Lot };
type TransactionWithDetails = Transaction & { farmer: Farmer; buyer: Buyer; lot: Lot; bid: Bid };

export default function TransactionsPage() {
  const { toast } = useToast();
  const [selectedBid, setSelectedBid] = useState<BidWithDetails | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [totalWeight, setTotalWeight] = useState("");
  const [hammaliCharges, setHammaliCharges] = useState("0");
  const [gradingCharges, setGradingCharges] = useState("0");
  const [aadhatPercent, setAadhatPercent] = useState("2");
  const [mandiPercent, setMandiPercent] = useState("1");
  const [chargedTo, setChargedTo] = useState("Buyer");

  const { data: allBids = [] } = useQuery<BidWithDetails[]>({
    queryKey: ["/api/bids"],
  });

  const { data: txns = [], isLoading } = useQuery<TransactionWithDetails[]>({
    queryKey: ["/api/transactions"],
  });

  const createTxMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/transactions", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      setDialogOpen(false);
      setSelectedBid(null);
      toast({ title: "Transaction Created", description: "Transaction recorded successfully" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const existingBidIds = new Set(txns.map(t => t.bidId));
  const pendingBids = allBids.filter(b => !existingBidIds.has(b.id));

  const openTransaction = (bid: BidWithDetails) => {
    setSelectedBid(bid);
    setTotalWeight("");
    setHammaliCharges("0");
    setGradingCharges("0");
    setAadhatPercent("2");
    setMandiPercent("1");
    setChargedTo("Buyer");
    setDialogOpen(true);
  };

  const tw = parseFloat(totalWeight) || 0;
  const bags = selectedBid?.numberOfBags || 0;
  const netWeight = tw > 0 ? (tw - bags).toFixed(2) : "0.00";
  const nw = parseFloat(netWeight);
  const price = parseFloat(selectedBid?.pricePerKg || "0");
  const grossAmount = nw * price;
  const hammali = parseFloat(hammaliCharges) || 0;
  const grading = parseFloat(gradingCharges) || 0;
  const aadhat = (grossAmount * (parseFloat(aadhatPercent) || 0)) / 100;
  const mandi = (grossAmount * (parseFloat(mandiPercent) || 0)) / 100;
  const totalCommission = aadhat + mandi;

  const farmerPayable = grossAmount - hammali - grading - (chargedTo === "Seller" ? totalCommission : 0);
  const buyerReceivable = grossAmount + (chargedTo === "Buyer" ? totalCommission : 0) + hammali + grading;

  const submitTransaction = () => {
    if (!selectedBid || !totalWeight) {
      toast({ title: "Error", description: "Total weight is required", variant: "destructive" });
      return;
    }

    createTxMutation.mutate({
      lotId: selectedBid.lot.id,
      bidId: selectedBid.id,
      buyerId: selectedBid.buyerId,
      farmerId: selectedBid.lot.farmerId,
      totalWeight,
      numberOfBags: bags,
      hammaliCharges: hammali.toString(),
      gradingCharges: grading.toString(),
      netWeight,
      pricePerKg: selectedBid.pricePerKg,
      aadhatCommissionPercent: aadhatPercent,
      mandiCommissionPercent: mandiPercent,
      aadhatCharges: aadhat.toFixed(2),
      mandiCharges: mandi.toFixed(2),
      chargedTo,
      totalPayableToFarmer: farmerPayable.toFixed(2),
      totalReceivableFromBuyer: buyerReceivable.toFixed(2),
      date: format(new Date(), "yyyy-MM-dd"),
    });
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
        <Receipt className="w-6 h-6 text-primary" />
        Transactions
      </h1>

      {pendingBids.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Pending Bids (Ready for Transaction)</h2>
          {pendingBids.map((bid) => (
            <Card key={bid.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0 text-sm space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="text-xs">{bid.lot.lotId}</Badge>
                      <Badge className="text-xs">Rs.{bid.pricePerKg}/kg</Badge>
                    </div>
                    <p>Buyer: <strong>{bid.buyer.name}</strong></p>
                    <p className="text-muted-foreground text-xs">{bid.numberOfBags} bags | Grade: {bid.grade || "N/A"}</p>
                  </div>
                  <Button
                    data-testid={`button-create-tx-${bid.id}`}
                    size="sm"
                    className="mobile-touch-target"
                    onClick={() => openTransaction(bid)}
                  >
                    <Calculator className="w-4 h-4 mr-1" />
                    Bill
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {txns.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground mt-6">Completed Transactions</h2>
          {txns.map((tx) => (
            <Card key={tx.id}>
              <CardContent className="pt-4 text-sm space-y-1">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <Badge variant="secondary" className="text-xs">{tx.lot.lotId}</Badge>
                  <Badge className="text-xs">{tx.date}</Badge>
                </div>
                <p>Farmer: <strong>{tx.farmer.name}</strong> <ArrowRight className="inline w-3 h-3" /> Buyer: <strong>{tx.buyer.name}</strong></p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Net Wt: {tx.netWeight} kg</span>
                  <span>Rate: Rs.{tx.pricePerKg}/kg</span>
                  <span>{tx.numberOfBags} bags</span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
                  <span className="text-primary">Farmer: Rs.{tx.totalPayableToFarmer}</span>
                  <span className="text-chart-2">Buyer: Rs.{tx.totalReceivableFromBuyer}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {pendingBids.length === 0 && txns.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          No bids or transactions yet. Complete bidding first.
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Transaction</DialogTitle>
          </DialogHeader>
          {selectedBid && (
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <p>Lot: <strong>{selectedBid.lot.lotId}</strong></p>
                <p>Buyer: <strong>{selectedBid.buyer.name}</strong></p>
                <p>Price: <strong>Rs.{selectedBid.pricePerKg}/kg</strong> | Bags: <strong>{selectedBid.numberOfBags}</strong></p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Total Weight (kg)</Label>
                  <Input
                    data-testid="input-total-weight"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={totalWeight}
                    onChange={(e) => setTotalWeight(e.target.value)}
                    placeholder="0.00"
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Net Weight (kg)</Label>
                  <Input value={netWeight} disabled className="mobile-touch-target bg-muted" />
                  <p className="text-xs text-muted-foreground">Total - {bags} bags</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Hammali (Rs.)</Label>
                  <Input
                    data-testid="input-hammali"
                    type="number"
                    inputMode="decimal"
                    value={hammaliCharges}
                    onChange={(e) => setHammaliCharges(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Grading (Rs.)</Label>
                  <Input
                    data-testid="input-grading"
                    type="number"
                    inputMode="decimal"
                    value={gradingCharges}
                    onChange={(e) => setGradingCharges(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Aadhat %</Label>
                  <Input
                    data-testid="input-aadhat"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={aadhatPercent}
                    onChange={(e) => setAadhatPercent(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Mandi %</Label>
                  <Input
                    data-testid="input-mandi"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={mandiPercent}
                    onChange={(e) => setMandiPercent(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>Charges Applied To</Label>
                <Select value={chargedTo} onValueChange={setChargedTo}>
                  <SelectTrigger data-testid="select-charged-to" className="mobile-touch-target">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Buyer">Buyer</SelectItem>
                    <SelectItem value="Seller">Seller (Farmer)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="bg-muted rounded-md p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span>Gross Amount:</span>
                  <span className="font-medium">Rs.{grossAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Aadhat ({aadhatPercent}%):</span>
                  <span>Rs.{aadhat.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Mandi ({mandiPercent}%):</span>
                  <span>Rs.{mandi.toFixed(2)}</span>
                </div>
                <div className="border-t pt-2 flex justify-between font-medium text-primary">
                  <span>Payable to Farmer:</span>
                  <span>Rs.{farmerPayable.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span>Receivable from Buyer:</span>
                  <span>Rs.{buyerReceivable.toFixed(2)}</span>
                </div>
              </div>

              <Button
                data-testid="button-submit-transaction"
                className="w-full mobile-touch-target"
                onClick={submitTransaction}
                disabled={createTxMutation.isPending}
              >
                {createTxMutation.isPending ? "Saving..." : "Create Transaction"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
