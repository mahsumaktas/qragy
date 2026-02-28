const STORAGE_KEY = "qragy_admin_token";

let token = $state(localStorage.getItem(STORAGE_KEY) || "");

export function getToken() {
  return token;
}

export function setToken(value) {
  token = value.trim();
  if (token) {
    localStorage.setItem(STORAGE_KEY, token);
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function clearToken() {
  token = "";
  localStorage.removeItem(STORAGE_KEY);
}
