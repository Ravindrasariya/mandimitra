import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/lib/language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Lot, Farmer, Buyer, Bid } from "@shared/schema";
import { Trash2, AlertTriangle, Pencil } from "lucide-react";

type LotWithFarmer = Lot & { farmer: Farmer };
type BidWithDetails = Bid & { buyer: Buyer; lot: Lot; hasTransaction: boolean };

interface BidDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lot: LotWithFarmer | null;
  serialNumber: number | null;
  date: string;
  onBidSuccess: () => void;
}

export default function BidDialog({ open, onOpenChange, lot: initialLot, serialNumber, date, onBidSuccess }: BidDialogProps) {
  const { toast } = useToast();
  const { t } = useLanguage();

  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);

  const [buyerSearch, setBuyerSearch] = useState("");
  const [selectedBuyerId, setSelectedBuyerId] = useState<number | null>(null);
  const [pricePerKg, setPricePerKg] = useState("");
  const [bidBags, setBidBags] = useState("");
  const [showBuyerDropdown, setShowBuyerDropdown] = useState(false);
  const [paymentType, setPaymentType] = useState("Credit");
  const [advanceAmount, setAdvanceAmount] = useState("500");
  const buyerInputRef = useRef<HTMLInputElement>(null);
  const buyerDropdownRef = useRef<HTMLDivElement>(null);

  const [deleteConfirmBidId, setDeleteConfirmBidId] = useState<number | null>(null);
  const [editingBidId, setEditingBidId] = useState<number | null>(null);
  const [editBuyerId, setEditBuyerId] = useState<number | null>(null);
  const [editBuyerSearch, setEditBuyerSearch] = useState("");
  const [editPricePerKg, setEditPricePerKg] = useState("");
  const [editBidBags, setEditBidBags] = useState("");
  const [editPaymentType, setEditPaymentType] = useState("Credit");
  const [editAdvanceAmount, setEditAdvanceAmount] = useState("0");
  const [editGrade, setEditGrade] = useState("");
  const [showEditBuyerDropdown, setShowEditBuyerDropdown] = useState(false);
  const editBuyerInputRef = useRef<HTMLInputElement>(null);
  const editBuyerDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && initialLot) {
      setSelectedLotId(initialLot.id);
      setBidBags(initialLot.remainingBags > 0 ? initialLot.remainingBags.toString() : "");
      setSelectedBuyerId(null);
      setBuyerSearch("");
      setPricePerKg("");
      setPaymentType("Credit");
      setAdvanceAmount("500");
      setEditingBidId(null);
      setDeleteConfirmBidId(null);
    }
  }, [open, initialLot]);

  const { data: freshLot } = useQuery<LotWithFarmer>({
    queryKey: ["/api/lots", selectedLotId],
    enabled: !!selectedLotId && open,
  });

  const selectedLot = freshLot ?? initialLot;

  const { data: buyers = [] } = useQuery<Buyer[]>({
    queryKey: ["/api/buyers", buyerSearch ? `?search=${buyerSearch}` : ""],
  });

  const filteredBuyers = useMemo(() => {
    if (!buyerSearch.trim()) return buyers;
    const search = buyerSearch.toLowerCase();
    return buyers.filter(b => b.name.toLowerCase().includes(search) || (b.phone && b.phone.includes(search)));
  }, [buyers, buyerSearch]);

  const editFilteredBuyers = useMemo(() => {
    if (!editBuyerSearch.trim()) return buyers;
    const search = editBuyerSearch.toLowerCase();
    return buyers.filter(b => b.name.toLowerCase().includes(search) || (b.phone && b.phone.includes(search)));
  }, [buyers, editBuyerSearch]);

  const { data: lotBids = [] } = useQuery<BidWithDetails[]>({
    queryKey: ["/api/bids", selectedLot ? `?lotId=${selectedLot.id}` : ""],
    enabled: !!selectedLot && open,
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
    onBidSuccess();
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
      setBidBags("");
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
      setDeleteConfirmBidId(null);
      toast({ title: "Bid Deleted", variant: "success" });
    },
  });

  const updateBidMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest("PATCH", `/api/bids/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      invalidateAll();
      setEditingBidId(null);
      toast({ title: "Bid Updated", variant: "success" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
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

  const startEditBid = (bid: BidWithDetails) => {
    setEditingBidId(bid.id);
    setEditBuyerId(bid.buyerId);
    setEditBuyerSearch(bid.buyer.name);
    setEditPricePerKg(bid.pricePerKg);
    setEditBidBags(bid.numberOfBags.toString());
    setEditPaymentType(bid.paymentType || "Credit");
    setEditAdvanceAmount(bid.advanceAmount || "0");
    setEditGrade(bid.grade || "");
    setDeleteConfirmBidId(null);
  };

  const saveEditBid = () => {
    if (!editingBidId || !editBuyerId) return;
    const bags = parseInt(editBidBags);
    if (!bags || bags <= 0) {
      toast({ title: "Error", description: "Number of bags must be greater than 0", variant: "destructive" });
      return;
    }
    if (!editPricePerKg || parseFloat(editPricePerKg) <= 0) {
      toast({ title: "Error", description: "Price must be greater than 0", variant: "destructive" });
      return;
    }
    const editingBid = lotBids.find(b => b.id === editingBidId);
    if (editingBid && selectedLot) {
      const maxBags = selectedLot.remainingBags + editingBid.numberOfBags;
      if (bags > maxBags) {
        toast({ title: "Error", description: `Maximum ${maxBags} bags available`, variant: "destructive" });
        return;
      }
    }
    updateBidMutation.mutate({
      id: editingBidId,
      data: {
        buyerId: editBuyerId,
        pricePerKg: editPricePerKg,
        numberOfBags: bags,
        grade: editGrade || null,
        paymentType: editPaymentType,
        advanceAmount: editPaymentType === "Cash" ? editAdvanceAmount : "0",
      },
    });
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
        editBuyerDropdownRef.current && !editBuyerDropdownRef.current.contains(e.target as Node) &&
        editBuyerInputRef.current && !editBuyerInputRef.current.contains(e.target as Node)
      ) {
        setShowEditBuyerDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const lotHasRemainingBags = selectedLot && selectedLot.remainingBags > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Bid on SR #{serialNumber} | {date} | {selectedLot?.farmer.name}
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
                  <div key={bid.id} className="bg-muted/50 rounded-md p-2 text-sm">
                    {editingBidId === bid.id ? (
                      <div className="space-y-2">
                        <div className="space-y-1">
                          <Label className="text-xs">{t("bidding.buyer")}</Label>
                          <div className="relative">
                            <Input
                              ref={editBuyerInputRef}
                              data-testid={`input-edit-buyer-${bid.id}`}
                              value={editBuyerSearch}
                              onChange={(e) => {
                                setEditBuyerSearch(e.target.value);
                                setEditBuyerId(null);
                                setShowEditBuyerDropdown(true);
                              }}
                              onFocus={() => setShowEditBuyerDropdown(true)}
                              placeholder={t("bidding.selectBuyer")}
                              className="mobile-touch-target"
                              autoComplete="off"
                            />
                            {showEditBuyerDropdown && editBuyerSearch.trim() && editFilteredBuyers.length > 0 && (
                              <div
                                ref={editBuyerDropdownRef}
                                className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-md shadow-md max-h-48 overflow-y-auto"
                              >
                                {editFilteredBuyers.map((b) => (
                                  <button
                                    key={b.id}
                                    type="button"
                                    data-testid={`option-edit-buyer-${b.id}`}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
                                    onClick={() => {
                                      setEditBuyerId(b.id);
                                      setEditBuyerSearch(b.name);
                                      setShowEditBuyerDropdown(false);
                                    }}
                                  >
                                    <span className="font-medium">{b.name}</span>
                                    {b.phone && <span className="text-muted-foreground text-xs ml-1">({b.phone})</span>}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">{t("bidding.pricePerKg")}</Label>
                            <Input
                              data-testid={`input-edit-price-${bid.id}`}
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              value={editPricePerKg}
                              onChange={(e) => setEditPricePerKg(e.target.value)}
                              onFocus={(e) => e.target.select()}
                              className="mobile-touch-target"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("bidding.numberOfBags")}</Label>
                            <Input
                              data-testid={`input-edit-bags-${bid.id}`}
                              type="number"
                              inputMode="numeric"
                              value={editBidBags}
                              onChange={(e) => setEditBidBags(e.target.value)}
                              onFocus={(e) => e.target.select()}
                              className="mobile-touch-target"
                              max={selectedLot ? selectedLot.remainingBags + bid.numberOfBags : undefined}
                            />
                            <span className="text-[10px] text-muted-foreground">Max: {selectedLot ? selectedLot.remainingBags + bid.numberOfBags : "—"}</span>
                          </div>
                        </div>
                        <div className={`grid ${editPaymentType === "Cash" ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
                          <div className="space-y-1">
                            <Label className="text-xs">{t("bidding.paymentType")}</Label>
                            <Select value={editPaymentType} onValueChange={setEditPaymentType}>
                              <SelectTrigger className="mobile-touch-target" data-testid={`select-edit-payment-${bid.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Credit">Credit</SelectItem>
                                <SelectItem value="Cash">Cash</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          {editPaymentType === "Cash" && (
                            <div className="space-y-1">
                              <Label className="text-xs">{t("bidding.advanceAmount")}</Label>
                              <Input
                                data-testid={`input-edit-advance-${bid.id}`}
                                type="number"
                                inputMode="decimal"
                                value={editAdvanceAmount}
                                onChange={(e) => setEditAdvanceAmount(e.target.value)}
                                onFocus={(e) => e.target.select()}
                                className="mobile-touch-target"
                              />
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2 pt-1">
                          <Button
                            size="sm"
                            onClick={saveEditBid}
                            disabled={updateBidMutation.isPending || !editBuyerId}
                            data-testid={`button-save-edit-bid-${bid.id}`}
                          >
                            {updateBidMutation.isPending ? "Saving..." : "Save"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingBidId(null)}
                            data-testid={`button-cancel-edit-bid-${bid.id}`}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : deleteConfirmBidId === bid.id ? (
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-destructive font-medium">Are you sure?</span>
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => deleteBidMutation.mutate(bid.id)}
                            disabled={deleteBidMutation.isPending}
                            data-testid={`button-confirm-delete-bid-${bid.id}`}
                          >
                            {deleteBidMutation.isPending ? "Deleting..." : "Yes, Delete"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDeleteConfirmBidId(null)}
                            data-testid={`button-cancel-delete-bid-${bid.id}`}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <span className="font-medium">{bid.buyer.name}</span>
                          <span className="text-muted-foreground"> - Rs.{bid.pricePerKg}/kg x {bid.numberOfBags} bags</span>
                          {bid.grade && bid.grade !== "__all__" && <Badge variant="secondary" className="ml-2 text-xs">{bid.grade}</Badge>}
                          {bid.paymentType === "Cash" && <Badge variant="outline" className="ml-2 text-xs border-blue-400 text-blue-600 bg-blue-50">Cash ₹{bid.advanceAmount || "0"}</Badge>}
                          {bid.hasTransaction && <Badge variant="outline" className="ml-2 text-xs border-green-400 text-green-600 bg-green-50">Transacted</Badge>}
                        </div>
                        {!bid.hasTransaction && (
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="icon"
                              data-testid={`button-edit-bid-${bid.id}`}
                              onClick={() => startEditBid(bid)}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>
                            <Button
                              variant="destructive"
                              size="icon"
                              data-testid={`button-delete-bid-${bid.id}`}
                              onClick={() => setDeleteConfirmBidId(bid.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        )}
                      </div>
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
                        const val = e.target.value.replace(/\b\w/g, c => c.toUpperCase());
                        setBuyerSearch(val);
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
  );
}
