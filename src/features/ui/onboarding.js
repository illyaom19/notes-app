const KEY = "notes-app.onboarding.v1";

function loadState() {
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") ?? {};
  } catch (_error) {
    return {};
  }
}

export function createOnboardingHints({ element } = {}) {
  let state = loadState();

  function dismiss(id) {
    state[id] = { dismissedAt: new Date().toISOString(), completionState: "dismissed" };
    window.localStorage.setItem(KEY, JSON.stringify(state));
    if (element instanceof HTMLElement) {
      element.hidden = true;
    }
  }

  function maybeShow(id, message) {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    if (state[id]) {
      return;
    }

    element.hidden = false;
    element.innerHTML = `${message} <button type="button" data-dismiss="${id}">Got it</button>`;
    const button = element.querySelector("button[data-dismiss]");
    button?.addEventListener("click", () => dismiss(id), { once: true });
  }

  return { maybeShow, dismiss };
}
