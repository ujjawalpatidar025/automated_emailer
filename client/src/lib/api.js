// In dev this stays "/api" and rides Vite's proxy (see vite.config.js) to
// localhost:5000. In production there's no proxy, so the built app needs the
// deployed backend's real URL — set via VITE_API_URL at build time
// (client/.env.production).
const BASE = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "/api";

async function handle(res) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const jsonHeaders = { "Content-Type": "application/json" };

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────
  register: (payload) =>
    fetch(`${BASE}/auth/register`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }).then(handle),

  login: (payload) =>
    fetch(`${BASE}/auth/login`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(payload),
    }).then(handle),

  logout: () =>
    fetch(`${BASE}/auth/logout`, { method: "POST", credentials: "include" }).then(handle),

  me: () => fetch(`${BASE}/auth/me`, { credentials: "include" }).then(handle),

  updateMe: (patch) =>
    fetch(`${BASE}/auth/me`, {
      method: "PATCH",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }).then(handle),

  mailerHealth: () =>
    fetch(`${BASE}/auth/mailer-health`, { credentials: "include" }).then(handle),

  // ── Campaigns ─────────────────────────────────────────────────────
  listCampaigns: () => fetch(`${BASE}/campaigns`, { credentials: "include" }).then(handle),

  getCampaign: (id) =>
    fetch(`${BASE}/campaigns/${id}`, { credentials: "include" }).then(handle),

  createCampaign: (formData) =>
    fetch(`${BASE}/campaigns`, {
      method: "POST",
      credentials: "include",
      body: formData,
    }).then(handle),

  updateCampaign: (id, patch) =>
    fetch(`${BASE}/campaigns/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(patch),
    }).then(handle),

  deleteCampaign: (id) =>
    fetch(`${BASE}/campaigns/${id}`, { method: "DELETE", credentials: "include" }).then(handle),

  sendBatch: (id, count) =>
    fetch(`${BASE}/campaigns/${id}/send`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ count }),
    }).then(handle),

  sendSelected: (id, emails) =>
    fetch(`${BASE}/campaigns/${id}/send-selected`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify({ emails }),
    }).then(handle),

  retryFailed: (id, opts = {}) =>
    fetch(`${BASE}/campaigns/${id}/retry-failed`, {
      method: "POST",
      credentials: "include",
      headers: jsonHeaders,
      body: JSON.stringify(opts),
    }).then(handle),

  getCampaignAnalytics: (id) =>
    fetch(`${BASE}/campaigns/${id}/analytics`, { credentials: "include" }).then(handle),

  getGlobalAnalytics: () =>
    fetch(`${BASE}/analytics`, { credentials: "include" }).then(handle),

  streamUrl: (id) => `${BASE}/campaigns/${id}/stream`,
};
