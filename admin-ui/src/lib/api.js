import { getToken, clearToken } from "./auth.svelte.js";

async function fetchJson(url, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    "Bypass-Tunnel-Reminder": "true",
    ...(options.headers || {}),
  };

  const token = getToken();
  if (token) {
    headers["x-admin-token"] = token;
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    clearToken();
    window.location.hash = "#login";
    throw new Error("Oturum suresi doldu");
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || "HTTP " + response.status);
  }
  return payload;
}

function apiUrl(path) {
  // admin-v2 /admin-v2/ altinda, ../api/ ile bir ust dizine cikar
  return "../api/" + path;
}

export const api = {
  get(path) {
    return fetchJson(apiUrl(path));
  },

  post(path, body) {
    return fetchJson(apiUrl(path), {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  put(path, body) {
    return fetchJson(apiUrl(path), {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },

  delete(path) {
    return fetchJson(apiUrl(path), { method: "DELETE" });
  },

  async upload(path, file) {
    const headers = {
      "Content-Type": file.type,
      "Bypass-Tunnel-Reminder": "true",
    };
    const token = getToken();
    if (token) headers["x-admin-token"] = token;

    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers,
      body: file,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "HTTP " + response.status);
    return payload;
  },

  async uploadForm(path, formData) {
    const headers = { "Bypass-Tunnel-Reminder": "true" };
    const token = getToken();
    if (token) headers["x-admin-token"] = token;

    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers,
      body: formData,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || "HTTP " + response.status);
    return payload;
  },
};
