import { useState, useMemo } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import type { Farmer, Buyer, CashEntry, BankAccount } from "@shared/schema";
import { Wallet, Settings, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Download, RotateCcw, Trash2, Plus, Filter, X, Search, ChevronsUpDown } from "lucide-react";
import { format } from "date-fns";

type BuyerWithDues = Buyer & { receivableDue: string; overallDue: string };
type FarmerWithDues = Farmer & { totalPayable: string; totalDue: string; salesCount: number };
type TransactionAggregates = {
  totalHammali: number; totalExtraCharges: number; totalMandiCommission: number;
  paidHammali: number; paidMandiCommission: number;
};

const OUTFLOW_TYPES = [
  "Farmer-Advance",
  "Farmer-Harvest Sale",
  "General Expenses",
  "Hammali",
  "Mandi Commission",
  "Salary",
] as const;

export default function CashPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const now = new Date();
  const [activeTab, setActiveTab] = usePersistedState<"inward" | "outward" | "transfer">("cash-activeTab", "inward");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<CashEntry | null>(null);
  const [reverseConfirmEntry, setReverseConfirmEntry] = useState<CashEntry | null>(null);
  const [chequeBounceEntry, setChequeBounceEntry] = useState<CashEntry | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null);

  const [filterCategory, setFilterCategory] = usePersistedState("cash-filterCategory", "all");
  const [filterPaymentMode, setFilterPaymentMode] = usePersistedState("cash-filterPayMode", "all");
  const [filterOutflowType, setFilterOutflowType] = usePersistedState("cash-filterOutflow", "all");
  const [filterBuyer, setFilterBuyer] = usePersistedState("cash-filterBuyer", "all");
  const [filterFarmer, setFilterFarmer] = usePersistedState("cash-filterFarmer", "all");
  const [filterRemarks, setFilterRemarks] = usePersistedState("cash-filterRemarks", "all");
  const [filterMonth, setFilterMonth] = usePersistedState("cash-filterMonth", "all");
  const [filterYear, setFilterYear] = usePersistedState("cash-filterYear", String(now.getFullYear()));

  const [inwardPartyType, setInwardPartyType] = useState("Buyer");
  const [inwardBuyerId, setInwardBuyerId] = useState("");
  const [inwardAmount, setInwardAmount] = useState("");
  const [inwardDate, setInwardDate] = useState(format(now, "yyyy-MM-dd"));
  const [inwardPaymentMode, setInwardPaymentMode] = useState("Cash");
  const [inwardBankAccountId, setInwardBankAccountId] = useState("");
  const [inwardNotes, setInwardNotes] = useState("");

  const [outwardOutflowType, setOutwardOutflowType] = useState<string>("Farmer-Advance");
  const [outwardFarmerId, setOutwardFarmerId] = useState("");
  const [outwardAmount, setOutwardAmount] = useState("");
  const [outwardDate, setOutwardDate] = useState(format(now, "yyyy-MM-dd"));
  const [outwardPaymentMode, setOutwardPaymentMode] = useState("Cash");
  const [outwardBankAccountId, setOutwardBankAccountId] = useState("");
  const [outwardNotes, setOutwardNotes] = useState("");

  const [transferFromType, setTransferFromType] = useState("cash");
  const [transferFromAccountId, setTransferFromAccountId] = useState("");
  const [transferToType, setTransferToType] = useState("account");
  const [transferToAccountId, setTransferToAccountId] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferDate, setTransferDate] = useState(format(now, "yyyy-MM-dd"));
  const [transferNotes, setTransferNotes] = useState("");

  const [filterFarmerSearch, setFilterFarmerSearch] = useState("");
  const [filterFarmerOpen, setFilterFarmerOpen] = useState(false);
  const [filterRemarksSearch, setFilterRemarksSearch] = useState("");
  const [filterRemarksOpen, setFilterRemarksOpen] = useState(false);
  const [outwardReceiverName, setOutwardReceiverName] = useState("");
  const [outwardFarmerSearch, setOutwardFarmerSearch] = useState("");
  const [outwardFarmerOpen, setOutwardFarmerOpen] = useState(false);

  const [cashInHandOpening, setCashInHandOpening] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [newBankType, setNewBankType] = useState("Current");
  const [newBankBalance, setNewBankBalance] = useState("0");

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (filterCategory !== "all") params.set("category", filterCategory);
    if (filterMonth !== "all") params.set("month", filterMonth);
    if (filterYear !== "all") params.set("year", filterYear);
    return params.toString() ? `?${params.toString()}` : "";
  }, [filterCategory, filterMonth, filterYear]);

  const { data: allEntries = [], isLoading } = useQuery<CashEntry[]>({
    queryKey: [`/api/cash-entries${queryParams}`],
  });

  const { data: farmers = [] } = useQuery<Farmer[]>({ queryKey: ["/api/farmers"] });
  const { data: buyersWithDues = [] } = useQuery<BuyerWithDues[]>({ queryKey: ["/api/buyers?withDues=true"] });
  const { data: buyers = [] } = useQuery<Buyer[]>({ queryKey: ["/api/buyers"] });
  const { data: bankAccountsList = [] } = useQuery<BankAccount[]>({ queryKey: ["/api/bank-accounts"] });
  const { data: cashSettingsData } = useQuery<{ cashInHandOpening: string }>({ queryKey: ["/api/cash-settings"] });
  const { data: txAggregates } = useQuery<TransactionAggregates>({ queryKey: ["/api/transaction-aggregates"] });

  const { data: farmersWithDues = [] } = useQuery<FarmerWithDues[]>({ queryKey: ["/api/farmers-with-dues"] });

  const hasBankAccounts = bankAccountsList.length > 0;

  const uniqueRemarks = useMemo(() => {
    const remarks = new Set<string>();
    allEntries.forEach(e => { if (e.notes && e.notes.trim()) remarks.add(e.notes.trim()); });
    return Array.from(remarks).sort();
  }, [allEntries]);

  const filterRemarksResults = (search: string) => {
    if (!search) return uniqueRemarks;
    const lower = search.toLowerCase();
    return uniqueRemarks.filter(r => r.toLowerCase().includes(lower));
  };

  const hasActiveFilters = filterCategory !== "all" || filterPaymentMode !== "all" || filterOutflowType !== "all" || filterBuyer !== "all" || filterFarmer !== "all" || filterRemarks !== "all" || filterMonth !== "all" || filterYear !== String(now.getFullYear());

  const clearAllFilters = () => {
    setFilterCategory("all");
    setFilterPaymentMode("all");
    setFilterOutflowType("all");
    setFilterBuyer("all");
    setFilterFarmer("all");
    setFilterRemarks("all");
    setFilterRemarksSearch("");
    setFilterMonth("all");
    setFilterYear(String(now.getFullYear()));
  };

  const filteredEntries = useMemo(() => {
    let result = allEntries;
    if (filterPaymentMode !== "all") {
      result = result.filter(e => e.paymentMode === filterPaymentMode);
    }
    if (filterOutflowType !== "all") {
      result = result.filter(e => e.outflowType === filterOutflowType);
    }
    if (filterBuyer !== "all") {
      result = result.filter(e => e.buyerId === parseInt(filterBuyer));
    }
    if (filterFarmer !== "all") {
      result = result.filter(e => e.farmerId === parseInt(filterFarmer));
    }
    if (filterRemarks !== "all") {
      result = result.filter(e => e.notes && e.notes.trim() === filterRemarks);
    }
    return result;
  }, [allEntries, filterPaymentMode, filterOutflowType, filterBuyer, filterFarmer, filterRemarks]);

  const filteredTotals = useMemo(() => {
    let totalInflow = 0, totalOutflow = 0;
    filteredEntries.filter(e => !e.isReversed).forEach(e => {
      const amt = parseFloat(e.amount || "0");
      if (e.category === "inward") totalInflow += amt;
      else if (e.category === "outward") totalOutflow += amt;
      else if (e.category === "transfer") {
        if (e.type === "account_to_cash") totalInflow += amt;
        else if (e.type === "cash_to_account") totalOutflow += amt;
      }
    });
    return { totalInflow, totalOutflow };
  }, [filteredEntries]);

  const summaryData = useMemo(() => {
    const opening = parseFloat(cashSettingsData?.cashInHandOpening || "0");
    let cashReceived = 0, cashExpense = 0;
    const acctReceived: Record<number, number> = {};
    const acctExpense: Record<number, number> = {};

    allEntries.filter(e => !e.isReversed).forEach(e => {
      const amt = parseFloat(e.amount || "0");
      if (e.category === "inward") {
        if (e.paymentMode === "Cash") cashReceived += amt;
        else if (e.bankAccountId) {
          acctReceived[e.bankAccountId] = (acctReceived[e.bankAccountId] || 0) + amt;
        }
      } else if (e.category === "outward") {
        if (e.paymentMode === "Cash") cashExpense += amt;
        else if (e.bankAccountId) {
          acctExpense[e.bankAccountId] = (acctExpense[e.bankAccountId] || 0) + amt;
        }
      } else if (e.category === "transfer") {
        if (e.type === "cash_to_account" && e.bankAccountId) {
          cashExpense += amt;
          acctReceived[e.bankAccountId] = (acctReceived[e.bankAccountId] || 0) + amt;
        } else if (e.type === "account_to_cash" && e.bankAccountId) {
          cashReceived += amt;
          acctExpense[e.bankAccountId] = (acctExpense[e.bankAccountId] || 0) + amt;
        }
      }
    });

    const totalAccountReceived = Object.values(acctReceived).reduce((s, v) => s + v, 0);
    const totalAccountExpense = Object.values(acctExpense).reduce((s, v) => s + v, 0);

    const accountBreakdowns: { name: string; received: number; expense: number; balance: number }[] = bankAccountsList.map(a => ({
      name: a.name,
      received: acctReceived[a.id] || 0,
      expense: acctExpense[a.id] || 0,
      balance: parseFloat(a.openingBalance || "0") + (acctReceived[a.id] || 0) - (acctExpense[a.id] || 0),
    }));

    const totalAccountBalance = accountBreakdowns.reduce((s, a) => s + a.balance, 0);

    return {
      cashReceived, cashExpense, netCashInHand: opening + cashReceived - cashExpense,
      totalAccountReceived, totalAccountExpense, totalAccountBalance,
      accountBreakdowns,
    };
  }, [allEntries, cashSettingsData, bankAccountsList]);

  const invalidateCashQueries = () => {
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/cash-entries");
    }});
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/buyers");
    }});
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
    queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
    queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"] });
    queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/cash-entries", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateCashQueries();
      toast({ title: t("common.saved"), variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const reverseMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: number; reason?: string }) => {
      const res = await apiRequest("PATCH", `/api/cash-entries/${id}/reverse`, reason ? { reason } : undefined);
      return res.json();
    },
    onSuccess: () => {
      invalidateCashQueries();
      setReverseConfirmEntry(null);
      setChequeBounceEntry(null);
      toast({ title: t("common.saved"), description: "Entry reversed", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: t("common.error"), description: err.message, variant: "destructive" });
    },
  });

  const saveCashSettingsMutation = useMutation({
    mutationFn: async (val: string) => {
      const res = await apiRequest("POST", "/api/cash-settings", { cashInHandOpening: val });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/cash-settings"] });
      toast({ title: t("common.saved"), variant: "success" });
    },
  });

  const createBankMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bank-accounts", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setNewBankName("");
      setNewBankType("Current");
      setNewBankBalance("0");
      toast({ title: t("common.saved"), variant: "success" });
    },
  });

  const deleteBankMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bank-accounts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      setDeleteAccountId(null);
      toast({ title: "Account Deleted", variant: "success" });
    },
  });

  const submitInward = () => {
    if (!inwardAmount || parseFloat(inwardAmount) <= 0) {
      toast({ title: t("common.error"), description: "Enter valid amount", variant: "destructive" });
      return;
    }
    if (inwardPartyType === "Buyer" && !inwardBuyerId) {
      toast({ title: t("common.error"), description: "Select a buyer", variant: "destructive" });
      return;
    }
    if (inwardPaymentMode !== "Cash" && !inwardBankAccountId) {
      toast({ title: t("common.error"), description: "Select bank account", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      category: "inward",
      type: "cash_in",
      outflowType: inwardPartyType,
      buyerId: inwardPartyType === "Buyer" ? parseInt(inwardBuyerId) : null,
      amount: inwardAmount,
      date: inwardDate,
      paymentMode: inwardPaymentMode,
      bankAccountId: inwardPaymentMode !== "Cash" ? parseInt(inwardBankAccountId) : null,
      notes: inwardNotes || null,
    });
    setInwardAmount("");
    setInwardNotes("");
    setInwardBuyerId("");
  };

  const submitOutward = () => {
    if (!outwardAmount || parseFloat(outwardAmount) <= 0) {
      toast({ title: t("common.error"), description: "Enter valid amount", variant: "destructive" });
      return;
    }
    const needsFarmer = outwardOutflowType === "Farmer-Advance" || outwardOutflowType === "Farmer-Harvest Sale";
    if (needsFarmer && !outwardFarmerId) {
      toast({ title: t("common.error"), description: "Select a farmer", variant: "destructive" });
      return;
    }
    if (outwardOutflowType === "Salary" && !outwardReceiverName.trim()) {
      toast({ title: t("common.error"), description: "Enter receiver name", variant: "destructive" });
      return;
    }
    if (outwardPaymentMode !== "Cash" && !outwardBankAccountId) {
      toast({ title: t("common.error"), description: "Select bank account", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      category: "outward",
      type: "cash_out",
      outflowType: outwardOutflowType,
      farmerId: needsFarmer ? parseInt(outwardFarmerId) : null,
      partyName: outwardOutflowType === "Salary" ? outwardReceiverName.trim() : null,
      amount: outwardAmount,
      date: outwardDate,
      paymentMode: outwardPaymentMode,
      bankAccountId: outwardPaymentMode !== "Cash" ? parseInt(outwardBankAccountId) : null,
      notes: outwardNotes || null,
    });
    setOutwardAmount("");
    setOutwardNotes("");
    setOutwardFarmerId("");
    setOutwardReceiverName("");
  };

  const submitTransfer = () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      toast({ title: t("common.error"), description: "Enter valid amount", variant: "destructive" });
      return;
    }
    const isCashToAccount = transferFromType === "cash";
    const accountId = isCashToAccount ? transferToAccountId : transferFromAccountId;
    if (!accountId) {
      toast({ title: t("common.error"), description: "Select bank account", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      category: "transfer",
      type: isCashToAccount ? "cash_to_account" : "account_to_cash",
      outflowType: "Transfer",
      bankAccountId: parseInt(accountId),
      amount: transferAmount,
      date: transferDate,
      paymentMode: isCashToAccount ? "Online" : "Cash",
      notes: transferNotes || null,
    });
    setTransferAmount("");
    setTransferNotes("");
  };

  const getFarmerName = (id: number | null) => {
    if (!id) return "N/A";
    return farmers.find(f => f.id === id)?.name || `#${id}`;
  };

  const getBuyerName = (id: number | null) => {
    if (!id) return "N/A";
    return buyers.find(b => b.id === id)?.name || `#${id}`;
  };

  const getAccountName = (id: number | null) => {
    if (!id) return "";
    return bankAccountsList.find(a => a.id === id)?.name || `#${id}`;
  };

  const truncateAccountName = (name: string, maxLen = 20) => {
    if (name.length <= maxLen) return name;
    const hashIdx = name.indexOf("#");
    if (hashIdx >= 0) {
      const prefix = name.substring(0, hashIdx + 1);
      const num = name.substring(hashIdx + 1);
      const availLen = maxLen - prefix.length - 2;
      if (availLen > 0 && num.length > availLen) {
        return prefix + num.substring(0, availLen) + "..";
      }
    }
    return name.substring(0, maxLen - 2) + "..";
  };

  const filterFarmerResults = (search: string) => {
    if (!search || search.length < 1) return [];
    const s = search.toLowerCase();
    return farmers.filter(f => !f.isArchived && (
      f.name.toLowerCase().includes(s) ||
      f.phone?.toLowerCase().includes(s) ||
      f.village?.toLowerCase().includes(s)
    )).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 20);
  };

  const getEntryLabel = (e: CashEntry) => {
    if (e.category === "transfer") return "Transfer";
    if (e.outflowType === "Buyer" && e.buyerId) return getBuyerName(e.buyerId);
    if (e.farmerId) return getFarmerName(e.farmerId);
    if (e.outflowType === "Salary" && e.partyName) return `Salary - ${e.partyName}`;
    if (e.outflowType === "Others") return "General";
    return e.outflowType || "Entry";
  };

  const getCategoryBadge = (e: CashEntry) => {
    if (e.category === "inward") return <Badge className="text-[10px] bg-green-500">{t("cash.inward")}</Badge>;
    if (e.category === "outward") return <Badge className="text-[10px] bg-orange-500">{t("cash.outward")}</Badge>;
    return <Badge className="text-[10px] bg-blue-500">{t("cash.transfer")}</Badge>;
  };

  const downloadCSV = () => {
    const rows = filteredEntries.map(e => ({
      "Cash Flow ID": e.cashFlowId || "",
      "Date": e.date,
      "Category": e.category,
      "Outflow Type": e.outflowType || "",
      "Receiver/Party": e.partyName || (e.buyerId ? getBuyerName(e.buyerId) : e.farmerId ? getFarmerName(e.farmerId) : ""),
      "Buyer": e.buyerId ? getBuyerName(e.buyerId) : "",
      "Farmer": e.farmerId ? getFarmerName(e.farmerId) : "",
      "Amount": e.amount,
      "Payment Mode": e.paymentMode,
      "Bank Account": e.bankAccountId ? getAccountName(e.bankAccountId) : "",
      "Notes": e.notes || "",
      "Status": e.isReversed ? "Reversed" : "Active",
    }));
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${(r as any)[h]}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cash-flow-${format(now, "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const dueHammali = (txAggregates?.totalHammali || 0) - (txAggregates?.paidHammali || 0);
  const dueMandi = (txAggregates?.totalMandiCommission || 0) - (txAggregates?.paidMandiCommission || 0);

  const getOutflowHint = (type: string) => {
    if (type === "Hammali") return dueHammali > 0 ? `Due: ₹${dueHammali.toLocaleString("en-IN")}` : null;
    if (type === "Mandi Commission") return dueMandi > 0 ? `Due: ₹${dueMandi.toLocaleString("en-IN")}` : null;
    return null;
  };

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            {t("cash.title")}
          </h1>
          <p className="text-xs text-muted-foreground">{t("cash.subtitle")}</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => {
          setCashInHandOpening(cashSettingsData?.cashInHandOpening || "0");
          setSettingsOpen(true);
        }} data-testid="button-cash-settings">
          <Settings className="w-5 h-5" />
        </Button>
      </div>

      <div className="bg-muted/40 rounded-xl p-3">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
          <Card className="border-green-200">
            <CardContent className="p-3">
              <p className="text-[10px] text-green-600 font-medium">{t("cash.cashReceived")}</p>
              <p className="text-sm font-bold text-green-700" data-testid="text-cash-received">₹{summaryData.cashReceived.toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="border-orange-200">
            <CardContent className="p-3">
              <p className="text-[10px] text-orange-600 font-medium">{t("cash.cashExpense")}</p>
              <p className="text-sm font-bold text-orange-700" data-testid="text-cash-expense">₹{summaryData.cashExpense.toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200">
            <CardContent className="p-3">
              <p className="text-[10px] text-emerald-600 font-medium">{t("cash.netCashInHand")}</p>
              <p className="text-sm font-bold text-emerald-700" data-testid="text-net-cash">₹{summaryData.netCashInHand.toLocaleString("en-IN")}</p>
            </CardContent>
          </Card>
          <Card className="border-green-200">
            <CardContent className="p-3">
              <p className="text-[10px] text-green-600 font-medium">{t("cash.accountReceived")}</p>
              <p className="text-sm font-bold text-green-700" data-testid="text-account-received">₹{summaryData.totalAccountReceived.toLocaleString("en-IN")}</p>
              {summaryData.accountBreakdowns.filter(a => a.received > 0).map(a => (
                <div key={a.name} className="flex items-baseline justify-between gap-1 mt-0.5">
                  <span className="text-[10px] text-green-600/70 truncate">{truncateAccountName(a.name)}</span>
                  <span className="text-xs font-semibold text-green-700 whitespace-nowrap">₹{a.received.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-orange-200">
            <CardContent className="p-3">
              <p className="text-[10px] text-orange-600 font-medium">{t("cash.accountExpense")}</p>
              <p className="text-sm font-bold text-orange-700" data-testid="text-account-expense">₹{summaryData.totalAccountExpense.toLocaleString("en-IN")}</p>
              {summaryData.accountBreakdowns.filter(a => a.expense > 0).map(a => (
                <div key={a.name} className="flex items-baseline justify-between gap-1 mt-0.5">
                  <span className="text-[10px] text-orange-600/70 truncate">{truncateAccountName(a.name)}</span>
                  <span className="text-xs font-semibold text-orange-700 whitespace-nowrap">₹{a.expense.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card className="border-purple-200">
            <CardContent className="p-3">
              <p className="text-[10px] text-purple-600 font-medium">{t("cash.netInAccounts")}</p>
              <p className="text-sm font-bold text-purple-700" data-testid="text-net-accounts">₹{summaryData.totalAccountBalance.toLocaleString("en-IN")}</p>
              {summaryData.accountBreakdowns.map(a => (
                <div key={a.name} className="flex items-baseline justify-between gap-1 mt-0.5">
                  <span className="text-[10px] text-purple-600/70 truncate">{truncateAccountName(a.name)}</span>
                  <span className="text-xs font-semibold text-purple-700 whitespace-nowrap">₹{a.balance.toLocaleString("en-IN")}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="bg-muted/40 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{t("cash.filters")}</span>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="h-8 w-[130px] text-xs rounded-md border border-input bg-background px-2" data-testid="filter-category">
            <option value="all">All</option>
            <option value="inward">{t("cash.inwardCash")}</option>
            <option value="outward">{t("cash.outwardCash")}</option>
            <option value="transfer">{t("cash.transfer")}</option>
          </select>
          <select value={filterPaymentMode} onChange={(e) => setFilterPaymentMode(e.target.value)} className="h-8 w-[110px] text-xs rounded-md border border-input bg-background px-2" data-testid="filter-payment-mode">
            <option value="all">Payment: All</option>
            <option value="Cash">Cash</option>
            <option value="Online">Account</option>
            <option value="Cheque">Cheque</option>
          </select>
          <select value={filterOutflowType} onChange={(e) => setFilterOutflowType(e.target.value)} className="h-8 w-[150px] text-xs rounded-md border border-input bg-background px-2" data-testid="filter-outflow-type">
            <option value="all">Outflow: All</option>
            {OUTFLOW_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
          <select value={filterBuyer} onChange={(e) => setFilterBuyer(e.target.value)} className="h-8 w-[150px] text-xs rounded-md border border-input bg-background px-2" data-testid="filter-buyer">
            <option value="all">Buyer: All</option>
            {buyers.map(b => <option key={b.id} value={b.id.toString()}>{b.name}</option>)}
          </select>
          <div className="relative" data-testid="filter-farmer-wrapper">
            {filterFarmer !== "all" ? (
              <div className="h-8 w-[200px] text-xs rounded-md border border-input bg-background px-2 flex items-center gap-1">
                <span className="truncate flex-1">{farmers.find(f => f.id === parseInt(filterFarmer))?.name || "Farmer"}</span>
                <button onClick={() => { setFilterFarmer("all"); setFilterFarmerSearch(""); }} className="shrink-0" data-testid="button-clear-filter-farmer"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <>
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  value={filterFarmerSearch}
                  onChange={(e) => { setFilterFarmerSearch(e.target.value); setFilterFarmerOpen(true); }}
                  onFocus={() => setFilterFarmerOpen(true)}
                  onBlur={() => setTimeout(() => setFilterFarmerOpen(false), 200)}
                  placeholder="Farmer: Search..."
                  className="h-8 w-[200px] text-xs rounded-md border border-input bg-background pl-7 pr-2"
                  data-testid="filter-farmer"
                />
                {filterFarmerOpen && filterFarmerResults(filterFarmerSearch).length > 0 && (
                  <div className="absolute z-50 w-[280px] mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                    {filterFarmerResults(filterFarmerSearch).map(f => (
                      <button key={f.id} className="flex items-center gap-1.5 px-3 py-2 text-xs w-full text-left hover:bg-accent" data-testid={`filter-farmer-opt-${f.id}`}
                        onMouseDown={(e) => { e.preventDefault(); setFilterFarmer(f.id.toString()); setFilterFarmerSearch(""); setFilterFarmerOpen(false); }}>
                        <span className="font-medium">{f.name}</span>
                        <span className="text-muted-foreground">{f.phone}</span>
                        {f.village && <span className="text-muted-foreground">({f.village})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <div className="relative" data-testid="filter-remarks-wrapper">
            {filterRemarks !== "all" ? (
              <div className="h-8 w-[180px] text-xs rounded-md border border-input bg-background px-2 flex items-center gap-1">
                <span className="truncate flex-1">{filterRemarks}</span>
                <button onClick={() => { setFilterRemarks("all"); setFilterRemarksSearch(""); }} className="shrink-0" data-testid="button-clear-filter-remarks"><X className="w-3 h-3" /></button>
              </div>
            ) : (
              <>
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
                <input
                  value={filterRemarksSearch}
                  onChange={(e) => { setFilterRemarksSearch(e.target.value); setFilterRemarksOpen(true); }}
                  onFocus={() => setFilterRemarksOpen(true)}
                  onBlur={() => setTimeout(() => setFilterRemarksOpen(false), 200)}
                  placeholder="Remarks: Search..."
                  className="h-8 w-[180px] text-xs rounded-md border border-input bg-background pl-7 pr-2"
                  data-testid="filter-remarks"
                />
                {filterRemarksOpen && filterRemarksResults(filterRemarksSearch).length > 0 && (
                  <div className="absolute z-50 w-[220px] mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                    {filterRemarksResults(filterRemarksSearch).map(remark => (
                      <button key={remark} className="flex items-center gap-1.5 px-3 py-2 text-xs w-full text-left hover:bg-accent" data-testid={`filter-remarks-opt-${remark}`}
                        onMouseDown={(e) => { e.preventDefault(); setFilterRemarks(remark); setFilterRemarksSearch(""); setFilterRemarksOpen(false); }}>
                        <span className="truncate">{remark}</span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
          <select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="h-8 w-[90px] text-xs rounded-md border border-input bg-background px-2" data-testid="filter-month">
            <option value="all">All</option>
            {MONTHS.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
          </select>
          <select value={filterYear} onChange={(e) => setFilterYear(e.target.value)} className="h-8 w-[80px] text-xs rounded-md border border-input bg-background px-2" data-testid="filter-year">
            {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-destructive hover:text-destructive" onClick={clearAllFilters} data-testid="button-remove-filters">
              <X className="w-3.5 h-3.5 mr-1" />
              Remove Filter
            </Button>
          )}
        </div>
        {hasActiveFilters && (
          <div className="flex items-center gap-3 mt-2 pt-2 border-t border-border/50 text-xs">
            {filteredTotals.totalInflow > 0 && (
              <span className="font-semibold text-green-600">Total Inflow: ₹{filteredTotals.totalInflow.toLocaleString("en-IN")}</span>
            )}
            {filteredTotals.totalOutflow > 0 && (
              <span className="font-semibold text-red-600">Total Outflow: ₹{filteredTotals.totalOutflow.toLocaleString("en-IN")}</span>
            )}
            {filteredTotals.totalInflow === 0 && filteredTotals.totalOutflow === 0 && (
              <span className="text-muted-foreground">No matching entries</span>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-muted/40 rounded-xl p-3 space-y-3">
          <div className="flex gap-1 border-b pb-2">
            <Button
              variant={activeTab === "inward" ? "default" : "ghost"}
              size="sm" className="text-xs h-8 flex-1"
              onClick={() => setActiveTab("inward")}
              data-testid="tab-inward"
            >
              <ArrowDownLeft className="w-3.5 h-3.5 mr-1" />
              {t("cash.inwardCash")}
            </Button>
            <Button
              variant={activeTab === "outward" ? "default" : "ghost"}
              size="sm" className="text-xs h-8 flex-1"
              onClick={() => setActiveTab("outward")}
              data-testid="tab-outward"
            >
              <ArrowUpRight className="w-3.5 h-3.5 mr-1" />
              {t("cash.outwardCash")}
            </Button>
            <Button
              variant={activeTab === "transfer" ? "default" : "ghost"}
              size="sm" className="text-xs h-8 flex-1"
              onClick={() => setActiveTab("transfer")}
              data-testid="tab-transfer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 mr-1" />
              {t("cash.transfer")}
            </Button>
          </div>

          {activeTab === "inward" && (
            <div className="space-y-3 p-3 bg-background rounded-lg">
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.paymentMode")}</Label>
                {hasBankAccounts ? (
                  <Select value={inwardPaymentMode} onValueChange={setInwardPaymentMode}>
                    <SelectTrigger className="h-9 text-sm" data-testid="inward-payment-mode"><SelectValue /></SelectTrigger>
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
              {inwardPaymentMode !== "Cash" && hasBankAccounts && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("cash.selectAccount")}</Label>
                  <Select value={inwardBankAccountId} onValueChange={setInwardBankAccountId}>
                    <SelectTrigger className="h-9 text-sm" data-testid="inward-bank-account"><SelectValue placeholder={t("cash.selectAccount")} /></SelectTrigger>
                    <SelectContent>
                      {bankAccountsList.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.partyType")}</Label>
                <Select value={inwardPartyType} onValueChange={setInwardPartyType}>
                  <SelectTrigger className="h-9 text-sm" data-testid="inward-party-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Buyer">{t("cash.buyer")}</SelectItem>
                    <SelectItem value="Others">{t("cash.others")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {inwardPartyType === "Buyer" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("cash.buyerWithDues")}</Label>
                  <Select value={inwardBuyerId} onValueChange={setInwardBuyerId}>
                    <SelectTrigger className="h-9 text-sm" data-testid="inward-buyer"><SelectValue placeholder={t("cash.selectBuyer")} /></SelectTrigger>
                    <SelectContent>
                      {buyersWithDues.filter(b => parseFloat(b.overallDue) > 0).map(b => (
                        <SelectItem key={b.id} value={b.id.toString()}>
                          {b.name} - Due: ₹{parseFloat(b.overallDue).toLocaleString("en-IN")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.amount")}</Label>
                <Input type="number" inputMode="decimal" value={inwardAmount} onChange={e => setInwardAmount(e.target.value)} onFocus={e => e.target.select()} placeholder="0" className="h-9 text-sm" data-testid="inward-amount" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.paidOn")}</Label>
                <Input type="date" value={inwardDate} onChange={e => setInwardDate(e.target.value)} className="h-9 text-sm" data-testid="inward-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.remarks")}</Label>
                <Input value={inwardNotes} onChange={e => setInwardNotes(e.target.value)} placeholder={t("cash.remarksPlaceholder")} className="h-9 text-sm" data-testid="inward-notes" />
              </div>
              <Button className="w-full h-9 text-sm" onClick={submitInward} disabled={createMutation.isPending} data-testid="button-submit-inward">
                {createMutation.isPending ? t("common.saving") : t("cash.submit")}
              </Button>
            </div>
          )}

          {activeTab === "outward" && (
            <div className="space-y-3 p-3 bg-background rounded-lg">
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.paymentMode")}</Label>
                {hasBankAccounts ? (
                  <Select value={outwardPaymentMode} onValueChange={setOutwardPaymentMode}>
                    <SelectTrigger className="h-9 text-sm" data-testid="outward-payment-mode"><SelectValue /></SelectTrigger>
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
              {outwardPaymentMode !== "Cash" && hasBankAccounts && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("cash.selectAccount")}</Label>
                  <Select value={outwardBankAccountId} onValueChange={setOutwardBankAccountId}>
                    <SelectTrigger className="h-9 text-sm" data-testid="outward-bank-account"><SelectValue placeholder={t("cash.selectAccount")} /></SelectTrigger>
                    <SelectContent>
                      {bankAccountsList.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.outflowType")}</Label>
                <Select value={outwardOutflowType} onValueChange={setOutwardOutflowType}>
                  <SelectTrigger className="h-9 text-sm" data-testid="outward-outflow-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {OUTFLOW_TYPES.map(type => {
                      const hint = getOutflowHint(type);
                      return (
                        <SelectItem key={type} value={type}>
                          {type}{hint ? ` (${hint})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              {outwardOutflowType === "Salary" && (
                <div className="space-y-1">
                  <Label className="text-xs">Receiver Name</Label>
                  <Input value={outwardReceiverName} onChange={e => setOutwardReceiverName(e.target.value)} placeholder="Enter receiver name" className="h-9 text-sm" data-testid="outward-receiver-name" />
                </div>
              )}
              {(outwardOutflowType === "Farmer-Advance" || outwardOutflowType === "Farmer-Harvest Sale") && (
                <div className="space-y-1">
                  <Label className="text-xs">{outwardOutflowType === "Farmer-Advance" ? t("cash.farmer") : t("cash.farmerWithDues")}</Label>
                  <div className="relative">
                    {outwardFarmerId ? (
                      <div className="h-9 text-sm rounded-md border border-input bg-background px-3 flex items-center gap-2">
                        <span className="truncate flex-1" data-testid="text-outward-farmer-selected">
                          {(() => { const f = farmersWithDues.find(f => f.id === parseInt(outwardFarmerId)); return f ? (parseFloat(f.totalDue) > 0 ? `${f.name} - Due: ₹${parseFloat(f.totalDue).toLocaleString("en-IN")}` : f.name) : ""; })()}
                        </span>
                        <button onClick={() => { setOutwardFarmerId(""); setOutwardFarmerSearch(""); }} className="shrink-0" data-testid="button-clear-outward-farmer"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ) : (
                      <>
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <Input
                          value={outwardFarmerSearch}
                          onChange={(e) => { setOutwardFarmerSearch(e.target.value); setOutwardFarmerOpen(true); }}
                          onFocus={() => setOutwardFarmerOpen(true)}
                          onBlur={() => setTimeout(() => setOutwardFarmerOpen(false), 200)}
                          placeholder={t("cash.selectFarmer")}
                          className="h-9 text-sm pl-8"
                          data-testid="outward-farmer"
                        />
                        {outwardFarmerOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                            {(() => {
                              const isAdvance = outwardOutflowType === "Farmer-Advance";
                              const farmerList = isAdvance
                                ? farmersWithDues.filter(f => !f.isArchived).sort((a, b) => a.name.localeCompare(b.name))
                                : farmersWithDues.filter(f => !f.isArchived && parseFloat(f.totalDue) > 0).sort((a, b) => a.name.localeCompare(b.name));
                              const list = outwardFarmerSearch
                                ? farmerList.filter(f => {
                                    const q = outwardFarmerSearch.toLowerCase();
                                    return f.name.toLowerCase().includes(q) || f.phone.includes(q) || (f.village || "").toLowerCase().includes(q);
                                  }).slice(0, 20)
                                : farmerList.slice(0, 20);
                              return list.length > 0 ? list.map(f => (
                                <button key={f.id} className="flex items-center gap-1.5 px-3 py-2 text-sm w-full text-left hover:bg-accent" data-testid={`outward-farmer-opt-${f.id}`}
                                  onMouseDown={(e) => { e.preventDefault(); setOutwardFarmerId(f.id.toString()); setOutwardFarmerSearch(""); setOutwardFarmerOpen(false); }}>
                                  <span className="font-medium">{f.name}</span>
                                  <span className="text-muted-foreground text-xs">{f.phone}</span>
                                  {f.village && <span className="text-muted-foreground text-xs">({f.village})</span>}
                                  {parseFloat(f.totalDue) > 0 && <span className="ml-auto text-xs text-orange-600">Due: ₹{parseFloat(f.totalDue).toLocaleString("en-IN")}</span>}
                                </button>
                              )) : (
                                <div className="px-3 py-2 text-xs text-muted-foreground" data-testid="status-outward-farmer-empty">{outwardFarmerSearch ? "No farmers found" : isAdvance ? "No farmers found" : "No farmers with dues"}</div>
                              );
                            })()}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              {outwardOutflowType === "Hammali" && dueHammali > 0 && (
                <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded text-xs text-amber-700 dark:text-amber-300">
                  Total Hammali from Transactions: ₹{(txAggregates?.totalHammali || 0).toLocaleString("en-IN")} | Paid: ₹{(txAggregates?.paidHammali || 0).toLocaleString("en-IN")} | <span className="font-bold">Due: ₹{dueHammali.toLocaleString("en-IN")}</span>
                </div>
              )}
              {outwardOutflowType === "Mandi Commission" && dueMandi > 0 && (
                <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded text-xs text-amber-700 dark:text-amber-300">
                  Total Mandi Commission: ₹{(txAggregates?.totalMandiCommission || 0).toLocaleString("en-IN")} | Paid: ₹{(txAggregates?.paidMandiCommission || 0).toLocaleString("en-IN")} | <span className="font-bold">Due: ₹{dueMandi.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.amount")}</Label>
                <Input type="number" inputMode="decimal" value={outwardAmount} onChange={e => setOutwardAmount(e.target.value)} onFocus={e => e.target.select()} placeholder="0" className="h-9 text-sm" data-testid="outward-amount" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.paidOn")}</Label>
                <Input type="date" value={outwardDate} onChange={e => setOutwardDate(e.target.value)} className="h-9 text-sm" data-testid="outward-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("cash.remarks")}</Label>
                <Input value={outwardNotes} onChange={e => setOutwardNotes(e.target.value)} placeholder={t("cash.remarksPlaceholder")} className="h-9 text-sm" data-testid="outward-notes" />
              </div>
              <Button className="w-full h-9 text-sm" onClick={submitOutward} disabled={createMutation.isPending} data-testid="button-submit-outward">
                {createMutation.isPending ? t("common.saving") : t("cash.submit")}
              </Button>
            </div>
          )}

          {activeTab === "transfer" && (
            <div className="space-y-3 p-3 bg-background rounded-lg">
              {!hasBankAccounts ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  <p>{t("cash.addBankFirst")}</p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={() => {
                    setCashInHandOpening(cashSettingsData?.cashInHandOpening || "0");
                    setSettingsOpen(true);
                  }}>
                    <Settings className="w-3.5 h-3.5 mr-1" />
                    {t("cash.openSettings")}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("cash.from")}</Label>
                    <Select value={transferFromType} onValueChange={(v) => { setTransferFromType(v); setTransferToType(v === "cash" ? "account" : "cash"); }}>
                      <SelectTrigger className="h-9 text-sm" data-testid="transfer-from-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="account">Bank Account</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {transferFromType === "account" && (
                    <div className="space-y-1">
                      <Label className="text-xs">{t("cash.fromAccount")}</Label>
                      <Select value={transferFromAccountId} onValueChange={setTransferFromAccountId}>
                        <SelectTrigger className="h-9 text-sm" data-testid="transfer-from-account"><SelectValue placeholder={t("cash.selectAccount")} /></SelectTrigger>
                        <SelectContent>
                          {bankAccountsList.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">{t("cash.to")}</Label>
                    <Input value={transferToType === "cash" ? "Cash" : "Bank Account"} readOnly className="h-9 text-sm bg-muted" />
                  </div>
                  {transferToType === "account" && (
                    <div className="space-y-1">
                      <Label className="text-xs">{t("cash.toAccount")}</Label>
                      <Select value={transferToAccountId} onValueChange={setTransferToAccountId}>
                        <SelectTrigger className="h-9 text-sm" data-testid="transfer-to-account"><SelectValue placeholder={t("cash.selectAccount")} /></SelectTrigger>
                        <SelectContent>
                          {bankAccountsList.map(a => <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="space-y-1">
                    <Label className="text-xs">{t("cash.amount")}</Label>
                    <Input type="number" inputMode="decimal" value={transferAmount} onChange={e => setTransferAmount(e.target.value)} onFocus={e => e.target.select()} placeholder="0" className="h-9 text-sm" data-testid="transfer-amount" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("common.date")}</Label>
                    <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="h-9 text-sm" data-testid="transfer-date" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("cash.remarks")}</Label>
                    <Input value={transferNotes} onChange={e => setTransferNotes(e.target.value)} placeholder={t("cash.remarksPlaceholder")} className="h-9 text-sm" data-testid="transfer-notes" />
                  </div>
                  <Button className="w-full h-9 text-sm" onClick={submitTransfer} disabled={createMutation.isPending} data-testid="button-submit-transfer">
                    {createMutation.isPending ? t("common.saving") : t("cash.submit")}
                  </Button>
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-muted/40 rounded-xl p-3 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <h2 className="text-sm font-semibold">{t("cash.cashFlowHistory")}</h2>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={downloadCSV} data-testid="button-download-csv">
              <Download className="w-4 h-4" />
            </Button>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">{t("app.loading")}</div>
          ) : filteredEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">{t("cash.noEntries")}</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {filteredEntries.map(entry => (
                <Card
                  key={entry.id}
                  className={`cursor-pointer transition-opacity ${entry.isReversed ? "opacity-40" : ""}`}
                  onClick={() => setDetailEntry(entry)}
                  data-testid={`cash-entry-${entry.id}`}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 mb-1">
                          <span className="text-sm font-medium">
                            {entry.category === "inward" ? "↙" : entry.category === "outward" ? "↗" : "⇄"} {getEntryLabel(entry)}
                          </span>
                          {getCategoryBadge(entry)}
                          {entry.isReversed && <Badge variant="destructive" className="text-[10px]">Reversed</Badge>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{entry.date}</span>
                          <Badge variant="outline" className="text-[10px] h-4">{entry.paymentMode}</Badge>
                          {entry.outflowType && entry.category === "outward" && (
                            <span className="text-muted-foreground">{entry.outflowType}</span>
                          )}
                          {entry.isReversed && entry.reversedAt && (
                            <span>Reversed on {format(new Date(entry.reversedAt), "dd/MM/yyyy")}</span>
                          )}
                          {entry.notes && <span className="truncate max-w-[150px]">{entry.notes}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-sm font-bold whitespace-nowrap ${entry.category === "outward" || entry.category === "transfer" ? "text-orange-600" : "text-green-600"}`}>
                          {entry.category === "outward" ? "-" : entry.category === "inward" ? "+" : ""}₹{parseFloat(entry.amount).toLocaleString("en-IN")}
                        </span>
                        {!entry.isReversed && (
                          <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(ev) => { ev.stopPropagation(); setReverseConfirmEntry(entry); }} data-testid={`reverse-entry-${entry.id}`}>
                            <RotateCcw className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("cash.entryDetails")}</DialogTitle>
          </DialogHeader>
          {detailEntry && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Cash Flow ID</span><span className="font-medium">{detailEntry.cashFlowId || "N/A"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("common.date")}</span><span>{detailEntry.date}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.category")}</span>{getCategoryBadge(detailEntry)}</div>
              {detailEntry.outflowType && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.outflowType")}</span><span>{detailEntry.outflowType}</span></div>}
              {detailEntry.partyName && <div className="flex justify-between"><span className="text-muted-foreground">Receiver</span><span>{detailEntry.partyName}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.amount")}</span><span className="font-bold">₹{parseFloat(detailEntry.amount).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.paymentMode")}</span><span>{detailEntry.paymentMode}</span></div>
              {detailEntry.bankAccountId && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.bankAccount")}</span><span>{getAccountName(detailEntry.bankAccountId)}</span></div>}
              {detailEntry.buyerId && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.buyer")}</span><span>{getBuyerName(detailEntry.buyerId)}</span></div>}
              {detailEntry.farmerId && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.farmer")}</span><span>{getFarmerName(detailEntry.farmerId)}</span></div>}
              {detailEntry.notes && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.remarks")}</span><span>{detailEntry.notes}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{detailEntry.isReversed ? "Reversed" : "Active"}</span></div>
              {!detailEntry.isReversed && detailEntry.paymentMode === "Cheque" && (
                <Button variant="destructive" size="sm" className="w-full mt-2" onClick={() => { setChequeBounceEntry(detailEntry); setDetailEntry(null); }} data-testid="button-cheque-bounced">
                  Cheque Bounced
                </Button>
              )}
              {!detailEntry.isReversed && (
                <Button variant="outline" size="sm" className="w-full" onClick={() => { setReverseConfirmEntry(detailEntry); setDetailEntry(null); }} data-testid="button-reverse-from-detail">
                  {t("cash.reverseEntry")}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!reverseConfirmEntry} onOpenChange={() => setReverseConfirmEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cash.reverseEntry")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cash.reverseConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => reverseConfirmEntry && reverseMutation.mutate({ id: reverseConfirmEntry.id })}>
              {t("cash.reverse")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!chequeBounceEntry} onOpenChange={() => setChequeBounceEntry(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cheque Bounced</AlertDialogTitle>
            <AlertDialogDescription>
              This will reverse the entry and mark it as "Cheque Bounced". The bank account balance will be adjusted accordingly. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => chequeBounceEntry && reverseMutation.mutate({ id: chequeBounceEntry.id, reason: "Cheque Bounced" })} data-testid="button-confirm-cheque-bounced">
              Confirm Cheque Bounced
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("cash.settings")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t("cash.cashInHandOpening")}</Label>
              <div className="flex gap-2">
                <Input
                  type="number" inputMode="decimal"
                  value={cashInHandOpening}
                  onChange={e => setCashInHandOpening(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="0"
                  className="h-9 text-sm"
                  data-testid="input-cash-opening"
                />
                <Button size="sm" className="h-9" onClick={() => saveCashSettingsMutation.mutate(cashInHandOpening)} data-testid="button-save-opening">
                  {t("common.save")}
                </Button>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <Label className="text-sm font-medium">{t("cash.bankAccounts")}</Label>
              {bankAccountsList.map(account => (
                <div key={account.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{account.name}</p>
                    <p className="text-xs text-muted-foreground">{account.accountType} • Opening: ₹{parseFloat(account.openingBalance || "0").toLocaleString("en-IN")}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setDeleteAccountId(account.id)} data-testid={`delete-bank-${account.id}`}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}

              <div className="space-y-2 border rounded-lg p-3">
                <p className="text-xs font-medium">{t("cash.addBankAccount")}</p>
                <Input
                  value={newBankName}
                  onChange={e => setNewBankName(e.target.value)}
                  placeholder="e.g. SBI-Limit-#3545643843"
                  className="h-9 text-sm"
                  data-testid="input-bank-name"
                />
                <Select value={newBankType} onValueChange={setNewBankType}>
                  <SelectTrigger className="h-9 text-sm" data-testid="select-bank-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Limit">Limit</SelectItem>
                    <SelectItem value="Current">Current</SelectItem>
                    <SelectItem value="Saving">Saving</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number" inputMode="decimal"
                  value={newBankBalance}
                  onChange={e => setNewBankBalance(e.target.value)}
                  onFocus={e => e.target.select()}
                  placeholder="Opening Balance"
                  className="h-9 text-sm"
                  data-testid="input-bank-opening"
                />
                <Button
                  size="sm" className="w-full h-9"
                  disabled={!newBankName || createBankMutation.isPending}
                  onClick={() => createBankMutation.mutate({ name: newBankName, accountType: newBankType, openingBalance: newBankBalance || "0" })}
                  data-testid="button-add-bank"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {t("cash.addAccount")}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteAccountId} onOpenChange={() => setDeleteAccountId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cash.deleteAccount")}</AlertDialogTitle>
            <AlertDialogDescription>{t("cash.deleteAccountConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={() => deleteAccountId && deleteBankMutation.mutate(deleteAccountId)}>
              {t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
