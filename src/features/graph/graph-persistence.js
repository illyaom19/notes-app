const STORAGE_KEY = "notes-app.graph.widgets.v1";

function isGraphStateCandidate(entry) {
  return (
    typeof entry === "object" &&
    entry !== null &&
    entry.type === "graph-widget" &&
    typeof entry.id === "string"
  );
}

export function createGraphPersistence() {
  return {
    loadDefinitions() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          return [];
        }

        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          return [];
        }

        return parsed.filter((entry) => isGraphStateCandidate(entry));
      } catch (_error) {
        return [];
      }
    },

    saveFromRuntime(runtime) {
      const graphStates = runtime
        .listWidgets()
        .filter((widget) => widget.type === "graph-widget" && typeof widget.toSerializableState === "function")
        .map((widget) => widget.toSerializableState());

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(graphStates));
    },
  };
}
