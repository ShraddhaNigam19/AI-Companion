const {
  contextBridge,
  ipcRenderer
} = require("electron");

contextBridge.exposeInMainWorld(
  "companion",
  {
    onPetState: (callback) => {
      const handler = (_event, state) => callback(state);
      ipcRenderer.on("pet-state", handler);
      return () => ipcRenderer.removeListener("pet-state", handler);
    },

    onCompanionAction: (callback) => {
      const handler = (_event, action) => callback(action);
      ipcRenderer.on("companion-action", handler);
      return () => ipcRenderer.removeListener("companion-action", handler);
    },

    onResultData: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("result-data", handler);
      return () => ipcRenderer.removeListener("result-data", handler);
    },

    onResultStream: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("result-stream", handler);
      return () => ipcRenderer.removeListener("result-stream", handler);
    },

    onPlacementChanged: (callback) => {
      const handler = (_event, placement) => callback(placement);
      ipcRenderer.on("placement-changed", handler);
      return () => ipcRenderer.removeListener("placement-changed", handler);
    },

    submitTaskFromCompanion: (taskText) =>
      ipcRenderer.invoke("companion:submit-task", taskText),

    getPendingTask: () =>
      ipcRenderer.invoke("companion:get-pending-task"),

    clearPendingTask: (taskId) =>
      ipcRenderer.send("companion:clear-pending-task", taskId),

    onTaskDispatched: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on("companion:dispatch-task", handler);
      return () => ipcRenderer.removeListener("companion:dispatch-task", handler);
    },

    getResultData: () =>
      ipcRenderer.invoke(
        "get-result-data"
      ),

    setPlacement: (placement) =>
      ipcRenderer.send(
        "set-placement",
        placement
      ),

    getPlacement: () =>
      ipcRenderer.invoke(
        "get-placement"
      ),

    requestRoam: () =>
      ipcRenderer.send(
        "request-roam"
      ),

    setState: (state) =>
      ipcRenderer.send(
        "pet-action",
        state
      ),

    toggleSleep: () =>
      ipcRenderer.send(
        "toggle-sleep"
      ),

    talk: () =>
      ipcRenderer.send(
        "talk-to-luna"
      ),

    giveTask: () =>
      ipcRenderer.send(
        "give-task"
      ),

    openSettings: () =>
      ipcRenderer.send(
        "open-settings"
      ),

    quit: () =>
      ipcRenderer.send(
        "quit-app"
      ),

    openContextMenu: () =>
      ipcRenderer.send(
        "open-context-menu"
      ),

    dragWindow: (
      screenX,
      screenY,
      clientX,
      clientY
    ) =>
      ipcRenderer.send(
        "drag-window",
        {
          screenX,
          screenY,
          clientX,
          clientY
        }
      ),

    dragStarted: (screenX, screenY, clientX, clientY) =>
      ipcRenderer.send(
        "drag-started",
        {
          screenX,
          screenY,
          clientX,
          clientY
        }
      ),

    dragEnded: () =>
      ipcRenderer.send(
        "drag-ended"
      ),

    openExternal: (url) =>
      ipcRenderer.send(
        "open-external",
        url
      ),

    openResultWindow: (
      task,
      result,
      sources = []
    ) =>
      ipcRenderer.send(
        "open-result-window",
        {
          task,
          result,
          sources
        }
      ),

    closeResultWindow: () =>
      ipcRenderer.send(
        "close-result-window"
      ),

    newTaskFromResult: () =>
      ipcRenderer.send(
        "new-task-from-result"
      ),

    isResultWindow: () =>
      window.location.hash ===
      "#result",

    runGemmaTask: (
      task,
      options = {}
    ) =>
      ipcRenderer.invoke(
        "run-gemma-task",
        task,
        options
      ),

    getChatHistory: () =>
      ipcRenderer.invoke("get-chat-history"),

    saveChatHistory: (messages) =>
      ipcRenderer.invoke("save-chat-history", messages),

    clearChatHistory: () =>
      ipcRenderer.invoke("clear-chat-history"),

    listConversations: () =>
      ipcRenderer.invoke("conversations:list"),

    getConversation: (conversationId) =>
      ipcRenderer.invoke("conversations:get", conversationId),

    createConversation: (initialTask, customId) =>
      ipcRenderer.invoke("conversations:create", initialTask, customId),

    saveConversation: (conversation) =>
      ipcRenderer.invoke("conversations:save", conversation),

    deleteConversation: (conversationId) =>
      ipcRenderer.invoke("conversations:delete", conversationId),

    clearAllConversations: () =>
      ipcRenderer.invoke("conversations:clear"),

    getActiveConversationId: () =>
      ipcRenderer.invoke("conversations:getActiveId"),

    setActiveConversationId: (conversationId) =>
      ipcRenderer.invoke("conversations:setActiveId", conversationId),

    // Screen Vision
    captureScreen: () =>
      ipcRenderer.invoke("screen:capture"),

    analyzeScreen: (options) =>
      ipcRenderer.invoke("screen:analyze", options),

    // Developer Mode
    selectProjectFolder: () =>
      ipcRenderer.invoke("dev:select-project"),

    getProjectPath: () =>
      ipcRenderer.invoke("dev:get-project-path"),

    listProjectFiles: (relDir) =>
      ipcRenderer.invoke("dev:list-files", relDir),

    readProjectFile: (relFilePath, maxBytes) =>
      ipcRenderer.invoke("dev:read-file", relFilePath, maxBytes),

    searchProjectCode: (query, maxMatches) =>
      ipcRenderer.invoke("dev:search-code", query, maxMatches),

    diagnoseProject: (options) =>
      ipcRenderer.invoke("dev:diagnose", options),

    // Monitoring
    startMonitoring: (options) =>
      ipcRenderer.invoke("monitor:start", options),

    stopMonitoring: (taskId) =>
      ipcRenderer.invoke("monitor:stop", taskId),

    getMonitoringStatus: (taskId) =>
      ipcRenderer.invoke("monitor:status", taskId),

    onMonitoringAlert: (callback) => {
      const handler = (_event, alert) => callback(alert);
      ipcRenderer.on("monitor:alert", handler);
      return () => ipcRenderer.removeListener("monitor:alert", handler);
    }
  }
);