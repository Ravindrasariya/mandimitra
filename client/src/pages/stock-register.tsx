import { useState, useRef, useEffect, useMemo } from "react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { CROPS, SIZES } from "@shared/schema";
import type { Lot, Farmer, LotEditHistory } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Search, Edit, Package, Wheat, X, ChevronDown, ChevronRight, Calendar, Download, History } from "lucide-react";
import { format } from "date-fns";

type LotWithFarmer = Lot & { farmer: Farmer };

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function StockRegisterPage() {
  const { toast } = useToast();
  const { t } = useLanguage();

  const now = new Date();
  const currentYear = now.getFullYear().toString();
  const currentMonth = (now.getMonth() + 1).toString();
  const currentDay = now.getDate().toString();

  const [activeCrop, setActiveCrop] = usePersistedState("sr-activeCrop", "Garlic");
  const [yearFilter, setYearFilter] = usePersistedState("sr-yearFilter", currentYear);
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("sr-selectedMonths", [currentMonth]);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("sr-selectedDays", [currentDay]);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const [saleFilter, setSaleFilter] = usePersistedState<"all" | "sold" | "unsold" | "returned">("sr-saleFilter", "all");

  const [farmerSearch, setFarmerSearch] = useState("");
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [editingLot, setEditingLot] = useState<LotWithFarmer | null>(null);
  const [editVariety, setEditVariety] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editBagMarka, setEditBagMarka] = useState("");
  const [editVehicleNumber, setEditVehicleNumber] = useState("");
  const [editVehicleBhadaRate, setEditVehicleBhadaRate] = useState("");
  const [editInitialTotalWeight, setEditInitialTotalWeight] = useState("");
  const [editActualNumberOfBags, setEditActualNumberOfBags] = useState("");
  const [editNumberOfBags, setEditNumberOfBags] = useState("");
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [lotHistoryOpen, setLotHistoryOpen] = useState(false);

  const { data: lotEditHistory = [] } = useQuery<LotEditHistory[]>({
    queryKey: ["/api/lot-edit-history", editingLot?.id],
    enabled: !!editingLot,
  });

  const { data: allLots = [], isLoading } = useQuery<LotWithFarmer[]>({
    queryKey: ["/api/lots", `?crop=${activeCrop}`],
  });

  const { data: allFarmers = [] } = useQuery<Farmer[]>({
    queryKey: ["/api/farmers"],
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const farmerSuggestions = useMemo(() => {
    if (!farmerSearch || farmerSearch.length < 1) return [];
    const s = farmerSearch.toLowerCase();
    return allFarmers
      .filter(f =>
        f.name.toLowerCase().includes(s) ||
        f.phone.includes(s) ||
        (f.village && f.village.toLowerCase().includes(s))
      )
      .slice(0, 8);
  }, [farmerSearch, allFarmers]);

  const daysInMonths = useMemo(() => {
    if (selectedMonths.length === 0) return 31;
    const year = parseInt(yearFilter);
    return Math.max(...selectedMonths.map(m => new Date(year, parseInt(m), 0).getDate()));
  }, [selectedMonths, yearFilter]);

  const toggleMonth = (month: string) => {
    setSelectedMonths(prev => {
      if (prev.includes(month)) {
        return prev.filter(m => m !== month);
      }
      return [...prev, month];
    });
    setSelectedDays([]);
  };

  const selectAllMonths = () => {
    setSelectedMonths([]);
    setSelectedDays([]);
    setMonthPopoverOpen(false);
  };

  const toggleDay = (day: string) => {
    setSelectedDays(prev => {
      if (prev.includes(day)) {
        return prev.filter(d => d !== day);
      }
      return [...prev, day];
    });
  };

  const selectAllDays = () => {
    setSelectedDays([]);
    setDayPopoverOpen(false);
  };

  const isDefaultFilters = yearFilter === currentYear &&
    selectedMonths.length === 1 && selectedMonths[0] === currentMonth &&
    selectedDays.length === 1 && selectedDays[0] === currentDay &&
    !selectedFarmer && saleFilter === "all";

  const clearFilters = () => {
    setYearFilter(currentYear);
    setSelectedMonths([currentMonth]);
    setSelectedDays([currentDay]);
    setSelectedFarmer(null);
    setFarmerSearch("");
    setSaleFilter("all");
  };

  const filtered = useMemo(() => {
    let result = allLots;

    if (selectedMonths.length > 0) {
      result = result.filter(l => {
        const parts = l.date.split("-");
        const lotYear = parts[0];
        const lotMonth = String(parseInt(parts[1]));
        return lotYear === yearFilter && selectedMonths.includes(lotMonth);
      });
    } else {
      result = result.filter(l => l.date.startsWith(yearFilter));
    }

    if (selectedDays.length > 0) {
      result = result.filter(l => {
        const parts = l.date.split("-");
        const lotDay = String(parseInt(parts[2]));
        return selectedDays.includes(lotDay);
      });
    }

    if (selectedFarmer) {
      result = result.filter(l => l.farmerId === selectedFarmer.id);
    }

    if (saleFilter === "sold") {
      result = result.filter(l => !l.isReturned && l.remainingBags === 0);
    } else if (saleFilter === "unsold") {
      result = result.filter(l => !l.isReturned && l.remainingBags > 0);
    } else if (saleFilter === "returned") {
      result = result.filter(l => l.isReturned);
    }

    return result;
  }, [allLots, yearFilter, selectedMonths, selectedDays, selectedFarmer, saleFilter]);

  const selectFarmer = (farmer: Farmer) => {
    setSelectedFarmer(farmer);
    setFarmerSearch("");
    setShowSuggestions(false);
  };

  const clearFarmerFilter = () => {
    setSelectedFarmer(null);
    setFarmerSearch("");
  };

  const updateLotMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/lots/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lot-edit-history"] });
      setEditingLot(null);
      toast({ title: "Lot Updated", variant: "success" });
    },
  });

  const returnLotMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/lots/${id}/return`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
      queryClient.invalidateQueries({ queryKey: ["/api/cash-entries"] });
      setReturnConfirmOpen(false);
      setEditingLot(null);
      if (data.soldBags > 0) {
        toast({ title: "Lot Returned", description: `Partially sold lot adjusted to ${data.soldBags} bags and marked as sold`, variant: "success" });
      } else {
        toast({ title: "Lot Returned", variant: "success" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const openEdit = (lot: LotWithFarmer) => {
    setEditingLot(lot);
    setEditVariety(lot.variety || "");
    setEditSize(lot.size || "");
    setEditBagMarka(lot.bagMarka || "");
    setEditVehicleNumber(lot.vehicleNumber || "");
    setEditVehicleBhadaRate(lot.vehicleBhadaRate || "");
    setEditInitialTotalWeight(lot.initialTotalWeight || "");
    setEditActualNumberOfBags(String(lot.actualNumberOfBags ?? lot.numberOfBags));
    setEditNumberOfBags(String(lot.numberOfBags));
  };

  const saveEdit = () => {
    if (!editingLot) return;
    const origBags = editNumberOfBags ? parseInt(editNumberOfBags) : editingLot.numberOfBags;
    const actualBags = editActualNumberOfBags ? parseInt(editActualNumberOfBags) : origBags;
    updateLotMutation.mutate({
      id: editingLot.id,
      data: {
        variety: editVariety || null,
        size: editSize,
        bagMarka: editBagMarka || null,
        vehicleNumber: editVehicleNumber ? editVehicleNumber.toUpperCase() : null,
        vehicleBhadaRate: editVehicleBhadaRate || null,
        initialTotalWeight: editInitialTotalWeight || null,
        numberOfBags: origBags,
        actualNumberOfBags: Math.min(actualBags, origBags),
      },
    });
  };

  const getLotStatus = (lot: LotWithFarmer) => {
    if (lot.isReturned) return "Returned";
    const actual = lot.actualNumberOfBags ?? lot.numberOfBags;
    if (lot.remainingBags === 0) return "Sold Out";
    if (lot.remainingBags < actual) return "Partially Sold";
    return "Unsold";
  };

  const getStatusBadge = (lot: LotWithFarmer) => {
    const status = getLotStatus(lot);
    switch (status) {
      case "Returned":
        return <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">{t("stockRegister.returned")}</Badge>;
      case "Sold Out":
        return <Badge variant="destructive" className="text-xs">{t("stockRegister.soldOut")}</Badge>;
      case "Partially Sold":
        return <Badge variant="secondary" className="text-xs border-blue-400 text-blue-600 bg-blue-50">{t("stockRegister.partiallySold")}</Badge>;
      case "Unsold":
        return <Badge variant="outline" className="text-xs border-green-400 text-green-600 bg-green-50">{t("stockRegister.unsold")}</Badge>;
    }
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

  const exportCSV = () => {
    if (filtered.length === 0) return;

    const headers = [
      "Lot ID", "Serial #", "Date", "Crop", "Variety", "Size",
      "Farmer ID", "Farmer Name", "Farmer Phone", "Farmer Village", "Farmer Tehsil", "Farmer District",
      "No. of Bags", "Remaining Bags", "Bag Marka", "Initial Total Weight",
      "Vehicle Number", "Vehicle Bhada Rate",
      "Status"
    ];

    const escCSV = (val: any) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = filtered.map(lot => [
      lot.lotId, lot.serialNumber, lot.date, lot.crop, lot.variety || "", lot.size || "",
      lot.farmer.farmerId, lot.farmer.name, lot.farmer.phone, lot.farmer.village || "", lot.farmer.tehsil || "", lot.farmer.district || "",
      lot.numberOfBags, lot.remainingBags, lot.bagMarka || "", lot.initialTotalWeight || "",
      lot.vehicleNumber || "", lot.vehicleBhadaRate || "",
      getLotStatus(lot)
    ].map(escCSV).join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stock_register_${activeCrop}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-3">
      <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        {t("stockRegister.title")}
      </h1>

      {/* Row 1: Crop dropdown left, Year + Month right */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={activeCrop} onValueChange={setActiveCrop}>
          <SelectTrigger
            data-testid="select-crop-filter"
            className="w-auto font-medium border-primary/50 bg-primary/10 text-primary"
          >
            <Wheat className="w-3.5 h-3.5 mr-1 flex-shrink-0" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CROPS.map((crop) => (
              <SelectItem key={crop} value={crop} data-testid={`toggle-crop-${crop.toLowerCase()}`}>
                {crop}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-1.5 ml-auto">
          <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSelectedDays([]); }}>
            <SelectTrigger className="w-[75px] h-8 text-xs" data-testid="select-year-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 5 }, (_, i) => String(now.getFullYear() - i)).map(y => (
                <SelectItem key={y} value={y}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover open={monthPopoverOpen} onOpenChange={setMonthPopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs min-w-[70px] justify-between px-2" data-testid="select-month-filter">
                {monthLabel}
                <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2" align="end">
              <button
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
                data-testid="month-select-all"
                onClick={selectAllMonths}
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
                      data-testid={`month-option-${val}`}
                      onClick={() => toggleMonth(val)}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            data-testid="button-export-csv"
            onClick={exportCSV}
            disabled={filtered.length === 0}
            title="Download CSV"
          >
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Row 2: Farmer search left, Sold/Unsold + Day filter right */}
      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0" ref={searchRef}>
          {selectedFarmer ? (
            <div className="flex items-center gap-1.5 border rounded-md px-2 h-8 bg-muted/50 text-sm">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <span className="truncate">{selectedFarmer.name}</span>
              <span className="text-muted-foreground text-xs shrink-0">- {selectedFarmer.phone}</span>
              {selectedFarmer.village && <span className="text-muted-foreground text-xs shrink-0 hidden sm:inline">- {selectedFarmer.village}</span>}
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 ml-auto shrink-0"
                onClick={clearFarmerFilter}
                data-testid="button-clear-farmer"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                data-testid="input-farmer-search"
                value={farmerSearch}
                onChange={(e) => { setFarmerSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={t("stockRegister.farmerSearchPlaceholder")}
                className="pl-8 h-8 text-sm"
              />
              {showSuggestions && farmerSuggestions.length > 0 && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-[200px] overflow-y-auto">
                  {farmerSuggestions.map((farmer) => (
                    <button
                      key={farmer.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm w-full text-left"
                      data-testid={`farmer-suggestion-${farmer.id}`}
                      onClick={() => selectFarmer(farmer)}
                    >
                      <span className="font-medium">{farmer.name}</span>
                      <span className="text-muted-foreground">{farmer.phone}</span>
                      {farmer.village && (
                        <span className="text-muted-foreground text-xs">({farmer.village})</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <Select value={saleFilter} onValueChange={(v) => setSaleFilter(v as "all" | "sold" | "unsold")}>
          <SelectTrigger className="w-[75px] h-8 text-xs shrink-0" data-testid="select-sale-filter">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("stockRegister.all")}</SelectItem>
            <SelectItem value="sold">{t("stockRegister.sold")}</SelectItem>
            <SelectItem value="unsold">{t("stockRegister.unsoldFilter")}</SelectItem>
            <SelectItem value="returned">{t("stockRegister.returned")}</SelectItem>
          </SelectContent>
        </Select>

        <Popover open={dayPopoverOpen} onOpenChange={setDayPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[65px] justify-between px-2 shrink-0" data-testid="select-day-filter">
              <Calendar className="w-3 h-3 mr-1" />
              {dayLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="day-select-all"
              onClick={selectAllDays}
            >
              <Checkbox checked={selectedDays.length === 0} />
              <span>{t("stockRegister.allDays")}</span>
            </button>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: daysInMonths }, (_, i) => String(i + 1)).map(d => (
                <button
                  key={d}
                  className={`flex items-center justify-center rounded text-xs p-1.5 ${selectedDays.includes(d) ? "bg-primary text-primary-foreground" : ""}`}
                  data-testid={`day-option-${d}`}
                  onClick={() => toggleDay(d)}
                >
                  {d}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {!isDefaultFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-destructive hover:text-destructive px-2 shrink-0"
            onClick={clearFilters}
            data-testid="button-clear-filters"
          >
            <X className="w-3 h-3 mr-1" />
            {t("stockRegister.clearFilters")}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t("stockRegister.noLots")} {activeCrop}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lot) => (
            <Card key={lot.id} className={lot.isReturned ? "opacity-50" : ""}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">SR #{lot.serialNumber}</Badge>
                      <Badge className="text-xs">{lot.lotId}</Badge>
                      {getStatusBadge(lot)}
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="font-medium truncate">{lot.farmer.name} - {lot.farmer.phone}</p>
                      {lot.farmer.village && (
                        <p className="text-muted-foreground text-xs">{lot.farmer.village}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>{t("common.date")}: {lot.date}</span>
                        {lot.variety && <span>{t("stockRegister.variety")}: {lot.variety}</span>}
                        <span>{t("stockRegister.size")}: {lot.size}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span>Bags: <strong>{lot.numberOfBags}</strong></span>
                        {(lot.actualNumberOfBags != null && lot.actualNumberOfBags !== lot.numberOfBags) && (
                          <span>Actual: <strong className="text-orange-600">{lot.actualNumberOfBags}</strong></span>
                        )}
                        <span>{t("common.remaining")}: <strong className={lot.remainingBags > 0 ? "text-primary" : "text-destructive"}>{lot.remainingBags}</strong></span>
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        {lot.bagMarka && <span>{t("stockRegister.marka")}: {lot.bagMarka}</span>}
                        {lot.vehicleNumber && <span>{t("stockRegister.vehicle")}: {lot.vehicleNumber}</span>}
                        {lot.vehicleBhadaRate && <span>{t("stockRegister.bhada")}: Rs.{lot.vehicleBhadaRate}/bag</span>}
                        {lot.initialTotalWeight && <span>{t("stockRegister.initWt")}: {lot.initialTotalWeight} kg</span>}
                      </div>
                    </div>
                  </div>
                  {!lot.isReturned && (
                    <Button
                      variant="secondary"
                      size="icon"
                      data-testid={`button-edit-lot-${lot.id}`}
                      onClick={() => openEdit(lot)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingLot} onOpenChange={(open) => !open && setEditingLot(null)}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("stockRegister.editLot")} - {editingLot?.lotId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Original # of Bags</Label>
                <Input
                  data-testid="input-original-bags"
                  type="text"
                  inputMode="numeric"
                  value={editNumberOfBags}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setEditNumberOfBags(val);
                    if (val) {
                      setEditActualNumberOfBags(val);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="mobile-touch-target"
                />
              </div>
              <div className="space-y-1">
                <Label>Actual # of Bags</Label>
                <Input
                  data-testid="input-actual-bags"
                  type="text"
                  inputMode="numeric"
                  value={editActualNumberOfBags}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    const maxBags = editNumberOfBags ? parseInt(editNumberOfBags) : (editingLot?.numberOfBags ?? 0);
                    if (val === '' || parseInt(val) <= maxBags) {
                      setEditActualNumberOfBags(val);
                    }
                  }}
                  onFocus={(e) => e.target.select()}
                  className="mobile-touch-target"
                />
                {editingLot && (() => {
                  const origBags = editNumberOfBags ? parseInt(editNumberOfBags) : editingLot.numberOfBags;
                  const actual = editingLot.actualNumberOfBags ?? editingLot.numberOfBags;
                  const soldBags = actual - editingLot.remainingBags;
                  const currentActual = editActualNumberOfBags ? parseInt(editActualNumberOfBags) : origBags;
                  return (
                    <>
                      {currentActual < origBags && (
                        <p className="text-xs text-orange-600">Reduced from {origBags} due to damaged/grading/partial returned harvest</p>
                      )}
                      {soldBags > 0 && (
                        <p className="text-xs text-muted-foreground">Min: {soldBags} (already sold)</p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("stockRegister.variety")}</Label>
                <Input
                  data-testid="input-edit-variety"
                  value={editVariety}
                  onChange={(e) => setEditVariety(e.target.value)}
                  className="mobile-touch-target"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("stockRegister.size")}</Label>
                <Select value={editSize} onValueChange={setEditSize}>
                  <SelectTrigger data-testid="select-edit-size" className="mobile-touch-target">
                    <SelectValue placeholder={t("stockEntry.selectSize")} />
                  </SelectTrigger>
                  <SelectContent>
                    {SIZES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("stockRegister.bagMarka")}</Label>
                <Input
                  data-testid="input-edit-bag-marka"
                  value={editBagMarka}
                  onChange={(e) => setEditBagMarka(e.target.value)}
                  className="mobile-touch-target"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("stockRegister.vehicleNumber")}</Label>
                <Input
                  data-testid="input-edit-vehicle-number"
                  value={editVehicleNumber}
                  onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase())}
                  className="mobile-touch-target"
                  style={{ textTransform: 'uppercase' }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{t("stockRegister.vehicleBhadaRate")}</Label>
                <Input
                  data-testid="input-edit-bhada-rate"
                  type="text"
                  inputMode="decimal"
                  value={editVehicleBhadaRate}
                  onChange={(e) => setEditVehicleBhadaRate(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  className="mobile-touch-target"
                />
              </div>
              <div className="space-y-1">
                <Label>{t("stockRegister.initialWeight")}</Label>
                <Input
                  data-testid="input-edit-initial-weight"
                  type="text"
                  inputMode="decimal"
                  value={editInitialTotalWeight}
                  onChange={(e) => setEditInitialTotalWeight(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  placeholder="0.00"
                  className="mobile-touch-target"
                />
              </div>
            </div>
            <Button
              data-testid="button-save-edit"
              className="w-full mobile-touch-target"
              onClick={saveEdit}
              disabled={updateLotMutation.isPending}
            >
              {updateLotMutation.isPending ? t("common.saving") : t("common.saveChanges")}
            </Button>

            {lotEditHistory.length > 0 && (
              <Collapsible open={lotHistoryOpen} onOpenChange={setLotHistoryOpen}>
                <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground w-full py-1" data-testid="toggle-lot-history">
                  {lotHistoryOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <History className="h-3 w-3" />
                  <span>Edit History ({lotEditHistory.length})</span>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-2 mt-1 max-h-40 overflow-y-auto">
                    {(() => {
                      const fieldLabels: Record<string, string> = {
                        numberOfBags: "Original Bags",
                        actualNumberOfBags: "Actual Bags",
                        crop: "Crop",
                        variety: "Variety",
                        size: "Size",
                        bagMarka: "Bag Marka",
                        vehicleNumber: "Vehicle Number",
                        vehicleBhadaRate: "Bhada Rate",
                        initialTotalWeight: "Initial Weight",
                      };
                      const grouped = lotEditHistory.reduce((acc, h) => {
                        const key = new Date(h.createdAt).toISOString();
                        if (!acc[key]) acc[key] = { changedBy: h.changedBy, createdAt: h.createdAt, fields: [] };
                        acc[key].fields.push(h);
                        return acc;
                      }, {} as Record<string, { changedBy: string | null; createdAt: Date; fields: LotEditHistory[] }>);
                      const sortedGroups = Object.values(grouped).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                      return sortedGroups.map((group, i) => (
                        <div key={i} className="bg-muted/50 rounded p-2 text-xs space-y-0.5">
                          <div className="flex justify-between text-muted-foreground">
                            <span className="font-medium">{group.changedBy}</span>
                            <span>{format(new Date(group.createdAt), "dd MMM yyyy, hh:mm a")}</span>
                          </div>
                          {group.fields.map((h, j) => (
                            <div key={j} className="flex gap-1">
                              <span className="text-muted-foreground">{fieldLabels[h.fieldChanged] || h.fieldChanged}:</span>
                              <span className="line-through text-red-500">{h.oldValue || "—"}</span>
                              <span>→</span>
                              <span className="text-green-600 font-medium">{h.newValue || "—"}</span>
                            </div>
                          ))}
                        </div>
                      ));
                    })()}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            <Button
              variant="destructive"
              data-testid="button-return-lot"
              className="w-full mobile-touch-target"
              onClick={() => setReturnConfirmOpen(true)}
              disabled={returnLotMutation.isPending}
            >
              {t("stockRegister.returnToFarmer")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={returnConfirmOpen} onOpenChange={setReturnConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stockRegister.returnConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("stockRegister.returnConfirmMsg")}
              {editingLot && editingLot.remainingBags < (editingLot.actualNumberOfBags ?? editingLot.numberOfBags) ? (
                <span className="block mt-2 text-orange-600 font-medium">
                  {t("stockRegister.returnPartialMsg")} ({(editingLot.actualNumberOfBags ?? editingLot.numberOfBags) - editingLot.remainingBags} bags sold). The bag count will be adjusted to the sold amount and marked as sold out.
                </span>
              ) : (
                <span className="block mt-2">
                  {t("stockRegister.returnUnsoldMsg")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-return">{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              data-testid="button-confirm-return"
              className="bg-destructive text-destructive-foreground"
              onClick={() => editingLot && returnLotMutation.mutate(editingLot.id)}
              disabled={returnLotMutation.isPending}
            >
              {returnLotMutation.isPending ? t("stockRegister.returning") : t("stockRegister.yesReturn")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
