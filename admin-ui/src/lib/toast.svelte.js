let toasts = $state([]);
let nextId = 0;

export function getToasts() {
  return toasts;
}

export function showToast(message, type = "info", duration = 3500) {
  const id = ++nextId;
  toasts.push({ id, message, type, removing: false });

  setTimeout(() => {
    const idx = toasts.findIndex((t) => t.id === id);
    if (idx !== -1) {
      toasts[idx].removing = true;
      setTimeout(() => {
        toasts = toasts.filter((t) => t.id !== id);
      }, 300);
    }
  }, duration);
}

export function removeToast(id) {
  toasts = toasts.filter((t) => t.id !== id);
}
