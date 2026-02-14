import { useState, useMemo } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/lib/language";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, ChevronDown, Calendar, Users, Package, Landmark, HandCoins, ShoppingBag, TrendingUp } from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";

type DashboardData = {
  businessName: string;
  lots: { id: number; lotId: string; crop: string; date: string; numberOfBags: number; remainingBags: number; farmerId: number; farmerName: string; initialTotalWeight: string | null }[];
  transactions: { id: number; transactionId: string; date: string; crop: string; lotId: string; farmerId: number; farmerName: string; buyerId: number; buyerName: string; totalPayableToFarmer: string; totalReceivableFromBuyer: string; mandiCharges: string; aadhatCharges: string; netWeight: string; numberOfBags: number; isReversed: boolean }[];
  farmersWithDues: { id: number; name: string; totalPayable: string; totalDue: string }[];
  buyersWithDues: { id: number; name: string; receivableDue: string; overallDue: string }[];
};

const PIE_COLORS = ["#2563eb", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"];

export default function DashboardPage() {
  const { t } = useLanguage();
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentMonth = String(now.getMonth() + 1);
  const currentDay = String(now.getDate());

  const [selectedYears, setSelectedYears] = usePersistedState<string[]>("dash-selectedYears", [currentYear]);
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("dash-selectedMonths", [currentMonth]);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("dash-selectedDays", []);
  const [cropFilter, setCropFilter] = usePersistedState("dash-cropFilter", "all");
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);
  const [yearPopoverOpen, setYearPopoverOpen] = useState(false);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["/api/dashboard"],
  });

  const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const daysInMonths = useMemo(() => {
    if (selectedMonths.length === 0 || selectedYears.length === 0) return 31;
    const year = parseInt(selectedYears[0]);
    return Math.max(...selectedMonths.map(m => new Date(year, parseInt(m), 0).getDate()));
  }, [selectedMonths, selectedYears]);

  const toggleYear = (year: string) => {
    setSelectedYears(prev => prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]);
    setSelectedDays([]);
  };

  const toggleMonth = (month: string) => {
    setSelectedMonths(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);
    setSelectedDays([]);
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const yearLabel = selectedYears.length === 0
    ? "All Years"
    : selectedYears.length === 1
      ? selectedYears[0]
      : `${selectedYears.length} Years`;

  const monthLabel = selectedMonths.length === 0
    ? t("stockRegister.allMonths")
    : selectedMonths.length === 1
      ? MONTH_LABELS[parseInt(selectedMonths[0]) - 1]
      : `${selectedMonths.length} ${t("stockRegister.nMonths")}`;

  const dayLabel = selectedDays.length === 0
    ? t("stockRegister.allDays")
    : selectedDays.length === 1
      ? selectedDays[0]
      : `${selectedDays.length} ${t("stockRegister.nDays")}`;

  const matchesDateFilter = (dateStr: string) => {
    const d = new Date(dateStr + "T00:00:00");
    if (selectedYears.length > 0 && !selectedYears.includes(String(d.getFullYear()))) return false;
    if (selectedMonths.length > 0 && !selectedMonths.includes(String(d.getMonth() + 1))) return false;
    if (selectedDays.length > 0 && !selectedDays.includes(String(d.getDate()))) return false;
    return true;
  };

  const filteredTxns = useMemo(() => {
    if (!data) return [];
    return data.transactions.filter(t => {
      if (t.isReversed) return false;
      if (cropFilter !== "all" && t.crop !== cropFilter) return false;
      return matchesDateFilter(t.date || "");
    });
  }, [data, cropFilter, selectedYears, selectedMonths, selectedDays]);

  const filteredLots = useMemo(() => {
    if (!data) return [];
    return data.lots.filter(l => {
      if (cropFilter !== "all" && l.crop !== cropFilter) return false;
      return matchesDateFilter(l.date || "");
    });
  }, [data, cropFilter, selectedYears, selectedMonths, selectedDays]);

  const uniqueFarmerIds = useMemo(() => new Set(filteredLots.map(l => l.farmerId)), [filteredLots]);

  const summary = useMemo(() => {
    const farmersCount = uniqueFarmerIds.size;
    const lotsCount = filteredLots.length;
    const txnCount = filteredTxns.length;
    const totalPayable = filteredTxns.reduce((s, t) => s + parseFloat(t.totalPayableToFarmer || "0"), 0);
    const totalReceivable = filteredTxns.reduce((s, t) => s + parseFloat(t.totalReceivableFromBuyer || "0"), 0);
    const totalMandi = filteredTxns.reduce((s, t) => s + parseFloat(t.mandiCharges || "0"), 0);
    const totalAadhat = filteredTxns.reduce((s, t) => s + parseFloat(t.aadhatCharges || "0"), 0);

    const farmerDue = data?.farmersWithDues.reduce((s, f) => s + parseFloat(f.totalDue || "0"), 0) || 0;
    const buyerDue = data?.buyersWithDues.reduce((s, b) => s + parseFloat(b.overallDue || "0"), 0) || 0;

    return { farmersCount, lotsCount, txnCount, totalPayable, totalReceivable, totalMandi, totalAadhat, farmerDue, buyerDue };
  }, [filteredTxns, filteredLots, uniqueFarmerIds, data]);

  const cropDistribution = useMemo(() => {
    const map = new Map<string, number>();
    filteredTxns.forEach(t => {
      const val = parseFloat(t.totalReceivableFromBuyer || "0");
      map.set(t.crop, (map.get(t.crop) || 0) + val);
    });
    const total = Array.from(map.values()).reduce((s, v) => s + v, 0);
    return Array.from(map.entries()).map(([name, value]) => ({
      name,
      value: Math.round(value),
      pct: total > 0 ? ((value / total) * 100).toFixed(1) : "0",
    }));
  }, [filteredTxns]);

  const buyerDuesDistribution = useMemo(() => {
    if (!data) return [];
    const filtered = data.buyersWithDues.filter(b => parseFloat(b.overallDue) > 0);
    const total = filtered.reduce((s, b) => s + parseFloat(b.overallDue), 0);
    return filtered.map(b => ({
      name: b.name,
      value: Math.round(parseFloat(b.overallDue)),
      pct: total > 0 ? ((parseFloat(b.overallDue) / total) * 100).toFixed(1) : "0",
    })).sort((a, b) => b.value - a.value);
  }, [data]);

  const timeSeriesData = useMemo(() => {
    const dateMap = new Map<string, { farmerDue: number; buyerDue: number; volume: number; aadhat: number; count: number }>();

    filteredTxns.forEach(t => {
      const date = t.date || "";
      if (!dateMap.has(date)) dateMap.set(date, { farmerDue: 0, buyerDue: 0, volume: 0, aadhat: 0, count: 0 });
      const entry = dateMap.get(date)!;
      entry.farmerDue += parseFloat(t.totalPayableToFarmer || "0");
      entry.buyerDue += parseFloat(t.totalReceivableFromBuyer || "0");
      entry.volume += parseFloat(t.netWeight || "0");
      entry.aadhat += parseFloat(t.aadhatCharges || "0");
      entry.count += 1;
    });

    return Array.from(dateMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, vals]) => ({
        date: formatShortDate(date),
        farmerDue: Math.round(vals.farmerDue),
        buyerDue: Math.round(vals.buyerDue),
        avgVolume: vals.count > 0 ? Math.round(vals.volume / vals.count) : 0,
        aadhat: Math.round(vals.aadhat),
      }));
  }, [filteredTxns]);

  if (isLoading) {
    return (
      <div className="p-3 md:p-6 max-w-6xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-10 bg-muted rounded" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 bg-muted rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <LayoutDashboard className="w-5 h-5 text-primary" />
        <h1 className="text-base md:text-lg font-bold" data-testid="text-business-name">
          {data?.businessName || "Dashboard"}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-filters">
        <Select value={cropFilter} onValueChange={setCropFilter}>
          <SelectTrigger className="w-[110px]" data-testid="dash-crop-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Crops</SelectItem>
            <SelectItem value="Potato">Potato</SelectItem>
            <SelectItem value="Onion">Onion</SelectItem>
            <SelectItem value="Garlic">Garlic</SelectItem>
          </SelectContent>
        </Select>

        <Popover open={yearPopoverOpen} onOpenChange={setYearPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[75px] justify-between px-2 shrink-0" data-testid="dash-year-filter">
              {yearLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="year-select-all"
              onClick={() => { setSelectedYears([]); setSelectedDays([]); setYearPopoverOpen(false); }}
            >
              <Checkbox checked={selectedYears.length === 0} />
              <span>All Years</span>
            </button>
            {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
              <button
                key={y}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left ${selectedYears.includes(y) ? "bg-primary text-primary-foreground" : ""}`}
                data-testid={`year-option-${y}`}
                onClick={() => toggleYear(y)}
              >
                <Checkbox checked={selectedYears.includes(y)} />
                <span>{y}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="dash-month-filter">
              {monthLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="dash-month-select-all"
              onClick={() => { setSelectedMonths([]); setSelectedDays([]); setMonthPopoverOpen(false); }}
            >
              <Checkbox checked={selectedMonths.length === 0} />
              <span>{t("stockRegister.allMonths")}</span>
            </button>
            <div className="grid grid-cols-4 gap-0.5">
              {MONTH_LABELS.map((m, i) => {
                const val = String(i + 1);
                return (
                  <button
                    key={val}
                    className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedMonths.includes(val) ? "bg-primary text-primary-foreground" : ""}`}
                    data-testid={`dash-month-option-${val}`}
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
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="dash-day-filter">
              <Calendar className="w-3 h-3 mr-1" />
              {dayLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="dash-day-select-all"
              onClick={() => { setSelectedDays([]); setDayPopoverOpen(false); }}
            >
              <Checkbox checked={selectedDays.length === 0} />
              <span>{t("stockRegister.allDays")}</span>
            </button>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: daysInMonths }, (_, i) => String(i + 1)).map(d => (
                <button
                  key={d}
                  className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedDays.includes(d) ? "bg-primary text-primary-foreground" : ""}`}
                  data-testid={`dash-day-option-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2" data-testid="dashboard-summary-cards">
        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Package className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Farmers / Lots / Txns</span>
            </div>
            <div className="text-lg font-bold text-blue-700 dark:text-blue-400" data-testid="text-summary-counts">
              {summary.farmersCount} <span className="text-xs font-normal text-muted-foreground">/</span> {summary.lotsCount} <span className="text-xs font-normal text-muted-foreground">/</span> {summary.txnCount}
            </div>
          </CardContent>
        </Card>

        <Card className="border-orange-200 dark:border-orange-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Farmer Payable</span>
            </div>
            <div className="text-sm font-bold text-orange-700 dark:text-orange-400" data-testid="text-farmer-payable">
              ₹{summary.totalPayable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-red-600 font-medium" data-testid="text-farmer-due">
              Due: ₹{summary.farmerDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <ShoppingBag className="w-3.5 h-3.5 text-green-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Buyer Receivable</span>
            </div>
            <div className="text-sm font-bold text-green-700 dark:text-green-400" data-testid="text-buyer-receivable">
              ₹{summary.totalReceivable.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
            <div className="text-[11px] text-red-600 font-medium" data-testid="text-buyer-due">
              Due: ₹{summary.buyerDue.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 dark:border-purple-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Landmark className="w-3.5 h-3.5 text-purple-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Mandi Commission</span>
            </div>
            <div className="text-sm font-bold text-purple-700 dark:text-purple-400" data-testid="text-mandi-commission">
              ₹{summary.totalMandi.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-amber-200 dark:border-amber-800">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <HandCoins className="w-3.5 h-3.5 text-amber-600" />
              <span className="text-[11px] font-medium text-muted-foreground">Aadhat Commission</span>
            </div>
            <div className="text-sm font-bold text-amber-700 dark:text-amber-400" data-testid="text-aadhat-commission">
              ₹{summary.totalAadhat.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-primary" />
              Receivables by Crop
            </h3>
            {cropDistribution.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={cropDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, pct }) => `${name} (${pct}%)`}
                  >
                    {cropDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
              <ShoppingBag className="w-4 h-4 text-primary" />
              Buyer Dues Distribution
            </h3>
            {buyerDuesDistribution.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={buyerDuesDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, pct }) => `${name} (${pct}%)`}
                  >
                    {buyerDuesDistribution.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2">Farmer Payable by Date</h3>
            {timeSeriesData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatINR} />
                  <Tooltip formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                  <Line type="monotone" dataKey="farmerDue" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} name="Farmer Payable" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2">Buyer Receivable by Date</h3>
            {timeSeriesData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatINR} />
                  <Tooltip formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                  <Line type="monotone" dataKey="buyerDue" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Buyer Receivable" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2">Average Volume (Kg) by Date</h3>
            {timeSeriesData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(value: number) => `${value.toLocaleString("en-IN")} Kg`} />
                  <Line type="monotone" dataKey="avgVolume" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} name="Avg Volume (Kg)" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <h3 className="text-sm font-semibold mb-2">Aadhat Value by Date</h3>
            {timeSeriesData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={formatINR} />
                  <Tooltip formatter={(value: number) => `₹${value.toLocaleString("en-IN")}`} />
                  <Line type="monotone" dataKey="aadhat" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} name="Aadhat Value" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatINR(value: number): string {
  if (value >= 100000) return `₹${(value / 100000).toFixed(1)}L`;
  if (value >= 1000) return `₹${(value / 1000).toFixed(1)}K`;
  return `₹${value}`;
}
