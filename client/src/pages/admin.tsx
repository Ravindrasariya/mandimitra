import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Building2, Users as UsersIcon, Plus, Search, Pencil, Power, Archive, RotateCcw,
  Trash2, KeyRound, LogOut, AlertTriangle,
} from "lucide-react";
import type { Business, User } from "@shared/schema";

type SafeUser = Omit<User, "password"> & { business: Business };

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge data-testid="badge-status-active" className="bg-green-500 hover:bg-green-600">Active</Badge>;
  if (status === "inactive") return <Badge data-testid="badge-status-inactive" variant="secondary">Inactive</Badge>;
  return <Badge data-testid="badge-status-archived" variant="outline">Archived</Badge>;
}

export default function AdminPage() {
  const { logout } = useAuth();
  const [tab, setTab] = useState<"merchants" | "users">("merchants");

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b bg-card sticky top-0 z-30">
        <div>
          <h1 className="text-lg font-bold">Admin Panel</h1>
          <p className="text-xs text-muted-foreground">Manage merchants and users</p>
        </div>
        <Button variant="outline" size="sm" data-testid="button-admin-logout" onClick={logout}>
          <LogOut className="w-4 h-4 mr-1" /> Logout
        </Button>
      </header>

      <div className="px-4 md:px-6 py-4">
        <div className="flex gap-2 mb-6">
          <Button
            variant={tab === "merchants" ? "default" : "outline"}
            size="sm"
            data-testid="tab-merchants"
            onClick={() => setTab("merchants")}
          >
            <Building2 className="w-4 h-4 mr-1" /> Merchants
          </Button>
          <Button
            variant={tab === "users" ? "default" : "outline"}
            size="sm"
            data-testid="tab-users"
            onClick={() => setTab("users")}
          >
            <UsersIcon className="w-4 h-4 mr-1" /> Users
          </Button>
        </div>

        {tab === "merchants" ? <MerchantsTab /> : <UsersTab />}
      </div>
    </div>
  );
}

function MerchantsTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editBiz, setEditBiz] = useState<Business | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "toggle" | "archive" | "reset"; biz: Business } | null>(null);

  const { data: businesses = [], isLoading } = useQuery<Business[]>({
    queryKey: ["/api/admin/businesses"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; phone: string; address: string }) => {
      const res = await apiRequest("POST", "/api/admin/businesses", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: "Success", description: "Merchant created" });
      setShowAdd(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<Business> }) => {
      const res = await apiRequest("PATCH", `/api/admin/businesses/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: "Success", description: "Merchant updated" });
      setEditBiz(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = businesses.filter(b =>
    !search || b.name.toLowerCase().includes(search.toLowerCase()) ||
    b.merchantId.toLowerCase().includes(search.toLowerCase()) ||
    (b.phone || "").includes(search)
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Merchants</CardTitle>
              <p className="text-xs text-muted-foreground">Manage all registered merchants/businesses</p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-merchants"
                  placeholder="Search Merchants..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button data-testid="button-add-merchant" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Merchant
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No merchants found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 px-2 font-medium">Merchant ID</th>
                    <th className="py-2 px-2 font-medium">Name</th>
                    <th className="py-2 px-2 font-medium">Status</th>
                    <th className="py-2 px-2 font-medium">Contact</th>
                    <th className="py-2 px-2 font-medium">Address</th>
                    <th className="py-2 px-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((biz) => (
                    <tr key={biz.id} className="border-b hover:bg-muted/50" data-testid={`row-merchant-${biz.id}`}>
                      <td className="py-3 px-2 font-mono text-xs">{biz.merchantId}</td>
                      <td className="py-3 px-2 font-medium">{biz.name}</td>
                      <td className="py-3 px-2"><StatusBadge status={biz.status} /></td>
                      <td className="py-3 px-2">{biz.phone ? `${biz.phone}` : "-"}</td>
                      <td className="py-3 px-2 max-w-[200px] truncate text-muted-foreground">{biz.address || "-"}</td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-edit-merchant-${biz.id}`}
                            title="Edit"
                            onClick={() => setEditBiz(biz)}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-toggle-merchant-${biz.id}`}
                            title={biz.status === "active" ? "Deactivate" : "Activate"}
                            onClick={() => setConfirmAction({ type: "toggle", biz })}
                          >
                            <Power className={`w-4 h-4 ${biz.status === "active" ? "text-green-600" : "text-muted-foreground"}`} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-archive-merchant-${biz.id}`}
                            title={biz.status === "archived" ? "Unarchive" : "Archive"}
                            onClick={() => setConfirmAction({ type: "archive", biz })}
                          >
                            <Archive className={`w-4 h-4 ${biz.status === "archived" ? "text-orange-500" : ""}`} />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            data-testid={`button-reset-merchant-${biz.id}`}
                            title="Reset"
                            onClick={() => setConfirmAction({ type: "reset", biz })}
                          >
                            <RotateCcw className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddMerchantDialog open={showAdd} onClose={() => setShowAdd(false)} onSubmit={(data) => createMutation.mutate(data)} isPending={createMutation.isPending} />
      {editBiz && <EditMerchantDialog biz={editBiz} onClose={() => setEditBiz(null)} onSubmit={(data) => updateMutation.mutate({ id: editBiz.id, data })} isPending={updateMutation.isPending} />}
      {confirmAction && <ConfirmMerchantAction action={confirmAction} onClose={() => setConfirmAction(null)} />}
    </>
  );
}

function AddMerchantDialog({ open, onClose, onSubmit, isPending }: { open: boolean; onClose: () => void; onSubmit: (data: { name: string; phone: string; address: string }) => void; isPending: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, phone, address });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setName(""); setPhone(""); setAddress(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Merchant</DialogTitle>
          <DialogDescription>Create a new merchant/business account</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name *</Label>
            <Input data-testid="input-merchant-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter business name" required />
          </div>
          <div className="space-y-2">
            <Label>Contact Number</Label>
            <Input data-testid="input-merchant-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter contact number" />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input data-testid="input-merchant-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Enter address" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" data-testid="button-save-merchant" disabled={isPending || !name}>{isPending ? "Saving..." : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditMerchantDialog({ biz, onClose, onSubmit, isPending }: { biz: Business; onClose: () => void; onSubmit: (data: Partial<Business>) => void; isPending: boolean }) {
  const [name, setName] = useState(biz.name);
  const [phone, setPhone] = useState(biz.phone || "");
  const [address, setAddress] = useState(biz.address || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ name, phone, address });
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Merchant</DialogTitle>
          <DialogDescription>Update merchant details for {biz.merchantId}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Business Name *</Label>
            <Input data-testid="input-edit-merchant-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Contact Number</Label>
            <Input data-testid="input-edit-merchant-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Address</Label>
            <Input data-testid="input-edit-merchant-address" value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" data-testid="button-update-merchant" disabled={isPending || !name}>{isPending ? "Updating..." : "Update"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConfirmMerchantAction({ action, onClose }: { action: { type: "toggle" | "archive" | "reset"; biz: Business }; onClose: () => void }) {
  const { toast } = useToast();
  const [adminPassword, setAdminPassword] = useState("");
  const [resetPassword, setResetPassword] = useState("");

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/businesses/${action.biz.id}/toggle-status`, { adminPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: "Success", description: `Merchant ${action.biz.status === "active" ? "deactivated" : "activated"}` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/businesses/${action.biz.id}/archive`, { adminPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: "Success", description: `Merchant ${action.biz.status === "archived" ? "reinstated" : "archived"}` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/admin/businesses/${action.biz.id}/reset`, { adminPassword, resetPassword });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      toast({ title: "Success", description: "Business data has been reset" });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const isPending = toggleMutation.isPending || archiveMutation.isPending || resetMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (action.type === "toggle") toggleMutation.mutate();
    else if (action.type === "archive") archiveMutation.mutate();
    else resetMutation.mutate();
  };

  const isToggle = action.type === "toggle";
  const isArchive = action.type === "archive";
  const isReset = action.type === "reset";

  const title = isToggle
    ? (action.biz.status === "active" ? "Deactivate Merchant" : "Activate Merchant")
    : isArchive
    ? (action.biz.status === "archived" ? "Reinstate Merchant" : "Archive Merchant")
    : "Reset Merchant Data";

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className={isReset ? "text-destructive" : ""}>{title}</DialogTitle>
          <DialogDescription>
            {action.biz.name} ({action.biz.merchantId})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {isReset && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm text-destructive">
                <p className="font-semibold">Warning: This action cannot be undone!</p>
                <p className="mt-1">This will permanently delete ALL data entered by users of this business including farmers, buyers, lots, bids, transactions, and cash entries. Business and user account details will be preserved.</p>
              </div>
            </div>
          )}

          {(isToggle || isArchive) && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md p-3 flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {isToggle
                  ? (action.biz.status === "active"
                    ? "No users under this business will be able to login while it is inactive."
                    : "Users under this business will be able to login again.")
                  : (action.biz.status === "archived"
                    ? "Users under this business will be able to login again after reinstatement."
                    : "No users under this business will be able to login while it is archived.")}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label>Admin Password *</Label>
            <Input
              data-testid="input-admin-password"
              type="password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              placeholder="Enter your admin password"
              required
            />
          </div>

          {isReset && (
            <div className="space-y-2">
              <Label>Reset Password (separate from admin password) *</Label>
              <Input
                data-testid="input-reset-password"
                type="password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Enter your dedicated reset password"
                required
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              variant={isReset ? "destructive" : "default"}
              data-testid="button-confirm-action"
              disabled={isPending || !adminPassword || (isReset && !resetPassword)}
            >
              {isPending ? "Processing..." : "Confirm"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsersTab() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editUser, setEditUser] = useState<SafeUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<SafeUser | null>(null);

  const { data: allUsers = [], isLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
  });

  const { data: businesses = [] } = useQuery<Business[]>({
    queryKey: ["/api/admin/businesses"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: { username: string; name: string; phone: string; businessId: number }) => {
      const res = await apiRequest("POST", "/api/admin/users", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User created with default password: password123" });
      setShowAdd(false);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User updated" });
      setEditUser(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User deleted" });
      setDeleteUser(null);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const resetPwMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("POST", `/api/admin/users/${id}/reset-password`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "Password reset to default (password123)" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const filtered = allUsers.filter(u =>
    !search || u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    (u.phone || "").includes(search)
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Users</CardTitle>
              <p className="text-xs text-muted-foreground">Manage all user accounts</p>
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1 sm:w-60">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-search-users"
                  placeholder="Search Users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Button data-testid="button-add-user" onClick={() => setShowAdd(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add User
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No users found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 px-2 font-medium">Username</th>
                    <th className="py-2 px-2 font-medium">Name</th>
                    <th className="py-2 px-2 font-medium">Mobile</th>
                    <th className="py-2 px-2 font-medium">Merchant</th>
                    <th className="py-2 px-2 font-medium">Permissions</th>
                    <th className="py-2 px-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b hover:bg-muted/50" data-testid={`row-user-${u.id}`}>
                      <td className="py-3 px-2 font-medium">{u.username}</td>
                      <td className="py-3 px-2">{u.name || "-"}</td>
                      <td className="py-3 px-2">{u.phone || "-"}</td>
                      <td className="py-3 px-2">{u.business?.name || "-"}</td>
                      <td className="py-3 px-2">
                        {u.role === "system_admin" ? (
                          <Badge className="bg-green-500 hover:bg-green-600">Full Access</Badge>
                        ) : (
                          <Badge variant="secondary">Can Edit</Badge>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center justify-end gap-1">
                          {u.role !== "system_admin" && (
                            <>
                              <Button
                                variant="ghost" size="icon"
                                data-testid={`button-edit-user-${u.id}`}
                                title="Edit"
                                onClick={() => setEditUser(u)}
                              >
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                data-testid={`button-reset-password-${u.id}`}
                                title="Reset Password"
                                onClick={() => resetPwMutation.mutate(u.id)}
                              >
                                <KeyRound className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                data-testid={`button-delete-user-${u.id}`}
                                title="Delete"
                                onClick={() => setDeleteUser(u)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AddUserDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        businesses={businesses}
        onSubmit={(data) => createMutation.mutate(data)}
        isPending={createMutation.isPending}
      />

      {editUser && (
        <EditUserDialog
          user={editUser}
          businesses={businesses}
          onClose={() => setEditUser(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editUser.id, data })}
          isPending={updateMutation.isPending}
        />
      )}

      {deleteUser && (
        <Dialog open onOpenChange={(v) => { if (!v) setDeleteUser(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete User</DialogTitle>
              <DialogDescription>Are you sure you want to delete this user?</DialogDescription>
            </DialogHeader>
            <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3">
              <p className="text-sm"><strong>Username:</strong> {deleteUser.username}</p>
              <p className="text-sm"><strong>Name:</strong> {deleteUser.name}</p>
              <p className="text-sm"><strong>Merchant:</strong> {deleteUser.business?.name}</p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
              <Button
                variant="destructive"
                data-testid="button-confirm-delete-user"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(deleteUser.id)}
              >
                {deleteMutation.isPending ? "Deleting..." : "Delete User"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function AddUserDialog({ open, onClose, businesses, onSubmit, isPending }: {
  open: boolean;
  onClose: () => void;
  businesses: Business[];
  onSubmit: (data: { username: string; name: string; phone: string; businessId: number }) => void;
  isPending: boolean;
}) {
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessId, setBusinessId] = useState<string>("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ username, name, phone, businessId: parseInt(businessId) });
  };

  const activeBusinesses = businesses.filter(b => b.status === "active");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { onClose(); setUsername(""); setName(""); setPhone(""); setBusinessId(""); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
          <DialogDescription>Create a new user with default password: password123</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input data-testid="input-user-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Enter full name" required />
          </div>
          <div className="space-y-2">
            <Label>Username *</Label>
            <Input data-testid="input-user-username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username" required />
          </div>
          <div className="space-y-2">
            <Label>Mobile Number *</Label>
            <Input data-testid="input-user-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Enter mobile number" required />
          </div>
          <div className="space-y-2">
            <Label>Assign Merchant *</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger data-testid="select-user-business">
                <SelectValue placeholder="Select a merchant" />
              </SelectTrigger>
              <SelectContent>
                {activeBusinesses.map(b => (
                  <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" data-testid="button-save-user" disabled={isPending || !username || !name || !phone || !businessId}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, businesses, onClose, onSubmit, isPending }: {
  user: SafeUser;
  businesses: Business[];
  onClose: () => void;
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [username, setUsername] = useState(user.username);
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || "");
  const [businessId, setBusinessId] = useState(user.businessId.toString());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ username, name, phone, businessId: parseInt(businessId) });
  };

  const activeBusinesses = businesses.filter(b => b.status === "active");

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update user account details</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input data-testid="input-edit-user-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Username *</Label>
            <Input data-testid="input-edit-user-username" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Mobile Number</Label>
            <Input data-testid="input-edit-user-phone" type="tel" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Assign Merchant *</Label>
            <Select value={businessId} onValueChange={setBusinessId}>
              <SelectTrigger data-testid="select-edit-user-business">
                <SelectValue placeholder="Select a merchant" />
              </SelectTrigger>
              <SelectContent>
                {activeBusinesses.map(b => (
                  <SelectItem key={b.id} value={b.id.toString()}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" data-testid="button-update-user" disabled={isPending || !username || !name}>{isPending ? "Updating..." : "Update"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

