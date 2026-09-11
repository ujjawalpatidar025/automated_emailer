import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login(payload) {
    const { user } = await api.login(payload);
    setUser(user);
    return user;
  }

  async function register(payload) {
    const { user } = await api.register(payload);
    setUser(user);
    return user;
  }

  async function logout() {
    await api.logout().catch(() => {});
    setUser(null);
  }

  return { user, loading, login, register, logout, refresh };
}
