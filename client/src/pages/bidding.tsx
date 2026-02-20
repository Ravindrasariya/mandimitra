import { useState } from "react";
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
import { CROPS, SIZES } from "@shared/schema";
import type { Lot, Farmer, Buyer, Bid } from "@shared/schema";
import { Gavel, Plus, Trash2, Search } from "lucide-react";

type LotWithFarmer = Lot & { farmer: Farmer };
type BidWithDetails = Bid & { buyer: Buyer; lot: Lot };

export default function BiddingPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [activeCrop, setActiveCrop] = usePersistedState("bid-activeCrop", "Garlic");
  const [activeGrade, setActiveGrade] = usePersistedState("bid-activeGrade", "Large");
  const [selectedLot, setSelectedLot] = useState<LotWithFarmer | null>(null);
  const [bidDialogOpen, setBidDialogOpen] = useState(false);
  const [buyerSearch, setBuyerSearch] = useState("");
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);
  const [pricePerKg, setPricePerKg] = useState("");
  const [bidBags, setBidBags] = useState("");

  const { data: lots = [], isLoading } = useQuery<LotWithFarmer[]>({
    queryKey: ["/api/lots", `?crop=${activeCrop}`],
  });

  const availableLots = lots.filter(l => l.remainingBags > 0 && !l.isReturned && l.size === activeGrade);

  const { data: buyers = [] } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers", buyerSearch ? `?search=${buyerSearch}` : ""],
  });

  const { data: lotBids = [] } = useQuery<BidWithDetails[]>({
    queryKey: ["/api/bids", selectedLot ? `?lotId=${selectedLot.id}` : ""],
    enabled: !!selectedLot,
  });

  const createBidMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/bids", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
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
      queryClient.invalidateQueries({ queryKey: ["/api/bids"] });
      queryClient.invalidateQueries({ queryKey: ["/api/lots"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/farmers-with-dues"] });
      queryClient.invalidateQueries({ predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && key.startsWith("/api/buyers");
      }});
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
    setBidBags(lot.remainingBags.toString());
    setBidDialogOpen(true);
  };

  const submitBid = () => {
    if (!selectedLot || !selectedBuyerId || !pricePerKg || !bidBags) {
      toast({ title: "Error", description: "All bid fields are required", variant: "destructive" });
      return;
    }
    const bags = parseInt(bidBags);
    if (bags > selectedLot.remainingBags) {
      toast({ title: "Error", description: `Only ${selectedLot.remainingBags} bags remaining`, variant: "destructive" });
      return;
    }

    createBidMutation.mutate({
      lotId: selectedLot.id,
      buyerId: selectedBuyerId,
      pricePerKg,
      numberOfBags: bags,
      grade: activeGrade,
    });
  };

  const [newBuyerName, setNewBuyerName] = useState("");
  const [newBuyerPhone, setNewBuyerPhone] = useState("");
  const [showNewBuyer, setShowNewBuyer] = useState(false);

  const addNewBuyer = async () => {
    if (!newBuyerName) return;
    try {
      const buyer = await createBuyerMutation.mutateAsync({ name: newBuyerName, phone: newBuyerPhone || null });
      setSelectedBuyerId(buyer.id);
      setShowNewBuyer(false);
      setNewBuyerName("");
      setNewBuyerPhone("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  return (
    <div className="p-3 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-base md:text-lg font-bold flex items-center gap-2">
        <Gavel className="w-5 h-5 text-primary" />
        {t("bidding.title")}
      </h1>

      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-2 flex-wrap">
          {SIZES.map((size) => (
            <Button
              key={size}
              variant={activeGrade === size ? "default" : "secondary"}
              size="sm"
              data-testid={`toggle-size-${size.toLowerCase()}`}
              className="mobile-touch-target whitespace-nowrap"
              onClick={() => setActiveGrade(size)}
            >
              {size}
            </Button>
          ))}
        </div>
        <Select value={activeCrop} onValueChange={setActiveCrop}>
          <SelectTrigger data-testid="select-bid-crop" className="w-[130px] mobile-touch-target flex-shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CROPS.map((crop) => (
              <SelectItem key={crop} value={crop} data-testid={`toggle-bid-crop-${crop.toLowerCase()}`}>
                {crop}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : availableLots.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {t("bidding.noLots")} {activeCrop}
        </div>
      ) : (
        <div className="space-y-3">
          {availableLots.map((lot) => (
            <Card key={lot.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <Badge variant="secondary" className="text-xs">SR #{lot.serialNumber}</Badge>
                      <Badge className="text-xs">{lot.lotId}</Badge>
                    </div>
                    <p className="text-sm font-medium truncate">{lot.farmer.name}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground mt-1">
                      <span>{t("common.remaining")}: <strong className="text-foreground">{lot.remainingBags}</strong> / {lot.actualNumberOfBags ?? lot.numberOfBags} {t("common.bags")}</span>
                      {lot.initialTotalWeight && <span>{t("stockRegister.initWt")}: {lot.initialTotalWeight} kg</span>}
                    </div>
                  </div>
                  <Button
                    data-testid={`button-bid-lot-${lot.id}`}
                    className="mobile-touch-target"
                    onClick={() => openBidDialog(lot)}
                  >
                    <Gavel className="w-4 h-4 mr-1" />
                    {t("bidding.bid")}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={bidDialogOpen} onOpenChange={setBidDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Bid on {selectedLot?.lotId} - {selectedLot?.farmer.name}
            </DialogTitle>
          </DialogHeader>

          {selectedLot && (
            <div className="space-y-4">
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <p>{t("bidding.remainingBags")}: <strong>{selectedLot.remainingBags}</strong></p>
                <p>{t("stockRegister.size")}: <strong>{activeGrade}</strong></p>
              </div>

              {lotBids.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("bidding.existingBids")}</Label>
                  {lotBids.map((bid) => (
                    <div key={bid.id} className="flex items-center justify-between gap-2 bg-muted/50 rounded-md p-2 text-sm">
                      <div>
                        <span className="font-medium">{bid.buyer.name}</span>
                        <span className="text-muted-foreground"> - Rs.{bid.pricePerKg}/kg x {bid.numberOfBags} bags</span>
                        {bid.grade && <Badge variant="secondary" className="ml-2 text-xs">{bid.grade}</Badge>}
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        data-testid={`button-delete-bid-${bid.id}`}
                        onClick={() => deleteBidMutation.mutate(bid.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="border-t pt-4 space-y-3">
                <Label className="font-medium">{t("bidding.newBid")}</Label>
                <div className="space-y-2">
                  <Label>{t("bidding.buyer")}</Label>
                  {!showNewBuyer ? (
                    <div className="space-y-2">
                      <Select
                        value={selectedBuyerId?.toString() || ""}
                        onValueChange={(v) => setSelectedBuyerId(parseInt(v))}
                      >
                        <SelectTrigger data-testid="select-buyer" className="mobile-touch-target">
                          <SelectValue placeholder={t("bidding.selectBuyer")} />
                        </SelectTrigger>
                        <SelectContent>
                          {buyers.map((b) => (
                            <SelectItem key={b.id} value={b.id.toString()}>{b.name}{b.phone ? ` (${b.phone})` : ""}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="secondary"
                        size="sm"
                        data-testid="button-new-buyer"
                        onClick={() => setShowNewBuyer(true)}
                        className="mobile-touch-target"
                      >
                        <Plus className="w-3 h-3 mr-1" /> {t("bidding.newBuyer")}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2 bg-muted/50 rounded-md p-3">
                      <Input
                        data-testid="input-new-buyer-name"
                        value={newBuyerName}
                        onChange={(e) => setNewBuyerName(e.target.value)}
                        placeholder={t("bidding.buyerName")}
                        className="mobile-touch-target"
                      />
                      <Input
                        data-testid="input-new-buyer-phone"
                        value={newBuyerPhone}
                        onChange={(e) => setNewBuyerPhone(e.target.value)}
                        placeholder={t("bidding.phoneOptional")}
                        className="mobile-touch-target"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" data-testid="button-save-buyer" onClick={addNewBuyer} className="mobile-touch-target">{t("common.save")}</Button>
                        <Button size="sm" variant="secondary" onClick={() => setShowNewBuyer(false)} className="mobile-touch-target">{t("common.cancel")}</Button>
                      </div>
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
                  disabled={createBidMutation.isPending}
                >
                  {createBidMutation.isPending ? t("common.saving") : t("bidding.addBid")}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
