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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CROPS, SIZES } from "@shared/schema";
import type { Lot, Farmer, Buyer, Bid } from "@shared/schema";
import { Gavel, Trash2, AlertTriangle, Pencil, ChevronDown, Search } from "lucide-react";

type LotWithFarmer = Lot & { farmer: Farmer };
type BidWithDetails = Bid & { buyer: Buyer; lot: Lot; hasTransaction: boolean };

const ALL_VALUE = "__all__";
const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getLotStatus(lot: LotWithFarmer) {
  const actual = lot.actualNumberOfBags ?? lot.numberOfBags;
  if (lot.remainingBags <= 0) return "sold";
  if (lot.remainingBags < actual) return "partial";
  return "unsold";
}

function LotStatusBadge({ lot }: { lot: LotWithFarmer }) {
  const status = getLotStatus(lot);
  if (status === "sold") {
    return <Badge variant="destructive" className="text-xs" data-testid={`badge-status-${lot.id}`}>Sold Out</Badge>;
  }
  if (status === "partial") {
    return <Badge variant="secondary" className="text-xs border-blue-400 text-blue-600 bg-blue-50" data-testid={`badge-status-${lot.id}`}>Partially Sold</Badge>;
  }
  return <Badge variant="outline" className="text-xs border-green-400 text-green-600 bg-green-50" data-testid={`badge-status-${lot.id}`}>Unsold</Badge>;
}

export default function BiddingPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const now = new Date();
  const currentYear = String(now.getFullYear());

  const [activeCrop, setActiveCrop] = usePersistedState("bid-activeCrop", ALL_VALUE);
  const [activeGrade, setActiveGrade] = usePersistedState("bid-activeGrade", ALL_VALUE);
  const [selectedStatuses, setSelectedStatuses] = usePersistedState<string[]>("bid-selectedStatuses2", ["unsold", "partial"]);
  const [yearFilter, setYearFilter] = usePersistedState("bid-yearFilter", ALL_VALUE);
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("bid-selectedMonths", []);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("bid-selectedDays", []);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);
  const [farmerSearch, setFarmerSearch] = usePersistedState("bid-farmerSearch", "");
  const [showFarmerDropdown, setShowFarmerDropdown] = useState(false);
  const farmerInputRef = useRef<HTMLInputElement>(null);
  const farmerDropdownRef = useRef<HTMLDivElement>(null);

  const [selectedLot, setSelectedLot] = useState<LotWithFarmer | null>(null);
  const [dialogSerialNumber, setDialogSerialNumber] = useState<number | null>(null);
  const [dialogDate, setDialogDate] = useState<string>("");
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState("");
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);
  const [pricePerKg, setPricePerKg] = useState("");
  const [bidBags, setBidBags] = useState("");
  const [showBuyerDropdown, setShowBuyerDropdown] = useState(false);
  const [paymentType, setPaymentType] = useState("Credit");
  const [advanceAmount, setAdvanceAmount] = useState("500");
  const buyerInputRef = useRef<HTMLInputElement>(null);
  const buyerDropdownRef = useRef<HTMLDivElement>(null);

  const cropQueryParam = activeCrop === ALL_VALUE ? "" : `?crop=${activeCrop}`;
  const { data: lots = [], isLoading } = useQuery<LotWithFarmer[]>({
    queryKey: ["/api/lots", cropQueryParam],
  });

  const { data: allFarmers = [] } = useQuery<Farmer[]>({
    queryKey: ["/api/farmers"],
  });

  const farmerSuggestions = useMemo(() => {
    if (!farmerSearch || farmerSearch.length < 1) return [];
    const s = farmerSearch.toLowerCase();
    return allFarmers.filter(f =>
      f.name.toLowerCase().includes(s) ||
      (f.phone && f.phone.includes(s)) ||
      (f.village && f.village.toLowerCase().includes(s))
    ).slice(0, 10);
  }, [farmerSearch, allFarmers]);

  const daysInMonths = useMemo(() => {
    if (selectedMonths.length === 0) return 31;
    const year = yearFilter !== ALL_VALUE ? parseInt(yearFilter) : now.getFullYear();
    return Math.max(...selectedMonths.map(m => new Date(year, parseInt(m), 0).getDate()));
  }, [selectedMonths, yearFilter]);

  const toggleMonth = (month: string) => {
    setSelectedMonths(prev => prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]);
    setSelectedDays([]);
  };

  const selectAllMonths = () => {
    setSelectedMonths([]);
    setSelectedDays([]);
    setMonthPopoverOpen(false);
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const selectAllDays = () => {
    setSelectedDays([]);
    setDayPopoverOpen(false);
  };

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

  const toggleStatus = (status: string) => {
    setSelectedStatuses(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  };

  const selectAllStatuses = () => {
    setSelectedStatuses([]);
    setStatusPopoverOpen(false);
  };

  const STATUS_OPTIONS = [
    { value: "sold", label: "Sold" },
    { value: "unsold", label: "Unsold" },
    { value: "partial", label: "Partially Sold" },
  ];

  const statusLabel = selectedStatuses.length === 0
    ? t("common.all")
    : selectedStatuses.length === 1
      ? STATUS_OPTIONS.find(s => s.value === selectedStatuses[0])?.label || selectedStatuses[0]
      : `${selectedStatuses.length} statuses`;

  const filteredLots = useMemo(() => {
    const searchLower = farmerSearch.trim().toLowerCase();
    return lots.filter(l => {
      if (l.isReturned) return false;
      if (activeGrade !== ALL_VALUE && l.size !== activeGrade) return false;
      if (yearFilter !== ALL_VALUE) {
        const d = new Date(l.date);
        if (d.getFullYear() !== parseInt(yearFilter)) return false;
        if (selectedMonths.length > 0 && !selectedMonths.includes(String(d.getMonth() + 1))) return false;
        if (selectedDays.length > 0 && !selectedDays.includes(String(d.getDate()))) return false;
      }
      if (searchLower) {
        const f = l.farmer;
        const match = f.name.toLowerCase().includes(searchLower) ||
          (f.phone && f.phone.includes(searchLower)) ||
          (f.village && f.village.toLowerCase().includes(searchLower));
        if (!match) return false;
      }
      return true;
    });
  }, [lots, activeGrade, yearFilter, selectedMonths, selectedDays, farmerSearch]);

  const groupedBySerial = useMemo(() => {
    const groups = new Map<string, { serialNumber: number; date: string; lots: LotWithFarmer[] }>();
    for (const lot of filteredLots) {
      const sr = lot.serialNumber;
      const key = `${lot.date}-${sr}`;
      if (!groups.has(key)) groups.set(key, { serialNumber: sr, date: lot.date, lots: [] });
      groups.get(key)!.lots.push(lot);
    }
    let result = Array.from(groups.values());
    if (selectedStatuses.length > 0) {
      result = result.filter(g => g.lots.some(lot => selectedStatuses.includes(getLotStatus(lot))));
    }
    result.sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.serialNumber - b.serialNumber;
    });
    return result;
  }, [filteredLots, selectedStatuses]);

  const { data: buyers = [] } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers", buyerSearch ? `?search=${buyerSearch}` : ""],
  });

  const filteredBuyers = useMemo(() => {
    if (!buyerSearch.trim()) return buyers;
    const search = buyerSearch.toLowerCase();
    return buyers.filter(b => b.name.toLowerCase().includes(search) || (b.phone && b.phone.includes(search)));
  }, [buyers, buyerSearch]);

  const { data: lotBids = [] } = useQuery<BidWithDetails[]>({
    queryKey: ["/api/bids", selectedLot ? `?lotId=${selectedLot.id}` : ""],
    enabled: !!selectedLot,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/bids"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["/api/lots"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["/api/transactions"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["/api/transaction-aggregates"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard"], refetchType: "all" });
    queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"], refetchType: "all" });
    queryClient.invalidateQueries({ predicate: (query) => {
      const key = query.queryKey[0];
      return typeof key === "string" && key.startsWith("/api/buyers");
    }, refetchType: "all" });
  };

  const createBidMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bids", data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Bid Saved", variant: "success" });
      setPricePerKg("");
      const bagsUsed = parseInt(bidBags) || 0;
      const newRemaining = selectedLot ? Math.max(0, selectedLot.remainingBags - bagsUsed) : 0;
      setBidBags(newRemaining > 0 ? newRemaining.toString() : "");
      if (selectedLot) {
        setSelectedLot({ ...selectedLot, remainingBags: newRemaining });
      }
      setSelectedBuyerId(null);
      setBuyerSearch("");
      setPaymentType("Credit");
      setAdvanceAmount("500");
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const deleteBidMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/bids/${id}`);
    },
    onSuccess: () => {
      invalidateAll();
      toast({ title: "Bid Deleted", variant: "success" });
    },
  });

  const createBuyerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/buyers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/buyers"] });
    },
  });

  const openBidDialog = (lot: LotWithFarmer, serialNumber: number, date: string) => {
    setSelectedLot(lot);
    setDialogSerialNumber(serialNumber);
    setDialogDate(date);
    setBidBags(lot.remainingBags > 0 ? lot.remainingBags.toString() : "");
    setBidDialogOpen(true);
    setSelectedBuyerId(null);
    setBuyerSearch("");
    setPricePerKg("");
    setPaymentType("Credit");
    setAdvanceAmount("500");
  };

  const selectBuyer = (buyer: Buyer) => {
    setSelectedBuyerId(buyer.id);
    setBuyerSearch(buyer.name);
    setShowBuyerDropdown(false);
  };

  const submitBid = async () => {
    if (!selectedLot || !pricePerKg || !bidBags) {
      toast({ title: "Error", description: "All bid fields are required", variant: "destructive" });
      return;
    }
    if (!selectedBuyerId && !buyerSearch.trim()) {
      toast({ title: "Error", description: "Please enter a buyer name", variant: "destructive" });
      return;
    }
    const bags = parseInt(bidBags);
    if (bags > selectedLot.remainingBags) {
      toast({ title: "Error", description: `Only ${selectedLot.remainingBags} bags remaining`, variant: "destructive" });
      return;
    }

    let buyerId = selectedBuyerId;
    if (!buyerId) {
      try {
        const newBuyer = await createBuyerMutation.mutateAsync({ name: buyerSearch.trim() });
        buyerId = newBuyer.id;
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        return;
      }
    }

    createBidMutation.mutate({
      lotId: selectedLot.id,
      buyerId,
      pricePerKg,
      numberOfBags: bags,
      grade: selectedLot.size || null,
      paymentType,
      advanceAmount: paymentType === "Cash" ? advanceAmount : "0",
    });
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buyerDropdownRef.current && !buyerDropdownRef.current.contains(e.target as Node) &&
        buyerInputRef.current && !buyerInputRef.current.contains(e.target as Node)
      ) {
        setShowBuyerDropdown(false);
      }
      if (
        farmerDropdownRef.current && !farmerDropdownRef.current.contains(e.target as Node) &&
        farmerInputRef.current && !farmerInputRef.current.contains(e.target as Node)
      ) {
        setShowFarmerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const lotHasRemainingBags = selectedLot && selectedLot.remainingBags > 0;

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h1 className="text-base md:text-lg font-bold flex items-center gap-2 mr-1">
          <Gavel className="w-5 h-5 text-primary" />
          {t("bidding.title")}
        </h1>

        <div className="relative">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              ref={farmerInputRef}
              data-testid="input-farmer-search"
              value={farmerSearch}
              onChange={(e) => {
                setFarmerSearch(e.target.value);
                setShowFarmerDropdown(true);
              }}
              onFocus={() => { if (farmerSearch.length >= 1) setShowFarmerDropdown(true); }}
              placeholder="Farmer / Phone / Village"
              className="w-44 md:w-52 h-8 text-xs pl-7"
              autoComplete="off"
            />
          </div>
          {showFarmerDropdown && farmerSearch.length >= 1 && farmerSuggestions.length > 0 && (
            <div
              ref={farmerDropdownRef}
              className="absolute z-50 w-64 mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto"
            >
              {farmerSuggestions.map((f) => (
                <div
                  key={f.id}
                  className="px-3 py-2 text-xs hover:bg-accent cursor-pointer"
                  data-testid={`option-farmer-${f.id}`}
                  onClick={() => {
                    setFarmerSearch(f.name);
                    setShowFarmerDropdown(false);
                  }}
                >
                  <span className="font-medium">{f.name}</span>
                  {f.phone && <span className="text-muted-foreground"> — {f.phone}</span>}
                  {f.village && <span className="text-muted-foreground"> — {f.village}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSelectedMonths([]); setSelectedDays([]); }}>
          <SelectTrigger data-testid="select-year" className="w-auto text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE} data-testid="option-year-all">{t("common.all")}</SelectItem>
            {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
              <SelectItem key={y} value={y} data-testid={`option-year-${y}`}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1" data-testid="button-month-filter">
              {monthLabel}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div
              className="flex items-center gap-2 w-full px-2 py-1 text-xs hover:bg-accent rounded cursor-pointer"
              onClick={selectAllMonths}
              data-testid="button-all-months"
            >
              <Checkbox checked={selectedMonths.length === 0} />
              <span>{t("stockRegister.allMonths")}</span>
            </div>
            <div className="grid grid-cols-4 gap-1 mt-1">
              {MONTH_LABELS.map((m, i) => {
                const val = String(i + 1);
                return (
                  <div
                    key={val}
                    className={`flex items-center justify-center rounded text-xs p-1.5 cursor-pointer ${selectedMonths.includes(val) ? "bg-primary text-primary-foreground" : ""}`}
                    data-testid={`toggle-month-${val}`}
                    onClick={() => toggleMonth(val)}
                  >
                    {m}
                  </div>
                );
              })}
            </div>
          </PopoverContent>
        </Popover>

        <Popover open={dayPopoverOpen} onOpenChange={setDayPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1" data-testid="button-day-filter">
              {dayLabel}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div
              className="flex items-center gap-2 w-full px-2 py-1 text-xs hover:bg-accent rounded cursor-pointer"
              onClick={selectAllDays}
              data-testid="button-all-days"
            >
              <Checkbox checked={selectedDays.length === 0} />
              <span>{t("stockRegister.allDays")}</span>
            </div>
            <div className="grid grid-cols-7 gap-1 mt-1">
              {Array.from({ length: daysInMonths }, (_, i) => String(i + 1)).map(d => (
                <div
                  key={d}
                  className={`flex items-center justify-center rounded text-xs p-1.5 cursor-pointer ${selectedDays.includes(d) ? "bg-primary text-primary-foreground" : ""}`}
                  data-testid={`toggle-day-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={activeCrop} onValueChange={setActiveCrop}>
          <SelectTrigger
            data-testid="select-bid-crop"
            className="w-auto font-medium border-primary/50 bg-primary/10 text-primary"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE} data-testid="toggle-bid-crop-all">
              {t("common.all")}
            </SelectItem>
            {CROPS.map((crop) => (
              <SelectItem key={crop} value={crop} data-testid={`toggle-bid-crop-${crop.toLowerCase()}`}>
                {crop}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={activeGrade} onValueChange={setActiveGrade}>
          <SelectTrigger
            data-testid="select-size-filter"
            className="w-auto font-medium border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-400"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE} data-testid="toggle-size-all">
              {t("common.all")}
            </SelectItem>
            {SIZES.map((size) => (
              <SelectItem key={size} value={size} data-testid={`toggle-size-${size.toLowerCase()}`}>
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="text-xs gap-1 font-medium border-violet-500/50 bg-violet-500/10 text-violet-600 dark:text-violet-400" data-testid="button-status-filter">
              {statusLabel}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <div
              className="flex items-center gap-2 w-full px-2 py-1 text-xs hover:bg-accent rounded cursor-pointer"
              onClick={selectAllStatuses}
              data-testid="button-all-statuses"
            >
              <Checkbox checked={selectedStatuses.length === 0} />
              <span>{t("common.all")}</span>
            </div>
            <div className="space-y-1 mt-1">
              {STATUS_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  className="flex items-center gap-2 w-full px-2 py-1 text-xs hover:bg-accent rounded cursor-pointer"
                  onClick={() => toggleStatus(opt.value)}
                  data-testid={`toggle-status-${opt.value}`}
                >
                  <Checkbox checked={selectedStatuses.includes(opt.value)} />
                  <span>{opt.label}</span>
                </div>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : groupedBySerial.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="text-no-lots">
          {t("bidding.noLots")}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedBySerial.map((group) => {
            const { serialNumber, date, lots: groupLots } = group;
            const firstLot = groupLots[0];
            return (
              <Card key={`${date}-${serialNumber}`} data-testid={`card-serial-group-${serialNumber}`}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="text-xs font-semibold" data-testid={`badge-sr-${serialNumber}`}>
                      SR #{serialNumber}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{date}</span>
                    <span className="text-sm font-medium truncate" data-testid={`text-farmer-${serialNumber}`}>
                      {firstLot.farmer.name}
                    </span>
                    {firstLot.farmer.phone && (
                      <span className="text-xs text-muted-foreground">{firstLot.farmer.phone}</span>
                    )}
                    {firstLot.farmer.village && (
                      <span className="text-xs text-muted-foreground">
                        {firstLot.farmer.village}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    {groupLots.map((lot) => {
                      const isSold = lot.remainingBags <= 0;
                      return (
                        <div
                          key={lot.id}
                          className={`flex items-center justify-between gap-2 rounded-md bg-muted/50 p-2 ${isSold ? "opacity-70" : ""}`}
                          data-testid={`row-lot-${lot.id}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-0.5">
                              <Badge className="text-xs">{lot.crop}</Badge>
                              {lot.size && (
                                <Badge variant="outline" className="text-xs">{lot.size}</Badge>
                              )}
                              {lot.variety && (
                                <span className="text-xs text-muted-foreground">{lot.variety}</span>
                              )}
                              <LotStatusBadge lot={lot} />
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>
                                {t("common.remaining")}: <strong className="text-foreground">{lot.remainingBags}</strong> / {lot.actualNumberOfBags ?? lot.numberOfBags} {t("common.bags")}
                              </span>
                              {lot.initialTotalWeight && (
                                <span>{t("stockRegister.initWt")}: {lot.initialTotalWeight} kg</span>
                              )}
                              {lot.bagMarka && (
                                <span>{t("stockRegister.marka")}: {lot.bagMarka}</span>
                              )}
                            </div>
                          </div>
                          {isSold ? (
                            <Button
                              data-testid={`button-edit-lot-${lot.id}`}
                              size="icon"
                              variant="outline"
                              className="mobile-touch-target"
                              onClick={() => openBidDialog(lot, serialNumber, date)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              data-testid={`button-bid-lot-${lot.id}`}
                              size="sm"
                              className="mobile-touch-target"
                              onClick={() => openBidDialog(lot, serialNumber, date)}
                            >
                              <Gavel className="w-4 h-4 mr-1" />
                              {t("bidding.bid")}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-sm">
              Bid on SR #{dialogSerialNumber} | {dialogDate} | {selectedLot?.farmer.name}
            </DialogTitle>
          </DialogHeader>

          {selectedLot && (
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm grid grid-cols-2 gap-x-4 gap-y-1">
                <p>{t("bidding.remainingBags")}: <strong>{selectedLot.remainingBags}</strong></p>
                <p>Crop: <strong>{selectedLot.crop}</strong></p>
                {selectedLot.size && <p>{t("stockRegister.size")}: <strong>{selectedLot.size}</strong></p>}
                {selectedLot.variety && <p>{t("stockRegister.variety")}: <strong>{selectedLot.variety}</strong></p>}
              </div>

              {lotBids.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("bidding.existingBids")}</Label>
                  {lotBids.map((bid) => (
                    <div key={bid.id} className="flex items-center justify-between gap-2 bg-muted/50 rounded-md p-2 text-sm">
                      <div>
                        <span className="font-medium">{bid.buyer.name}</span>
                        <span className="text-muted-foreground"> - Rs.{bid.pricePerKg}/kg x {bid.numberOfBags} bags</span>
                        {bid.grade && bid.grade !== "__all__" && <Badge variant="secondary" className="ml-2 text-xs">{bid.grade}</Badge>}
                        {bid.paymentType === "Cash" && <Badge variant="outline" className="ml-2 text-xs border-blue-400 text-blue-600 bg-blue-50">Cash ₹{bid.advanceAmount || "0"}</Badge>}
                        {bid.hasTransaction && <Badge variant="outline" className="ml-2 text-xs border-green-400 text-green-600 bg-green-50">Transacted</Badge>}
                      </div>
                      {!bid.hasTransaction && (
                        <Button
                          variant="destructive"
                          size="icon"
                          data-testid={`button-delete-bid-${bid.id}`}
                          onClick={() => deleteBidMutation.mutate(bid.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {lotHasRemainingBags && (
                <div className="border-t pt-4 space-y-3">
                  <Label className="font-medium">{t("bidding.newBid")}</Label>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Label>{t("bidding.buyer")}</Label>
                      {buyerSearch.trim() && !selectedBuyerId && filteredBuyers.length === 0 && (
                        <span className="text-[11px] text-orange-500">New buyer "{buyerSearch.trim()}" will be created</span>
                      )}
                    </div>
                    <div className="relative">
                      <Input
                        ref={buyerInputRef}
                        data-testid="input-buyer-search"
                        value={buyerSearch}
                        onChange={(e) => {
                          setBuyerSearch(e.target.value);
                          setSelectedBuyerId(null);
                          setShowBuyerDropdown(true);
                        }}
                        onFocus={() => setShowBuyerDropdown(true)}
                        placeholder={t("bidding.selectBuyer")}
                        className="mobile-touch-target"
                        autoComplete="off"
                      />
                      {showBuyerDropdown && buyerSearch.trim() && filteredBuyers.length > 0 && (
                        <div
                          ref={buyerDropdownRef}
                          className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto"
                        >
                          {filteredBuyers.map((b) => (
                            <button
                              key={b.id}
                              type="button"
                              data-testid={`option-buyer-${b.id}`}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-center gap-2"
                              onClick={() => selectBuyer(b)}
                            >
                              <span className="font-medium">{b.name}</span>
                              {b.phone && <span className="text-muted-foreground text-xs">({b.phone})</span>}
                              {b.redFlag && <AlertTriangle className="w-3 h-3 text-orange-500 ml-auto" />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {selectedBuyerId && buyers.find(b => b.id === selectedBuyerId)?.redFlag && (
                      <div className="flex items-center gap-2 p-3 rounded-md bg-orange-50 border border-orange-300 text-orange-800 text-sm" data-testid="warning-red-flag-buyer">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 text-orange-600" />
                        <span className="font-medium">{t("bidding.redFlagWarningBuyer")}</span>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>{t("bidding.pricePerKg")}</Label>
                      <Input
                        data-testid="input-price-per-kg"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        value={pricePerKg}
                        onChange={(e) => setPricePerKg(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0.00"
                        className="mobile-touch-target"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>{t("bidding.numberOfBags")}</Label>
                      <Input
                        data-testid="input-bid-bags"
                        type="number"
                        inputMode="numeric"
                        value={bidBags}
                        onChange={(e) => setBidBags(e.target.value)}
                        onFocus={(e) => e.target.select()}
                        placeholder="0"
                        className="mobile-touch-target"
                        max={selectedLot.remainingBags}
                      />
                    </div>
                  </div>
                  <div className={`grid ${paymentType === "Cash" ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
                    <div className="space-y-1">
                      <Label>Payment Type</Label>
                      <Select value={paymentType} onValueChange={setPaymentType}>
                        <SelectTrigger data-testid="select-payment-type" className="mobile-touch-target">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Credit">Credit</SelectItem>
                          <SelectItem value="Cash">Cash</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {paymentType === "Cash" && (
                      <div className="space-y-1">
                        <Label>Advance (₹)</Label>
                        <Input
                          data-testid="input-advance-amount"
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          value={advanceAmount}
                          onChange={(e) => setAdvanceAmount(e.target.value)}
                          onFocus={(e) => e.target.select()}
                          placeholder="500"
                          className="mobile-touch-target"
                        />
                      </div>
                    )}
                  </div>
                  <Button
                    data-testid="button-submit-bid"
                    className="w-full mobile-touch-target"
                    onClick={submitBid}
                    disabled={createBidMutation.isPending || createBuyerMutation.isPending}
                  >
                    {(createBidMutation.isPending || createBuyerMutation.isPending) ? t("common.saving") : t("bidding.addBid")}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
