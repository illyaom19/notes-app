export function createContextSectionRuntime({
  sectionsStore,
  notebookLibraryStore,
  notebookDocumentLibraryStore,
  documentManager,
  createSectionManagementUi,
  workspaceScopeId,
  contextUiElements,
  sectionUiElements,
  showTextPromptDialog,
  showNoticeDialog,
  showConfirmDialog,
  showActionDialog,
  switchContext,
  switchSection,
  importWidgetsFromAnotherContext,
  flushWorkspacePersist,
  scheduleWorkspacePersist,
  updateContextUi,
  restoreWorkspaceForActiveContext,
  updateOnboardingControlsUi,
  scheduleOnboardingRefresh,
  resetOnboardingSignals,
  setContextStore,
  setContextWorkspaceStore,
  setContextUiController,
  setSectionUiController,
  setActiveContextId,
  setActiveSectionId,
  getActiveContextId,
  getActiveSectionId,
} = {}) {
  if (!sectionsStore || !documentManager || typeof workspaceScopeId !== "function") {
    throw new Error("Context section runtime requires stores and workspaceScopeId.");
  }

  async function setup() {
    const [contextStoreModule, contextWorkspaceModule, contextUiModule] = await Promise.all([
      import("../contexts/context-store.js"),
      import("../contexts/context-workspace-store.js"),
      import("../contexts/context-management-ui.js"),
    ]);

    const contextStore = contextStoreModule.createContextStore();
    const contextWorkspaceStore = contextWorkspaceModule.createContextWorkspaceStore({
      assetManagerOptions: {
        allowLocalStoragePayloadFallback: false,
      },
      allowInlinePdfBase64Fallback: false,
    });
    if (typeof contextWorkspaceStore.prepare === "function") {
      await contextWorkspaceStore.prepare();
    }

    setContextStore?.(contextStore);
    setContextWorkspaceStore?.(contextWorkspaceStore);

    const initializeScope = () => {
      const activeContextId = contextStore.getActiveContextId();
      setActiveContextId?.(activeContextId);
      sectionsStore.ensureNotebook(activeContextId);
      const activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
      setActiveSectionId?.(activeSectionId);
      documentManager.setContextId(workspaceScopeId(activeContextId, activeSectionId));
    };
    initializeScope();

    const createContextHandler = async () => {
      const name = await showTextPromptDialog({
        title: "Create Notebook",
        label: "Notebook name",
        defaultValue: "New Notebook",
        confirmLabel: "Create",
      });
      if (!name) {
        return;
      }

      flushWorkspacePersist?.();

      const created = contextStore.createContext(name, "notebook");
      if (!created) {
        await showNoticeDialog?.("Notebook name cannot be empty.", { title: "Notebook" });
        return;
      }

      const activeContextId = created.id;
      setActiveContextId?.(activeContextId);
      sectionsStore.ensureNotebook(activeContextId);
      const activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
      setActiveSectionId?.(activeSectionId);
      resetOnboardingSignals?.();
      documentManager.setContextId(workspaceScopeId(activeContextId, activeSectionId));
      updateContextUi?.();
      await restoreWorkspaceForActiveContext?.();
      updateOnboardingControlsUi?.();
      scheduleOnboardingRefresh?.(0);
    };

    const renameContextHandler = async (contextId = getActiveContextId?.()) => {
      if (!contextId) {
        return;
      }

      const target = contextStore.getContextById(contextId);
      if (!target) {
        return;
      }

      const nextName = await showTextPromptDialog({
        title: "Rename Notebook",
        label: "Notebook name",
        defaultValue: target.name,
        confirmLabel: "Rename",
      });
      if (!nextName) {
        return;
      }

      const renamed = contextStore.renameContext(target.id, nextName);
      if (!renamed) {
        await showNoticeDialog?.("Notebook name cannot be empty.", { title: "Notebook" });
        return;
      }

      updateContextUi?.();
      scheduleWorkspacePersist?.();
    };

    const deleteContextHandler = async (contextId = getActiveContextId?.()) => {
      if (!contextId) {
        return;
      }

      const target = contextStore.getContextById(contextId);
      if (!target) {
        return;
      }

      const confirmed = await showConfirmDialog({
        title: "Delete Notebook",
        message: `Delete notebook "${target.name}"?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) {
        return;
      }

      flushWorkspacePersist?.();
      const targetSections = sectionsStore.listSections(target.id);
      const deletingActiveContext = target.id === getActiveContextId?.();

      const result = contextStore.deleteContext(target.id);
      if (!result) {
        await showNoticeDialog?.("At least one notebook must remain.", { title: "Notebook" });
        return;
      }

      for (const section of targetSections) {
        contextWorkspaceStore.deleteWorkspace(
          workspaceScopeId(result.deletedContextId, section.id),
        );
      }
      sectionsStore.deleteNotebook(result.deletedContextId);
      notebookLibraryStore?.deleteNotebook?.(result.deletedContextId);
      notebookDocumentLibraryStore?.deleteNotebook?.(result.deletedContextId);

      if (deletingActiveContext) {
        const activeContextId = result.activeContextId;
        setActiveContextId?.(activeContextId);
        sectionsStore.ensureNotebook(activeContextId);
        const activeSectionId = sectionsStore.getActiveSectionId(activeContextId);
        setActiveSectionId?.(activeSectionId);
        resetOnboardingSignals?.();
        documentManager.setContextId(workspaceScopeId(activeContextId, activeSectionId));
        updateContextUi?.();
        await restoreWorkspaceForActiveContext?.();
        updateOnboardingControlsUi?.();
        scheduleOnboardingRefresh?.(0);
        return;
      }

      updateContextUi?.();
      scheduleWorkspacePersist?.();
    };

    const createSectionHandler = async () => {
      const activeContextId = getActiveContextId?.();
      if (!activeContextId) {
        return;
      }

      const defaultName = `Section ${sectionsStore.listSections(activeContextId).length + 1}`;
      const name = await showTextPromptDialog({
        title: "Create Section",
        label: "Section name",
        defaultValue: defaultName,
        confirmLabel: "Create",
      });
      if (!name) {
        return;
      }

      flushWorkspacePersist?.();
      const created = sectionsStore.createSection(activeContextId, name);
      if (!created) {
        await showNoticeDialog?.("Section name cannot be empty.", { title: "Section" });
        return;
      }

      const nextSectionId = created.id;
      setActiveSectionId?.(nextSectionId);
      resetOnboardingSignals?.();
      documentManager.setContextId(workspaceScopeId(activeContextId, nextSectionId));
      updateContextUi?.();
      await restoreWorkspaceForActiveContext?.();
      updateOnboardingControlsUi?.();
      scheduleOnboardingRefresh?.(0);
    };

    const renameSectionHandler = async (sectionId = getActiveSectionId?.()) => {
      const activeContextId = getActiveContextId?.();
      if (!activeContextId || !sectionId) {
        return;
      }

      const section = sectionsStore
        .listSections(activeContextId)
        .find((entry) => entry.id === sectionId);
      if (!section) {
        return;
      }

      const nextName = await showTextPromptDialog({
        title: "Rename Section",
        label: "Section name",
        defaultValue: section.name,
        confirmLabel: "Rename",
      });
      if (!nextName) {
        return;
      }

      const renamed = sectionsStore.renameSection(activeContextId, section.id, nextName);
      if (!renamed) {
        await showNoticeDialog?.("Section name cannot be empty.", { title: "Section" });
        return;
      }

      updateContextUi?.();
    };

    const deleteSectionHandler = async (sectionId = getActiveSectionId?.()) => {
      const activeContextId = getActiveContextId?.();
      if (!activeContextId || !sectionId) {
        return;
      }

      const section = sectionsStore
        .listSections(activeContextId)
        .find((entry) => entry.id === sectionId);
      if (!section) {
        return;
      }

      const confirmed = await showConfirmDialog({
        title: "Delete Section",
        message: `Delete section "${section.name}"?`,
        confirmLabel: "Delete",
        danger: true,
      });
      if (!confirmed) {
        return;
      }

      flushWorkspacePersist?.();
      const deletingActiveSection = section.id === getActiveSectionId?.();
      const result = sectionsStore.deleteSection(activeContextId, section.id);
      if (!result) {
        await showNoticeDialog?.("At least one section must remain.", { title: "Section" });
        return;
      }

      contextWorkspaceStore.deleteWorkspace(
        workspaceScopeId(activeContextId, result.deletedSectionId),
      );
      if (deletingActiveSection) {
        const nextSectionId = result.activeSectionId;
        setActiveSectionId?.(nextSectionId);
        resetOnboardingSignals?.();
        documentManager.setContextId(workspaceScopeId(activeContextId, nextSectionId));
        updateContextUi?.();
        await restoreWorkspaceForActiveContext?.();
        updateOnboardingControlsUi?.();
        scheduleOnboardingRefresh?.(0);
        return;
      }

      updateContextUi?.();
      scheduleWorkspacePersist?.();
    };

    const openContextActions = async (contextId) => {
      const target = contextStore.getContextById(contextId);
      if (!target) {
        return;
      }

      const action = await showActionDialog({
        title: `Notebook: ${target.name}`,
        message: "Choose an action.",
        actions: [
          { id: "rename", label: "Rename Notebook", variant: "primary" },
          { id: "delete", label: "Delete Notebook", variant: "danger" },
        ],
      });
      if (!action) {
        return;
      }

      if (action === "rename") {
        await renameContextHandler(target.id);
        return;
      }

      if (action === "delete") {
        await deleteContextHandler(target.id);
      }
    };

    const openSectionActions = async (sectionId) => {
      const activeContextId = getActiveContextId?.();
      if (!activeContextId) {
        return;
      }

      const target = sectionsStore
        .listSections(activeContextId)
        .find((entry) => entry.id === sectionId);
      if (!target) {
        return;
      }

      const action = await showActionDialog({
        title: `Section: ${target.name}`,
        message: "Choose an action.",
        actions: [
          { id: "rename", label: "Rename Section", variant: "primary" },
          { id: "delete", label: "Delete Section", variant: "danger" },
        ],
      });
      if (!action) {
        return;
      }

      if (action === "rename") {
        await renameSectionHandler(target.id);
        return;
      }

      if (action === "delete") {
        await deleteSectionHandler(target.id);
      }
    };

    const contextUiController = contextUiModule.createContextManagementUi({
      ...contextUiElements,
      onSwitchContext: (nextContextId) => {
        void switchContext?.(nextContextId);
      },
      onCreateContext: () => {
        void createContextHandler();
      },
      onOpenContextActions: (contextId) => {
        void openContextActions(contextId);
      },
      onImportContextWidgets: () => {
        void importWidgetsFromAnotherContext?.();
      },
    });

    const sectionUiController = createSectionManagementUi({
      ...sectionUiElements,
      onSwitchSection: (nextSectionId) => {
        void switchSection?.(nextSectionId);
      },
      onCreateSection: () => {
        void createSectionHandler();
      },
      onOpenSectionActions: (sectionId) => {
        void openSectionActions(sectionId);
      },
    });

    setContextUiController?.(contextUiController);
    setSectionUiController?.(sectionUiController);

    updateContextUi?.();
    await restoreWorkspaceForActiveContext?.();

    return {
      contextStore,
      contextWorkspaceStore,
      contextUiController,
      sectionUiController,
    };
  }

  return {
    setup,
  };
}
