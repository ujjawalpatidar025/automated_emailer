import { useCallback, useEffect, useState } from "react";
import { api, getToken, setToken } from "@/lib/api";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      setToken(null); // stale/expired — stop sending it
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function login(payload) {
    const { user, token } = await api.login(payload);
    setToken(token);
    setUser(user);
    return user;
  }

  async function register(payload) {
    const { user, token } = await api.register(payload);
    setToken(token);
    setUser(user);
    return user;
  }

  async function logout() {
    await api.logout().catch(() => {});
    setToken(null);
    setUser(null);
  }

  return { user, loading, login, register, logout, refresh };
}
