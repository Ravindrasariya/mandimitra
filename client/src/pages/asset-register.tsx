import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/language";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Calculator, Landmark } from "lucide-react";
import { ASSET_CATEGORIES, ASSET_DEPRECIATION_RATES, type Asset, type AssetDepreciationLog } from "@shared/schema";

function getFYOptions(): string[] {
  const now = new Date();
  const currentYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const options: string[] = [];
  for (let y = currentYear; y >= currentYear - 5; y--) {
    options.push(`${y}-${(y + 1).toString().slice(2)}`);
  }
  return options;
}

export default function AssetRegisterPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [disposeDialogOpen, setDisposeDialogOpen] = useState(false);
  const [disposingAsset, setDisposingAsset] = useState<Asset | null>(null);
  const [depDialogOpen, setDepDialogOpen] = useState(false);
  const [expandedAsset, setExpandedAsset] = useState<number | null>(null);
  const [depFY, setDepFY] = useState(getFYOptions()[0]);

  const [formData, setFormData] = useState({
    name: "", category: "Building" as string, purchaseDate: new Date().toISOString().split("T")[0],
    originalCost: "", depreciationRate: "10", assetType: "opening",
  });
  const [disposeData, setDisposeData] = useState({ disposalDate: "", disposalAmount: "", disposalReason: "" });

  const { data: assetList = [], isLoading } = useQuery<Asset[]>({ queryKey: ["/api/assets"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/assets", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); setDialogOpen(false); toast({ title: t("common.saved") }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/assets/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); setDialogOpen(false); setEditingAsset(null); toast({ title: t("common.saved") }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/assets/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); toast({ title: t("common.delete") }); },
  });

  const disposeMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/assets/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/assets"] }); setDisposeDialogOpen(false); setDisposingAsset(null); toast({ title: t("common.saved") }); },
  });

  const depMutation = useMutation({
    mutationFn: (fy: string) => apiRequest("POST", "/api/assets/depreciation", { fy }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/assets"] });
      setDepDialogOpen(false);
      toast({ title: t("assets.depSuccess") });
    },
  });

  const openAdd = () => {
    setEditingAsset(null);
    setFormData({ name: "", category: "Building", purchaseDate: new Date().toISOString().split("T")[0], originalCost: "", depreciationRate: "10", assetType: "opening" });
    setDialogOpen(true);
  };

  const openEdit = (asset: Asset) => {
    setEditingAsset(asset);
    setFormData({
      name: asset.name, category: asset.category, purchaseDate: asset.purchaseDate,
      originalCost: asset.originalCost || "", depreciationRate: asset.depreciationRate || "10", assetType: asset.assetType,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = { ...formData, currentBookValue: formData.originalCost };
    if (editingAsset) {
      updateMutation.mutate({ id: editingAsset.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleCategoryChange = (cat: string) => {
    const rate = ASSET_DEPRECIATION_RATES[cat] || 10;
    setFormData(f => ({ ...f, category: cat, depreciationRate: rate.toString() }));
  };

  const handleDispose = () => {
    if (!disposingAsset) return;
    disposeMutation.mutate({ id: disposingAsset.id, data: { isDisposed: true, ...disposeData } });
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Landmark className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-asset-title">{t("assets.title")}</h1>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300">Beta</Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setDepDialogOpen(true)} data-testid="button-run-depreciation">
            <Calculator className="w-4 h-4 mr-1" />{t("assets.runDepreciation")}
          </Button>
          <Button size="sm" onClick={openAdd} data-testid="button-add-asset">
            <Plus className="w-4 h-4 mr-1" />{t("assets.addAsset")}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : assetList.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="text-no-assets">{t("assets.noAssets")}</div>
      ) : (
        <div className="space-y-3">
          {assetList.map((asset) => (
            <AssetCard
              key={asset.id}
              asset={asset}
              expanded={expandedAsset === asset.id}
              onToggleExpand={() => setExpandedAsset(expandedAsset === asset.id ? null : asset.id)}
              onEdit={() => openEdit(asset)}
              onDelete={() => { if (confirm(t("assets.deleteConfirm"))) deleteMutation.mutate(asset.id); }}
              onDispose={() => { setDisposingAsset(asset); setDisposeData({ disposalDate: new Date().toISOString().split("T")[0], disposalAmount: "", disposalReason: "" }); setDisposeDialogOpen(true); }}
              t={t}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingAsset ? t("assets.editAsset") : t("assets.addAsset")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("assets.name")}</Label>
              <Input data-testid="input-asset-name" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{t("assets.category")}</Label>
              <Select value={formData.category} onValueChange={handleCategoryChange}>
                <SelectTrigger data-testid="select-asset-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("assets.purchaseDate")}</Label>
                <Input data-testid="input-purchase-date" type="date" value={formData.purchaseDate} onChange={e => setFormData(f => ({ ...f, purchaseDate: e.target.value }))} />
              </div>
              <div>
                <Label>{t("assets.originalCost")}</Label>
                <Input data-testid="input-original-cost" type="number" inputMode="decimal" value={formData.originalCost} onChange={e => setFormData(f => ({ ...f, originalCost: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("assets.depRate")}</Label>
              <Input data-testid="input-dep-rate" type="number" inputMode="decimal" value={formData.depreciationRate} onChange={e => setFormData(f => ({ ...f, depreciationRate: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={!formData.name || !formData.originalCost || createMutation.isPending || updateMutation.isPending} data-testid="button-save-asset">
              {(createMutation.isPending || updateMutation.isPending) ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={disposeDialogOpen} onOpenChange={setDisposeDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("assets.dispose")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("assets.disposalDate")}</Label>
              <Input data-testid="input-disposal-date" type="date" value={disposeData.disposalDate} onChange={e => setDisposeData(d => ({ ...d, disposalDate: e.target.value }))} />
            </div>
            <div>
              <Label>{t("assets.disposalAmount")}</Label>
              <Input data-testid="input-disposal-amount" type="number" inputMode="decimal" value={disposeData.disposalAmount} onChange={e => setDisposeData(d => ({ ...d, disposalAmount: e.target.value }))} />
            </div>
            <div>
              <Label>{t("assets.disposalReason")}</Label>
              <Input data-testid="input-disposal-reason" value={disposeData.disposalReason} onChange={e => setDisposeData(d => ({ ...d, disposalReason: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={handleDispose} disabled={disposeMutation.isPending} data-testid="button-confirm-dispose">
              {disposeMutation.isPending ? t("common.saving") : t("assets.dispose")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={depDialogOpen} onOpenChange={setDepDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("assets.runDepreciation")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("assets.fy")}</Label>
              <Select value={depFY} onValueChange={setDepFY}>
                <SelectTrigger data-testid="select-dep-fy"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {getFYOptions().map(fy => <SelectItem key={fy} value={fy}>{fy}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" onClick={() => depMutation.mutate(depFY)} disabled={depMutation.isPending} data-testid="button-confirm-depreciation">
              {depMutation.isPending ? t("common.saving") : t("assets.runDepreciation")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AssetCard({ asset, expanded, onToggleExpand, onEdit, onDelete, onDispose, t }: {
  asset: Asset; expanded: boolean; onToggleExpand: () => void;
  onEdit: () => void; onDelete: () => void; onDispose: () => void;
  t: (key: string) => string;
}) {
  const { data: depLog = [] } = useQuery<AssetDepreciationLog[]>({
    queryKey: ["/api/assets", asset.id, "depreciation"],
    queryFn: async () => { const r = await fetch(`/api/assets/${asset.id}/depreciation`); if (!r.ok) throw new Error("Failed to load"); return r.json(); },
    enabled: expanded,
  });

  return (
    <Card data-testid={`card-asset-${asset.id}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold" data-testid={`text-asset-name-${asset.id}`}>{asset.name}</span>
              <Badge variant="outline" className="text-xs">{asset.category}</Badge>
              {asset.isDisposed ? (
                <Badge variant="destructive" className="text-xs">{t("assets.disposed")}</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-300">{t("assets.active")}</Badge>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <div>{t("assets.purchaseDate")}: <span className="text-foreground">{asset.purchaseDate}</span></div>
              <div>{t("assets.originalCost")}: <span className="text-foreground font-medium">{Number(asset.originalCost).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span></div>
              <div>{t("assets.bookValue")}: <span className="text-foreground font-medium">{Number(asset.currentBookValue).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span></div>
              <div>{t("assets.depRate")}: <span className="text-foreground">{asset.depreciationRate}%</span></div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!asset.isDisposed && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDispose} data-testid={`button-dispose-${asset.id}`} title={t("assets.dispose")}>
                <Trash2 className="w-3.5 h-3.5 text-orange-500" />
              </Button>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} data-testid={`button-edit-asset-${asset.id}`}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} data-testid={`button-delete-asset-${asset.id}`}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleExpand} data-testid={`button-expand-asset-${asset.id}`}>
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 border-t pt-3">
            <h4 className="text-sm font-medium mb-2">{t("assets.depLog")}</h4>
            {depLog.length === 0 ? (
              <p className="text-xs text-muted-foreground">No depreciation records</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-3">{t("assets.fy")}</th>
                      <th className="text-right py-1 pr-3">{t("assets.openingVal")}</th>
                      <th className="text-right py-1 pr-3">{t("assets.depAmount")}</th>
                      <th className="text-right py-1 pr-3">{t("assets.closingVal")}</th>
                      <th className="text-right py-1">{t("assets.months")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depLog.map(log => (
                      <tr key={log.id} className="border-b last:border-0">
                        <td className="py-1 pr-3">{log.financialYear}</td>
                        <td className="text-right py-1 pr-3">{Number(log.openingValue).toLocaleString("en-IN")}</td>
                        <td className="text-right py-1 pr-3 text-red-600">{Number(log.depreciationAmount).toLocaleString("en-IN")}</td>
                        <td className="text-right py-1 pr-3 font-medium">{Number(log.closingValue).toLocaleString("en-IN")}</td>
                        <td className="text-right py-1">{log.monthsUsed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
