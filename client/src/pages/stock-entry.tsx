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
import { Plus, Trash2, Search, Wheat } from "lucide-react";
import { format } from "date-fns";

type LotEntry = {
  crop: string;
  variety: string;
  numberOfBags: string;
  size: string;
  bagMarka: string;
  vehicleNumber: string;
  vehicleBhadaRate: string;
  initialTotalWeight: string;
};

const emptyLot: LotEntry = {
  crop: "",
  variety: "",
  numberOfBags: "",
  size: "",
  bagMarka: "",
  vehicleNumber: "",
  vehicleBhadaRate: "",
  initialTotalWeight: "",
};

export default function StockEntryPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [farmerSearch, setFarmerSearch, clearFarmerSearch] = usePersistedState("se-farmerSearch", "");
  const [selectedFarmer, setSelectedFarmer, clearSelectedFarmer] = usePersistedState<Farmer | null>("se-selectedFarmer", null);
  const [showFarmerForm, setShowFarmerForm, clearShowFarmerForm] = usePersistedState("se-showFarmerForm", false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const [farmerName, setFarmerName, clearFarmerName] = usePersistedState("se-farmerName", "");
  const [farmerPhone, setFarmerPhone, clearFarmerPhone] = usePersistedState("se-farmerPhone", "");
  const [village, setVillage, clearVillage] = usePersistedState("se-village", "");
  const [tehsil, setTehsil, clearTehsil] = usePersistedState("se-tehsil", "");
  const [district, setDistrict, clearDistrict] = usePersistedState("se-district", "");
  const [state] = useState("Madhya Pradesh");
  const [entryDate, setEntryDate, clearEntryDate] = usePersistedState("se-entryDate", format(new Date(), "yyyy-MM-dd"));

  const [lots, setLots, clearLots] = usePersistedState<LotEntry[]>("se-lots", [{ ...emptyLot }]);

  const { data: farmerSuggestions = [] } = useQuery<Farmer[]>({
    queryKey: ["/api/farmers", `?search=${farmerSearch}`],
    enabled: farmerSearch.length >= 2 && !selectedFarmer,
  });

  const createFarmerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/farmers", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/farmers"] });
    },
  });

  const createLotMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/lots", data);
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

  const addLot = () => {
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

    const invalidLots = lots.filter(l => !l.crop || !l.numberOfBags || !l.size);
    if (invalidLots.length > 0) {
      toast({ title: "Error", description: "Each lot needs crop, number of bags, and size", variant: "destructive" });
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

      for (const lot of lots) {
        await createLotMutation.mutateAsync({
          farmerId,
          date: entryDate,
          crop: lot.crop,
          variety: lot.variety || null,
          numberOfBags: parseInt(lot.numberOfBags),
          size: lot.size,
          bagMarka: lot.bagMarka || null,
          vehicleNumber: lot.vehicleNumber ? lot.vehicleNumber.toUpperCase() : null,
          vehicleBhadaRate: lot.vehicleBhadaRate || null,
          initialTotalWeight: lot.initialTotalWeight || null,
        });
      }

      toast({ title: "Success", description: `${lots.length} lot(s) added to stock register` });

      clearFarmerSearch();
      clearSelectedFarmer();
      clearShowFarmerForm();
      clearFarmerName();
      clearFarmerPhone();
      clearVillage();
      clearTehsil();
      clearDistrict();
      clearEntryDate();
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
                    onChange={(e) => setFarmerPhone(e.target.value)}
                    placeholder={t("stockEntry.mobilePlaceholder")}
                    className="mobile-touch-target text-sm"
                    maxLength={10}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>{t("common.village")}</Label>
                  <Input
                    data-testid="input-village"
                    value={village}
                    onChange={(e) => setVillage(e.target.value)}
                    placeholder={t("common.village")}
                    className="mobile-touch-target text-sm capitalize"
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("common.tehsil")}</Label>
                  <Input
                    data-testid="input-tehsil"
                    value={tehsil}
                    onChange={(e) => setTehsil(e.target.value)}
                    placeholder={t("common.tehsil")}
                    className="mobile-touch-target text-sm capitalize"
                  />
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
                  <Label>{t("stockEntry.size")}</Label>
                  <Select value={lot.size} onValueChange={(v) => updateLot(index, "size", v)}>
                    <SelectTrigger data-testid={`select-size-${index}`} className="mobile-touch-target text-sm">
                      <SelectValue placeholder={t("stockEntry.selectSize")} />
                    </SelectTrigger>
                    <SelectContent>
                      {SIZES.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label>{t("stockEntry.numberOfBags")}</Label>
                  <Input
                    data-testid={`input-bags-${index}`}
                    type="text"
                    inputMode="numeric"
                    value={lot.numberOfBags}
                    onChange={(e) => updateLot(index, "numberOfBags", e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0"
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
                  <Label>{t("stockEntry.vehicleNumber")}</Label>
                  <Input
                    data-testid={`input-vehicle-number-${index}`}
                    value={lot.vehicleNumber}
                    onChange={(e) => updateLot(index, "vehicleNumber", e.target.value.toUpperCase())}
                    placeholder="e.g. MP09AB1234"
                    className="mobile-touch-target text-sm"
                    style={{ textTransform: 'uppercase' }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{t("stockEntry.bhadaRate")}</Label>
                  <Input
                    data-testid={`input-bhada-rate-${index}`}
                    type="text"
                    inputMode="decimal"
                    value={lot.vehicleBhadaRate}
                    onChange={(e) => updateLot(index, "vehicleBhadaRate", e.target.value)}
                    onFocus={(e) => e.target.select()}
                    placeholder="0.00"
                    className="mobile-touch-target text-sm"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
        >
          <Plus className="w-4 h-4 mr-2" />
          {t("stockEntry.addLot")}
        </Button>
        <Button
          data-testid="button-submit-stock"
          className="mobile-touch-target flex-1 sm:flex-none"
          onClick={handleSubmit}
          disabled={createLotMutation.isPending || createFarmerMutation.isPending}
        >
          {createLotMutation.isPending ? t("common.saving") : t("stockEntry.saveToRegister")}
        </Button>
      </div>
    </div>
  );
}
