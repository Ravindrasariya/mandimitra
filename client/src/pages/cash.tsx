import { useState, useMemo, useRef, useEffect } from "react";
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
import { ASSET_CATEGORIES, ASSET_DEPRECIATION_RATES } from "@shared/schema";
import { Wallet, Settings, ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Download, RotateCcw, Trash2, Plus, Filter, X, Search, ChevronsUpDown, Pencil, Check, Save } from "lucide-react";
import { format } from "date-fns";

type BuyerWithDues = Buyer & { receivableDue: string; overallDue: string };
type FarmerWithDues = Farmer & { totalPayable: string; totalDue: string; salesCount: number };
type TransactionAggregates = {
  totalHammali: number; totalExtraCharges: number; totalMandiCommission: number;
  paidHammali: number; paidExtraCharges: number; paidMandiCommission: number;
};

const OUTFLOW_TYPES = [
  "Farmer-Advance",
  "Farmer-Harvest Sale",
  "Extra Charges",
  "General Expenses",
  "Hammali",
  "Mandi Commission",
  "Salary",
  "Interest Payment on Loan/LOC",
] as const;

export default function CashPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const now = new Date();
  const [activeTab, setActiveTab] = usePersistedState<"inward" | "outward" | "transfer">("cash-activeTab", "inward");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [detailEntry, setDetailEntry] = useState<CashEntry | null>(null);
  const [detailEntryGroup, setDetailEntryGroup] = useState<CashEntry[]>([]);
  const [reverseConfirmEntry, setReverseConfirmEntry] = useState<CashEntry | null>(null);
  const [chequeBounceEntry, setChequeBounceEntry] = useState<CashEntry | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<number | null>(null);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editAccountData, setEditAccountData] = useState({ name: "", accountType: "Current", openingBalance: "0" });

  const [filterCategory, setFilterCategory] = usePersistedState("cash-filterCategory", "all");
  const [filterPaymentMode, setFilterPaymentMode] = usePersistedState("cash-filterPayMode", "all");
  const [filterOutflowType, setFilterOutflowType] = usePersistedState("cash-filterOutflow", "all");
  const [filterBuyer, setFilterBuyer] = usePersistedState("cash-filterBuyer", "all");
  const [filterFarmer, setFilterFarmer] = usePersistedState("cash-filterFarmer", "all");
  const [filterRemarks, setFilterRemarks] = usePersistedState("cash-filterRemarks", "all");
  const [filterMonth, setFilterMonth] = usePersistedState("cash-filterMonth", "all");
  const [filterYear, setFilterYear] = usePersistedState("cash-filterYear", String(now.getFullYear()));

  const [inwardPartyType, setInwardPartyType, clearInwardPartyType] = usePersistedState("cash-inwardPartyType", "Buyer");
  const [inwardBuyerId, setInwardBuyerId, clearInwardBuyerId] = usePersistedState("cash-inwardBuyerId", "");
  const [inwardAmount, setInwardAmount, clearInwardAmount] = usePersistedState("cash-inwardAmount", "");
  const [inwardDate, setInwardDate, clearInwardDate] = usePersistedState("cash-inwardDate", format(now, "yyyy-MM-dd"));
  const [inwardPaymentMode, setInwardPaymentMode, clearInwardPaymentMode] = usePersistedState("cash-inwardPaymentMode", "Cash");
  const [inwardBankAccountId, setInwardBankAccountId, clearInwardBankAccountId] = usePersistedState("cash-inwardBankAccountId", "");
  const [inwardNotes, setInwardNotes, clearInwardNotes] = usePersistedState("cash-inwardNotes", "");
  const [inwardAllocations, setInwardAllocations, clearInwardAllocations] = usePersistedState<{ txnId: number | null; txnLabel: string; serialNumber: number; date: string; numberOfBags: number; crop: string; due: number; dueDays: number; amount: string; discountPercent: string; pettyAdj: string }[]>("cash-inwardAllocations", []);
  const [allocationSearch, setAllocationSearch] = useState("");
  const [allocationDropdownOpen, setAllocationDropdownOpen] = useState(false);
  const allocationDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (allocationDropdownRef.current && !allocationDropdownRef.current.contains(e.target as Node)) {
        setAllocationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [outwardOutflowType, setOutwardOutflowType, clearOutwardOutflowType] = usePersistedState<string>("cash-outwardOutflowType", "Farmer-Advance");
  const [outwardFarmerId, setOutwardFarmerId, clearOutwardFarmerId] = usePersistedState("cash-outwardFarmerId", "");
  const [outwardAmount, setOutwardAmount, clearOutwardAmount] = usePersistedState("cash-outwardAmount", "");
  const [outwardDate, setOutwardDate, clearOutwardDate] = usePersistedState("cash-outwardDate", format(now, "yyyy-MM-dd"));
  const [outwardPaymentMode, setOutwardPaymentMode, clearOutwardPaymentMode] = usePersistedState("cash-outwardPaymentMode", "Cash");
  const [outwardBankAccountId, setOutwardBankAccountId, clearOutwardBankAccountId] = usePersistedState("cash-outwardBankAccountId", "");
  const [outwardNotes, setOutwardNotes, clearOutwardNotes] = usePersistedState("cash-outwardNotes", "");
  const [farmerAllocations, setFarmerAllocations, clearFarmerAllocations] = usePersistedState<{ groupKey: string; txnLabel: string; serialNumber: number; date: string; numberOfBags: number; crops: string; due: number; amount: string; transactionIds: { id: number; due: number }[] }[]>("cash-farmerAllocations", []);
  const [farmerAllocationSearch, setFarmerAllocationSearch] = useState("");
  const [farmerAllocationDropdownOpen, setFarmerAllocationDropdownOpen] = useState(false);
  const farmerAllocationDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (farmerAllocationDropdownRef.current && !farmerAllocationDropdownRef.current.contains(e.target as Node)) {
        setFarmerAllocationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [transferFromType, setTransferFromType, clearTransferFromType] = usePersistedState("cash-transferFromType", "cash");
  const [transferFromAccountId, setTransferFromAccountId, clearTransferFromAccountId] = usePersistedState("cash-transferFromAccountId", "");
  const [transferToType, setTransferToType, clearTransferToType] = usePersistedState("cash-transferToType", "account");
  const [transferToAccountId, setTransferToAccountId, clearTransferToAccountId] = usePersistedState("cash-transferToAccountId", "");
  const [transferAmount, setTransferAmount, clearTransferAmount] = usePersistedState("cash-transferAmount", "");
  const [transferDate, setTransferDate, clearTransferDate] = usePersistedState("cash-transferDate", format(now, "yyyy-MM-dd"));
  const [transferNotes, setTransferNotes, clearTransferNotes] = usePersistedState("cash-transferNotes", "");

  const [filterFarmerSearch, setFilterFarmerSearch] = useState("");
  const [filterFarmerOpen, setFilterFarmerOpen] = useState(false);
  const [filterRemarksSearch, setFilterRemarksSearch] = useState("");
  const [filterRemarksOpen, setFilterRemarksOpen] = useState(false);
  const [outwardReceiverName, setOutwardReceiverName, clearOutwardReceiverName] = usePersistedState("cash-outwardReceiverName", "");
  const [outwardFarmerSearch, setOutwardFarmerSearch] = useState("");
  const [outwardFarmerOpen, setOutwardFarmerOpen] = useState(false);

  const [expenseCategory, setExpenseCategory, clearExpenseCategory] = usePersistedState<"revenue" | "capital">("cash-expenseCategory", "revenue");
  const [capitalAssetName, setCapitalAssetName, clearCapitalAssetName] = usePersistedState("cash-capitalAssetName", "");
  const [capitalCategory, setCapitalCategory, clearCapitalCategory] = usePersistedState("cash-capitalCategory", "");
  const [capitalDepRate, setCapitalDepRate, clearCapitalDepRate] = usePersistedState("cash-capitalDepRate", "");
  const [capitalAmount, setCapitalAmount, clearCapitalAmount] = usePersistedState("cash-capitalAmount", "");
  const [capitalDate, setCapitalDate, clearCapitalDate] = usePersistedState("cash-capitalDate", format(now, "yyyy-MM-dd"));
  const [capitalRemarks, setCapitalRemarks, clearCapitalRemarks] = usePersistedState("cash-capitalRemarks", "");

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

  type PendingTxn = { id: number; transactionId: string; serialNumber: number; date: string; numberOfBags: number; crop: string; totalReceivableFromBuyer: string; paidAmount: string; due: string; bidCreatedAt: string };
  const { data: pendingTransactions = [] } = useQuery<PendingTxn[]>({
    queryKey: ["/api/buyers", inwardBuyerId, "pending-transactions"],
    queryFn: () => inwardBuyerId ? fetch(`/api/buyers/${inwardBuyerId}/pending-transactions`, { credentials: "include" }).then(r => r.json()) : Promise.resolve([]),
    enabled: inwardPartyType === "Buyer" && !!inwardBuyerId,
  });

  type FarmerPendingTxn = { groupKey: string; serialNumber: number; date: string; numberOfBags: number; crops: string; totalPayableToFarmer: string; farmerPaidAmount: string; due: string; transactionIds: { id: number; due: number }[] };
  const { data: farmerPendingTransactions = [] } = useQuery<FarmerPendingTxn[]>({
    queryKey: ["/api/farmers", outwardFarmerId, "pending-transactions"],
    queryFn: () => outwardFarmerId ? fetch(`/api/farmers/${outwardFarmerId}/pending-transactions`, { credentials: "include" }).then(r => r.json()) : Promise.resolve([]),
    enabled: outwardOutflowType === "Farmer-Harvest Sale" && !!outwardFarmerId,
  });

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

  type EntryGroup = { key: string; representative: CashEntry; entries: CashEntry[]; totalAmount: number; isReversed: boolean; };
  const groupedEntries = useMemo<EntryGroup[]>(() => {
    const map = new Map<string, CashEntry[]>();
    for (const e of filteredEntries) {
      const key = e.cashFlowId || `solo-${e.id}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.values()).map(entries => ({
      key: entries[0].cashFlowId || `solo-${entries[0].id}`,
      representative: entries[0],
      entries,
      totalAmount: entries.reduce((s, e) => s + parseFloat(e.amount || "0"), 0),
      isReversed: entries.every(e => e.isReversed),
    }));
  }, [filteredEntries]);

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
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/farmers");
    }});
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

  const updateBankMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/bank-accounts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      setEditingAccountId(null);
      toast({ title: t("common.saved"), variant: "success" });
    },
  });

  const capitalExpenseMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/capital-expense", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0] as string;
        return key?.startsWith("/api/cash-entries") || key === "/api/assets" || key?.startsWith("/api/books/");
      }});
      clearCapitalAssetName();
      clearCapitalCategory();
      clearCapitalDepRate();
      clearCapitalAmount();
      clearCapitalDate();
      clearCapitalRemarks();
      toast({ title: t("common.saved"), variant: "success" });
    },
  });

  const submitCapitalExpense = () => {
    if (!capitalAssetName.trim()) {
      toast({ title: t("common.error"), description: "Enter asset name", variant: "destructive" });
      return;
    }
    if (!capitalCategory) {
      toast({ title: t("common.error"), description: "Select a category", variant: "destructive" });
      return;
    }
    if (!capitalAmount || parseFloat(capitalAmount) <= 0) {
      toast({ title: t("common.error"), description: "Enter valid amount", variant: "destructive" });
      return;
    }
    if (outwardPaymentMode !== "Cash" && !outwardBankAccountId) {
      toast({ title: t("common.error"), description: "Select bank account", variant: "destructive" });
      return;
    }
    capitalExpenseMutation.mutate({
      assetName: capitalAssetName.trim(),
      category: capitalCategory,
      depreciationRate: capitalDepRate || "10",
      amount: capitalAmount,
      date: capitalDate,
      paymentMode: outwardPaymentMode,
      bankAccountId: outwardPaymentMode !== "Cash" ? parseInt(outwardBankAccountId) : null,
      remarks: capitalRemarks || null,
    });
  };

  const clearInwardForm = () => {
    clearInwardAmount();
    clearInwardNotes();
    clearInwardBuyerId();
    clearInwardAllocations();
    clearInwardBankAccountId();
    setAllocationSearch("");
  };

  const clearOutwardForm = () => {
    clearOutwardAmount();
    clearOutwardNotes();
    clearOutwardFarmerId();
    clearOutwardReceiverName();
    clearFarmerAllocations();
    clearOutwardBankAccountId();
    setFarmerAllocationSearch("");
  };

  const clearTransferForm = () => {
    clearTransferAmount();
    clearTransferNotes();
    clearTransferFromAccountId();
    clearTransferToAccountId();
  };

  const submitInward = () => {
    if (inwardPartyType === "Buyer" && !inwardBuyerId) {
      toast({ title: t("common.error"), description: "Select a buyer", variant: "destructive" });
      return;
    }
    if (inwardPaymentMode !== "Cash" && !inwardBankAccountId) {
      toast({ title: t("common.error"), description: "Select bank account", variant: "destructive" });
      return;
    }
    if (inwardPartyType === "Buyer" && inwardAllocations.length > 0) {
      if (!inwardAmount || parseFloat(inwardAmount) <= 0) {
        toast({ title: t("common.error"), description: "Enter the total amount received", variant: "destructive" });
        return;
      }
      const hasInvalidAmount = inwardAllocations.some(a => !a.amount || parseFloat(a.amount) < 0);
      if (hasInvalidAmount) {
        toast({ title: t("common.error"), description: "Enter valid amounts for all allocations", variant: "destructive" });
        return;
      }
      const hasNegativeValues = inwardAllocations.some(a => parseFloat(a.discountPercent || "0") < 0 || parseFloat(a.pettyAdj || "0") < 0);
      if (hasNegativeValues) {
        toast({ title: t("common.error"), description: "Discount % and Petty Adj cannot be negative", variant: "destructive" });
        return;
      }
      const overAllocated = inwardAllocations.some(a => {
        const discountAmt = (parseFloat(a.discountPercent || "0") / 100) * a.due;
        const total = parseFloat(a.amount || "0") + discountAmt + parseFloat(a.pettyAdj || "0");
        return total > a.due + 0.01;
      });
      if (overAllocated) {
        toast({ title: t("common.error"), description: "Amount + Discount + Petty Adj cannot exceed due amount for any transaction", variant: "destructive" });
        return;
      }
      const totalAllocated = inwardAllocations.reduce((sum, a) => sum + parseFloat(a.amount || "0"), 0);
      const totalReceived = parseFloat(inwardAmount);
      if (Math.abs(totalAllocated - totalReceived) > 0.01) {
        toast({ title: t("common.error"), description: `Allocated amount (₹${totalAllocated.toLocaleString("en-IN")}) must equal received amount (₹${totalReceived.toLocaleString("en-IN")})`, variant: "destructive" });
        return;
      }
      const buildSplitLog = () => {
        if (inwardAllocations.length <= 1) return null;
        const getLabel = (a: typeof inwardAllocations[0]) => a.txnId === null ? "PY" : `SR#${a.serialNumber}`;
        const items = inwardAllocations.map(a => {
          const discAmt = (parseFloat(a.discountPercent || "0") / 100) * a.due;
          return {
            label: getLabel(a),
            amount: parseFloat(a.amount || "0").toFixed(2),
            discountPct: a.discountPercent || "0",
            discountAmt: discAmt.toFixed(2),
            pettyAdj: parseFloat(a.pettyAdj || "0").toFixed(2),
          };
        });
        return JSON.stringify(items);
      };
      createMutation.mutate({
        category: "inward",
        type: "cash_in",
        outflowType: "Buyer",
        buyerId: parseInt(inwardBuyerId),
        amount: inwardAmount,
        date: inwardDate,
        paymentMode: inwardPaymentMode,
        bankAccountId: inwardPaymentMode !== "Cash" ? parseInt(inwardBankAccountId) : null,
        notes: inwardNotes || null,
        splitLog: buildSplitLog(),
        allocations: inwardAllocations.map(a => ({
          transactionId: a.txnId,
          amount: a.amount || "0",
          discount: ((parseFloat(a.discountPercent || "0") / 100) * a.due).toFixed(2),
          pettyAdj: a.pettyAdj || "0",
        })),
      }, { onSuccess: clearInwardForm });
    } else if (inwardPartyType === "Buyer") {
      toast({ title: t("common.error"), description: "Select at least one transaction to allocate payment", variant: "destructive" });
      return;
    } else {
      if (!inwardAmount || parseFloat(inwardAmount) <= 0) {
        toast({ title: t("common.error"), description: "Enter valid amount", variant: "destructive" });
        return;
      }
      createMutation.mutate({
        category: "inward",
        type: "cash_in",
        outflowType: inwardPartyType,
        amount: inwardAmount,
        date: inwardDate,
        paymentMode: inwardPaymentMode,
        bankAccountId: inwardPaymentMode !== "Cash" ? parseInt(inwardBankAccountId) : null,
        notes: inwardNotes || null,
      }, { onSuccess: clearInwardForm });
    }
  };

  const submitOutward = () => {
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

    if (outwardOutflowType === "Farmer-Harvest Sale" && outwardFarmerId && farmerAllocations.length > 0) {
      if (!outwardAmount || parseFloat(outwardAmount) <= 0) {
        toast({ title: t("common.error"), description: "Enter the total amount paid", variant: "destructive" });
        return;
      }
      const hasInvalidAmount = farmerAllocations.some(a => !a.amount || parseFloat(a.amount) < 0);
      if (hasInvalidAmount) {
        toast({ title: t("common.error"), description: "Enter valid amounts for all allocations", variant: "destructive" });
        return;
      }
      const overAllocated = farmerAllocations.some(a => parseFloat(a.amount || "0") > a.due + 0.01);
      if (overAllocated) {
        toast({ title: t("common.error"), description: "Amount cannot exceed due for any transaction", variant: "destructive" });
        return;
      }
      const totalAllocated = farmerAllocations.reduce((sum, a) => sum + parseFloat(a.amount || "0"), 0);
      const totalPaid = parseFloat(outwardAmount);
      if (Math.abs(totalAllocated - totalPaid) > 0.01) {
        toast({ title: t("common.error"), description: `Allocated amount (₹${totalAllocated.toLocaleString("en-IN")}) must equal paid amount (₹${totalPaid.toLocaleString("en-IN")})`, variant: "destructive" });
        return;
      }
      const buildFarmerSplitLog = () => {
        if (farmerAllocations.length <= 1) return null;
        const items = farmerAllocations.map(a => ({
          label: a.txnLabel,
          amount: parseFloat(a.amount || "0").toFixed(2),
          discountPct: "0",
          discountAmt: "0.00",
          pettyAdj: "0.00",
        }));
        return JSON.stringify(items);
      };
      createMutation.mutate({
        category: "outward",
        type: "cash_out",
        outflowType: outwardOutflowType,
        farmerId: parseInt(outwardFarmerId),
        amount: outwardAmount,
        date: outwardDate,
        paymentMode: outwardPaymentMode,
        bankAccountId: outwardPaymentMode !== "Cash" ? parseInt(outwardBankAccountId) : null,
        notes: outwardNotes || null,
        splitLog: buildFarmerSplitLog(),
        allocations: farmerAllocations.map(a => ({
          transactionIds: a.transactionIds.length > 0 ? a.transactionIds : undefined,
          transactionId: a.transactionIds.length === 0 ? null : undefined,
          amount: a.amount || "0",
          discount: "0",
          pettyAdj: "0",
        })),
      }, { onSuccess: clearOutwardForm });
    } else if (outwardOutflowType === "Farmer-Harvest Sale" && outwardFarmerId) {
      toast({ title: t("common.error"), description: "Select at least one transaction to allocate payment", variant: "destructive" });
      return;
    } else {
      if (!outwardAmount || parseFloat(outwardAmount) <= 0) {
        toast({ title: t("common.error"), description: "Enter valid amount", variant: "destructive" });
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
      }, { onSuccess: clearOutwardForm });
    }
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
    }, { onSuccess: clearTransferForm });
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
    if (e.outflowType === "Capital Expense" && e.partyName) return `Capital - ${e.partyName}`;
    if (e.outflowType === "Others") return "General";
    return e.outflowType || "Entry";
  };

  const getCategoryBadge = (e: CashEntry) => {
    if (e.category === "inward") return <Badge className="text-[10px] bg-green-500">{t("cash.inward")}</Badge>;
    if (e.category === "outward") return <Badge className="text-[10px] bg-orange-500">{t("cash.outward")}</Badge>;
    return <Badge className="text-[10px] bg-blue-500">{t("cash.transfer")}</Badge>;
  };

  const downloadCSV = () => {
    const parseSplitLog = (log: string | null) => {
      if (!log) return null;
      try { return JSON.parse(log) as { label: string; amount: string; discountPct: string; discountAmt: string; pettyAdj: string }[]; } catch { return null; }
    };
    const rows = groupedEntries.map(group => {
      const e = group.representative;
      const splitLog = (e as any).splitLog as string | null;
      const splits = parseSplitLog(splitLog);
      const splitAmounts = splits ? splits.map(s => `${s.label}:${parseFloat(s.amount).toLocaleString("en-IN")}`).join(" | ") : "";
      const splitDisc = splits ? splits.map(s => `${s.label}:${s.discountPct}%`).join(" | ") : "";
      const splitPetty = splits ? splits.map(s => `${s.label}:${parseFloat(s.pettyAdj).toLocaleString("en-IN")}`).join(" | ") : "";
      return {
        "Cash Flow ID": e.cashFlowId || "",
        "Date": format(new Date(e.createdAt), "dd/MM/yyyy HH:mm:ss"),
        "Category": e.category,
        "Outflow Type": e.outflowType || "",
        "Receiver/Party": e.partyName || (e.buyerId ? getBuyerName(e.buyerId) : e.farmerId ? getFarmerName(e.farmerId) : ""),
        "Buyer": e.buyerId ? getBuyerName(e.buyerId) : "",
        "Farmer": e.farmerId ? getFarmerName(e.farmerId) : "",
        "Total Amount": group.totalAmount.toFixed(2),
        "Amount Split": splitAmounts,
        "Disc % Split": splitDisc,
        "Petty Adj Split": splitPetty,
        "Payment Mode": e.paymentMode,
        "Bank Account": e.bankAccountId ? getAccountName(e.bankAccountId) : "",
        "Notes": e.notes || "",
        "Status": group.isReversed ? "Reversed" : "Active",
      };
    });
    const headers = Object.keys(rows[0] || {});
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${String((r as any)[h]).replace(/"/g, '""')}"`).join(","))].join("\n");
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
  const dueExtraCharges = (txAggregates?.totalExtraCharges || 0) - (txAggregates?.paidExtraCharges || 0);
  const dueMandi = (txAggregates?.totalMandiCommission || 0) - (txAggregates?.paidMandiCommission || 0);

  const getOutflowHint = (type: string) => {
    if (type === "Hammali") return dueHammali > 0 ? `Due: ₹${dueHammali.toLocaleString("en-IN")}` : null;
    if (type === "Extra Charges") return dueExtraCharges > 0 ? `Due: ₹${dueExtraCharges.toLocaleString("en-IN")}` : null;
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
            <option value="Capital Expense">Capital Expense</option>
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
              size="sm" className="text-[11px] flex-1"
              onClick={() => setActiveTab("inward")}
              data-testid="tab-inward"
            >
              <ArrowDownLeft className="w-3 h-3 mr-0.5" />
              {t("cash.inwardCash")}
            </Button>
            <Button
              variant={activeTab === "outward" ? "default" : "ghost"}
              size="sm" className="text-[11px] flex-1"
              onClick={() => setActiveTab("outward")}
              data-testid="tab-outward"
            >
              <ArrowUpRight className="w-3 h-3 mr-0.5" />
              {t("cash.outwardCash")}
            </Button>
            <Button
              variant={activeTab === "transfer" ? "default" : "ghost"}
              size="sm" className="text-[11px] flex-1"
              onClick={() => setActiveTab("transfer")}
              data-testid="tab-transfer"
            >
              <ArrowLeftRight className="w-3 h-3 mr-0.5" />
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
                  <Select value={inwardBuyerId} onValueChange={(v) => { setInwardBuyerId(v); setInwardAllocations([]); setAllocationSearch(""); }}>
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
              {inwardPartyType === "Buyer" && inwardBuyerId && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("cash.amount")}</Label>
                  <Input type="number" inputMode="decimal" value={inwardAmount} onChange={e => {
                    const newVal = e.target.value;
                    setInwardAmount(newVal);
                    if (inwardAllocations.length === 1) {
                      setInwardAllocations(prev => prev.map(a => ({ ...a, amount: newVal })));
                    }
                  }} onFocus={e => e.target.select()} placeholder="0" className="h-9 text-sm" data-testid="inward-amount" />
                </div>
              )}
              {inwardPartyType === "Buyer" && inwardBuyerId && (
                <div className="space-y-2">
                  <Label className="text-xs">Allocate to Transactions</Label>
                  <div className="relative" ref={allocationDropdownRef}>
                    <div className="flex items-center border rounded-md bg-background">
                      <Search className="w-3.5 h-3.5 ml-2 text-muted-foreground" />
                      <Input
                        value={allocationSearch}
                        onChange={e => { setAllocationSearch(e.target.value); setAllocationDropdownOpen(true); }}
                        onFocus={() => setAllocationDropdownOpen(true)}
                        placeholder="Search SR#, date, crop..."
                        className="h-9 text-sm border-0 focus-visible:ring-0"
                        data-testid="allocation-search"
                      />
                    </div>
                    {allocationDropdownOpen && (() => {
                      const selectedIds = new Set(inwardAllocations.map(a => a.txnId));
                      const available = pendingTransactions.filter(pt => !selectedIds.has(pt.id));
                      const filtered = available.filter(pt => {
                        if (!allocationSearch) return true;
                        const s = allocationSearch.toLowerCase();
                        return String(pt.serialNumber).includes(s) || pt.date.toLowerCase().includes(s) || (pt.crop || "").toLowerCase().includes(s);
                      });
                      if (filtered.length === 0) return null;
                      return (
                        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-popover border rounded-md shadow-lg">
                          {filtered.map(pt => {
                            const dueDays = pt.date ? Math.max(0, Math.floor((Date.now() - new Date(pt.date + "T00:00:00").getTime()) / 86400000)) : 0;
                            return (
                              <div
                                key={pt.id}
                                className="px-3 py-2 hover:bg-accent cursor-pointer text-xs border-b last:border-b-0"
                                onClick={() => {
                                  setInwardAllocations(prev => {
                                    const total = parseFloat(inwardAmount || "0");
                                    const alreadyAllocated = prev.reduce((s, a) => s + parseFloat(a.amount || "0"), 0);
                                    const remaining = Math.max(0, total - alreadyAllocated);
                                    const due = parseFloat(pt.due);
                                    const autoAmt = total > 0 ? Math.min(remaining, due) : due;
                                    const autoPetty = Math.max(0, due - autoAmt);
                                    return [...prev, {
                                      txnId: pt.id === 0 ? null : pt.id,
                                      txnLabel: pt.transactionId === "PY_OPENING" ? "PY Opening Balance" : `SR #${pt.serialNumber}`,
                                      serialNumber: pt.serialNumber,
                                      date: pt.date,
                                      numberOfBags: pt.numberOfBags,
                                      crop: pt.crop,
                                      due,
                                      dueDays,
                                      amount: autoAmt.toFixed(2),
                                      discountPercent: "0",
                                      pettyAdj: autoPetty > 0.005 ? autoPetty.toFixed(2) : "0",
                                    }];
                                  });
                                  setAllocationSearch("");
                                  setAllocationDropdownOpen(false);
                                }}
                                data-testid={`allocation-option-${pt.id}`}
                              >
                                <div className="flex justify-between">
                                  <span className="font-medium">
                                    {pt.transactionId === "PY_OPENING" ? "PY Opening Balance" : `SR #${pt.serialNumber} | ${pt.crop}`}
                                  </span>
                                  <span className="text-orange-600 font-semibold">₹{parseFloat(pt.due).toLocaleString("en-IN")}</span>
                                </div>
                                <div className="text-muted-foreground mt-0.5">
                                  {pt.date} {pt.numberOfBags > 0 && `| ${pt.numberOfBags} bags`} | {dueDays} days
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>

                  {inwardAllocations.length > 0 && (
                    <div className="space-y-2">
                      {inwardAllocations.map((alloc, idx) => (
                        <div key={`${alloc.txnId}-${idx}`} className="bg-muted/60 rounded-lg p-2.5 space-y-2" data-testid={`allocation-row-${idx}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex flex-wrap items-center gap-1.5 text-xs">
                              <Badge variant="secondary" className="text-[10px]">{alloc.txnLabel}</Badge>
                              <span className="text-muted-foreground">{alloc.date}</span>
                              {alloc.numberOfBags > 0 && <span>{alloc.numberOfBags} bags</span>}
                              {alloc.crop && <span className="text-muted-foreground">{alloc.crop}</span>}
                              <span className="text-orange-600">Due ₹{alloc.due.toLocaleString("en-IN")}</span>
                              <span className="text-muted-foreground">{alloc.dueDays}d</span>
                            </div>
                            <Button
                              variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                              onClick={() => setInwardAllocations(prev => prev.filter((_, i) => i !== idx))}
                              data-testid={`remove-allocation-${idx}`}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 items-end">
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-muted-foreground">Amount</Label>
                              <Input
                                type="number" inputMode="decimal"
                                value={alloc.amount}
                                onChange={e => {
                                  const raw = e.target.value;
                                  const discAmt = (parseFloat(alloc.discountPercent || "0") / 100) * alloc.due;
                                  const parsed = parseFloat(raw || "0");
                                  const newPetty = Math.max(0, alloc.due - parsed - discAmt);
                                  setInwardAllocations(prev => prev.map((a, i) => i === idx ? { ...a, amount: raw, pettyAdj: newPetty > 0.005 ? newPetty.toFixed(2) : "0" } : a));
                                }}
                                onBlur={e => {
                                  const raw = parseFloat(e.target.value || "0");
                                  const capped = Math.min(Math.max(0, raw), alloc.due);
                                  const discAmt = (parseFloat(alloc.discountPercent || "0") / 100) * alloc.due;
                                  const newPetty = Math.max(0, alloc.due - capped - discAmt);
                                  setInwardAllocations(prev => prev.map((a, i) => i === idx ? { ...a, amount: capped.toFixed(2), pettyAdj: newPetty > 0.005 ? newPetty.toFixed(2) : "0" } : a));
                                }}
                                onFocus={e => e.target.select()}
                                className="h-7 text-xs px-1.5"
                                data-testid={`allocation-amount-${idx}`}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-0.5 truncate">
                                <Label className="text-[10px] text-muted-foreground shrink-0">Disc %</Label>
                                {parseFloat(alloc.discountPercent || "0") > 0 && (
                                  <span className="text-[9px] font-medium text-orange-600 truncate">
                                    ₹{((parseFloat(alloc.discountPercent || "0") / 100) * alloc.due).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>
                              <Input
                                type="number" inputMode="decimal"
                                value={alloc.discountPercent}
                                onChange={e => {
                                  const newDiscPct = e.target.value;
                                  const discAmt = (parseFloat(newDiscPct || "0") / 100) * alloc.due;
                                  const newPetty = Math.max(0, alloc.due - parseFloat(alloc.amount || "0") - discAmt);
                                  setInwardAllocations(prev => prev.map((a, i) => i === idx ? { ...a, discountPercent: newDiscPct, pettyAdj: newPetty > 0.005 ? newPetty.toFixed(2) : "0" } : a));
                                }}
                                onFocus={e => e.target.select()}
                                className="h-7 text-xs px-1.5"
                                placeholder="%"
                                data-testid={`allocation-discount-${idx}`}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <Label className="text-[10px] text-muted-foreground">Petty Adj (auto)</Label>
                              <Input
                                type="number" inputMode="decimal"
                                value={alloc.pettyAdj}
                                readOnly
                                className={`h-7 text-xs px-1.5 bg-muted cursor-not-allowed font-medium ${parseFloat(alloc.pettyAdj || "0") > 1000 ? "text-red-600" : parseFloat(alloc.pettyAdj || "0") > 100 ? "text-orange-500" : ""}`}
                                data-testid={`allocation-petty-${idx}`}
                              />
                            </div>
                          </div>
                          {(() => {
                            const discAmt = (parseFloat(alloc.discountPercent || "0") / 100) * alloc.due;
                            const totalSettled = parseFloat(alloc.amount || "0") + discAmt + parseFloat(alloc.pettyAdj || "0");
                            const isFullyClosed = Math.abs(totalSettled - alloc.due) < 0.02;
                            return (
                              <div className="flex justify-between items-center text-[10px] px-0.5">
                                <span className="text-muted-foreground">Settled (Amt+Disc+Petty)</span>
                                <span className={isFullyClosed ? "text-green-600 font-medium" : "text-muted-foreground"}>
                                  ₹{totalSettled.toLocaleString("en-IN", { maximumFractionDigits: 2 })} / ₹{alloc.due.toLocaleString("en-IN")}
                                </span>
                              </div>
                            );
                          })()}
                        </div>
                      ))}
                      {(() => {
                        const totalAllocated = inwardAllocations.reduce((s, a) => s + parseFloat(a.amount || "0"), 0);
                        const totalReceived = parseFloat(inwardAmount || "0");
                        const matched = totalReceived > 0 && Math.abs(totalAllocated - totalReceived) < 0.02;
                        const totalDiscountAmt = inwardAllocations.reduce((s, a) => s + (parseFloat(a.discountPercent || "0") / 100) * a.due, 0);
                        const totalPetty = inwardAllocations.reduce((s, a) => s + parseFloat(a.pettyAdj || "0"), 0);
                        return (
                          <div className="text-xs px-1 pt-1 border-t space-y-0.5">
                            <div className="flex justify-between items-center">
                              <span className="font-medium text-muted-foreground">Allocated</span>
                              <span className={`font-bold ${matched ? "text-green-600" : totalReceived > 0 ? "text-red-600" : ""}`}>
                                ₹{totalAllocated.toLocaleString("en-IN")} / ₹{totalReceived.toLocaleString("en-IN")}
                              </span>
                            </div>
                            {totalDiscountAmt > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Total Discount</span>
                                <span className="text-orange-600">₹{totalDiscountAmt.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                              </div>
                            )}
                            {totalPetty > 0 && (
                              <div className="flex justify-between items-center">
                                <span className="text-muted-foreground">Total Petty Adj</span>
                                <span>₹{totalPetty.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}
              {inwardPartyType !== "Buyer" && (
                <div className="space-y-1">
                  <Label className="text-xs">{t("cash.amount")}</Label>
                  <Input type="number" inputMode="decimal" value={inwardAmount} onChange={e => setInwardAmount(e.target.value)} onFocus={e => e.target.select()} placeholder="0" className="h-9 text-sm" data-testid="inward-amount-others" />
                </div>
              )}
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
                <Label className="text-xs font-medium">Expense Category</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={expenseCategory === "revenue" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-9"
                    onClick={() => setExpenseCategory("revenue")}
                    data-testid="expense-category-revenue"
                  >
                    Revenue Expense
                  </Button>
                  <Button
                    type="button"
                    variant={expenseCategory === "capital" ? "default" : "outline"}
                    size="sm"
                    className="flex-1 h-9"
                    onClick={() => setExpenseCategory("capital")}
                    data-testid="expense-category-capital"
                  >
                    Capital Expense
                  </Button>
                </div>
              </div>

              {expenseCategory === "revenue" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("cash.outflowType")}</Label>
                    <Select value={outwardOutflowType} onValueChange={(v) => { setOutwardOutflowType(v); setFarmerAllocations([]); setFarmerAllocationSearch(""); }}>
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
                            <button onClick={() => { setOutwardFarmerId(""); setOutwardFarmerSearch(""); setFarmerAllocations([]); setFarmerAllocationSearch(""); if (outwardOutflowType === "Farmer-Harvest Sale") setOutwardAmount(""); }} className="shrink-0" data-testid="button-clear-outward-farmer"><X className="w-3.5 h-3.5" /></button>
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
                                      onMouseDown={(e) => { e.preventDefault(); setOutwardFarmerId(f.id.toString()); setOutwardFarmerSearch(""); setOutwardFarmerOpen(false); setFarmerAllocations([]); setFarmerAllocationSearch(""); setOutwardAmount(""); }}>
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
                  {outwardOutflowType === "Farmer-Harvest Sale" && outwardFarmerId && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">{t("cash.amount")}</Label>
                        <Input type="number" inputMode="decimal" value={outwardAmount} onChange={e => setOutwardAmount(e.target.value)} onFocus={e => e.target.select()} placeholder="0" className="h-9 text-sm" data-testid="outward-amount" />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs">Allocate to Transactions</Label>
                        <div className="relative" ref={farmerAllocationDropdownRef}>
                          <div className="flex items-center border rounded-md bg-background">
                            <Search className="w-3.5 h-3.5 ml-2 text-muted-foreground" />
                            <Input
                              value={farmerAllocationSearch}
                              onChange={e => { setFarmerAllocationSearch(e.target.value); setFarmerAllocationDropdownOpen(true); }}
                              onFocus={() => setFarmerAllocationDropdownOpen(true)}
                              placeholder="Search SR#, date, crop..."
                              className="h-9 text-sm border-0 focus-visible:ring-0"
                              data-testid="farmer-allocation-search"
                            />
                          </div>
                          {farmerAllocationDropdownOpen && (() => {
                            const selectedKeys = new Set(farmerAllocations.map(a => a.groupKey));
                            const available = farmerPendingTransactions.filter(pt => !selectedKeys.has(pt.groupKey));
                            const filtered = available.filter(pt => {
                              if (!farmerAllocationSearch) return true;
                              const s = farmerAllocationSearch.toLowerCase();
                              return String(pt.serialNumber).includes(s) || pt.date.toLowerCase().includes(s) || (pt.crops || "").toLowerCase().includes(s);
                            });
                            if (filtered.length === 0) return null;
                            return (
                              <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-popover border rounded-md shadow-lg">
                                {filtered.map(pt => (
                                  <div
                                    key={pt.groupKey}
                                    className="px-3 py-2 hover:bg-accent cursor-pointer text-xs border-b last:border-b-0"
                                    onClick={() => {
                                      setFarmerAllocations(prev => [...prev, {
                                        groupKey: pt.groupKey,
                                        txnLabel: pt.groupKey === "PY_OPENING" ? "PY Opening Balance" : `SR #${pt.serialNumber}`,
                                        serialNumber: pt.serialNumber,
                                        date: pt.date,
                                        numberOfBags: pt.numberOfBags,
                                        crops: pt.crops,
                                        due: parseFloat(pt.due),
                                        amount: pt.due,
                                        transactionIds: pt.transactionIds,
                                      }]);
                                      setFarmerAllocationSearch("");
                                      setFarmerAllocationDropdownOpen(false);
                                    }}
                                    data-testid={`farmer-allocation-option-${pt.groupKey}`}
                                  >
                                    <div className="flex justify-between">
                                      <span className="font-medium">
                                        {pt.groupKey === "PY_OPENING" ? "PY Opening Balance" : `SR #${pt.serialNumber}${pt.crops ? ` | ${pt.crops}` : ""}`}
                                      </span>
                                      <span className="text-orange-600 font-semibold">₹{parseFloat(pt.due).toLocaleString("en-IN")}</span>
                                    </div>
                                    <div className="text-muted-foreground mt-0.5">
                                      {pt.date} {pt.numberOfBags > 0 && `| ${pt.numberOfBags} bags`}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            );
                          })()}
                        </div>

                        {farmerAllocations.length > 0 && (
                          <div className="space-y-2">
                            {farmerAllocations.map((alloc, idx) => (
                              <div key={`${alloc.groupKey}-${idx}`} className="bg-muted/60 rounded-lg p-2.5 space-y-2" data-testid={`farmer-allocation-row-${idx}`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                                    <Badge variant="secondary" className="text-[10px]">{alloc.txnLabel}</Badge>
                                    <span className="text-muted-foreground">{alloc.date}</span>
                                    {alloc.numberOfBags > 0 && <span>{alloc.numberOfBags} bags</span>}
                                    {alloc.crops && <span className="text-muted-foreground">{alloc.crops}</span>}
                                  </div>
                                  <Button
                                    variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                                    onClick={() => setFarmerAllocations(prev => prev.filter((_, i) => i !== idx))}
                                    data-testid={`farmer-remove-allocation-${idx}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 items-end">
                                  <div className="space-y-0.5">
                                    <Label className="text-[10px] text-muted-foreground">Due</Label>
                                    <Input
                                      value={`₹${alloc.due.toLocaleString("en-IN")}`}
                                      readOnly
                                      className="h-7 text-xs px-1.5 bg-muted"
                                      data-testid={`farmer-allocation-due-${idx}`}
                                    />
                                  </div>
                                  <div className="space-y-0.5">
                                    <Label className="text-[10px] text-muted-foreground">Amount</Label>
                                    <Input
                                      type="number" inputMode="decimal"
                                      value={alloc.amount}
                                      onChange={e => setFarmerAllocations(prev => prev.map((a, i) => i === idx ? { ...a, amount: e.target.value } : a))}
                                      onFocus={e => e.target.select()}
                                      className="h-7 text-xs px-1.5"
                                      data-testid={`farmer-allocation-amount-${idx}`}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                            {(() => {
                              const totalAllocated = farmerAllocations.reduce((s, a) => s + parseFloat(a.amount || "0"), 0);
                              const totalPaid = parseFloat(outwardAmount || "0");
                              const matched = totalPaid > 0 && Math.abs(totalAllocated - totalPaid) < 0.02;
                              return (
                                <div className="text-xs px-1 pt-1 border-t">
                                  <div className="flex justify-between items-center">
                                    <span className="font-medium text-muted-foreground">Allocated</span>
                                    <span className={`font-bold ${matched ? "text-green-600" : totalPaid > 0 ? "text-red-600" : ""}`}>
                                      ₹{totalAllocated.toLocaleString("en-IN")} / ₹{totalPaid.toLocaleString("en-IN")}
                                    </span>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                  {outwardOutflowType === "Hammali" && dueHammali > 0 && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded text-xs text-amber-700 dark:text-amber-300">
                      Total Hammali from Transactions: ₹{(txAggregates?.totalHammali || 0).toLocaleString("en-IN")} | Paid: ₹{(txAggregates?.paidHammali || 0).toLocaleString("en-IN")} | <span className="font-bold">Due: ₹{dueHammali.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {outwardOutflowType === "Extra Charges" && dueExtraCharges > 0 && (
                    <div className="p-2 bg-purple-50 dark:bg-purple-950 rounded text-xs text-purple-700 dark:text-purple-300">
                      Total Extra Charges from Transactions: ₹{(txAggregates?.totalExtraCharges || 0).toLocaleString("en-IN")} | Paid: ₹{(txAggregates?.paidExtraCharges || 0).toLocaleString("en-IN")} | <span className="font-bold">Due: ₹{dueExtraCharges.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {outwardOutflowType === "Mandi Commission" && dueMandi > 0 && (
                    <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded text-xs text-amber-700 dark:text-amber-300">
                      Total Mandi Commission: ₹{(txAggregates?.totalMandiCommission || 0).toLocaleString("en-IN")} | Paid: ₹{(txAggregates?.paidMandiCommission || 0).toLocaleString("en-IN")} | <span className="font-bold">Due: ₹{dueMandi.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {outwardOutflowType !== "Farmer-Harvest Sale" && (
                    <div className="space-y-1">
                      <Label className="text-xs">{t("cash.amount")}</Label>
                      <Input type="number" inputMode="decimal" value={outwardAmount} onChange={e => setOutwardAmount(e.target.value)} onFocus={e => e.target.select()} placeholder="0" className="h-9 text-sm" data-testid="outward-amount" />
                    </div>
                  )}
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
                </>
              )}

              {expenseCategory === "capital" && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Asset Name *</Label>
                    <Input
                      value={capitalAssetName}
                      onChange={e => setCapitalAssetName(e.target.value)}
                      placeholder="Enter asset name"
                      className="h-9 text-sm"
                      data-testid="capital-asset-name"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Category *</Label>
                    <Select value={capitalCategory} onValueChange={(v) => { setCapitalCategory(v); setCapitalDepRate(String(ASSET_DEPRECIATION_RATES[v] || 10)); }}>
                      <SelectTrigger className="h-9 text-sm" data-testid="capital-category"><SelectValue placeholder="Select category" /></SelectTrigger>
                      <SelectContent>
                        {ASSET_CATEGORIES.map(cat => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Depreciation Rate</Label>
                    <Input
                      type="number" inputMode="decimal"
                      value={capitalDepRate}
                      onChange={e => setCapitalDepRate(e.target.value)}
                      onFocus={e => e.target.select()}
                      placeholder="10"
                      className="h-9 text-sm"
                      data-testid="capital-dep-rate"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Amount ({"\u20B9"}) *</Label>
                    <Input
                      type="number" inputMode="decimal"
                      value={capitalAmount}
                      onChange={e => setCapitalAmount(e.target.value)}
                      onFocus={e => e.target.select()}
                      placeholder="0"
                      className="h-9 text-sm"
                      data-testid="capital-amount"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Paid on</Label>
                    <Input type="date" value={capitalDate} onChange={e => setCapitalDate(e.target.value)} className="h-9 text-sm" data-testid="capital-date" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{t("cash.remarks")}</Label>
                    <Input value={capitalRemarks} onChange={e => setCapitalRemarks(e.target.value)} placeholder={t("cash.remarksPlaceholder")} className="h-9 text-sm" data-testid="capital-remarks" />
                  </div>
                  <Button className="w-full h-9 text-sm" onClick={submitCapitalExpense} disabled={capitalExpenseMutation.isPending} data-testid="button-submit-capital">
                    <Save className="w-3.5 h-3.5 mr-1" />
                    {capitalExpenseMutation.isPending ? t("common.saving") : "Record Expense"}
                  </Button>
                </>
              )}
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
          ) : groupedEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">{t("cash.noEntries")}</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {groupedEntries.map(group => {
                const entry = group.representative;
                return (
                  <Card
                    key={group.key}
                    className={`cursor-pointer transition-opacity ${group.isReversed ? "opacity-40" : ""}`}
                    onClick={() => { setDetailEntry(entry); setDetailEntryGroup(group.entries); }}
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
                            {group.entries.length > 1 && <Badge variant="secondary" className="text-[10px]">{group.entries.length} txns</Badge>}
                            {group.isReversed && <Badge variant="destructive" className="text-[10px]">Reversed</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                            <span>{format(new Date(entry.createdAt), "dd/MM/yyyy HH:mm:ss")}</span>
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
                          <div className="text-right">
                            <span className={`text-sm font-bold whitespace-nowrap ${entry.category === "outward" || entry.category === "transfer" ? "text-orange-600" : "text-green-600"}`}>
                              {entry.category === "outward" ? "-" : entry.category === "inward" ? "+" : ""}₹{group.totalAmount.toLocaleString("en-IN")}
                            </span>
                          </div>
                          {!group.isReversed && (
                            <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={(ev) => { ev.stopPropagation(); setReverseConfirmEntry(entry); }} data-testid={`reverse-entry-${entry.id}`}>
                              <RotateCcw className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!detailEntry} onOpenChange={() => setDetailEntry(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("cash.entryDetails")}</DialogTitle>
          </DialogHeader>
          {detailEntry && (() => {
            const totalAmt = detailEntryGroup.reduce((s, e) => s + parseFloat(e.amount || "0"), 0);
            const splitLog = (detailEntry as any).splitLog as string | null;
            let splitItems: { label: string; amount: string; discountPct: string; discountAmt: string; pettyAdj: string; }[] | null = null;
            if (splitLog) { try { splitItems = JSON.parse(splitLog); } catch { splitItems = null; } }
            const isGroup = detailEntryGroup.length > 1;
            return (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Cash Flow ID</span><span className="font-medium">{detailEntry.cashFlowId || "N/A"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("common.date")}</span><span>{format(new Date(detailEntry.createdAt), "dd/MM/yyyy HH:mm:ss")}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.category")}</span>{getCategoryBadge(detailEntry)}</div>
                {detailEntry.outflowType && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.outflowType")}</span><span>{detailEntry.outflowType}</span></div>}
                {detailEntry.partyName && <div className="flex justify-between"><span className="text-muted-foreground">Receiver</span><span>{detailEntry.partyName}</span></div>}
                <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.amount")}</span><span className="font-bold">₹{totalAmt.toLocaleString("en-IN")}</span></div>
                {!isGroup && parseFloat(detailEntry.discount || "0") > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>₹{parseFloat(detailEntry.discount!).toLocaleString("en-IN")}</span></div>
                )}
                {!isGroup && parseFloat(detailEntry.pettyAdj || "0") > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Petty Adj</span><span>₹{parseFloat(detailEntry.pettyAdj!).toLocaleString("en-IN")}</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.paymentMode")}</span><span>{detailEntry.paymentMode}</span></div>
                {detailEntry.bankAccountId && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.bankAccount")}</span><span>{getAccountName(detailEntry.bankAccountId)}</span></div>}
                {detailEntry.buyerId && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.buyer")}</span><span>{getBuyerName(detailEntry.buyerId)}</span></div>}
                {detailEntry.farmerId && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.farmer")}</span><span>{getFarmerName(detailEntry.farmerId)}</span></div>}
                {detailEntry.notes && <div className="flex justify-between"><span className="text-muted-foreground">{t("cash.remarks")}</span><span>{detailEntry.notes}</span></div>}

                {isGroup && (
                  <div className="pt-2 border-t space-y-3">
                    <p className="text-xs font-semibold text-muted-foreground">Payment Split</p>
                    {(splitItems || detailEntryGroup.map((e, i) => ({
                      label: `Txn #${i + 1}`,
                      amount: parseFloat(e.amount || "0").toFixed(2),
                      discountPct: "0",
                      discountAmt: parseFloat(e.discount || "0").toFixed(2),
                      pettyAdj: parseFloat(e.pettyAdj || "0").toFixed(2),
                    }))).map((item, i) => (
                      <div key={i} className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                        <p className="text-sm font-semibold">{item.label}</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-medium">₹{parseFloat(item.amount).toLocaleString("en-IN")}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Disc %</span>
                          <span className="font-medium">{item.discountPct}%{parseFloat(item.discountAmt) > 0 ? ` (₹${parseFloat(item.discountAmt).toLocaleString("en-IN")})` : ""}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Petty Adj</span>
                          <span className="font-medium">₹{parseFloat(item.pettyAdj).toLocaleString("en-IN")}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

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
            );
          })()}
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
                editingAccountId === account.id ? (
                  <div key={account.id} className="space-y-2 p-2.5 bg-muted/30 rounded border border-primary/30 text-sm" data-testid={`edit-bank-row-${account.id}`}>
                    <Input
                      value={editAccountData.name}
                      onChange={e => setEditAccountData(d => ({ ...d, name: e.target.value }))}
                      className="h-8 text-sm"
                      data-testid={`input-edit-bank-name-${account.id}`}
                    />
                    <Select value={editAccountData.accountType} onValueChange={v => setEditAccountData(d => ({ ...d, accountType: v }))}>
                      <SelectTrigger className="h-8 text-sm" data-testid={`select-edit-bank-type-${account.id}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Limit">Limit</SelectItem>
                        <SelectItem value="Current">Current</SelectItem>
                        <SelectItem value="Saving">Saving</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number" inputMode="decimal"
                      value={editAccountData.openingBalance}
                      onChange={e => setEditAccountData(d => ({ ...d, openingBalance: e.target.value }))}
                      onFocus={e => e.target.select()}
                      className="h-8 text-sm"
                      data-testid={`input-edit-bank-balance-${account.id}`}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm" className="flex-1 h-8"
                        disabled={!editAccountData.name || updateBankMutation.isPending}
                        onClick={() => updateBankMutation.mutate({ id: account.id, data: editAccountData })}
                        data-testid={`button-save-edit-bank-${account.id}`}
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        {updateBankMutation.isPending ? t("common.saving") : t("common.save")}
                      </Button>
                      <Button variant="outline" size="sm" className="h-8" onClick={() => setEditingAccountId(null)} data-testid={`button-cancel-edit-bank-${account.id}`}>
                        {t("common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div key={account.id} className="flex items-center gap-2 p-2 bg-muted/30 rounded text-sm">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{account.name}</p>
                      <p className="text-xs text-muted-foreground">{account.accountType} • Opening: ₹{parseFloat(account.openingBalance || "0").toLocaleString("en-IN")}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => { setEditingAccountId(account.id); setEditAccountData({ name: account.name, accountType: account.accountType, openingBalance: account.openingBalance || "0" }); }} data-testid={`edit-bank-${account.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive shrink-0" onClick={() => setDeleteAccountId(account.id)} data-testid={`delete-bank-${account.id}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )
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
