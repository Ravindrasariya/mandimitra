import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Farmer, Transaction, CashEntry } from "@shared/schema";
import { Users, Search, TrendingDown, TrendingUp } from "lucide-react";

type LedgerData = {
  farmer: Farmer;
  transactions: Transaction[];
  cashEntries: CashEntry[];
};

export default function FarmerLedgerPage() {
  const [selectedFarmerId, setSelectedFarmerId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: farmers = [] } = useQuery<Farmer[]>({
    queryKey: ["/api/farmers"],
  });

  const dateParams = [
    dateFrom ? `dateFrom=${dateFrom}` : "",
    dateTo ? `dateTo=${dateTo}` : "",
  ].filter(Boolean).join("&");

  const { data: ledger, isLoading } = useQuery<LedgerData>({
    queryKey: ["/api/farmer-ledger", selectedFarmerId, dateParams ? `?${dateParams}` : ""],
    enabled: !!selectedFarmerId,
  });

  const filteredFarmers = searchTerm
    ? farmers.filter(f =>
        f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        f.phone.includes(searchTerm) ||
        (f.village && f.village.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : farmers;

  const totalPayable = ledger?.transactions.reduce((sum, t) => sum + parseFloat(t.totalPayableToFarmer || "0"), 0) || 0;
  const totalPaid = ledger?.cashEntries.reduce((sum, e) => sum + parseFloat(e.amount), 0) || 0;
  const openingBalance = parseFloat(ledger?.farmer.openingBalance || "0");
  const balance = openingBalance + totalPayable - totalPaid;

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
        <Users className="w-6 h-6 text-primary" />
        Farmer Ledger
      </h1>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-testid="input-farmer-ledger-search"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search farmer by name, phone, village..."
            className="pl-9 mobile-touch-target"
          />
        </div>

        <Select value={selectedFarmerId} onValueChange={setSelectedFarmerId}>
          <SelectTrigger data-testid="select-ledger-farmer" className="mobile-touch-target">
            <SelectValue placeholder="Select a farmer" />
          </SelectTrigger>
          <SelectContent>
            {filteredFarmers.map((f) => (
              <SelectItem key={f.id} value={f.id.toString()}>
                {f.name} - {f.phone} {f.village ? `(${f.village})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">From Date</Label>
            <Input
              data-testid="input-ledger-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mobile-touch-target"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To Date</Label>
            <Input
              data-testid="input-ledger-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mobile-touch-target"
            />
          </div>
        </div>
      </div>

      {selectedFarmerId && ledger && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Opening Bal</p>
                <p className="text-lg font-bold">Rs.{openingBalance.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingUp className="w-3 h-3" /> Payable</p>
                <p className="text-lg font-bold text-primary">Rs.{totalPayable.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-xs text-muted-foreground flex items-center justify-center gap-1"><TrendingDown className="w-3 h-3" /> Paid</p>
                <p className="text-lg font-bold">Rs.{totalPaid.toFixed(0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-3 pb-3 text-center">
                <p className="text-xs text-muted-foreground">Balance Due</p>
                <p className={`text-lg font-bold ${balance > 0 ? "text-destructive" : "text-primary"}`}>
                  Rs.{Math.abs(balance).toFixed(0)} {balance > 0 ? "DR" : balance < 0 ? "CR" : ""}
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Transactions</h2>
            {ledger.transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No transactions</p>
            ) : (
              ledger.transactions.map((tx) => (
                <Card key={tx.id}>
                  <CardContent className="pt-3 pb-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">{tx.date}</p>
                        <p>Net: {tx.netWeight} kg @ Rs.{tx.pricePerKg}/kg</p>
                      </div>
                      <Badge className="text-xs">Rs.{tx.totalPayableToFarmer}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Payments Received</h2>
            {ledger.cashEntries.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No payments</p>
            ) : (
              ledger.cashEntries.map((ce) => (
                <Card key={ce.id}>
                  <CardContent className="pt-3 pb-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">{ce.date}</p>
                        <p>{ce.paymentMode}{ce.chequeNumber ? ` - ${ce.chequeNumber}` : ""}</p>
                      </div>
                      <Badge variant="secondary" className="text-xs">Rs.{ce.amount}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </>
      )}

      {selectedFarmerId && isLoading && (
        <div className="text-center py-8 text-muted-foreground">Loading ledger...</div>
      )}

      {!selectedFarmerId && (
        <div className="text-center py-8 text-muted-foreground">
          Select a farmer to view their ledger
        </div>
      )}
    </div>
  );
}
