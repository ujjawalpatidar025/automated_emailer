// In dev this stays "/api" and rides Vite's proxy (see vite.config.js) to
// localhost:5000. In production, set VITE_API_URL to the deployed backend's
// URL (client/.env.production) — Vite bakes it into the build.
const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

const TOKEN_KEY = "automator_token";

// Auth is a Bearer token the client holds onto and attaches itself, not a
// cookie — frontend and backend are commonly on two unrelated origins (e.g.
// different vercel.app subdomains), and browsers block a cross-site cookie
// as third-party regardless of correct CORS/SameSite/Secure config. A token
// sent explicitly in a header doesn't run into that at all.
export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage unavailable (private mode, etc.) — nothing to do */
  }
}

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function authHeaders(extra) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : { ...extra };
}

function request(path, opts = {}) {
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: authHeaders(opts.headers),
  }).then(handle);
}

const jsonHeaders = { "Content-Type": "application/json" };

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────
  register: (payload) =>
    request("/auth/register", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),

  login: (payload) =>
    request("/auth/login", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }),

  logout: () => request("/auth/logout", { method: "POST" }),

  me: () => request("/auth/me"),

  updateMe: (patch) =>
    request("/auth/me", {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }),

  mailerHealth: () => request("/auth/mailer-health"),

  // ── Campaigns ─────────────────────────────────────────────────────
  listCampaigns: () => request("/campaigns"),

  getCampaign: (id) => request(`/campaigns/${id}`),

  createCampaign: (formData) =>
    request("/campaigns", { method: "POST", body: formData }),

  updateCampaign: (id, patch) =>
    request(`/campaigns/${id}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }),

  deleteCampaign: (id) => request(`/campaigns/${id}`, { method: "DELETE" }),

  sendBatch: (id, count) =>
    request(`/campaigns/${id}/send`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ count }),
    }),

  sendSelected: (id, emails) =>
    request(`/campaigns/${id}/send-selected`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({ emails }),
    }),

  retryFailed: (id, opts = {}) =>
    request(`/campaigns/${id}/retry-failed`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(opts),
    }),

  getCampaignAnalytics: (id) => request(`/campaigns/${id}/analytics`),

  getGlobalAnalytics: () => request("/analytics"),

  // EventSource can't set custom headers, so the token rides along as a
  // query param for this one request type only — requireAuth() on the
  // server accepts either the header or ?token=.
  streamUrl: (id) => {
    const token = getToken();
    return `${BASE}/campaigns/${id}/stream${token ? `?token=${encodeURIComponent(token)}` : ""}`;
  },
};
