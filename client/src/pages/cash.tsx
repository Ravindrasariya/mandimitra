import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PAYMENT_MODES } from "@shared/schema";
import type { Farmer, Buyer, CashEntry } from "@shared/schema";
import { Wallet, ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import { format } from "date-fns";

export default function CashPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"in" | "out">("in");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [amount, setAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("Cash");
  const [chequeNumber, setChequeNumber] = useState("");
  const [chequeDate, setChequeDate] = useState("");
  const [bankName, setBankName] = useState("");
  const [notes, setNotes] = useState("");
  const [selectedFarmerId, setSelectedFarmerId] = useState<number | null>(null);
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);

  const { data: cashEntries = [], isLoading } = useQuery<CashEntry[]>({
    queryKey: ["/api/cash-entries", `?type=${activeTab === "in" ? "cash_in" : "cash_out"}`],
  });

  const { data: farmers = [] } = useQuery<Farmer[]>({
    queryKey: ["/api/farmers"],
  });

  const { data: buyers = [] } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/cash-entries", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      setDialogOpen(false);
      resetForm();
      toast({ title: "Saved", description: "Cash entry recorded" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const resetForm = () => {
    setAmount("");
    setPaymentMode("Cash");
    setChequeNumber("");
    setChequeDate("");
    setBankName("");
    setNotes("");
    setSelectedFarmerId(null);
    setSelectedBuyerId(null);
    setEntryDate(format(new Date(), "yyyy-MM-dd"));
  };

  const openDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const submit = () => {
    if (!amount || parseFloat(amount) <= 0) {
      toast({ title: "Error", description: "Enter a valid amount", variant: "destructive" });
      return;
    }

    if (activeTab === "in" && !selectedBuyerId) {
      toast({ title: "Error", description: "Select a buyer", variant: "destructive" });
      return;
    }
    if (activeTab === "out" && !selectedFarmerId) {
      toast({ title: "Error", description: "Select a farmer", variant: "destructive" });
      return;
    }

    createMutation.mutate({
      type: activeTab === "in" ? "cash_in" : "cash_out",
      amount,
      date: entryDate,
      paymentMode,
      chequeNumber: paymentMode === "Cheque" ? chequeNumber : null,
      chequeDate: paymentMode === "Cheque" ? chequeDate : null,
      bankName: paymentMode === "Cheque" ? bankName : null,
      notes: notes || null,
      farmerId: activeTab === "out" ? selectedFarmerId : null,
      buyerId: activeTab === "in" ? selectedBuyerId : null,
    });
  };

  const getFarmerName = (id: number | null) => {
    if (!id) return "";
    return farmers.find(f => f.id === id)?.name || `Farmer #${id}`;
  };

  const getBuyerName = (id: number | null) => {
    if (!id) return "";
    return buyers.find(b => b.id === id)?.name || `Buyer #${id}`;
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
        <Wallet className="w-6 h-6 text-primary" />
        Cash Management
      </h1>

      <div className="flex gap-2">
        <Button
          variant={activeTab === "in" ? "default" : "secondary"}
          data-testid="toggle-cash-in"
          className="mobile-touch-target flex-1"
          onClick={() => setActiveTab("in")}
        >
          <ArrowDownCircle className="w-4 h-4 mr-2" />
          Cash In (Buyers)
        </Button>
        <Button
          variant={activeTab === "out" ? "default" : "secondary"}
          data-testid="toggle-cash-out"
          className="mobile-touch-target flex-1"
          onClick={() => setActiveTab("out")}
        >
          <ArrowUpCircle className="w-4 h-4 mr-2" />
          Cash Out (Farmers)
        </Button>
      </div>

      <Button
        data-testid="button-add-cash"
        className="w-full mobile-touch-target"
        onClick={openDialog}
      >
        <Plus className="w-4 h-4 mr-2" />
        {activeTab === "in" ? "Record Payment from Buyer" : "Record Payment to Farmer"}
      </Button>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : cashEntries.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No {activeTab === "in" ? "cash in" : "cash out"} entries yet
        </div>
      ) : (
        <div className="space-y-3">
          {cashEntries.map((entry) => (
            <Card key={entry.id}>
              <CardContent className="pt-4 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="text-xs">Rs.{entry.amount}</Badge>
                      <Badge variant="secondary" className="text-xs">{entry.paymentMode}</Badge>
                    </div>
                    <p className="text-muted-foreground text-xs">{entry.date}</p>
                    {entry.buyerId && <p>Buyer: {getBuyerName(entry.buyerId)}</p>}
                    {entry.farmerId && <p>Farmer: {getFarmerName(entry.farmerId)}</p>}
                    {entry.chequeNumber && <p className="text-xs text-muted-foreground">Cheque: {entry.chequeNumber}</p>}
                    {entry.notes && <p className="text-xs text-muted-foreground">{entry.notes}</p>}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {activeTab === "in" ? "Cash In - Payment from Buyer" : "Cash Out - Payment to Farmer"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Date</Label>
              <Input
                data-testid="input-cash-date"
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="mobile-touch-target"
              />
            </div>

            {activeTab === "in" ? (
              <div className="space-y-1">
                <Label>Buyer</Label>
                <Select value={selectedBuyerId?.toString() || ""} onValueChange={(v) => setSelectedBuyerId(parseInt(v))}>
                  <SelectTrigger data-testid="select-cash-buyer" className="mobile-touch-target">
                    <SelectValue placeholder="Select buyer" />
                  </SelectTrigger>
                  <SelectContent>
                    {buyers.map((b) => (
                      <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label>Farmer</Label>
                <Select value={selectedFarmerId?.toString() || ""} onValueChange={(v) => setSelectedFarmerId(parseInt(v))}>
                  <SelectTrigger data-testid="select-cash-farmer" className="mobile-touch-target">
                    <SelectValue placeholder="Select farmer" />
                  </SelectTrigger>
                  <SelectContent>
                    {farmers.map((f) => (
                      <SelectItem key={f.id} value={f.id.toString()}>{f.name} - {f.phone}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Amount (Rs.)</Label>
              <Input
                data-testid="input-cash-amount"
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="mobile-touch-target text-lg font-medium"
              />
            </div>

            <div className="space-y-1">
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger data-testid="select-payment-mode" className="mobile-touch-target">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODES.map((m) => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {paymentMode === "Cheque" && (
              <div className="space-y-3 bg-muted/50 rounded-md p-3">
                <div className="space-y-1">
                  <Label>Cheque Number</Label>
                  <Input
                    data-testid="input-cheque-number"
                    value={chequeNumber}
                    onChange={(e) => setChequeNumber(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Cheque Date</Label>
                  <Input
                    data-testid="input-cheque-date"
                    type="date"
                    value={chequeDate}
                    onChange={(e) => setChequeDate(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Bank Name</Label>
                  <Input
                    data-testid="input-bank-name"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="mobile-touch-target"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Notes (Optional)</Label>
              <Input
                data-testid="input-cash-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes"
                className="mobile-touch-target"
              />
            </div>

            <Button
              data-testid="button-submit-cash"
              className="w-full mobile-touch-target"
              onClick={submit}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? "Saving..." : "Save Entry"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
