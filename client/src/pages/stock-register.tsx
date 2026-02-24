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
import type { Lot, Farmer } from "@shared/schema";
import { Search, Edit, Package, Wheat, X, ChevronDown, Calendar, Download, Truck } from "lucide-react";
import { format } from "date-fns";

type LotWithFarmer = Lot & { farmer: Farmer };

type VehicleGroup = {
  key: string;
  serialNumber: number;
  date: string;
  lots: LotWithFarmer[];
};

type LotEditState = {
  variety: string;
  size: string;
  bagMarka: string;
  initialTotalWeight: string;
  actualNumberOfBags: string;
  numberOfBags: string;
};

const MONTH_LABELS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function StockRegisterPage() {
  const { toast } = useToast();
  const { t } = useLanguage();

  const now = new Date();
  const currentYear = now.getFullYear().toString();
  const currentMonth = (now.getMonth() + 1).toString();
  const currentDay = now.getDate().toString();

  const [activeCrop, setActiveCrop] = usePersistedState("sr-activeCrop", "All");
  const [yearFilter, setYearFilter] = usePersistedState("sr-yearFilter", currentYear);
  const [selectedMonths, setSelectedMonths] = usePersistedState<string[]>("sr-selectedMonths", [currentMonth]);
  const [selectedDays, setSelectedDays] = usePersistedState<string[]>("sr-selectedDays", [currentDay]);
  const [monthPopoverOpen, setMonthPopoverOpen] = useState(false);
  const [dayPopoverOpen, setDayPopoverOpen] = useState(false);

  const [selectedStatuses, setSelectedStatuses] = usePersistedState<string[]>("sr-selectedStatuses", []);
  const [statusPopoverOpen, setStatusPopoverOpen] = useState(false);

  const [farmerSearch, setFarmerSearch] = useState("");
  const [selectedFarmer, setSelectedFarmer] = useState<Farmer | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [editingGroup, setEditingGroup] = useState<LotWithFarmer[] | null>(null);
  const [editVehicleNumber, setEditVehicleNumber] = useState("");
  const [editDriverName, setEditDriverName] = useState("");
  const [editDriverContact, setEditDriverContact] = useState("");
  const [editVehicleBhadaRate, setEditVehicleBhadaRate] = useState("");
  const [editFreightType, setEditFreightType] = useState("");
  const [editTotalBagsInVehicle, setEditTotalBagsInVehicle] = useState("");
  const [editLotFields, setEditLotFields] = useState<Record<number, LotEditState>>({});
  const [origVehicle, setOrigVehicle] = useState({ vehicleNumber: "", driverName: "", driverContact: "", vehicleBhadaRate: "", freightType: "", totalBagsInVehicle: "" });
  const [origLotFields, setOrigLotFields] = useState<Record<number, LotEditState>>({});
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);
  const [returningLot, setReturningLot] = useState<LotWithFarmer | null>(null);

  const { data: allLots = [], isLoading } = useQuery<LotWithFarmer[]>({
    queryKey: activeCrop === "All" ? ["/api/lots"] : ["/api/lots", `?crop=${activeCrop}`],
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
    !selectedFarmer && selectedStatuses.length === 0;

  const clearFilters = () => {
    setYearFilter(currentYear);
    setSelectedMonths([currentMonth]);
    setSelectedDays([currentDay]);
    setSelectedFarmer(null);
    setFarmerSearch("");
    setSelectedStatuses([]);
  };

  const statusOptions = [
    { value: "sold", label: t("stockRegister.sold") },
    { value: "partial", label: t("stockRegister.partiallySold") },
    { value: "unsold", label: t("stockRegister.unsoldFilter") },
    { value: "returned", label: t("stockRegister.returned") },
  ];

  const toggleStatus = (val: string) => {
    setSelectedStatuses(prev => prev.includes(val) ? prev.filter(s => s !== val) : [...prev, val]);
  };

  const selectAllStatuses = () => {
    setSelectedStatuses([]);
    setStatusPopoverOpen(false);
  };

  const statusLabel = selectedStatuses.length === 0
    ? t("stockRegister.all")
    : selectedStatuses.length === 1
      ? statusOptions.find(o => o.value === selectedStatuses[0])?.label || selectedStatuses[0]
      : `${selectedStatuses.length} selected`;

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

    return result;
  }, [allLots, yearFilter, selectedMonths, selectedDays, selectedFarmer]);

  const grouped = useMemo(() => {
    const groups = new Map<string, LotWithFarmer[]>();
    for (const lot of filtered) {
      const key = `${lot.serialNumber}-${lot.date}-${lot.farmerId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(lot);
    }
    const statusMap: Record<string, string> = { "Sold Out": "sold", "Partially Sold": "partial", "Unsold": "unsold", "Returned": "returned" };
    let result = Array.from(groups.entries())
      .map(([key, lots]) => ({
        key,
        serialNumber: lots[0].serialNumber,
        date: lots[0].date,
        lots,
      } as VehicleGroup));
    if (selectedStatuses.length > 0) {
      result = result.filter(group => {
        const nonReturned = group.lots.filter(l => !l.isReturned);
        let groupStatus: string;
        if (nonReturned.length === 0) groupStatus = "returned";
        else if (nonReturned.every(l => l.remainingBags === 0)) groupStatus = "sold";
        else if (nonReturned.some(l => l.remainingBags < (l.actualNumberOfBags ?? l.numberOfBags))) groupStatus = "partial";
        else groupStatus = "unsold";
        return selectedStatuses.includes(groupStatus);
      });
    }
    return result.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.serialNumber - a.serialNumber;
    });
  }, [filtered, selectedStatuses]);

  const selectFarmer = (farmer: Farmer) => {
    setSelectedFarmer(farmer);
    setFarmerSearch("");
    setShowSuggestions(false);
  };

  const clearFarmerFilter = () => {
    setSelectedFarmer(null);
    setFarmerSearch("");
  };

  const saveGroupMutation = useMutation({
    mutationFn: async () => {
      if (!editingGroup) throw new Error("No group");

      const vn = editVehicleNumber || origVehicle.vehicleNumber;
      const totalBagsStr = editTotalBagsInVehicle || origVehicle.totalBagsInVehicle;
      const totalBagsParsed = totalBagsStr ? parseInt(totalBagsStr, 10) : NaN;
      const sharedData: Record<string, any> = {
        vehicleNumber: vn ? vn.toUpperCase() : null,
        driverName: editDriverName || origVehicle.driverName || null,
        driverContact: editDriverContact || origVehicle.driverContact || null,
        vehicleBhadaRate: editVehicleBhadaRate || origVehicle.vehicleBhadaRate || null,
        freightType: editFreightType || origVehicle.freightType || null,
        totalBagsInVehicle: Number.isFinite(totalBagsParsed) ? totalBagsParsed : null,
      };

      const updates = editingGroup
        .filter(lot => !lot.isReturned)
        .map(lot => {
          const lotState = editLotFields[lot.id];
          const orig = origLotFields[lot.id];
          if (!lotState || !orig) return null;

          const origBags = lot.numberOfBags;
          const actualStr = lotState.actualNumberOfBags || orig.actualNumberOfBags;
          const actualBags = actualStr ? parseInt(actualStr, 10) : origBags;

          return apiRequest("PATCH", `/api/lots/${lot.id}`, {
            ...sharedData,
            variety: lotState.variety || orig.variety || null,
            size: lotState.size || orig.size || null,
            bagMarka: lotState.bagMarka || orig.bagMarka || null,
            initialTotalWeight: lotState.initialTotalWeight || orig.initialTotalWeight || null,
            numberOfBags: origBags,
            actualNumberOfBags: Math.min(actualBags, origBags),
          });
        })
        .filter(Boolean);

      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lot-edit-history"] });
      setEditingGroup(null);
      toast({ title: "Group Updated", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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
      setReturningLot(null);
      setEditingGroup(null);
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

  const openGroupEdit = (group: VehicleGroup) => {
    const lots = group.lots;
    setEditingGroup(lots);
    const first = lots[0];
    setOrigVehicle({
      vehicleNumber: first.vehicleNumber || "",
      driverName: first.driverName || "",
      driverContact: first.driverContact || "",
      vehicleBhadaRate: first.vehicleBhadaRate || "",
      freightType: first.freightType || "",
      totalBagsInVehicle: first.totalBagsInVehicle != null ? String(first.totalBagsInVehicle) : "",
    });
    setEditVehicleNumber("");
    setEditDriverName("");
    setEditDriverContact("");
    setEditVehicleBhadaRate("");
    setEditFreightType("");
    setEditTotalBagsInVehicle("");

    const fields: Record<number, LotEditState> = {};
    const origFields: Record<number, LotEditState> = {};
    for (const lot of lots) {
      origFields[lot.id] = {
        variety: lot.variety || "",
        size: lot.size || "",
        bagMarka: lot.bagMarka || "",
        initialTotalWeight: lot.initialTotalWeight || "",
        actualNumberOfBags: String(lot.actualNumberOfBags ?? lot.numberOfBags),
        numberOfBags: String(lot.numberOfBags),
      };
      fields[lot.id] = {
        variety: "",
        size: "",
        bagMarka: "",
        initialTotalWeight: "",
        actualNumberOfBags: "",
        numberOfBags: String(lot.numberOfBags),
      };
    }
    setOrigLotFields(origFields);
    setEditLotFields(fields);
  };

  const updateLotField = (lotId: number, field: keyof LotEditState, value: string) => {
    setEditLotFields(prev => ({
      ...prev,
      [lotId]: { ...prev[lotId], [field]: value },
    }));
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
        return <Badge variant="secondary" className="text-xs border-orange-400 text-orange-600 bg-orange-50">{t("stockRegister.partiallySold")}</Badge>;
      case "Unsold":
        return <Badge variant="outline" className="text-xs border-green-400 text-green-600 bg-green-50">{t("stockRegister.unsold")}</Badge>;
    }
  };

  const getGroupStatus = (group: VehicleGroup) => {
    const nonReturned = group.lots.filter(l => !l.isReturned);
    if (nonReturned.length === 0) return "Returned";
    const allSold = nonReturned.every(l => l.remainingBags === 0);
    if (allSold) return "Sold Out";
    const anySold = nonReturned.some(l => l.remainingBags < (l.actualNumberOfBags ?? l.numberOfBags));
    if (anySold) return "Partially Sold";
    return "Unsold";
  };

  const getGroupStatusBadge = (group: VehicleGroup) => {
    const status = getGroupStatus(group);
    switch (status) {
      case "Returned":
        return <Badge variant="outline" className="text-xs border-orange-400 text-orange-600 bg-orange-50">{t("stockRegister.returned")}</Badge>;
      case "Sold Out":
        return <Badge variant="destructive" className="text-xs">{t("stockRegister.soldOut")}</Badge>;
      case "Partially Sold":
        return <Badge variant="secondary" className="text-xs border-orange-400 text-orange-600 bg-orange-50">{t("stockRegister.partiallySold")}</Badge>;
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
      "SR #", "Lot ID", "Date", "Crop", "Variety", "Size",
      "Farmer ID", "Farmer Name", "Farmer Phone", "Farmer Village", "Farmer Tehsil", "Farmer District",
      "No. of Bags", "Remaining Bags", "Bag Marka", "Initial Total Weight",
      "Vehicle Number", "Vehicle Bhada Rate", "Driver Name", "Driver Contact", "Freight Type", "Total Bags In Vehicle",
      "Status"
    ];

    const escCSV = (val: any) => {
      const s = String(val ?? "");
      return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const rows = filtered.map(lot => [
      lot.serialNumber, lot.lotId, lot.date, lot.crop, lot.variety || "", lot.size || "",
      lot.farmer.farmerId, lot.farmer.name, lot.farmer.phone, lot.farmer.village || "", lot.farmer.tehsil || "", lot.farmer.district || "",
      lot.numberOfBags, lot.remainingBags, lot.bagMarka || "", lot.initialTotalWeight || "",
      lot.vehicleNumber || "", lot.vehicleBhadaRate || "", lot.driverName || "", lot.driverContact || "", lot.freightType || "", lot.totalBagsInVehicle ?? "",
      getLotStatus(lot)
    ].map(escCSV).join(","));

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const cropLabel = activeCrop === "All" ? "all_crops" : activeCrop;
    a.download = `stock_register_${cropLabel}_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-3">
      <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        {t("stockRegister.title")}
      </h1>

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
            <SelectItem value="All" data-testid="toggle-crop-all">{t("common.all")}</SelectItem>
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

        <Popover open={statusPopoverOpen} onOpenChange={setStatusPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs min-w-[75px] justify-between px-2 shrink-0" data-testid="select-sale-filter">
              {statusLabel}
              <ChevronDown className="w-3 h-3 ml-1 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="end">
            <button
              className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left border-b mb-1"
              data-testid="status-select-all"
              onClick={selectAllStatuses}
            >
              <Checkbox checked={selectedStatuses.length === 0} />
              {t("stockRegister.all")}
            </button>
            {statusOptions.map(opt => (
              <button
                key={opt.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded text-sm w-full text-left hover:bg-accent"
                data-testid={`status-option-${opt.value}`}
                onClick={() => toggleStatus(opt.value)}
              >
                <Checkbox checked={selectedStatuses.includes(opt.value)} />
                {opt.label}
              </button>
            ))}
          </PopoverContent>
        </Popover>

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
      ) : grouped.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t("stockRegister.noLots")} {activeCrop === "All" ? "" : activeCrop}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((group) => {
            const first = group.lots[0];
            const farmer = first.farmer;
            const allReturned = group.lots.every(l => l.isReturned);
            const hasVehicleInfo = first.vehicleNumber || first.driverName || first.vehicleBhadaRate || first.freightType || first.driverContact;

            return (
              <Card key={group.key} className={allReturned ? "opacity-50" : ""} data-testid={`card-group-${group.serialNumber}`}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs" data-testid={`badge-sr-${group.serialNumber}`}>SR #{group.serialNumber}</Badge>
                        <span className="text-xs text-muted-foreground">{group.date}</span>
                        {getGroupStatusBadge(group)}
                      </div>

                      <div className="text-sm">
                        <p className="font-medium truncate" data-testid={`text-farmer-${group.key}`}>
                          {farmer.name} - {farmer.phone}
                          {farmer.village && <span className="text-muted-foreground text-xs ml-1">({farmer.village})</span>}
                        </p>
                        {first.totalBagsInVehicle != null && (
                          <span className="text-xs text-muted-foreground">
                            Total: <strong>{first.totalBagsInVehicle}</strong> {t("common.bags")}
                          </span>
                        )}
                      </div>

                      <div className="border-t pt-1.5 mt-1.5">
                        {group.lots.map((lot, lotIdx) => {
                          const actual = lot.actualNumberOfBags ?? lot.numberOfBags;
                          return (
                            <div key={lot.id} className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs py-1.5 ${lotIdx > 0 ? "border-t border-dashed" : ""} ${lot.isReturned ? "opacity-50" : ""}`} data-testid={`lot-row-${lot.id}`}>
                              <Badge variant="outline" className="text-xs py-0 px-1.5">{lot.crop}</Badge>
                              <span><strong>{actual}</strong> {t("common.bags")}</span>
                              <span className={lot.remainingBags > 0 ? "text-primary" : "text-destructive"}>
                                {t("common.remaining")}: <strong>{lot.remainingBags}</strong>
                              </span>
                              {lot.variety && <span className="text-muted-foreground">{lot.variety}</span>}
                              {lot.size && <span className="text-muted-foreground">{lot.size}</span>}
                              {lot.bagMarka && <span className="text-muted-foreground">{t("stockRegister.marka")}: {lot.bagMarka}</span>}
                              {getStatusBadge(lot)}
                            </div>
                          );
                        })}
                      </div>

                      {hasVehicleInfo && (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground border-t pt-1.5 mt-1.5">
                          {first.vehicleNumber && (
                            <span className="flex items-center gap-1">
                              <Truck className="w-3 h-3" />
                              {first.vehicleNumber}
                            </span>
                          )}
                          {first.driverName && <span>Driver: {first.driverName}</span>}
                          {first.vehicleBhadaRate && <span>{t("stockRegister.bhada")}: Rs.{first.vehicleBhadaRate}</span>}
                          {first.freightType && <span>{first.freightType}</span>}
                          {first.driverContact && <span>{first.driverContact}</span>}
                        </div>
                      )}
                    </div>
                    {!allReturned && (
                      <Button
                        variant="secondary"
                        size="icon"
                        data-testid={`button-edit-group-${group.serialNumber}`}
                        onClick={() => openGroupEdit(group)}
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!editingGroup} onOpenChange={(open) => !open && setEditingGroup(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Group - SR #{editingGroup?.[0]?.serialNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5" />
                Vehicle Info
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{t("stockRegister.vehicleNumber")}</Label>
                  <Input
                    data-testid="input-edit-vehicle-number"
                    value={editVehicleNumber}
                    onChange={(e) => setEditVehicleNumber(e.target.value.toUpperCase())}
                    placeholder={origVehicle.vehicleNumber || "Vehicle #"}
                    className="mobile-touch-target"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Driver Name</Label>
                  <Input
                    data-testid="input-edit-driver-name"
                    value={editDriverName}
                    onChange={(e) => setEditDriverName(e.target.value)}
                    placeholder={origVehicle.driverName || "Driver Name"}
                    className="mobile-touch-target"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Driver Contact</Label>
                  <Input
                    data-testid="input-edit-driver-contact"
                    value={editDriverContact}
                    onChange={(e) => setEditDriverContact(e.target.value)}
                    placeholder={origVehicle.driverContact || "Contact"}
                    className="mobile-touch-target"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("stockRegister.vehicleBhadaRate")}</Label>
                  <Input
                    data-testid="input-edit-bhada-rate"
                    type="text"
                    inputMode="decimal"
                    value={editVehicleBhadaRate}
                    onChange={(e) => setEditVehicleBhadaRate(e.target.value)}
                    placeholder={origVehicle.vehicleBhadaRate || "0.00"}
                    className="mobile-touch-target"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Freight Type</Label>
                  <Select value={editFreightType || origVehicle.freightType || "none"} onValueChange={(v) => setEditFreightType(v === "none" ? "" : v)}>
                    <SelectTrigger data-testid="select-edit-freight-type" className="mobile-touch-target">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">--</SelectItem>
                      <SelectItem value="Advance">Advance</SelectItem>
                      <SelectItem value="Credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Total Bags (Vehicle)</Label>
                  <Input
                    data-testid="input-edit-total-bags-vehicle"
                    type="text"
                    inputMode="numeric"
                    value={editTotalBagsInVehicle}
                    onChange={(e) => setEditTotalBagsInVehicle(e.target.value.replace(/\D/g, ''))}
                    placeholder={origVehicle.totalBagsInVehicle || "0"}
                    className="mobile-touch-target"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-medium">Lots</h3>
              {editingGroup?.map((lot) => {
                const lotState = editLotFields[lot.id];
                if (!lotState) return null;
                const isReturned = lot.isReturned;

                return (
                  <div key={lot.id} className={`border rounded-md p-3 space-y-2 ${isReturned ? "opacity-50" : ""}`} data-testid={`edit-lot-section-${lot.id}`}>
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">{lot.crop}</Badge>
                        {getStatusBadge(lot)}
                      </div>
                      {!isReturned && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive border-destructive/30"
                          data-testid={`button-return-lot-${lot.id}`}
                          onClick={() => { setReturningLot(lot); setReturnConfirmOpen(true); }}
                        >
                          {t("stockRegister.returnToFarmer")}
                        </Button>
                      )}
                    </div>

                    {!isReturned && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Original Bags</Label>
                            <Input
                              data-testid={`input-original-bags-${lot.id}`}
                              type="text"
                              inputMode="numeric"
                              value={lotState.numberOfBags}
                              disabled
                              className="h-8 text-sm bg-muted"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Actual Bags</Label>
                            <Input
                              data-testid={`input-actual-bags-${lot.id}`}
                              type="text"
                              inputMode="numeric"
                              value={lotState.actualNumberOfBags}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                const maxBags = parseInt(origLotFields[lot.id]?.numberOfBags || String(lot.numberOfBags));
                                if (val === '' || parseInt(val) <= maxBags) {
                                  updateLotField(lot.id, "actualNumberOfBags", val);
                                }
                              }}
                              placeholder={origLotFields[lot.id]?.actualNumberOfBags || "0"}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("stockRegister.variety")}</Label>
                            <Input
                              data-testid={`input-edit-variety-${lot.id}`}
                              value={lotState.variety}
                              onChange={(e) => updateLotField(lot.id, "variety", e.target.value)}
                              placeholder={origLotFields[lot.id]?.variety || t("common.optional")}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("stockRegister.size")}</Label>
                            <Select value={lotState.size || origLotFields[lot.id]?.size || "none"} onValueChange={(v) => updateLotField(lot.id, "size", v === "none" ? "" : v)}>
                              <SelectTrigger data-testid={`select-edit-size-${lot.id}`} className="h-8 text-sm">
                                <SelectValue placeholder={t("stockEntry.selectSize")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">--</SelectItem>
                                {SIZES.map((s) => (
                                  <SelectItem key={s} value={s}>{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("stockRegister.bagMarka")}</Label>
                            <Input
                              data-testid={`input-edit-bag-marka-${lot.id}`}
                              value={lotState.bagMarka}
                              onChange={(e) => updateLotField(lot.id, "bagMarka", e.target.value)}
                              placeholder={origLotFields[lot.id]?.bagMarka || t("common.optional")}
                              className="h-8 text-sm"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("stockRegister.initialWeight")}</Label>
                            <Input
                              data-testid={`input-edit-initial-weight-${lot.id}`}
                              type="text"
                              inputMode="decimal"
                              value={lotState.initialTotalWeight}
                              onChange={(e) => updateLotField(lot.id, "initialTotalWeight", e.target.value)}
                              placeholder={origLotFields[lot.id]?.initialTotalWeight || "0.00"}
                              className="h-8 text-sm"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              data-testid="button-save-group-edit"
              className="w-full mobile-touch-target"
              onClick={() => saveGroupMutation.mutate()}
              disabled={saveGroupMutation.isPending}
            >
              {saveGroupMutation.isPending ? t("common.saving") : t("common.saveChanges")}
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
              {returningLot && (
                <span className="block mt-1 text-xs text-muted-foreground">
                  {returningLot.crop} - {returningLot.lotId}
                </span>
              )}
              {returningLot && returningLot.remainingBags < (returningLot.actualNumberOfBags ?? returningLot.numberOfBags) ? (
                <span className="block mt-2 text-orange-600 font-medium">
                  {t("stockRegister.returnPartialMsg")} ({(returningLot.actualNumberOfBags ?? returningLot.numberOfBags) - returningLot.remainingBags} bags sold). The bag count will be adjusted to the sold amount and marked as sold out.
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
              onClick={() => returningLot && returnLotMutation.mutate(returningLot.id)}
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
