import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PieChart, Download } from "lucide-react";

function getFYOptions(): string[] {
  const now = new Date();
  const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options: string[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    options.push(`${y}-${(y + 1).toString().slice(2)}`);
  }
  return options;
}

const fmt = (n: number) => n.toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });

export default function BalanceSheetPage() {
  const { t } = useLanguage();
  const fyOptions = getFYOptions();
  const [fy, setFY] = useState(fyOptions[0]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/books/balance-sheet", fy],
    queryFn: async () => { const r = await fetch(`/api/books/balance-sheet?fy=${fy}`); if (!r.ok) throw new Error("Failed to load"); return r.json(); },
  });

  const downloadCSV = () => {
    if (!data) return;
    const rows: string[][] = [["Section", "Item", "Amount"]];
    if (data.fixedAssets?.byCategory) {
      Object.entries(data.fixedAssets.byCategory).forEach(([cat, val]) => rows.push(["Fixed Assets", cat, String(val)]));
    }
    rows.push(["Fixed Assets", "Total", String(data.fixedAssets?.total || 0)]);
    rows.push(["Current Assets", "Cash in Hand", String(data.currentAssets?.cashInHand || 0)]);
    rows.push(["Current Assets", "Bank Balances", String(data.currentAssets?.totalBankBalance || 0)]);
    rows.push(["Current Assets", "Buyer Receivables", String(data.currentAssets?.buyerReceivable || 0)]);
    rows.push(["Current Assets", "Total", String(data.currentAssets?.total || 0)]);
    rows.push(["Total Assets", "", String(data.totalAssets || 0)]);
    if (data.longTermLiabilities) {
      data.longTermLiabilities.forEach((l: any) => rows.push(["Long-term Liabilities", l.name, String(l.outstanding)]));
    }
    rows.push(["Long-term Liabilities", "Total", String(data.totalLongTermLiabilities || 0)]);
    rows.push(["Current Liabilities", "Farmer Payable", String(data.currentLiabilities?.farmerPayable || 0)]);
    rows.push(["Current Liabilities", "Limit A/c Outstanding", String(data.currentLiabilities?.limitOutstanding || 0)]);
    rows.push(["Total Liabilities", "", String(data.totalLiabilities || 0)]);
    rows.push(["Owner's Equity", "", String(data.ownersEquity || 0)]);

    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `balance-sheet-${fy}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <PieChart className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-bs-title">{t("balanceSheet.title")}</h1>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300">Beta</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={fy} onValueChange={setFY}>
            <SelectTrigger className="w-32" data-testid="select-bs-fy"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fyOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={downloadCSV} data-testid="button-bs-csv">
            <Download className="w-4 h-4 mr-1" />{t("balanceSheet.downloadCSV")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : !data ? null : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("balanceSheet.asOf")} {parseInt(fy.split("-")[0]) + 1}</p>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">{t("balanceSheet.fixedAssets")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3">
              {data.fixedAssets?.byCategory && Object.entries(data.fixedAssets.byCategory).length > 0 ? (
                <div className="space-y-1">
                  {Object.entries(data.fixedAssets.byCategory).map(([cat, val]) => (
                    <div key={cat} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{cat}</span>
                      <span data-testid={`text-fa-${cat}`}>{fmt(val as number)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t pt-1">
                    <span>Total</span>
                    <span data-testid="text-fa-total">{fmt(data.fixedAssets.total)}</span>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No fixed assets</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">{t("balanceSheet.currentAssets")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("balanceSheet.cashInHand")}</span>
                <span data-testid="text-ca-cash">{fmt(data.currentAssets.cashInHand)}</span>
              </div>
              {data.currentAssets.bankBalances?.map((b: any) => (
                <div key={b.name} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{b.name}</span>
                  <span>{fmt(b.balance)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("balanceSheet.buyerReceivable")}</span>
                <span data-testid="text-ca-buyer">{fmt(data.currentAssets.buyerReceivable)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>Total</span>
                <span data-testid="text-ca-total">{fmt(data.currentAssets.total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="py-3 px-4">
              <div className="flex justify-between font-bold text-lg">
                <span>{t("balanceSheet.totalAssets")}</span>
                <span data-testid="text-total-assets" className="text-primary">{fmt(data.totalAssets)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base">{t("balanceSheet.longTermLiabilities")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-1">
              {data.longTermLiabilities?.length > 0 ? (
                <>
                  {data.longTermLiabilities.map((l: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{l.name} ({l.type})</span>
                      <span>{fmt(l.outstanding)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm font-semibold border-t pt-1">
                    <span>Total</span>
                    <span data-testid="text-lt-total">{fmt(data.totalLongTermLiabilities)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">No long-term liabilities</p>
              )}
            </CardContent>
          </Card>

          {(data.currentLiabilities?.farmerPayable > 0 || data.currentLiabilities?.limitOutstanding > 0) && (
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-base">{t("balanceSheet.currentLiabilities")}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 px-4 pb-3 space-y-1">
                {data.currentLiabilities.farmerPayable > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("balanceSheet.farmerPayable")}</span>
                    <span data-testid="text-cl-farmer">{fmt(data.currentLiabilities.farmerPayable)}</span>
                  </div>
                )}
                {data.currentLiabilities.limitOutstanding > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{t("balanceSheet.limitOutstanding")}</span>
                    <span data-testid="text-cl-limit">{fmt(data.currentLiabilities.limitOutstanding)}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="bg-red-50/50 border-red-200/50">
            <CardContent className="py-3 px-4">
              <div className="flex justify-between font-bold text-lg">
                <span>{t("balanceSheet.totalLiabilities")}</span>
                <span data-testid="text-total-liabilities" className="text-red-600">{fmt(data.totalLiabilities)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className={data.ownersEquity >= 0 ? "bg-green-50/50 border-green-200/50" : "bg-red-50/50 border-red-200/50"}>
            <CardContent className="py-3 px-4">
              <div className="flex justify-between font-bold text-lg">
                <span>{t("balanceSheet.ownersEquity")}</span>
                <span data-testid="text-equity" className={data.ownersEquity >= 0 ? "text-green-700" : "text-red-600"}>{fmt(data.ownersEquity)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
