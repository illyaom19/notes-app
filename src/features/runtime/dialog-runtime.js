export function createDialogRuntime({ documentObj = document } = {}) {
  let activeAppDialog = null;

  function closeActiveAppDialog() {
    if (activeAppDialog instanceof HTMLDialogElement && activeAppDialog.open) {
      activeAppDialog.close("cancel");
    }
    activeAppDialog = null;
  }

  function showAppDialog({
    title = "",
    message = "",
    actions = [],
    buildBody = null,
    closeOnCancel = true,
  } = {}) {
    return new Promise((resolve) => {
      closeActiveAppDialog();

      const dialog = documentObj.createElement("dialog");
      dialog.className = "app-modal";
      activeAppDialog = dialog;

      const form = documentObj.createElement("form");
      form.method = "dialog";
      form.className = "app-modal__body";

      if (title) {
        const titleElement = documentObj.createElement("h2");
        titleElement.className = "app-modal__title";
        titleElement.textContent = title;
        form.append(titleElement);
      }

      if (message) {
        const messageElement = documentObj.createElement("p");
        messageElement.className = "app-modal__message";
        messageElement.textContent = message;
        form.append(messageElement);
      }

      if (typeof buildBody === "function") {
        buildBody(form);
      }

      const actionsRow = documentObj.createElement("div");
      actionsRow.className = "app-modal__actions";

      const normalizedActions =
        actions.length > 0 ? actions : [{ id: "ok", label: "OK", variant: "primary" }];

      for (const action of normalizedActions) {
        const button = documentObj.createElement("button");
        button.type = "submit";
        button.className = "app-modal__button";
        if (action.variant === "primary") {
          button.classList.add("app-modal__button--primary");
        } else if (action.variant === "danger") {
          button.classList.add("app-modal__button--danger");
        }
        button.value = action.id;
        button.textContent = action.label;
        actionsRow.append(button);
      }

      form.append(actionsRow);
      dialog.append(form);

      const cleanup = (result = null) => {
        dialog.removeEventListener("cancel", onCancel);
        dialog.removeEventListener("close", onClose);
        dialog.remove();
        if (activeAppDialog === dialog) {
          activeAppDialog = null;
        }
        resolve(result);
      };

      const onCancel = (event) => {
        if (!closeOnCancel) {
          event.preventDefault();
        }
      };

      const onClose = () => {
        cleanup(dialog.returnValue || null);
      };

      dialog.addEventListener("cancel", onCancel);
      dialog.addEventListener("close", onClose);
      documentObj.body.append(dialog);
      dialog.showModal();
    });
  }

  async function showNoticeDialog(message, { title = "Notice", buttonLabel = "OK" } = {}) {
    await showAppDialog({
      title,
      message,
      actions: [{ id: "ok", label: buttonLabel, variant: "primary" }],
    });
  }

  async function showConfirmDialog({
    title = "Confirm",
    message = "",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
  } = {}) {
    const result = await showAppDialog({
      title,
      message,
      actions: [
        { id: "cancel", label: cancelLabel },
        { id: "confirm", label: confirmLabel, variant: danger ? "danger" : "primary" },
      ],
    });
    return result === "confirm";
  }

  async function showTextPromptDialog({
    title = "Enter value",
    message = "",
    label = "Value",
    defaultValue = "",
    placeholder = "",
    confirmLabel = "Save",
  } = {}) {
    let input = null;
    const result = await showAppDialog({
      title,
      message,
      actions: [
        { id: "cancel", label: "Cancel" },
        { id: "confirm", label: confirmLabel, variant: "primary" },
      ],
      buildBody: (root) => {
        const field = documentObj.createElement("label");
        field.className = "app-modal__field";

        const fieldLabel = documentObj.createElement("span");
        fieldLabel.className = "app-modal__field-label";
        fieldLabel.textContent = label;

        input = documentObj.createElement("input");
        input.type = "text";
        input.className = "app-modal__field-input";
        input.value = defaultValue;
        input.placeholder = placeholder;
        input.autocomplete = "off";

        field.append(fieldLabel, input);
        root.append(field);

        queueMicrotask(() => {
          input?.focus();
          input?.select();
        });
      },
    });

    if (result !== "confirm" || !(input instanceof HTMLInputElement)) {
      return null;
    }
    const value = input.value.trim();
    return value || null;
  }

  async function showActionDialog({
    title = "",
    message = "",
    actions = [],
    cancelLabel = "Cancel",
  } = {}) {
    if (!Array.isArray(actions) || actions.length < 1) {
      return null;
    }
    const normalizedActions = actions.map((action) => ({
      id: action.id,
      label: action.label,
      variant: action.variant ?? "primary",
    }));
    normalizedActions.push({ id: "cancel", label: cancelLabel });

    const result = await showAppDialog({
      title,
      message,
      actions: normalizedActions,
    });
    return result === "cancel" ? null : result;
  }

  async function showSelectDialog({
    title = "",
    message = "",
    label = "Select an option",
    options = [],
    confirmLabel = "Select",
    defaultOptionId = null,
  } = {}) {
    if (!Array.isArray(options) || options.length < 1) {
      return null;
    }

    let select = null;
    const result = await showAppDialog({
      title,
      message,
      actions: [
        { id: "cancel", label: "Cancel" },
        { id: "confirm", label: confirmLabel, variant: "primary" },
      ],
      buildBody: (root) => {
        const field = documentObj.createElement("label");
        field.className = "app-modal__field";

        const fieldLabel = documentObj.createElement("span");
        fieldLabel.className = "app-modal__field-label";
        fieldLabel.textContent = label;

        select = documentObj.createElement("select");
        select.className = "app-modal__field-select";

        for (const option of options) {
          const element = documentObj.createElement("option");
          element.value = option.id;
          element.textContent = option.label;
          select.append(element);
        }

        if (typeof defaultOptionId === "string" && defaultOptionId.trim()) {
          select.value = defaultOptionId;
        }

        field.append(fieldLabel, select);
        root.append(field);

        queueMicrotask(() => {
          select?.focus();
        });
      },
    });

    if (result !== "confirm" || !(select instanceof HTMLSelectElement)) {
      return null;
    }

    return options.find((option) => option.id === select.value) ?? null;
  }

  async function showMultiSelectDialog({
    title = "",
    message = "",
    options = [],
    confirmLabel = "Apply",
  } = {}) {
    if (!Array.isArray(options) || options.length < 1) {
      return [];
    }

    const checkedById = new Map(options.map((option) => [option.id, false]));
    const result = await showAppDialog({
      title,
      message,
      actions: [
        { id: "cancel", label: "Cancel" },
        { id: "confirm", label: confirmLabel, variant: "primary" },
      ],
      buildBody: (root) => {
        const list = documentObj.createElement("div");
        list.className = "app-modal__choice-list";

        for (const option of options) {
          const label = documentObj.createElement("label");
          label.className = "app-modal__choice-item";

          const input = documentObj.createElement("input");
          input.type = "checkbox";
          input.className = "app-modal__choice-input";
          input.addEventListener("change", () => {
            checkedById.set(option.id, input.checked);
          });

          const text = documentObj.createElement("span");
          text.className = "app-modal__choice-label";
          text.textContent = option.label;

          label.append(input, text);
          list.append(label);
        }

        root.append(list);
      },
    });

    if (result !== "confirm") {
      return [];
    }

    return options.map((option) => option.id).filter((id) => checkedById.get(id) === true);
  }

  return {
    closeActiveAppDialog,
    showAppDialog,
    showNoticeDialog,
    showConfirmDialog,
    showTextPromptDialog,
    showActionDialog,
    showSelectDialog,
    showMultiSelectDialog,
  };
}
