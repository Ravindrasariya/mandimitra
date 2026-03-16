import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/lib/language";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Scale, CheckCircle, RotateCcw } from "lucide-react";
import { LIABILITY_TYPES, type Liability, type LiabilityPayment } from "@shared/schema";

export default function LiabilityRegisterPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Liability | null>(null);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [payingLiability, setPayingLiability] = useState<Liability | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    name: "", type: "Bank Loan" as string, originalAmount: "", outstandingAmount: "",
    interestRate: "", emiAmount: "", startDate: new Date().toISOString().split("T")[0],
  });
  const [paymentData, setPaymentData] = useState({ paymentDate: new Date().toISOString().split("T")[0], amount: "", principalAmount: "", interestAmount: "" });

  const { data: liabilityList = [], isLoading } = useQuery<Liability[]>({ queryKey: ["/api/liabilities"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/liabilities", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); setDialogOpen(false); toast({ title: t("common.saved") }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/liabilities/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); setDialogOpen(false); setEditing(null); toast({ title: t("common.saved") }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/liabilities/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); toast({ title: t("common.delete") }); },
  });

  const settleMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/liabilities/${id}/settle`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] }); toast({ title: t("common.saved") }); },
  });

  const paymentMutation = useMutation({
    mutationFn: ({ liabilityId, data }: { liabilityId: number; data: any }) => apiRequest("POST", `/api/liabilities/${liabilityId}/payments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      if (payingLiability) queryClient.invalidateQueries({ queryKey: ["/api/liabilities", payingLiability.id, "payments"] });
      setPaymentDialogOpen(false); toast({ title: t("common.saved") });
    },
  });

  const openAdd = () => {
    setEditing(null);
    setFormData({ name: "", type: "Bank Loan", originalAmount: "", outstandingAmount: "", interestRate: "", emiAmount: "", startDate: new Date().toISOString().split("T")[0] });
    setDialogOpen(true);
  };

  const openEdit = (l: Liability) => {
    setEditing(l);
    setFormData({
      name: l.name, type: l.type, originalAmount: l.originalAmount || "",
      outstandingAmount: l.outstandingAmount || "", interestRate: l.interestRate || "",
      emiAmount: l.emiAmount || "", startDate: l.startDate,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (editing) {
      updateMutation.mutate({ id: editing.id, data: formData });
    } else {
      createMutation.mutate({ ...formData, outstandingAmount: formData.outstandingAmount || formData.originalAmount });
    }
  };

  const openPayment = (l: Liability) => {
    setPayingLiability(l);
    setPaymentData({ paymentDate: new Date().toISOString().split("T")[0], amount: "", principalAmount: "", interestAmount: "" });
    setPaymentDialogOpen(true);
  };

  const handlePayment = () => {
    if (!payingLiability) return;
    const total = parseFloat(paymentData.amount || "0");
    const principal = parseFloat(paymentData.principalAmount || "0");
    const interest = total - principal;
    paymentMutation.mutate({
      liabilityId: payingLiability.id,
      data: { ...paymentData, amount: total.toFixed(2), principalAmount: principal.toFixed(2), interestAmount: Math.max(0, interest).toFixed(2) },
    });
  };

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Scale className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold" data-testid="text-liability-title">{t("liabilities.title")}</h1>
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-300">Beta</Badge>
        </div>
        <Button size="sm" onClick={openAdd} data-testid="button-add-liability">
          <Plus className="w-4 h-4 mr-1" />{t("liabilities.addLiability")}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">{t("app.loading")}</div>
      ) : liabilityList.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground" data-testid="text-no-liabilities">{t("liabilities.noLiabilities")}</div>
      ) : (
        <div className="space-y-3">
          {liabilityList.map((l) => (
            <LiabilityCard
              key={l.id}
              liability={l}
              expanded={expandedId === l.id}
              onToggleExpand={() => setExpandedId(expandedId === l.id ? null : l.id)}
              onEdit={() => openEdit(l)}
              onDelete={() => { if (confirm(t("liabilities.deleteConfirm"))) deleteMutation.mutate(l.id); }}
              onSettle={() => settleMutation.mutate(l.id)}
              onAddPayment={() => openPayment(l)}
              t={t}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? t("liabilities.editLiability") : t("liabilities.addLiability")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("liabilities.name")}</Label>
              <Input data-testid="input-liability-name" value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>{t("liabilities.type")}</Label>
              <Select value={formData.type} onValueChange={v => setFormData(f => ({ ...f, type: v }))}>
                <SelectTrigger data-testid="select-liability-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIABILITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("liabilities.originalAmount")}</Label>
                <Input data-testid="input-original-amount" type="number" inputMode="decimal" value={formData.originalAmount} onChange={e => setFormData(f => ({ ...f, originalAmount: e.target.value }))} />
              </div>
              <div>
                <Label>{t("liabilities.outstanding")}</Label>
                <Input data-testid="input-outstanding" type="number" inputMode="decimal" value={formData.outstandingAmount} onChange={e => setFormData(f => ({ ...f, outstandingAmount: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("liabilities.interestRate")}</Label>
                <Input data-testid="input-interest-rate" type="number" inputMode="decimal" value={formData.interestRate} onChange={e => setFormData(f => ({ ...f, interestRate: e.target.value }))} />
              </div>
              <div>
                <Label>{t("liabilities.emi")}</Label>
                <Input data-testid="input-emi" type="number" inputMode="decimal" value={formData.emiAmount} onChange={e => setFormData(f => ({ ...f, emiAmount: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>{t("liabilities.startDate")}</Label>
              <Input data-testid="input-start-date" type="date" value={formData.startDate} onChange={e => setFormData(f => ({ ...f, startDate: e.target.value }))} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={!formData.name || !formData.originalAmount || createMutation.isPending || updateMutation.isPending} data-testid="button-save-liability">
              {(createMutation.isPending || updateMutation.isPending) ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("liabilities.addPayment")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("liabilities.paymentDate")}</Label>
              <Input data-testid="input-payment-date" type="date" value={paymentData.paymentDate} onChange={e => setPaymentData(d => ({ ...d, paymentDate: e.target.value }))} />
            </div>
            <div>
              <Label>{t("liabilities.amount")}</Label>
              <Input data-testid="input-payment-amount" type="number" inputMode="decimal" value={paymentData.amount} onChange={e => setPaymentData(d => ({ ...d, amount: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("liabilities.principal")}</Label>
                <Input data-testid="input-principal" type="number" inputMode="decimal" value={paymentData.principalAmount} onChange={e => setPaymentData(d => ({ ...d, principalAmount: e.target.value }))} />
              </div>
              <div>
                <Label>{t("liabilities.interest")}</Label>
                <Input disabled value={paymentData.amount && paymentData.principalAmount ? (parseFloat(paymentData.amount) - parseFloat(paymentData.principalAmount || "0")).toFixed(2) : ""} />
              </div>
            </div>
            <Button className="w-full" onClick={handlePayment} disabled={!paymentData.amount || paymentMutation.isPending} data-testid="button-save-payment">
              {paymentMutation.isPending ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LiabilityCard({ liability, expanded, onToggleExpand, onEdit, onDelete, onSettle, onAddPayment, t }: {
  liability: Liability; expanded: boolean; onToggleExpand: () => void;
  onEdit: () => void; onDelete: () => void; onSettle: () => void; onAddPayment: () => void;
  t: (key: string) => string;
}) {
  const { toast } = useToast();

  const { data: payments = [] } = useQuery<LiabilityPayment[]>({
    queryKey: ["/api/liabilities", liability.id, "payments"],
    queryFn: async () => { const r = await fetch(`/api/liabilities/${liability.id}/payments`); if (!r.ok) throw new Error("Failed to load"); return r.json(); },
    enabled: expanded,
  });

  const reverseMutation = useMutation({
    mutationFn: (paymentId: number) => apiRequest("POST", `/api/liabilities/${liability.id}/payments/${paymentId}/reverse`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities"] });
      queryClient.invalidateQueries({ queryKey: ["/api/liabilities", liability.id, "payments"] });
      toast({ title: t("common.saved") });
    },
  });

  return (
    <Card data-testid={`card-liability-${liability.id}`}>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold" data-testid={`text-liability-name-${liability.id}`}>{liability.name}</span>
              <Badge variant="outline" className="text-xs">{liability.type}</Badge>
              {liability.isSettled && <Badge variant="secondary" className="text-xs bg-green-50 text-green-700 border-green-300">{t("liabilities.settled")}</Badge>}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 mt-2 text-sm text-muted-foreground">
              <div>{t("liabilities.originalAmount")}: <span className="text-foreground font-medium">{Number(liability.originalAmount).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span></div>
              <div>{t("liabilities.outstanding")}: <span className="text-foreground font-medium text-red-600">{Number(liability.outstandingAmount).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span></div>
              <div>{t("liabilities.interestRate")}: <span className="text-foreground">{liability.interestRate}%</span></div>
              {liability.emiAmount && <div>{t("liabilities.emi")}: <span className="text-foreground">{Number(liability.emiAmount).toLocaleString("en-IN", { style: "currency", currency: "INR" })}</span></div>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!liability.isSettled && (
              <>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onAddPayment} data-testid={`button-pay-${liability.id}`} title={t("liabilities.addPayment")}>
                  <Plus className="w-3.5 h-3.5 text-green-600" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onSettle} data-testid={`button-settle-${liability.id}`} title={t("liabilities.markSettled")}>
                  <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} data-testid={`button-edit-liability-${liability.id}`}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete} data-testid={`button-delete-liability-${liability.id}`}>
              <Trash2 className="w-3.5 h-3.5 text-destructive" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onToggleExpand} data-testid={`button-expand-liability-${liability.id}`}>
              {expanded ? <ChevronUp className="w-5 h-5" strokeWidth={3} /> : <ChevronDown className="w-5 h-5" strokeWidth={3} />}
            </Button>
          </div>
        </div>

        {expanded && (
          <div className="mt-3 border-t pt-3">
            <h4 className="text-sm font-medium mb-2">{t("liabilities.payments")}</h4>
            {payments.length === 0 ? (
              <p className="text-xs text-muted-foreground">No payments recorded</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-1 pr-3">{t("liabilities.paymentDate")}</th>
                      <th className="text-right py-1 pr-3">{t("liabilities.amount")}</th>
                      <th className="text-right py-1 pr-3">{t("liabilities.principal")}</th>
                      <th className="text-right py-1 pr-3">{t("liabilities.interest")}</th>
                      <th className="text-right py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id} className={`border-b last:border-0 ${p.isReversed ? "opacity-40 line-through" : ""}`}>
                        <td className="py-1 pr-3">{p.paymentDate}</td>
                        <td className="text-right py-1 pr-3">{Number(p.amount).toLocaleString("en-IN")}</td>
                        <td className="text-right py-1 pr-3">{Number(p.principalAmount).toLocaleString("en-IN")}</td>
                        <td className="text-right py-1 pr-3">{Number(p.interestAmount).toLocaleString("en-IN")}</td>
                        <td className="text-right py-1">
                          {p.isReversed ? (
                            <Badge variant="outline" className="text-[10px]">{t("liabilities.reversed")}</Badge>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => reverseMutation.mutate(p.id)} data-testid={`button-reverse-payment-${p.id}`}>
                              <RotateCcw className="w-3 h-3 text-orange-500" />
                            </Button>
                          )}
                        </td>
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
