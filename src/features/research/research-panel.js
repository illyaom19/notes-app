function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function normalizeCitation(input) {
  const source = input && typeof input === "object" ? input : {};
  const sourceTitle = typeof source.sourceTitle === "string" ? source.sourceTitle.trim() : "";
  const url = typeof source.url === "string" ? source.url.trim() : "";

  if (!sourceTitle || !url) {
    return null;
  }

  return {
    sourceTitle,
    url,
    accessedAt: nowIso(),
    author: typeof source.author === "string" && source.author.trim() ? source.author.trim() : null,
    publisher: typeof source.publisher === "string" && source.publisher.trim() ? source.publisher.trim() : null,
    snippetType:
      typeof source.snippetType === "string" && source.snippetType.trim() ? source.snippetType.trim() : "note",
    attributionText:
      typeof source.attributionText === "string" && source.attributionText.trim()
        ? source.attributionText.trim()
        : sourceTitle,
  };
}

export function createResearchPanel({
  panelElement,
  titleInput,
  urlInput,
  attributionInput,
  snippetInput,
  snippetTypeInput,
  captureButton,
  onCapture,
  getActiveContextId,
} = {}) {
  let open = false;

  function setOpen(nextOpen) {
    open = Boolean(nextOpen);
    if (panelElement instanceof HTMLElement) {
      panelElement.hidden = !open;
    }
  }

  captureButton?.addEventListener("click", () => {
    const citation = normalizeCitation({
      sourceTitle: titleInput?.value,
      url: urlInput?.value,
      author: attributionInput?.value,
      attributionText: attributionInput?.value,
      snippetType: snippetTypeInput?.value,
    });

    const content = typeof snippetInput?.value === "string" ? snippetInput.value.trim() : "";
    if (!citation || !content) {
      window.alert("Research capture requires source title, URL, and snippet.");
      return;
    }

    const capture = {
      id: makeId("research"),
      contextId: typeof getActiveContextId === "function" ? getActiveContextId() : null,
      contentType: citation.snippetType,
      content,
      citation,
    };

    if (typeof onCapture === "function") {
      onCapture(capture);
    }

    if (snippetInput instanceof HTMLTextAreaElement) {
      snippetInput.value = "";
    }
  });

  return {
    setOpen,
    isOpen: () => open,
    toggle() {
      setOpen(!open);
    },
  };
}
