import { useState } from "react";
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
import { CROPS, SIZES } from "@shared/schema";
import type { Lot, Farmer } from "@shared/schema";
import { Search, Edit, Package, Wheat } from "lucide-react";
import { format } from "date-fns";

type LotWithFarmer = Lot & { farmer: Farmer };

export default function StockRegisterPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [activeCrop, setActiveCrop] = useState("Garlic");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingLot, setEditingLot] = useState<LotWithFarmer | null>(null);
  const [editVariety, setEditVariety] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editBagMarka, setEditBagMarka] = useState("");
  const [editVehicleNumber, setEditVehicleNumber] = useState("");
  const [editVehicleBhadaRate, setEditVehicleBhadaRate] = useState("");
  const [editInitialTotalWeight, setEditInitialTotalWeight] = useState("");
  const [returnConfirmOpen, setReturnConfirmOpen] = useState(false);

  const todayStr = format(new Date(), "yyyy-MM-dd");

  const { data: allLots = [], isLoading } = useQuery<LotWithFarmer[]>({
    queryKey: ["/api/lots", `?crop=${activeCrop}`],
  });

  const updateLotMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/lots/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      setEditingLot(null);
      toast({ title: "Updated", description: "Lot details updated" });
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
      setReturnConfirmOpen(false);
      setEditingLot(null);
      if (data.soldBags > 0) {
        toast({ title: "Lot Returned", description: `Partially sold lot adjusted to ${data.soldBags} bags and marked as sold` });
      } else {
        toast({ title: "Lot Returned", description: "Lot marked as returned to farmer" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const filtered = searchTerm
    ? allLots.filter(l =>
        l.lotId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.serialNumber.toString().includes(searchTerm) ||
        l.farmer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.farmer.phone.includes(searchTerm)
      )
    : allLots;

  const openEdit = (lot: LotWithFarmer) => {
    setEditingLot(lot);
    setEditVariety(lot.variety || "");
    setEditSize(lot.size || "");
    setEditBagMarka(lot.bagMarka || "");
    setEditVehicleNumber(lot.vehicleNumber || "");
    setEditVehicleBhadaRate(lot.vehicleBhadaRate || "");
    setEditInitialTotalWeight(lot.initialTotalWeight || "");
  };

  const saveEdit = () => {
    if (!editingLot) return;
    updateLotMutation.mutate({
      id: editingLot.id,
      data: {
        variety: editVariety || null,
        size: editSize,
        bagMarka: editBagMarka || null,
        vehicleNumber: editVehicleNumber ? editVehicleNumber.toUpperCase() : null,
        vehicleBhadaRate: editVehicleBhadaRate || null,
        initialTotalWeight: editInitialTotalWeight || null,
      },
    });
  };

  const getLotStatus = (lot: LotWithFarmer) => {
    if (lot.isReturned) return "Returned";
    if (lot.remainingBags === 0) return "Sold Out";
    if (lot.remainingBags < lot.numberOfBags) return "Partially Sold";
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

  const cropIcon = (crop: string) => {
    return <Wheat className="w-4 h-4" />;
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
        <Package className="w-5 h-5 text-primary" />
        {t("stockRegister.title")}
      </h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CROPS.map((crop) => (
          <Button
            key={crop}
            variant={activeCrop === crop ? "default" : "secondary"}
            size="sm"
            data-testid={`toggle-crop-${crop.toLowerCase()}`}
            className="mobile-touch-target whitespace-nowrap"
            onClick={() => setActiveCrop(crop)}
          >
            {crop}
          </Button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          data-testid="input-stock-search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder={t("stockRegister.searchPlaceholder")}
          className="pl-9 mobile-touch-target"
        />
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
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("stockRegister.editLot")} - {editingLot?.lotId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
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
            <div className="space-y-1">
              <Label>{t("stockRegister.vehicleBhadaRate")}</Label>
              <Input
                data-testid="input-edit-bhada-rate"
                type="text"
                inputMode="decimal"
                value={editVehicleBhadaRate}
                onChange={(e) => setEditVehicleBhadaRate(e.target.value)}
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
                placeholder="0.00"
                className="mobile-touch-target"
              />
            </div>
            <Button
              data-testid="button-save-edit"
              className="w-full mobile-touch-target"
              onClick={saveEdit}
              disabled={updateLotMutation.isPending}
            >
              {updateLotMutation.isPending ? t("common.saving") : t("common.saveChanges")}
            </Button>
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
              {editingLot && editingLot.remainingBags < editingLot.numberOfBags ? (
                <span className="block mt-2 text-orange-600 font-medium">
                  {t("stockRegister.returnPartialMsg")} ({editingLot.numberOfBags - editingLot.remainingBags} bags sold). The bag count will be adjusted to the sold amount and marked as sold out.
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
