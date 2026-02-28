import { getToken } from "./auth.svelte.js";

export function createSSE(path, { onMessage, onEvent, onError } = {}) {
  const token = getToken();
  const sep = path.includes("?") ? "&" : "?";
  const url = "../api/" + path + (token ? sep + "token=" + encodeURIComponent(token) : "");

  const es = new EventSource(url);

  if (onMessage) {
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onMessage(data);
      } catch {
        // ignore parse errors
      }
    };
  }

  if (onEvent) {
    for (const [event, handler] of Object.entries(onEvent)) {
      es.addEventListener(event, (e) => {
        try {
          const data = e.data ? JSON.parse(e.data) : {};
          handler(data);
        } catch {
          handler({});
        }
      });
    }
  }

  es.onerror = () => {
    if (onError) onError();
    es.close();
  };

  return {
    close() {
      es.close();
    },
  };
}
