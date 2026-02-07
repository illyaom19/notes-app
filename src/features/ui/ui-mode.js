const KEY = "notes-app.ui.mode.v1";

export function createUiModeController({ root = document.body, statusOutput, toggleButton } = {}) {
  let mode = window.localStorage.getItem(KEY) === "debug" ? "debug" : "production";

  function apply() {
    root.dataset.uiMode = mode;
    if (statusOutput) {
      statusOutput.textContent = mode;
    }
    if (toggleButton instanceof HTMLButtonElement) {
      toggleButton.textContent = mode === "production" ? "Debug Mode" : "Production Mode";
    }
  }

  function setMode(nextMode) {
    mode = nextMode === "debug" ? "debug" : "production";
    window.localStorage.setItem(KEY, mode);
    apply();
  }

  toggleButton?.addEventListener("click", () => {
    setMode(mode === "production" ? "debug" : "production");
  });

  apply();

  return {
    getMode: () => mode,
    setMode,
  };
}
