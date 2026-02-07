function makeId(prefix) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSnippetType(value) {
  if (value === "definition" || value === "image") {
    return value;
  }
  return "text";
}

function isTypingTarget(target) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function isLikelyUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_error) {
    return false;
  }
}

export function createResearchPanelController({
  panelElement,
  toggleButton,
  onCapture,
  getActiveContextId,
  getActiveSourceWidgetId,
  onOpenChange,
}) {
  if (!(panelElement instanceof HTMLElement)) {
    return {
      open: () => {},
      close: () => {},
      toggle: () => {},
      dispose: () => {},
      isOpen: () => false,
    };
  }

  const closeButton = panelElement.querySelector("#research-close");
  const statusOutput = panelElement.querySelector("#research-status");
  const typeSelect = panelElement.querySelector("#research-content-type");
  const textField = panelElement.querySelector("#research-text-content");
  const imageField = panelElement.querySelector("#research-image-url");
  const sourceTitleField = panelElement.querySelector("#research-source-title");
  const urlField = panelElement.querySelector("#research-url");
  const authorField = panelElement.querySelector("#research-author");
  const publisherField = panelElement.querySelector("#research-publisher");
  const attributionField = panelElement.querySelector("#research-attribution");
  const captureButton = panelElement.querySelector("#research-capture");
  const textLabel = panelElement.querySelector('[data-research-field="text"]');
  const imageLabel = panelElement.querySelector('[data-research-field="image"]');

  let open = false;

  const setStatus = (message) => {
    if (statusOutput instanceof HTMLElement) {
      statusOutput.textContent = message;
    }
  };

  const updateVisibility = () => {
    const snippetType = normalizeSnippetType(typeSelect instanceof HTMLSelectElement ? typeSelect.value : "text");
    if (textLabel instanceof HTMLElement) {
      textLabel.hidden = snippetType === "image";
    }
    if (imageLabel instanceof HTMLElement) {
      imageLabel.hidden = snippetType !== "image";
    }
  };

  const setOpen = (nextOpen) => {
    open = Boolean(nextOpen);
    panelElement.hidden = !open;
    if (toggleButton instanceof HTMLButtonElement) {
      toggleButton.textContent = open ? "Hide Research" : "Research Panel";
    }
    onOpenChange?.(open);
    if (open) {
      updateVisibility();
    }
  };

  const buildCapture = () => {
    const snippetType = normalizeSnippetType(typeSelect instanceof HTMLSelectElement ? typeSelect.value : "text");
    const textContent = asString(textField instanceof HTMLTextAreaElement ? textField.value : "");
    const imageUrl = asString(imageField instanceof HTMLInputElement ? imageField.value : "");
    const sourceTitle = asString(sourceTitleField instanceof HTMLInputElement ? sourceTitleField.value : "");
    const sourceUrl = asString(urlField instanceof HTMLInputElement ? urlField.value : "");
    const author = asString(authorField instanceof HTMLInputElement ? authorField.value : "");
    const publisher = asString(publisherField instanceof HTMLInputElement ? publisherField.value : "");
    const attributionText = asString(
      attributionField instanceof HTMLInputElement ? attributionField.value : "",
    );

    if (!sourceTitle) {
      throw new Error("Source title is required.");
    }
    if (!sourceUrl || !isLikelyUrl(sourceUrl)) {
      throw new Error("A valid source URL is required.");
    }
    if (!attributionText) {
      throw new Error("Attribution text is required.");
    }

    if (snippetType === "image") {
      if (!imageUrl || !isLikelyUrl(imageUrl)) {
        throw new Error("A valid image URL is required for image captures.");
      }
    } else if (!textContent) {
      throw new Error("Text content is required for text/definition captures.");
    }

    const capture = {
      id: makeId("capture"),
      contextId: getActiveContextId?.() ?? null,
      contentType: snippetType,
      content: snippetType === "image" ? imageUrl : textContent,
      citation: {
        sourceTitle,
        url: sourceUrl,
        accessedAt: nowIso(),
        snippetType,
        attributionText,
      },
      sourceWidgetId: getActiveSourceWidgetId?.() ?? null,
    };

    if (author) {
      capture.citation.author = author;
    }
    if (publisher) {
      capture.citation.publisher = publisher;
    }

    return capture;
  };

  const onCaptureClick = async () => {
    if (!(captureButton instanceof HTMLButtonElement)) {
      return;
    }

    captureButton.disabled = true;
    captureButton.textContent = "Capturing...";

    try {
      const capture = buildCapture();
      await onCapture?.(capture);
      setStatus("Capture created with citation.");
    } catch (error) {
      setStatus(error?.message ?? "Capture failed.");
    } finally {
      captureButton.disabled = false;
      captureButton.textContent = "Capture To Widget";
    }
  };

  const onKeyDown = (event) => {
    if (event.key === "Escape" && open) {
      setOpen(false);
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r" && !isTypingTarget(event.target)) {
      event.preventDefault();
      setOpen(!open);
    }
  };

  const onToggleClick = () => setOpen(!open);
  const onCloseClick = () => setOpen(false);
  const onTypeChange = () => updateVisibility();
  const onCaptureButtonClick = () => {
    void onCaptureClick();
  };

  toggleButton?.addEventListener("click", onToggleClick);
  closeButton?.addEventListener("click", onCloseClick);
  typeSelect?.addEventListener("change", onTypeChange);
  captureButton?.addEventListener("click", onCaptureButtonClick);
  window.addEventListener("keydown", onKeyDown);

  setOpen(false);
  setStatus("Capture snippets with citation fields.");

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    toggle: () => setOpen(!open),
    isOpen: () => open,
    dispose() {
      toggleButton?.removeEventListener("click", onToggleClick);
      closeButton?.removeEventListener("click", onCloseClick);
      typeSelect?.removeEventListener("change", onTypeChange);
      captureButton?.removeEventListener("click", onCaptureButtonClick);
      window.removeEventListener("keydown", onKeyDown);
      setOpen(false);
    },
  };
}
