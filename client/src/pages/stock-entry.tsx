import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DISTRICTS, CROPS, SIZES } from "@shared/schema";
import type { Farmer } from "@shared/schema";
import { Plus, Trash2, Search, Wheat, AlertTriangle, Truck } from "lucide-react";
import { format } from "date-fns";

type LotEntry = {
  crop: string;
  variety: string;
  numberOfBags: string;
  size: string;
  bagMarka: string;
  initialTotalWeight: string;
};

const emptyLot: LotEntry = {
  crop: "",
  variety: "",
  numberOfBags: "",
  size: "",
  bagMarka: "",
  initialTotalWeight: "",
};

export default function StockEntryPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [farmerSearch, setFarmerSearch, clearFarmerSearch] = usePersistedState("se-farmerSearch", "");
  const [selectedFarmer, setSelectedFarmer, clearSelectedFarmer] = usePersistedState<Farmer | null>("se-selectedFarmer", null);
  const [showFarmerForm, setShowFarmerForm, clearShowFarmerForm] = usePersistedState("se-showFarmerForm", false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showVillageSuggestions, setShowVillageSuggestions] = useState(false);
  const [showTehsilSuggestions, setShowTehsilSuggestions] = useState(false);

  const [farmerName, setFarmerName, clearFarmerName] = usePersistedState("se-farmerName", "");
  const [farmerPhone, setFarmerPhone, clearFarmerPhone] = usePersistedState("se-farmerPhone", "");
  const [village, setVillage, clearVillage] = usePersistedState("se-village", "");
  const [tehsil, setTehsil, clearTehsil] = usePersistedState("se-tehsil", "");
  const [district, setDistrict, clearDistrict] = usePersistedState("se-district", "");
  const [state] = useState("Madhya Pradesh");
  const [entryDate, setEntryDate, clearEntryDate] = usePersistedState("se-entryDate", format(new Date(), "yyyy-MM-dd"));

  const [vehicleNumber, setVehicleNumber, clearVehicleNumber] = usePersistedState("se-vehicleNumber", "");
  const [driverName, setDriverName, clearDriverName] = usePersistedState("se-driverName", "");
  const [driverContact, setDriverContact, clearDriverContact] = usePersistedState("se-driverContact", "");
  const [vehicleBhadaRate, setVehicleBhadaRate, clearVehicleBhadaRate] = usePersistedState("se-vehicleBhadaRate", "");
  const [freightType, setFreightType, clearFreightType] = usePersistedState("se-freightType", "");
  const [totalBagsInVehicle, setTotalBagsInVehicle, clearTotalBagsInVehicle] = usePersistedState("se-totalBagsInVehicle", "");

  const [lots, setLots, clearLots] = usePersistedState<LotEntry[]>("se-lots", [{ ...emptyLot }]);

  const { data: farmerSuggestions = [] } = useQuery<Farmer[]>({
    queryKey: ["/api/farmers", `?search=${farmerSearch}`],
    enabled: farmerSearch.length >= 1 && !selectedFarmer,
  });

  const { data: locationData } = useQuery<{ villages: string[]; tehsils: string[] }>({
    queryKey: ["/api/farmers/locations"],
  });

  const filteredVillages = (locationData?.villages || []).filter(
    (v) => village.length >= 1 && v.toLowerCase().includes(village.toLowerCase()) && v.toLowerCase() !== village.toLowerCase()
  );
  const filteredTehsils = (locationData?.tehsils || []).filter(
    (t) => tehsil.length >= 1 && t.toLowerCase().includes(tehsil.toLowerCase()) && t.toLowerCase() !== tehsil.toLowerCase()
  );

  const createFarmerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/farmers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers/locations"] });
    },
  });

  const createBatchMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/lots/batch", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
    },
  });

  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  const selectFarmer = (farmer: Farmer) => {
    setSelectedFarmer(farmer);
    setFarmerName(farmer.name);
    setFarmerPhone(farmer.phone);
    setVillage(farmer.village || "");
    setTehsil(farmer.tehsil || "");
    setDistrict(farmer.district || "");
    setFarmerSearch("");
    setShowSuggestions(false);
    setShowFarmerForm(true);
  };

  const totalLotBags = lots.reduce((sum, l) => sum + (parseInt(l.numberOfBags) || 0), 0);
  const totalBagsLimit = parseInt(totalBagsInVehicle) || 0;
  const canAddMore = totalBagsLimit === 0 || totalLotBags < totalBagsLimit;

  const addLot = () => {
    if (!canAddMore) return;
    setLots([...lots, { ...emptyLot }]);
  };

  const removeLot = (index: number) => {
    if (lots.length === 1) return;
    setLots(lots.filter((_, i) => i !== index));
  };

  const updateLot = (index: number, field: keyof LotEntry, value: string) => {
    const updated = [...lots];
    updated[index] = { ...updated[index], [field]: value };
    setLots(updated);
  };

  const handleSubmit = async () => {
    if (!farmerName || !farmerPhone) {
      toast({ title: "Error", description: "Farmer name and phone are required", variant: "destructive" });
      return;
    }

    if (!vehicleBhadaRate) {
      toast({ title: "Error", description: "Freight/Bhada rate is required", variant: "destructive" });
      return;
    }

    if (!freightType) {
      toast({ title: "Error", description: "Advance/Credit selection is required", variant: "destructive" });
      return;
    }

    if (!totalBagsInVehicle || parseInt(totalBagsInVehicle) <= 0) {
      toast({ title: "Error", description: "Total number of bags is required", variant: "destructive" });
      return;
    }

    const invalidLots = lots.filter(l => !l.crop || !l.numberOfBags);
    if (invalidLots.length > 0) {
      toast({ title: "Error", description: "Each lot needs crop and number of bags", variant: "destructive" });
      return;
    }

    if (totalLotBags > totalBagsLimit) {
      toast({ title: "Error", description: `Sum of lot bags (${totalLotBags}) exceeds total bags (${totalBagsLimit})`, variant: "destructive" });
      return;
    }

    try {
      let farmerId = selectedFarmer?.id;

      if (!farmerId) {
        const farmer = await createFarmerMutation.mutateAsync({
          name: capitalize(farmerName),
          phone: farmerPhone,
          village: capitalize(village),
          tehsil: capitalize(tehsil),
          district,
          state,
        });
        farmerId = farmer.id;
      }

      await createBatchMutation.mutateAsync({
        farmerId,
        date: entryDate,
        vehicleNumber: vehicleNumber || null,
        driverName: driverName || null,
        driverContact: driverContact || null,
        vehicleBhadaRate: vehicleBhadaRate || null,
        freightType,
        totalBagsInVehicle: parseInt(totalBagsInVehicle),
        lots: lots.map(lot => ({
          crop: lot.crop,
          variety: lot.variety || null,
          numberOfBags: parseInt(lot.numberOfBags),
          size: lot.size || null,
          bagMarka: lot.bagMarka || null,
          initialTotalWeight: lot.initialTotalWeight || null,
        })),
      });

      toast({ title: "Stock Entry Saved", description: `${lots.length} lot(s) added to stock register`, variant: "success" });

      clearFarmerSearch();
      clearSelectedFarmer();
      clearShowFarmerForm();
      clearFarmerName();
      clearFarmerPhone();
      clearVillage();
      clearTehsil();
      clearDistrict();
      clearEntryDate();
      clearVehicleNumber();
      clearDriverName();
      clearDriverContact();
      clearVehicleBhadaRate();
      clearFreightType();
      clearTotalBagsInVehicle();
      clearLots();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
        <Wheat className="w-5 h-5 text-primary" />
        {t("stockEntry.title")}
      </h1>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("stockEntry.farmerDetails")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>{t("common.date")}</Label>
            <Input
              type="date"
              data-testid="input-entry-date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="mobile-touch-target text-sm"
            />
          </div>

          {!showFarmerForm && (
            <div className="space-y-2 relative">
              <Label>{t("stockEntry.searchFarmer")}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-farmer-search"
                  value={farmerSearch}
                  onChange={(e) => { setFarmerSearch(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder={t("stockEntry.searchPlaceholder")}
                  className="pl-9 mobile-touch-target text-sm"
                />
              </div>
              {showSuggestions && farmerSuggestions.length > 0 && (
                <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {farmerSuggestions.map((f) => (
                    <button
                      key={f.id}
                      data-testid={`suggestion-farmer-${f.id}`}
                      className="w-full text-left px-3 py-3 hover-elevate text-sm border-b last:border-b-0"
                      onClick={() => selectFarmer(f)}
                    >
                      <span className="font-medium">{f.name}</span>
                      <span className="text-muted-foreground"> - {f.phone}</span>
                      {f.village && <span className="text-muted-foreground"> - {f.village}</span>}
                    </button>
                  ))}
                </div>
              )}
              <Button
                variant="secondary"
                data-testid="button-new-farmer"
                className="w-full mobile-touch-target"
                onClick={() => setShowFarmerForm(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t("stockEntry.newFarmer")}
              </Button>
            </div>
          )}

          {showFarmerForm && (
            <div className="space-y-3">
              {selectedFarmer?.redFlag && (
                <div className="flex items-center gap-2 p-3 rounded-md bg-orange-50 border border-orange-300 text-orange-800 text-sm" data-testid="warning-red-flag-farmer">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 text-orange-600" />
                  <span className="font-medium">{t("stockEntry.redFlagWarningFarmer")}</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 relative">
                  <Label>{t("stockEntry.farmerName")}</Label>
                  <Input
                    data-testid="input-farmer-name"
                    value={farmerName}
                    onChange={(e) => {
                      setFarmerName(e.target.value);
                      if (!selectedFarmer && e.target.value.length >= 2) {
                        setFarmerSearch(e.target.value);
                        setShowSuggestions(true);
                      } else {
                        setShowSuggestions(false);
                      }
                    }}
                    onFocus={() => {
                      if (!selectedFarmer && farmerName.length >= 2) {
                        setFarmerSearch(farmerName);
                        setShowSuggestions(true);
                      }
                    }}
                    placeholder={t("stockEntry.farmerNamePlaceholder")}
                    className="mobile-touch-target text-sm capitalize"
                  />
                  {showSuggestions && farmerSuggestions.length > 0 && !selectedFarmer && (
                    <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg max-h-48 overflow-y-auto top-full">
                      {farmerSuggestions.map((f) => (
                        <button
                          key={f.id}
                          data-testid={`inline-suggestion-farmer-${f.id}`}
                          className="w-full text-left px-3 py-3 hover-elevate text-sm border-b last:border-b-0"
                          onClick={() => selectFarmer(f)}
                        >
                          <span className="font-medium">{f.name}</span>
                          <span className="text-muted-foreground"> - {f.phone}</span>
                          {f.village && <span className="text-muted-foreground"> - {f.village}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>{t("stockEntry.mobileNumber")}</Label>
                  <Input
                    data-testid="input-farmer-phone"
                    type="tel"
                    value={farmerPhone}
                    onChange={(e) => setFarmerPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder={t("stockEntry.mobilePlaceholder")}
                    className="mobile-touch-target text-sm"
                    maxLength={10}
                  />
                  {farmerPhone && farmerPhone.length !== 10 && (
                    <p className="text-xs text-orange-600">Please enter a valid 10-digit mobile number</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1 relative">
                  <Label>{t("common.village")}</Label>
                  <Input
                    data-testid="input-village"
                    value={village}
                    onChange={(e) => { setVillage(e.target.value); setShowVillageSuggestions(true); }}
                    onFocus={() => setShowVillageSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowVillageSuggestions(false), 150)}
                    placeholder={t("common.village")}
                    className="mobile-touch-target text-sm capitalize"
                    autoComplete="off"
                  />
                  {showVillageSuggestions && filteredVillages.length > 0 && (
                    <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
                      {filteredVillages.map((v) => (
                        <button
                          key={v}
                          type="button"
                          data-testid={`suggestion-village-${v}`}
                          className="w-full text-left px-3 py-2 text-sm hover-elevate border-b last:border-b-0"
                          onMouseDown={() => { setVillage(v); setShowVillageSuggestions(false); }}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1 relative">
                  <Label>{t("common.tehsil")}</Label>
                  <Input
                    data-testid="input-tehsil"
                    value={tehsil}
                    onChange={(e) => { setTehsil(e.target.value); setShowTehsilSuggestions(true); }}
                    onFocus={() => setShowTehsilSuggestions(true)}
                    onBlur={() => setTimeout(() => setShowTehsilSuggestions(false), 150)}
                    placeholder={t("common.tehsil")}
                    className="mobile-touch-target text-sm capitalize"
                    autoComplete="off"
                  />
                  {showTehsilSuggestions && filteredTehsils.length > 0 && (
                    <div className="absolute z-50 w-full bg-popover border rounded-md shadow-lg mt-1 max-h-40 overflow-y-auto">
                      {filteredTehsils.map((th) => (
                        <button
                          key={th}
                          type="button"
                          data-testid={`suggestion-tehsil-${th}`}
                          className="w-full text-left px-3 py-2 text-sm hover-elevate border-b last:border-b-0"
                          onMouseDown={() => { setTehsil(th); setShowTehsilSuggestions(false); }}
                        >
                          {th}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1">
                  <Label>{t("common.district")}</Label>
                  <Select value={district} onValueChange={setDistrict}>
                    <SelectTrigger data-testid="select-district" className="mobile-touch-target text-sm">
                      <SelectValue placeholder={t("stockEntry.selectDistrict")} />
                    </SelectTrigger>
                    <SelectContent>
                      {DISTRICTS.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label>{t("common.state")}</Label>
                <Input value={state} disabled className="mobile-touch-target text-sm bg-muted" />
              </div>
              <Button
                variant="secondary"
                size="sm"
                data-testid="button-clear-farmer"
                onClick={() => {
                  clearSelectedFarmer();
                  clearShowFarmerForm();
                  clearFarmerName();
                  clearFarmerPhone();
                  clearVillage();
                  clearTehsil();
                  clearDistrict();
                  setFarmerSearch("");
                }}
              >
                <Trash2 className="w-3 h-3 mr-1" />
                {t("stockEntry.clearSelection")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Truck className="w-4 h-4" />
            Vehicle Information
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Vehicle #</Label>
              <Input
                data-testid="input-vehicle-number"
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                placeholder="e.g. MP09AB1234"
                className="mobile-touch-target text-sm"
                style={{ textTransform: 'uppercase' }}
              />
            </div>
            <div className="space-y-1">
              <Label>Driver Name</Label>
              <Input
                data-testid="input-driver-name"
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                placeholder="Optional"
                className="mobile-touch-target text-sm capitalize"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Driver Contact</Label>
              <Input
                data-testid="input-driver-contact"
                type="tel"
                value={driverContact}
                onChange={(e) => setDriverContact(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="Optional"
                className="mobile-touch-target text-sm"
                maxLength={10}
              />
            </div>
            <div className="space-y-1">
              <Label>Freight/Bhada (₹) <span className="text-red-500">*</span></Label>
              <Input
                data-testid="input-bhada-rate"
                type="text"
                inputMode="decimal"
                value={vehicleBhadaRate}
                onChange={(e) => setVehicleBhadaRate(e.target.value)}
                onFocus={(e) => e.target.select()}
                placeholder="0.00"
                className="mobile-touch-target text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Advance / Credit <span className="text-red-500">*</span></Label>
              <Select value={freightType} onValueChange={setFreightType}>
                <SelectTrigger data-testid="select-freight-type" className="mobile-touch-target text-sm">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Advance">Advance</SelectItem>
                  <SelectItem value="Credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Total # of Bags <span className="text-red-500">*</span></Label>
              <Input
                data-testid="input-total-bags"
                type="text"
                inputMode="numeric"
                value={totalBagsInVehicle}
                onChange={(e) => setTotalBagsInVehicle(e.target.value.replace(/\D/g, ''))}
                onFocus={(e) => e.target.select()}
                placeholder="0"
                className="mobile-touch-target text-sm"
              />
              {totalBagsLimit > 0 && (
                <p className="text-xs text-muted-foreground">
                  Allocated: {totalLotBags} / {totalBagsLimit}
                  {totalLotBags > totalBagsLimit && <span className="text-red-500 ml-1">(exceeds limit)</span>}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <h2 className="text-base font-semibold">{t("stockEntry.lotInfo")}</h2>
        {lots.map((lot, index) => (
          <Card key={index}>
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium text-muted-foreground">{`${t("stockEntry.lot")} #${index + 1}`}</span>
                {lots.length > 1 && (
                  <Button
                    variant="destructive"
                    size="icon"
                    data-testid={`button-remove-lot-${index}`}
                    onClick={() => removeLot(index)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>{t("stockEntry.crop")}</Label>
                  <Select value={lot.crop} onValueChange={(v) => updateLot(index, "crop", v)}>
                    <SelectTrigger data-testid={`select-crop-${index}`} className="mobile-touch-target text-sm">
                      <SelectValue placeholder={t("stockEntry.selectCrop")} />
                    </SelectTrigger>
                    <SelectContent>
                      {CROPS.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{t("stockEntry.numberOfBags")}</Label>
                  <Input
                    data-testid={`input-bags-${index}`}
                    type="text"
                    inputMode="numeric"
                    value={lot.numberOfBags}
                    onChange={(e) => updateLot(index, "numberOfBags", e.target.value.replace(/\D/g, ''))}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
                    className="mobile-touch-target text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("stockEntry.size")}</Label>
                  <Select value={lot.size} onValueChange={(v) => updateLot(index, "size", v === "__none__" ? "" : v)}>
                    <SelectTrigger data-testid={`select-size-${index}`} className="mobile-touch-target text-sm">
                      <SelectValue placeholder={t("common.optional")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {SIZES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>{t("stockEntry.variety")}</Label>
                  <Input
                    data-testid={`input-variety-${index}`}
                    value={lot.variety}
                    onChange={(e) => updateLot(index, "variety", e.target.value)}
                    placeholder={t("common.optional")}
                    className="mobile-touch-target text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("stockEntry.bagMarka")}</Label>
                  <Input
                    data-testid={`input-bag-marka-${index}`}
                    value={lot.bagMarka}
                    onChange={(e) => updateLot(index, "bagMarka", e.target.value)}
                    placeholder={t("common.optional")}
                    className="mobile-touch-target text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("stockEntry.initialWeight")}</Label>
                  <Input
                    data-testid={`input-initial-weight-${index}`}
                    type="text"
                    inputMode="decimal"
                    value={lot.initialTotalWeight}
                    onChange={(e) => updateLot(index, "initialTotalWeight", e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    className="mobile-touch-target text-sm"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          variant="secondary"
          data-testid="button-add-lot"
          className="mobile-touch-target text-sm"
          onClick={addLot}
          disabled={!canAddMore}
        >
          <Plus className="w-4 h-4 mr-2" />
          {t("stockEntry.addLot")}
        </Button>
        <Button
          data-testid="button-submit-stock"
          className="mobile-touch-target flex-1 sm:flex-none"
          onClick={handleSubmit}
          disabled={createBatchMutation.isPending || createFarmerMutation.isPending || (farmerPhone.length > 0 && farmerPhone.length !== 10)}
        >
          {createBatchMutation.isPending ? t("common.saving") : t("stockEntry.saveToRegister")}
        </Button>
      </div>
    </div>
  );
}
