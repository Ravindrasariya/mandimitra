import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { CROPS } from "@shared/schema";
import type { Lot, Farmer } from "@shared/schema";
import { Search, Edit, Package, Wheat } from "lucide-react";
import { format } from "date-fns";

type LotWithFarmer = Lot & { farmer: Farmer };

export default function StockRegisterPage() {
  const { toast } = useToast();
  const [activeCrop, setActiveCrop] = useState("Garlic");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingLot, setEditingLot] = useState<LotWithFarmer | null>(null);
  const [editVariety, setEditVariety] = useState("");
  const [editWeight1, setEditWeight1] = useState("");
  const [editWeight2, setEditWeight2] = useState("");

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
    setEditWeight1(lot.sampleBagWeight1 || "");
    setEditWeight2(lot.sampleBagWeight2 || "");
  };

  const saveEdit = () => {
    if (!editingLot) return;
    updateLotMutation.mutate({
      id: editingLot.id,
      data: {
        variety: editVariety || null,
        sampleBagWeight1: editWeight1 || null,
        sampleBagWeight2: editWeight2 || null,
      },
    });
  };

  const cropIcon = (crop: string) => {
    return <Wheat className="w-4 h-4" />;
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl md:text-2xl font-bold flex items-center gap-2">
        <Package className="w-6 h-6 text-primary" />
        Stock Register
      </h1>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {CROPS.map((crop) => (
          <Button
            key={crop}
            variant={activeCrop === crop ? "default" : "secondary"}
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
          placeholder="Search by farmer name, phone, Lot ID, SR#..."
          className="pl-9 mobile-touch-target"
        />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No lots found for {activeCrop}
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((lot) => (
            <Card key={lot.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <Badge variant="secondary" className="text-xs">SR #{lot.serialNumber}</Badge>
                      <Badge className="text-xs">{lot.lotId}</Badge>
                      {lot.remainingBags === 0 && (
                        <Badge variant="destructive" className="text-xs">Sold Out</Badge>
                      )}
                    </div>
                    <div className="text-sm space-y-1">
                      <p className="font-medium truncate">{lot.farmer.name} - {lot.farmer.phone}</p>
                      {lot.farmer.village && (
                        <p className="text-muted-foreground text-xs">{lot.farmer.village}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Date: {lot.date}</span>
                        {lot.variety && <span>Variety: {lot.variety}</span>}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                        <span>Bags: <strong>{lot.numberOfBags}</strong></span>
                        <span>Remaining: <strong className={lot.remainingBags > 0 ? "text-primary" : "text-destructive"}>{lot.remainingBags}</strong></span>
                        {lot.estimatedWeight && <span>Est. Wt: <strong>{lot.estimatedWeight} kg</strong></span>}
                      </div>
                      {(lot.sampleBagWeight1 || lot.sampleBagWeight2) && (
                        <p className="text-xs text-muted-foreground">
                          Sample: {lot.sampleBagWeight1 || "-"} / {lot.sampleBagWeight2 || "-"} kg
                          {lot.averageBagWeight && ` (Avg: ${lot.averageBagWeight} kg)`}
                        </p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="icon"
                    data-testid={`button-edit-lot-${lot.id}`}
                    onClick={() => openEdit(lot)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editingLot} onOpenChange={(open) => !open && setEditingLot(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Lot - {editingLot?.lotId}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Variety</Label>
              <Input
                data-testid="input-edit-variety"
                value={editVariety}
                onChange={(e) => setEditVariety(e.target.value)}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>Sample Weight 1 (kg)</Label>
              <Input
                data-testid="input-edit-weight1"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={editWeight1}
                onChange={(e) => setEditWeight1(e.target.value)}
                className="mobile-touch-target"
              />
            </div>
            <div className="space-y-1">
              <Label>Sample Weight 2 (kg)</Label>
              <Input
                data-testid="input-edit-weight2"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={editWeight2}
                onChange={(e) => setEditWeight2(e.target.value)}
                className="mobile-touch-target"
              />
            </div>
            <Button
              data-testid="button-save-edit"
              className="w-full mobile-touch-target"
              onClick={saveEdit}
              disabled={updateLotMutation.isPending}
            >
              {updateLotMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
