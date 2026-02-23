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
import { Gavel, Trash2, AlertTriangle, Pencil, ChevronDown } from "lucide-react";

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
  const currentMonth = String(now.getMonth() + 1);
  const currentDay = String(now.getDate());

  const [activeCrop, setActiveCrop] = usePersistedState("bid-activeCrop", ALL_VALUE);
  const [activeGrade, setActiveGrade] = usePersistedState("bid-activeGrade", ALL_VALUE);
  const [saleStatusFilter, setSaleStatusFilter] = usePersistedState("bid-saleStatus", ALL_VALUE);
  const [yearFilter, setYearFilter] = usePersistedState("bid-yearFilter", ALL_VALUE);
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("bid-selectedMonths", []);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("bid-selectedDays", []);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const [selectedLot, setSelectedLot] = useState<LotWithFarmer | null>(null);
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState("");
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);
  const [pricePerKg, setPricePerKg] = useState("");
  const [bidBags, setBidBags] = useState("");
  const [showBuyerDropdown, setShowBuyerDropdown] = useState(false);
  const buyerInputRef = useRef<HTMLInputElement>(null);
  const buyerDropdownRef = useRef<HTMLDivElement>(null);

  const cropQueryParam = activeCrop === ALL_VALUE ? "" : `?crop=${activeCrop}`;
  const { data: lots = [], isLoading } = useQuery<LotWithFarmer[]>({
    queryKey: ["/api/lots", cropQueryParam],
  });

  const daysInMonths = useMemo(() => {
    if (selectedMonths.length === 0) return 31;
    const year = parseInt(yearFilter);
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

  const filteredLots = useMemo(() => {
    return lots.filter(l => {
      if (l.isReturned) return false;
      if (activeGrade !== ALL_VALUE && l.size !== activeGrade) return false;
      const d = new Date(l.date);
      if (d.getFullYear() !== parseInt(yearFilter)) return false;
      if (selectedMonths.length > 0 && !selectedMonths.includes(String(d.getMonth() + 1))) return false;
      if (selectedDays.length > 0 && !selectedDays.includes(String(d.getDate()))) return false;
      return true;
    });
  }, [lots, activeGrade, yearFilter, selectedMonths, selectedDays]);

  const groupedBySerial = useMemo(() => {
    const groups = new Map<string, { serialNumber: number; date: string; lots: LotWithFarmer[] }>();
    for (const lot of filteredLots) {
      const sr = lot.serialNumber;
      const key = `${lot.date}-${sr}`;
      if (!groups.has(key)) groups.set(key, { serialNumber: sr, date: lot.date, lots: [] });
      groups.get(key)!.lots.push(lot);
    }
    const sorted = Array.from(groups.values()).sort((a, b) => {
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) return dateCompare;
      return a.serialNumber - b.serialNumber;
    });
    return sorted;
  }, [filteredLots]);

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

  const openBidDialog = (lot: LotWithFarmer) => {
    setSelectedLot(lot);
    setBidBags(lot.remainingBags > 0 ? lot.remainingBags.toString() : "");
    setBidDialogOpen(true);
    setSelectedBuyerId(null);
    setBuyerSearch("");
    setPricePerKg("");
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
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const lotHasRemainingBags = selectedLot && selectedLot.remainingBags > 0;

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
        <Gavel className="w-5 h-5 text-primary" />
        {t("bidding.title")}
      </h1>

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
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSelectedDays([]); }}>
          <SelectTrigger data-testid="select-year" className="w-auto text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
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
            <button
              className="flex items-center gap-2 w-full px-2 py-1 text-xs hover:bg-accent rounded"
              onClick={selectAllMonths}
              data-testid="button-all-months"
            >
              <Checkbox checked={selectedMonths.length === 0} />
              <span>{t("stockRegister.allMonths")}</span>
            </button>
            <div className="grid grid-cols-4 gap-1 mt-1">
              {MONTH_LABELS.map((m, i) => {
                const val = String(i + 1);
                return (
                  <button
                    key={val}
                    className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedMonths.includes(val) ? "bg-primary text-primary-foreground" : ""}`}
                    data-testid={`toggle-month-${val}`}
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
            <Button variant="outline" size="sm" className="text-xs gap-1" data-testid="button-day-filter">
              {dayLabel}
              <ChevronDown className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <button
              className="flex items-center gap-2 w-full px-2 py-1 text-xs hover:bg-accent rounded"
              onClick={selectAllDays}
              data-testid="button-all-days"
            >
              <Checkbox checked={selectedDays.length === 0} />
              <span>{t("stockRegister.allDays")}</span>
            </button>
            <div className="grid grid-cols-7 gap-1 mt-1">
              {Array.from({ length: daysInMonths }, (_, i) => String(i + 1)).map(d => (
                <button
                  key={d}
                  className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedDays.includes(d) ? "bg-primary text-primary-foreground" : ""}`}
                  data-testid={`toggle-day-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </button>
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
                    {firstLot.vehicleNumber && (
                      <span className="text-xs text-muted-foreground">
                        {t("stockRegister.vehicle")}: {firstLot.vehicleNumber}
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
                              onClick={() => openBidDialog(lot)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button
                              data-testid={`button-bid-lot-${lot.id}`}
                              size="sm"
                              className="mobile-touch-target"
                              onClick={() => openBidDialog(lot)}
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
            <DialogTitle>
              Bid on {selectedLot?.crop} - {selectedLot?.farmer.name}
            </DialogTitle>
          </DialogHeader>

          {selectedLot && (
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
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
                    <Label>{t("bidding.buyer")}</Label>
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
                      {showBuyerDropdown && buyerSearch.trim() && filteredBuyers.length === 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground">
                          New buyer "{buyerSearch.trim()}" will be created
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
