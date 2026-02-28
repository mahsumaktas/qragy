let current = $state(null);

export function getConfirm() {
  return current;
}

export function showConfirm({ title, message, confirmText = "Onayla", cancelText = "Iptal", danger = false }) {
  return new Promise((resolve) => {
    current = {
      title,
      message,
      confirmText,
      cancelText,
      danger,
      resolve(value) {
        current = null;
        resolve(value);
      },
    };
  });
}
