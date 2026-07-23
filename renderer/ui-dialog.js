function showToast(message, type = "info") {
  const overlayId = "app-dialog-overlay";
  let overlay = document.getElementById(overlayId);

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = overlayId;
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(0, 0, 0, 0.35)";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "10002";

    const dialog = document.createElement("div");
    dialog.id = "app-dialog";
    dialog.style.minWidth = "320px";
    dialog.style.maxWidth = "460px";
    dialog.style.width = "90%";
    dialog.style.background = "#fff";
    dialog.style.borderRadius = "8px";
    dialog.style.padding = "16px";
    dialog.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
    dialog.style.border = "1px solid #e5e7eb";

    const title = document.createElement("div");
    title.id = "app-dialog-title";
    title.style.fontSize = "14px";
    title.style.fontWeight = "600";
    title.style.marginBottom = "8px";

    const content = document.createElement("div");
    content.id = "app-dialog-message";
    content.style.fontSize = "13px";
    content.style.color = "#374151";
    content.style.marginBottom = "14px";
    content.style.whiteSpace = "pre-wrap";

    const actions = document.createElement("div");
    actions.style.display = "flex";
    actions.style.justifyContent = "flex-end";

    const confirmBtn = document.createElement("button");
    confirmBtn.id = "app-dialog-confirm";
    confirmBtn.textContent = "OK";
    confirmBtn.style.border = "none";
    confirmBtn.style.borderRadius = "6px";
    confirmBtn.style.padding = "8px 12px";
    confirmBtn.style.color = "#fff";
    confirmBtn.style.cursor = "pointer";

    actions.appendChild(confirmBtn);
    dialog.appendChild(title);
    dialog.appendChild(content);
    dialog.appendChild(actions);
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  }

  const titleEl = document.getElementById("app-dialog-title");
  const messageEl = document.getElementById("app-dialog-message");
  const confirmBtn = document.getElementById("app-dialog-confirm");

  if (type === "success") {
    titleEl.textContent = "Thành công";
    confirmBtn.style.background = "#059669";
  } else if (type === "failed" || type === "error") {
    titleEl.textContent = "Lỗi";
    confirmBtn.style.background = "#dc2626";
  } else {
    titleEl.textContent = "Thông báo";
    confirmBtn.style.background = "#2563eb";
  }

  messageEl.textContent = message;
  overlay.style.display = "flex";

  if (showToast._confirmHandler) {
    confirmBtn.removeEventListener("click", showToast._confirmHandler);
  }

  showToast._confirmHandler = () => {
    overlay.style.display = "none";
  };

  confirmBtn.addEventListener("click", showToast._confirmHandler);
  setTimeout(() => confirmBtn.focus(), 0);
}

function ensureActionDialog() {
  const overlayId = "app-action-overlay";
  let overlay = document.getElementById(overlayId);
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = overlayId;
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(0, 0, 0, 0.35)";
  overlay.style.display = "none";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "10001";

  const dialog = document.createElement("div");
  dialog.id = "app-action-dialog";
  dialog.style.minWidth = "340px";
  dialog.style.maxWidth = "560px";
  dialog.style.width = "92%";
  dialog.style.background = "#fff";
  dialog.style.borderRadius = "8px";
  dialog.style.padding = "14px";
  dialog.style.boxShadow = "0 8px 24px rgba(0,0,0,0.25)";
  dialog.style.border = "1px solid #e5e7eb";

  const title = document.createElement("div");
  title.id = "app-action-title";
  title.style.fontSize = "14px";
  title.style.fontWeight = "700";
  title.style.marginBottom = "8px";

  const content = document.createElement("div");
  content.id = "app-action-content";
  content.style.fontSize = "13px";
  content.style.color = "#374151";
  content.style.marginBottom = "12px";

  const actions = document.createElement("div");
  actions.style.display = "flex";
  actions.style.justifyContent = "flex-end";
  actions.style.gap = "8px";

  const cancelBtn = document.createElement("button");
  cancelBtn.id = "app-action-cancel";
  cancelBtn.textContent = "Hủy";
  cancelBtn.style.border = "1px solid #d1d5db";
  cancelBtn.style.background = "#fff";
  cancelBtn.style.borderRadius = "6px";
  cancelBtn.style.padding = "8px 12px";
  cancelBtn.style.cursor = "pointer";

  const okBtn = document.createElement("button");
  okBtn.id = "app-action-ok";
  okBtn.textContent = "OK";
  okBtn.style.border = "none";
  okBtn.style.background = "#2563eb";
  okBtn.style.color = "#fff";
  okBtn.style.borderRadius = "6px";
  okBtn.style.padding = "8px 12px";
  okBtn.style.cursor = "pointer";

  actions.appendChild(cancelBtn);
  actions.appendChild(okBtn);

  dialog.appendChild(title);
  dialog.appendChild(content);
  dialog.appendChild(actions);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  return overlay;
}

function showConfirmDialog(message, title = "Xác nhận") {
  return new Promise((resolve) => {
    const overlay = ensureActionDialog();
    const titleEl = document.getElementById("app-action-title");
    const contentEl = document.getElementById("app-action-content");
    const okBtn = document.getElementById("app-action-ok");
    const cancelBtn = document.getElementById("app-action-cancel");

    titleEl.textContent = title;
    contentEl.innerHTML = `<div style="white-space:pre-wrap;">${String(message || "")}</div>`;
    okBtn.textContent = "Xác nhận";
    overlay.style.display = "flex";

    const cleanup = () => {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.style.display = "none";
    };

    const onOk = () => {
      cleanup();
      resolve(true);
    };
    const onCancel = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    setTimeout(() => okBtn.focus(), 0);
  });
}

function showFormDialog({
  title = "Nhập dữ liệu",
  fields = [],
  submitText = "Lưu",
} = {}) {
  return new Promise((resolve) => {
    const overlay = ensureActionDialog();
    const titleEl = document.getElementById("app-action-title");
    const contentEl = document.getElementById("app-action-content");
    const okBtn = document.getElementById("app-action-ok");
    const cancelBtn = document.getElementById("app-action-cancel");

    titleEl.textContent = title;
    okBtn.textContent = submitText;

    const formHtml = fields
      .map(
        (
          field,
        ) => `<div style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
            <label style="font-size:12px; color:#4b5563; font-weight:600;">${field.label || field.name}</label>
            <input data-field="${field.name}" type="${field.type || "text"}" value="${String(field.value ?? "").replace(/"/g, "&quot;")}" placeholder="${String(field.placeholder ?? "").replace(/"/g, "&quot;")}" style="height:32px; border:1px solid #d1d5db; border-radius:6px; padding:0 8px;">
          </div>`,
      )
      .join("");

    contentEl.innerHTML = `<div>${formHtml}</div>`;
    overlay.style.display = "flex";

    const cleanup = () => {
      okBtn.removeEventListener("click", onOk);
      cancelBtn.removeEventListener("click", onCancel);
      overlay.style.display = "none";
    };

    const onOk = () => {
      const values = {};
      for (const field of fields) {
        const input = contentEl.querySelector(`[data-field="${field.name}"]`);
        values[field.name] = input ? input.value : "";
      }
      cleanup();
      resolve(values);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };

    okBtn.addEventListener("click", onOk);
    cancelBtn.addEventListener("click", onCancel);
    const firstInput = contentEl.querySelector("input");
    setTimeout(() => (firstInput ? firstInput.focus() : okBtn.focus()), 0);
  });
}

window.showToast = showToast;
window.showConfirmDialog = showConfirmDialog;
window.showFormDialog = showFormDialog;
