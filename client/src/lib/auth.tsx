import { createContext, useContext, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient, getQueryFn } from "./queryClient";

export type BusinessEntry = {
  userId: string;
  businessId: number;
  businessName: string;
  businessAddress: string;
  businessInitials: string;
  accessLevel: string;
};

type AuthUser = {
  id: string;
  username: string;
  name: string;
  phone: string | null;
  businessId: number;
  role: string;
  accessLevel: string;
  mustChangePassword: boolean;
  businessName: string;
  businessAddress: string;
  businessInitials: string;
  businessPhone: string;
  businessLicenceNo: string;
  businessShopNo: string;
  allBusinesses: BusinessEntry[];
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string, phone?: string) => Promise<void>;
  switchBusiness: (businessId: number) => Promise<void>;
};

const AuthContext = createContext<AuthContextType | null>(null);

const LAST_BUSINESS_KEY = (username: string) => `mandi-mitra-last-business-${username}`;

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/me"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async ({ username, password }: { username: string; password: string }) => {
      const res = await apiRequest("POST", "/api/auth/login", { username, password });
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: async (data) => {
      queryClient.clear();

      const keysToRemove = Object.keys(localStorage).filter(k => k.startsWith("mandi-mitra-se-"));
      keysToRemove.forEach(k => localStorage.removeItem(k));

      if (data.allBusinesses && data.allBusinesses.length > 1) {
        const stored = localStorage.getItem(LAST_BUSINESS_KEY(data.username));
        if (stored) {
          const lastId = parseInt(stored, 10);
          const target = data.allBusinesses.find(b => b.businessId === lastId);
          if (target && target.businessId !== data.businessId) {
            try {
              const res = await apiRequest("POST", "/api/auth/switch-business", { businessId: lastId });
              const switched = await res.json() as AuthUser;
              queryClient.setQueryData(["/api/auth/me"], switched);
              return;
            } catch {
            }
          }
        }
      }

      queryClient.setQueryData(["/api/auth/me"], data);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/me"], null);
      queryClient.clear();
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ currentPassword, newPassword, phone }: { currentPassword: string; newPassword: string; phone?: string }) => {
      const res = await apiRequest("POST", "/api/auth/change-password", { currentPassword, newPassword, phone });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/auth/me"], data);
    },
  });

  const switchBusinessMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", "/api/auth/switch-business", { businessId });
      return res.json() as Promise<AuthUser>;
    },
    onSuccess: (data) => {
      localStorage.setItem(LAST_BUSINESS_KEY(data.username), String(data.businessId));
      queryClient.setQueryData(["/api/auth/me"], data);
      queryClient.invalidateQueries();
    },
  });

  const login = async (username: string, password: string) => {
    return loginMutation.mutateAsync({ username, password });
  };

  const logout = async () => {
    await logoutMutation.mutateAsync();
  };

  const changePassword = async (currentPassword: string, newPassword: string, phone?: string) => {
    await changePasswordMutation.mutateAsync({ currentPassword, newPassword, phone });
  };

  const switchBusiness = async (businessId: number) => {
    await switchBusinessMutation.mutateAsync(businessId);
  };

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout, changePassword, switchBusiness }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
