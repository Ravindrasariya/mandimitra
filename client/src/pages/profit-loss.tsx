import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Download } from "lucide-react";

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

export default function ProfitLossPage() {
  const { t } = useLanguage();
  const fyOptions = getFYOptions();
  const [fy, setFY] = useState(fyOptions[0]);

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/books/profit-and-loss", fy],
    queryFn: async () => { const r = await fetch(`/api/books/profit-and-loss?fy=${fy}`); if (!r.ok) throw new Error("Failed to load"); return r.json(); },
  });

  const downloadCSV = () => {
    if (!data) return;
    const rows: string[][] = [["Section", "Item", "Amount"]];
    rows.push(["Income", "Aadhat Commission", String(data.income.aadhatCommission)]);
    rows.push(["Income", "Total", String(data.income.total)]);
    rows.push(["Expenses", "Depreciation", String(data.expenses.depreciation)]);
    rows.push(["Expenses", "Interest on Liabilities", String(data.expenses.interestOnLiabilities)]);
    rows.push(["Expenses", "Salary", String(data.expenses.salaryExpense)]);
    rows.push(["Expenses", "General Expenses", String(data.expenses.generalExpense)]);
    rows.push(["Expenses", "TDS", String(data.expenses.tdsExpense)]);
    rows.push(["Expenses", "Sales Loss", String(data.expenses.salesLossExpense)]);
    rows.push(["Expenses", "Total", String(data.expenses.total)]);
    rows.push(["Net Profit/Loss", "", String(data.netProfitLoss)]);

    const csv = rows.map(r => r.map(c => `"${c}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `pnl-${fy}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const isProfit = data && data.netProfitLoss >= 0;

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-pnl-title">{t("pnl.title")}</h1>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300">Beta</Badge>
        </div>
        <div className="flex items-center gap-2">
          <Select value={fy} onValueChange={setFY}>
            <SelectTrigger className="w-32" data-testid="select-pnl-fy"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fyOptions.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={downloadCSV} data-testid="button-pnl-csv">
            <Download className="w-4 h-4 mr-1" />{t("pnl.downloadCSV")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : !data ? null : (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("pnl.forFY")} {fy} (Apr {fy.split("-")[0]} - Mar {parseInt(fy.split("-")[0]) + 1})</p>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base text-green-700">{t("pnl.income")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-1">
              <IncomeRow label={t("pnl.aadhatCommission")} value={data.income.aadhatCommission} testId="text-inc-aadhat" />
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>{t("pnl.totalIncome")}</span>
                <span data-testid="text-inc-total" className="text-green-700">{fmt(data.income.total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-3 px-4">
              <CardTitle className="text-base text-red-600">{t("pnl.expenses")}</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 px-4 pb-3 space-y-1">
              <IncomeRow label={t("pnl.depreciation")} value={data.expenses.depreciation} testId="text-exp-dep" />
              <IncomeRow label={t("pnl.interestOnLiabilities")} value={data.expenses.interestOnLiabilities} testId="text-exp-interest" />
              <IncomeRow label="Salary" value={data.expenses.salaryExpense} testId="text-exp-salary" />
              <IncomeRow label="General Expenses" value={data.expenses.generalExpense} testId="text-exp-general" />
              <IncomeRow label="TDS" value={data.expenses.tdsExpense} testId="text-exp-tds" />
              <IncomeRow label="Sales Loss" value={data.expenses.salesLossExpense} testId="text-exp-sales-loss" />
              <div className="flex justify-between text-sm font-semibold border-t pt-1">
                <span>{t("pnl.totalExpenses")}</span>
                <span data-testid="text-exp-total" className="text-red-600">{fmt(data.expenses.total)}</span>
              </div>
            </CardContent>
          </Card>

          <Card className={isProfit ? "bg-green-50/50 border-green-200/50" : "bg-red-50/50 border-red-200/50"}>
            <CardContent className="py-4 px-4">
              <div className="flex justify-between items-center font-bold text-lg">
                <span className="flex items-center gap-2">
                  {isProfit ? <TrendingUp className="w-5 h-5 text-green-700" /> : <TrendingDown className="w-5 h-5 text-red-600" />}
                  {t("pnl.netProfitLoss")}
                </span>
                <span data-testid="text-net-pnl" className={isProfit ? "text-green-700" : "text-red-600"}>{fmt(data.netProfitLoss)}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function IncomeRow({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span data-testid={testId}>{fmt(value)}</span>
    </div>
  );
}
