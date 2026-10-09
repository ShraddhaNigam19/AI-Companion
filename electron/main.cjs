const {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  screen,
  shell
} = require("electron");

const {
  runTask,
  streamTask,
  analyzeScreenImage,
  diagnoseDeveloperCode
} = require("./gemma.cjs");

const path = require("path");
const fs = require("fs");
const conversationStore = require("./conversationStore.cjs");
const { captureScreenSafe } = require("./screenCapture.cjs");
const projectInspector = require("./projectInspector.cjs");
const monitoringService = require("./monitoringService.cjs");

const PET_W = 320;
const PET_H = 320;

const RESULT_W = 560;
const RESULT_H = 700;

let petWindow = null;
let resultWindow = null;

let moveTimer = null;
let roamDirection = 1; // 1 = moving right/down, -1 = moving left/up
let idleSleepTimer = null;
let lastUserInteraction = Date.now();
const SLEEP_IDLE_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes of idle time triggers sleep

let isSleeping = false;
let isDragging = false;

let placement = "bottom";

let targetX = 0;
let targetY = 0;

let dragOffsetX = 0;
let dragOffsetY = 0;

let currentResult = null;
let currentAuthorizedProjectPath = null;
let resultWindowCustomPosition = null;
let pendingCompanionTask = null;

/* =========================================================
   URL LOADER WITH LOCAL DIST FALLBACK & LOGGING
========================================================= */

function loadWindowURL(win, route = "") {
  const devUrl = "http://127.0.0.1:5173" + (route ? `#${route}` : "");
  const distPath = path.join(__dirname, "../dist/index.html");

  win.loadURL(devUrl).catch((err) => {
    console.warn(`[main] Failed to connect to ${devUrl} (${err.message}). Attempting fallback to ${distPath}`);
    try {
      if (win && !win.isDestroyed() && fs.existsSync(distPath)) {
        win.loadFile(distPath, route ? { hash: route } : {}).catch(() => {});
      }
    } catch {}
  });

  win.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[main] did-fail-load: ${errorDescription} (${errorCode}) for ${validatedURL}`);
    try {
      if (win && !win.isDestroyed() && validatedURL && validatedURL.includes("127.0.0.1") && fs.existsSync(distPath)) {
        console.log(`[main] Falling back to local bundle: ${distPath}`);
        win.loadFile(distPath, route ? { hash: route } : {}).catch(() => {});
      }
    } catch {}
  });

  win.webContents.on("console-message", (_event, level, message, line, sourceId) => {
    if (level >= 2) {
      console.error(`[renderer error]: ${message} (${sourceId}:${line})`);
    }
  });
}

/* =========================================================
   SINGLE INSTANCE
========================================================= */

const gotLock =
  app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on(
    "second-instance",
    () => {
      if (
        petWindow &&
        !petWindow.isDestroyed()
      ) {
        petWindow.show();
        petWindow.focus();
      }
    }
  );
}

/* =========================================================
   CREATE LUNA WINDOW
========================================================= */

function createWindow() {
  petWindow =
    new BrowserWindow({
      width: PET_W,
      height: PET_H,

      frame: false,
      transparent: true,
      resizable: false,
      movable: true,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,

      backgroundColor: "#00000000",

      webPreferences: {
        preload: path.join(
          __dirname,
          "preload.cjs"
        ),

        contextIsolation: true,
        nodeIntegration: false
      }
    });

  petWindow.setAlwaysOnTop(
    true,
    "floating"
  );

  loadWindowURL(petWindow, "");

  let initialPlacementApplied = false;
  petWindow.webContents.on(
    "did-finish-load",
    () => {
      if (!initialPlacementApplied) {
        initialPlacementApplied = true;
        applyPlacement(placement);
        if (!moveTimer) {
          startRoaming();
        }
      }
    }
  );

  if (!idleSleepTimer) {
    idleSleepTimer = setInterval(checkIdleSleep, 5000);
  }

  petWindow.on(
    "closed",
    () => {
      petWindow = null;
    }
  );
}

/* =========================================================
   WORK AREA
========================================================= */

function getWorkArea() {
  if (
    !petWindow ||
    petWindow.isDestroyed()
  ) {
    return screen.getPrimaryDisplay()
      .workArea;
  }

  const bounds =
    petWindow.getBounds();

  return screen
    .getDisplayNearestPoint({
      x: bounds.x,
      y: bounds.y
    })
    .workArea;
}

/* =========================================================
   SEND ACTION
========================================================= */

function sendAction(action) {
  if (
    !petWindow ||
    petWindow.isDestroyed()
  ) {
    return;
  }

  petWindow.webContents.send(
    "companion-action",
    {
      action
    }
  );
}

/* =========================================================
   SLEEP & WAKE MANAGEMENT
========================================================= */

function recordUserInteraction() {
  lastUserInteraction = Date.now();
  if (isSleeping) {
    wakeLuna();
  }
}

function sleepLuna() {
  if (isSleeping) return;
  isSleeping = true;
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-state", { state: "sleeping" });
  }
}

function wakeLuna() {
  if (!isSleeping) return;
  isSleeping = false;
  lastUserInteraction = Date.now();
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-state", {
      state: placement === "center" ? "idle" : "walking"
    });
  }
  if (!moveTimer) {
    startRoaming();
  }
}

function checkIdleSleep() {
  if (isSleeping || isDragging) return;
  const now = Date.now();
  if (now - lastUserInteraction >= SLEEP_IDLE_TIMEOUT_MS) {
    sleepLuna();
  }
}

/* =========================================================
   EDGE-AWARE DIRECTIONAL ROAMING
========================================================= */

function chooseTarget() {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  const workArea = getWorkArea();
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - PET_W;
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - PET_H;

  targetX = Math.floor(minX + Math.random() * Math.max(1, maxX - minX));
  targetY = Math.floor(minY + Math.random() * Math.max(1, maxY - minY));
}

// Case A: Bottom Edge horizontal patrol
function roamBottom(workArea, bounds) {
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - PET_W;
  const fixedY = workArea.y + workArea.height - PET_H;

  if (bounds.x >= maxX) {
    roamDirection = -1;
  } else if (bounds.x <= minX) {
    roamDirection = 1;
  }

  const speed = 2;
  let nextX = bounds.x + (roamDirection * speed);
  nextX = Math.max(minX, Math.min(nextX, maxX));

  petWindow.setPosition(Math.round(nextX), Math.round(fixedY));
  petWindow.webContents.send("pet-state", { state: "walking" });
}

// Case B: Top Edge horizontal patrol
function roamTop(workArea, bounds) {
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - PET_W;
  const fixedY = workArea.y;

  if (bounds.x >= maxX) {
    roamDirection = -1;
  } else if (bounds.x <= minX) {
    roamDirection = 1;
  }

  const speed = 2;
  let nextX = bounds.x + (roamDirection * speed);
  nextX = Math.max(minX, Math.min(nextX, maxX));

  petWindow.setPosition(Math.round(nextX), Math.round(fixedY));
  petWindow.webContents.send("pet-state", { state: "walking" });
}

// Case C1: Left Edge vertical patrol
function roamLeft(workArea, bounds) {
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - PET_H;
  const fixedX = workArea.x;

  if (bounds.y >= maxY) {
    roamDirection = -1;
  } else if (bounds.y <= minY) {
    roamDirection = 1;
  }

  const speed = 2;
  let nextY = bounds.y + (roamDirection * speed);
  nextY = Math.max(minY, Math.min(nextY, maxY));

  petWindow.setPosition(Math.round(fixedX), Math.round(nextY));
  petWindow.webContents.send("pet-state", { state: "walking" });
}

// Case C2: Right Edge vertical patrol
function roamRight(workArea, bounds) {
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - PET_H;
  const fixedX = workArea.x + workArea.width - PET_W;

  if (bounds.y >= maxY) {
    roamDirection = -1;
  } else if (bounds.y <= minY) {
    roamDirection = 1;
  }

  const speed = 2;
  let nextY = bounds.y + (roamDirection * speed);
  nextY = Math.max(minY, Math.min(nextY, maxY));

  petWindow.setPosition(Math.round(fixedX), Math.round(nextY));
  petWindow.webContents.send("pet-state", { state: "walking" });
}

// Case D: Free Roaming bounded naturally
function roamFree(workArea, bounds) {
  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - PET_W;
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - PET_H;

  const dx = targetX - bounds.x;
  const dy = targetY - bounds.y;
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance < 6) {
    chooseTarget();
    petWindow.webContents.send("pet-state", { state: "idle" });
    return;
  }

  const speed = 2.5;
  const stepX = (dx / distance) * speed;
  const stepY = (dy / distance) * speed;

  const nextX = Math.max(minX, Math.min(bounds.x + stepX, maxX));
  const nextY = Math.max(minY, Math.min(bounds.y + stepY, maxY));

  petWindow.setPosition(Math.round(nextX), Math.round(nextY));
  petWindow.webContents.send("pet-state", { state: "walking" });
}

// Case E: Center placement (resting idle)
function holdCenter(workArea, bounds) {
  const centerX = workArea.x + Math.round((workArea.width - PET_W) / 2);
  const centerY = workArea.y + Math.round((workArea.height - PET_H) / 2);
  if (Math.abs(bounds.x - centerX) > 2 || Math.abs(bounds.y - centerY) > 2) {
    petWindow.setPosition(centerX, centerY);
  }
}

/* =========================================================
   MOVEMENT LOOP
========================================================= */

function moveTowardsTarget() {
  if (
    !petWindow ||
    petWindow.isDestroyed() ||
    isSleeping ||
    isDragging
  ) {
    return;
  }

  const workArea = getWorkArea();
  const bounds = petWindow.getBounds();

  switch (placement) {
    case "bottom":
      roamBottom(workArea, bounds);
      break;
    case "top":
      roamTop(workArea, bounds);
      break;
    case "left":
      roamLeft(workArea, bounds);
      break;
    case "right":
      roamRight(workArea, bounds);
      break;
    case "free":
      roamFree(workArea, bounds);
      break;
    case "center":
      holdCenter(workArea, bounds);
      break;
    default:
      roamBottom(workArea, bounds);
      break;
  }
}

function startRoaming() {
  if (moveTimer) {
    clearInterval(moveTimer);
    moveTimer = null;
  }

  chooseTarget();
  moveTimer = setInterval(moveTowardsTarget, 40);
}

/* =========================================================
   PLACEMENT
========================================================= */

function applyPlacement(nextPlacement) {
  if (!petWindow || petWindow.isDestroyed()) {
    return;
  }

  recordUserInteraction();
  placement = nextPlacement || "bottom";
  roamDirection = 1;

  const workArea = getWorkArea();
  let x = workArea.x;
  let y = workArea.y;

  switch (placement) {
    case "top":
      x = workArea.x + Math.round((workArea.width - PET_W) / 2);
      y = workArea.y;
      break;
    case "left":
      x = workArea.x;
      y = workArea.y + Math.round((workArea.height - PET_H) / 2);
      break;
    case "right":
      x = workArea.x + workArea.width - PET_W;
      y = workArea.y + Math.round((workArea.height - PET_H) / 2);
      break;
    case "center":
      x = workArea.x + Math.round((workArea.width - PET_W) / 2);
      y = workArea.y + Math.round((workArea.height - PET_H) / 2);
      break;
    case "free":
      chooseTarget();
      break;
    case "bottom":
    default:
      x = workArea.x + Math.round((workArea.width - PET_W) / 2);
      y = workArea.y + workArea.height - PET_H;
      break;
  }

  if (placement !== "free") {
    const clampedX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - PET_W));
    const clampedY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - PET_H));
    petWindow.setPosition(Math.round(clampedX), Math.round(clampedY));
  }

  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.webContents.send("pet-state", {
      state: isSleeping ? "sleeping" : (placement === "center" ? "idle" : "walking")
    });
    petWindow.webContents.send("placement-changed", placement);
  }

  if (!moveTimer) {
    startRoaming();
  }
}

/* =========================================================
   CONTEXT MENU (Streamlined: Talk, Settings, Current Task removed)
========================================================= */

function showContextMenu() {
  recordUserInteraction();

  const placementMenu = Menu.buildFromTemplate([
    {
      label: "Bottom",
      type: "radio",
      checked: placement === "bottom",
      click: () => applyPlacement("bottom")
    },
    {
      label: "Top",
      type: "radio",
      checked: placement === "top",
      click: () => applyPlacement("top")
    },
    {
      label: "Left",
      type: "radio",
      checked: placement === "left",
      click: () => applyPlacement("left")
    },
    {
      label: "Right",
      type: "radio",
      checked: placement === "right",
      click: () => applyPlacement("right")
    },
    {
      label: "Center",
      type: "radio",
      checked: placement === "center",
      click: () => applyPlacement("center")
    },
    {
      label: "Free (Roam)",
      type: "radio",
      checked: placement === "free",
      click: () => applyPlacement("free")
    }
  ]);

  const menu = Menu.buildFromTemplate([
    {
      label: "🎯 Give Task",
      click: () => {
        recordUserInteraction();
        sendAction("give-task");
      }
    },
    {
      label: "💬 Open Chat / Result",
      click: () => {
        recordUserInteraction();
        if (currentResult) {
          showResultWindow(
            currentResult.task,
            currentResult.result,
            currentResult.sources || []
          );
        } else {
          showResultWindow("Chat with Luna", "", []);
        }
      }
    },
    {
      type: "separator"
    },
    {
      label: "📍 Placement",
      submenu: placementMenu
    },
    {
      label: "🚶 Roam",
      click: () => {
        recordUserInteraction();
        applyPlacement("free");
      }
    },
    {
      label: isSleeping ? "☀️ Wake Up" : "💤 Sleep",
      click: () => {
        if (isSleeping) {
          wakeLuna();
        } else {
          sleepLuna();
        }
      }
    },
    {
      type: "separator"
    },
    {
      label: "❌ Quit Companions",
      click: () => app.quit()
    }
  ]);

  menu.popup();
}

/* =========================================================
   RESULT WINDOW
========================================================= */

function createResultWindow() {
  if (
    resultWindow &&
    !resultWindow.isDestroyed()
  ) {
    return resultWindow;
  }

  resultWindow =
    new BrowserWindow({
      width: RESULT_W,
      height: RESULT_H,

      show: false,

      frame: true,
      resizable: true,

      backgroundColor:
        "#120019",

      title:
        "Luna — AI Companion",

      alwaysOnTop: true,

      webPreferences: {
        preload: path.join(
          __dirname,
          "preload.cjs"
        ),

        contextIsolation: true,
        nodeIntegration: false
      }
    });

  resultWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  resultWindow.webContents.on("will-navigate", (event, url) => {
    if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://")) && !url.includes("127.0.0.1")) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  resultWindow.setAlwaysOnTop(
    true,
    "floating"
  );

  loadWindowURL(
    resultWindow,
    "result"
  );

  resultWindow.on("moved", () => {
    if (resultWindow && !resultWindow.isDestroyed()) {
      const bounds = resultWindow.getBounds();
      resultWindowCustomPosition = { x: bounds.x, y: bounds.y };
    }
  });

  resultWindow.on(
    "closed",
    () => {
      resultWindow = null;
      if (
        petWindow &&
        !petWindow.isDestroyed()
      ) {
        petWindow.webContents.send(
          "companion-action",
          {
            action: "clear-task"
          }
        );
      }
    }
  );

  return resultWindow;
}

/* =========================================================
   POSITION RESULT WINDOW
========================================================= */

function positionResultWindow() {
  if (
    !resultWindow ||
    resultWindow.isDestroyed()
  ) {
    return;
  }

  // If user has manually moved the result window, preserve their chosen coordinates
  if (resultWindowCustomPosition) {
    const currentBounds = resultWindow.getBounds();
    const display = screen.getDisplayNearestPoint({
      x: resultWindowCustomPosition.x,
      y: resultWindowCustomPosition.y
    });
    const workArea = display.workArea;

    const safeX = Math.max(
      workArea.x,
      Math.min(
        resultWindowCustomPosition.x,
        workArea.x + workArea.width - currentBounds.width
      )
    );
    const safeY = Math.max(
      workArea.y,
      Math.min(
        resultWindowCustomPosition.y,
        workArea.y + workArea.height - currentBounds.height
      )
    );
    resultWindow.setPosition(Math.round(safeX), Math.round(safeY));
    return;
  }

  // If result window is already open and visible, do not move it on every task or state update
  if (resultWindow.isVisible()) {
    return;
  }

  if (
    !petWindow ||
    petWindow.isDestroyed()
  ) {
    return;
  }

  const petBounds =
    petWindow.getBounds();

  const display =
    screen.getDisplayNearestPoint(
      {
        x: petBounds.x,
        y: petBounds.y
      }
    );

  const workArea =
    display.workArea;

  let x =
    petBounds.x +
    PET_W +
    15;

  let y =
    petBounds.y;

  if (
    x + RESULT_W >
    workArea.x +
      workArea.width
  ) {
    x =
      petBounds.x -
      RESULT_W -
      15;
  }

  // Clamp within display work area
  x = Math.max(
    workArea.x,
    Math.min(x, workArea.x + workArea.width - RESULT_W)
  );

  y = Math.max(
    workArea.y,
    Math.min(y, workArea.y + workArea.height - RESULT_H)
  );

  resultWindow.setPosition(
    Math.round(x),
    Math.round(y)
  );
}

/* =========================================================
   BRING RESULT WINDOW FRONT
========================================================= */

function bringResultToFront() {
  if (
    !resultWindow ||
    resultWindow.isDestroyed()
  ) {
    return;
  }

  resultWindow.show();

  resultWindow.setAlwaysOnTop(
    true,
    "floating"
  );

  resultWindow.focus();
  resultWindow.moveTop();

  setTimeout(() => {
    if (
      resultWindow &&
      !resultWindow.isDestroyed()
    ) {
      resultWindow.show();
      resultWindow.focus();
      resultWindow.moveTop();
    }
  }, 100);

  setTimeout(() => {
    if (
      resultWindow &&
      !resultWindow.isDestroyed()
    ) {
      resultWindow.show();
      resultWindow.focus();
      resultWindow.moveTop();
    }
  }, 300);
}

/* =========================================================
   SHOW RESULT WINDOW
========================================================= */

function showResultWindow(
  task,
  result,
  sources = [],
  conversationId = null
) {
  currentResult = {
    conversationId,
    task,
    result,
    sources
  };

  const window =
    createResultWindow();

  positionResultWindow();

  const sendResult = () => {
    if (
      window &&
      !window.isDestroyed()
    ) {
      window.webContents.send(
        "result-data",
        currentResult
      );
    }
  };

  if (
    window.webContents.isLoading()
  ) {
    window.webContents.once(
      "did-finish-load",
      sendResult
    );
  } else {
    sendResult();
  }

  bringResultToFront();
}

/* =========================================================
   STREAM TO RESULT WINDOW
========================================================= */

function sendResultStream(data) {
  if (
    !resultWindow ||
    resultWindow.isDestroyed()
  ) {
    return;
  }

  resultWindow.webContents.send(
    "result-stream",
    data
  );
}

/* =========================================================
   IPC — CONTEXT MENU
========================================================= */

ipcMain.on(
  "open-context-menu",
  () => {
    showContextMenu();
  }
);

/* =========================================================
   IPC — ROAM & PLACEMENT
========================================================= */

ipcMain.on(
  "request-roam",
  () => {
    applyPlacement("free");
  }
);

ipcMain.on(
  "set-placement",
  (_event, place) => {
    applyPlacement(place);
  }
);

ipcMain.handle(
  "get-placement",
  () => {
    return placement;
  }
);

/* =========================================================
   IPC — SLEEP
========================================================= */

ipcMain.on(
  "toggle-sleep",
  () => {
    if (isSleeping) {
      wakeLuna();
    } else {
      sleepLuna();
    }
  }
);

/* =========================================================
   IPC — TALK
========================================================= */

ipcMain.on(
  "talk-to-luna",
  () => {
    recordUserInteraction();

    sendAction("talk");

    if (
      petWindow &&
      !petWindow.isDestroyed()
    ) {
      petWindow.webContents.send(
        "pet-state",
        {
          state: "talking"
        }
      );
    }
  }
);

/* =========================================================
   IPC — GIVE TASK
========================================================= */

ipcMain.on(
  "give-task",
  () => {
    recordUserInteraction();

    sendAction(
      "give-task"
    );
  }
);

/* =========================================================
   IPC — COMPANION TASK SUBMISSION TO RESULT WINDOW
========================================================= */

ipcMain.handle("companion:submit-task", async (_event, taskText) => {
  const cleaned = typeof taskText === "string" ? taskText.trim() : "";
  if (!cleaned) {
    return { success: false, error: "Task cannot be empty." };
  }

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  pendingCompanionTask = {
    taskId,
    text: cleaned,
    timestamp: Date.now()
  };

  const window = createResultWindow();
  positionResultWindow();
  bringResultToFront();

  const dispatch = () => {
    if (window && !window.isDestroyed()) {
      window.webContents.send("companion:dispatch-task", {
        taskId,
        text: cleaned
      });
    }
  };

  if (window.webContents.isLoading()) {
    window.webContents.once("did-finish-load", () => {
      setTimeout(dispatch, 150);
    });
  } else {
    dispatch();
  }

  return { success: true, taskId };
});

ipcMain.handle("companion:get-pending-task", () => {
  return pendingCompanionTask;
});

ipcMain.on("companion:clear-pending-task", (_event, taskId) => {
  if (pendingCompanionTask && (!taskId || pendingCompanionTask.taskId === taskId)) {
    pendingCompanionTask = null;
  }
});

/* =========================================================
   IPC — GEMMA TASK
========================================================= */

ipcMain.handle(
  "run-gemma-task",
  async (
    _event,
    task,
    options = {}
  ) => {
    const openResult =
      options.openResult !== false;

    const conversationId =
      options.conversationId ||
      currentResult?.conversationId ||
      `conv-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const requestId =
      options.requestId ||
      Date.now().toString();

    const context =
      Array.isArray(options.context)
        ? options.context
        : (Array.isArray(options.history)
            ? options.history
            : (typeof options.context === "string" ? options.context : ""));

    try {
      /*
       * Open the result window immediately.
       * This makes the app feel much faster.
       */
      if (openResult) {
        showResultWindow(
          task,
          "",
          [],
          conversationId
        );
      } else {
        bringResultToFront();
      }

      sendResultStream({
        type: "start",
        conversationId,
        requestId,
        task,
        text: "",
        sources: []
      });

      const screenshotsDir = path.join(app.getPath("pictures"), "LunaScreenshots");
      const toolContext = {
        screenshotsDir,
        captureScreen: async () => {
          return await captureScreenSafe({ petWindow, resultWindow, screenshotsDir });
        },
        analyzeScreen: async (base64Jpeg, prompt) => {
          return await analyzeScreenImage(base64Jpeg, prompt);
        },
        projectPath: currentAuthorizedProjectPath,
        onTimerFired: ({ minutes, label }) => {
          if (petWindow && !petWindow.isDestroyed()) {
            petWindow.webContents.send("pet-state", { state: "talking" });
            petWindow.webContents.send("companion-action", { action: "talk" });
          }
          if (resultWindow && !resultWindow.isDestroyed()) {
            sendResultStream({
              type: "chunk",
              conversationId,
              requestId,
              task: "Timer Alert",
              text: `\n\n⏰ **Timer Alert!** Time is up for: **${label || "Scheduled reminder"}** (${minutes}m)`,
              sources: []
            });
            bringResultToFront();
          }
        }
      };

      /*
       * Stream Gemma's response
       * directly into the result window.
       */
      const result =
        await streamTask(
          task,
          (_piece, fullText) => {
            currentResult = {
              conversationId,
              task,
              result: fullText,
              sources: []
            };

            sendResultStream({
              type: "chunk",
              conversationId,
              requestId,
              task,
              text: fullText,
              sources: []
            });
          },
          context,
          toolContext
        );

      currentResult = {
        conversationId,
        task,
        result: result.text,
        sources:
          result.sources || []
      };

      sendResultStream({
        type: "end",
        conversationId,
        requestId,
        task,
        text: result.text,
        sources:
          result.sources || []
      });

      return {
        success: true,
        conversationId,
        requestId,
        result: result.text,
        sources:
          result.sources || []
      };
    } catch (error) {
      console.error(
        "Gemma task error:",
        error
      );

      const message =
        error?.message ||
        "Luna couldn't complete the task.";

      sendResultStream({
        type: "error",
        conversationId,
        requestId,
        task,
        error: message,
        text: "",
        sources: []
      });

      return {
        success: false,
        conversationId,
        requestId,
        error: message,
        sources: []
      };
    }
  }
);

/* =========================================================
   IPC — GET RESULT
========================================================= */

ipcMain.handle(
  "get-result-data",
  () => {
    return currentResult;
  }
);

/* =========================================================
   IPC — OPEN EXTERNAL URL
========================================================= */

ipcMain.on("open-external", (_event, url) => {
  if (typeof url === "string" && (url.startsWith("http://") || url.startsWith("https://"))) {
    shell.openExternal(url);
  }
});

/* =========================================================
   IPC — PET ACTION
========================================================= */

ipcMain.on(
  "pet-action",
  (_event, state) => {
    if (
      petWindow &&
      !petWindow.isDestroyed()
    ) {
      petWindow.webContents.send(
        "pet-state",
        {
          state
        }
      );
    }
  }
);

/* =========================================================
   IPC — DRAG START
========================================================= */

ipcMain.on(
  "drag-started",
  (
    _event,
    data
  ) => {
    if (
      !petWindow ||
      petWindow.isDestroyed()
    ) {
      return;
    }

    isDragging = true;

    placement = "free";

    if (
      moveTimer
    ) {
      clearInterval(
        moveTimer
      );

      moveTimer = null;
    }

    /*
     * Keep the exact point
     * where Luna was grabbed.
     */
    const offsetX = data?.clientX ?? data?.offsetX;
    const offsetY = data?.clientY ?? data?.offsetY;
    if (typeof offsetX === "number" && typeof offsetY === "number") {
      dragOffsetX = offsetX;
      dragOffsetY = offsetY;
    }
  }
);

/* =========================================================
   IPC — DRAG WINDOW
========================================================= */

ipcMain.on(
  "drag-window",
  (
    _event,
    {
      screenX,
      screenY
    }
  ) => {
    if (
      !petWindow ||
      petWindow.isDestroyed() ||
      !isDragging
    ) {
      return;
    }

    const newX =
      screenX -
      dragOffsetX;

    const newY =
      screenY -
      dragOffsetY;

    petWindow.setPosition(
      Math.round(newX),
      Math.round(newY)
    );
  }
);

/* =========================================================
   IPC — DRAG END
========================================================= */

ipcMain.on(
  "drag-ended",
  () => {
    isDragging = false;
    placement = "free";
    recordUserInteraction();
    chooseTarget();
    if (!moveTimer) {
      startRoaming();
    }
  }
);

/* =========================================================
   IPC — OPEN RESULT WINDOW
========================================================= */

ipcMain.on(
  "open-result-window",
  (
    _event,
    {
      task,
      result,
      sources = []
    }
  ) => {
    currentResult = {
      task,
      result,
      sources
    };

    showResultWindow(
      task,
      result,
      sources
    );
  }
);

/* =========================================================
   IPC — CLOSE RESULT WINDOW
========================================================= */

ipcMain.on(
  "close-result-window",
  () => {
    if (
      resultWindow &&
      !resultWindow.isDestroyed()
    ) {
      resultWindow.close();
    }
  }
);

/* =========================================================
   IPC — NEW TASK
========================================================= */

ipcMain.on(
  "new-task-from-result",
  () => {
    currentResult = null;

    if (
      resultWindow &&
      !resultWindow.isDestroyed()
    ) {
      resultWindow.hide();
    }

    if (
      petWindow &&
      !petWindow.isDestroyed()
    ) {
      petWindow.show();
      petWindow.focus();

      petWindow.webContents.send(
        "companion-action",
        {
          action:
            "give-task"
        }
      );
    }
  }
);

/* =========================================================
   IPC — SETTINGS
========================================================= */

ipcMain.on(
  "open-settings",
  () => {
    sendAction(
      "settings"
    );
  }
);

/* =========================================================
   IPC — QUIT
========================================================= */

ipcMain.on(
  "quit-app",
  () => {
    app.quit();
  }
);

/* =========================================================
/* =========================================================
   CONVERSATION STORE & PERSISTENCE
========================================================= */

ipcMain.handle("conversations:list", async () => {
  return conversationStore.listConversations(app.getPath("userData"));
});

ipcMain.handle("conversations:get", async (_event, conversationId) => {
  return conversationStore.getConversation(app.getPath("userData"), conversationId);
});

ipcMain.handle("conversations:create", async (_event, initialTask, customId) => {
  return conversationStore.createConversation(app.getPath("userData"), initialTask, customId);
});

ipcMain.handle("conversations:save", async (_event, conversation) => {
  return conversationStore.saveConversation(app.getPath("userData"), conversation);
});

ipcMain.handle("conversations:delete", async (_event, conversationId) => {
  return conversationStore.deleteConversation(app.getPath("userData"), conversationId);
});

ipcMain.handle("conversations:clear", async () => {
  return conversationStore.clearAllConversations(app.getPath("userData"));
});

ipcMain.handle("conversations:getActiveId", async () => {
  return conversationStore.getActiveConversationId(app.getPath("userData"));
});

ipcMain.handle("conversations:setActiveId", async (_event, conversationId) => {
  return conversationStore.setActiveConversationId(app.getPath("userData"), conversationId);
});

// Backward-compatible fallback handlers
ipcMain.handle("get-chat-history", async () => {
  const activeId = conversationStore.getActiveConversationId(app.getPath("userData"));
  if (activeId) {
    const conv = conversationStore.getConversation(app.getPath("userData"), activeId);
    if (conv && Array.isArray(conv.messages)) {
      return conv.messages.map(m => ({
        role: m.role,
        text: m.content || m.text,
        sources: m.sources || []
      }));
    }
  }
  const all = conversationStore.listConversations(app.getPath("userData"));
  if (all.length > 0) {
    const latest = conversationStore.getConversation(app.getPath("userData"), all[0].conversationId);
    if (latest && Array.isArray(latest.messages)) {
      return latest.messages.map(m => ({
        role: m.role,
        text: m.content || m.text,
        sources: m.sources || []
      }));
    }
  }
  return [];
});

ipcMain.handle("save-chat-history", async (_event, messages) => {
  if (!Array.isArray(messages) || messages.length === 0) return true;
  let activeId = conversationStore.getActiveConversationId(app.getPath("userData"));
  let conv = activeId ? conversationStore.getConversation(app.getPath("userData"), activeId) : null;
  if (!conv) {
    const firstUser = messages.find(m => m.role === "user");
    conv = conversationStore.createConversation(app.getPath("userData"), firstUser ? (firstUser.text || firstUser.content) : "");
  }
  conv.messages = messages.map((m, idx) => ({
    messageId: m.messageId || `msg-${idx}-${Date.now()}`,
    role: m.role,
    content: m.content || m.text,
    timestamp: m.timestamp || Date.now(),
    sources: m.sources || []
  }));
  return conversationStore.saveConversation(app.getPath("userData"), conv);
});

ipcMain.handle("clear-chat-history", async () => {
  return conversationStore.clearAllConversations(app.getPath("userData"));
});

/* =========================================================
   SCREEN CAPTURE & VISION ANALYSIS IPC
========================================================= */

ipcMain.handle("screen:capture", async () => {
  try {
    const screenshotsDir = path.join(app.getPath("pictures"), "LunaScreenshots");
    const result = await captureScreenSafe({ petWindow, resultWindow, screenshotsDir });
    return {
      success: true,
      base64Data: result.base64Data,
      imageJpegBase64: result.base64Data,
      filePath: result.filePath,
      width: result.width,
      height: result.height
    };
  } catch (err) {
    console.error("[main] screen:capture failed:", err);
    return {
      success: false,
      error: err.message || "Failed to capture screen safely."
    };
  }
});

ipcMain.handle("screen:analyze", async (_event, { prompt, customImageBase64 } = {}) => {
  try {
    let base64 = customImageBase64;
    if (!base64) {
      const cap = await captureScreenSafe({ petWindow, resultWindow });
      base64 = cap.base64Data;
    }
    const visionResult = await analyzeScreenImage(base64, prompt);
    const analysisText = typeof visionResult === "string" ? visionResult : (visionResult?.text || "");
    return {
      success: true,
      analysis: analysisText
    };
  } catch (err) {
    console.error("[main] screen:analyze failed:", err);
    return {
      success: false,
      error: err.message || "Screen analysis failed."
    };
  }
});

/* =========================================================
   DEVELOPER MODE / PROJECT INSPECTOR IPC
========================================================= */

ipcMain.handle("dev:select-project", async () => {
  try {
    const res = await dialog.showOpenDialog({
      title: "Select Project Root for Luna Developer Mode",
      properties: ["openDirectory"]
    });
    if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
      return { canceled: true, projectPath: currentAuthorizedProjectPath };
    }
    currentAuthorizedProjectPath = res.filePaths[0];
    return {
      canceled: false,
      projectPath: currentAuthorizedProjectPath
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle("dev:get-project-path", async () => {
  return currentAuthorizedProjectPath;
});

ipcMain.handle("dev:list-files", async (_event, maxDepth = 3) => {
  if (!currentAuthorizedProjectPath) {
    return { error: "No project folder selected. Please select a project folder first." };
  }
  return { files: projectInspector.listProjectFiles(currentAuthorizedProjectPath, maxDepth) };
});

ipcMain.handle("dev:read-file", async (_event, relFilePath, maxBytes) => {
  if (!currentAuthorizedProjectPath) {
    return { error: "No project folder selected. Please select a project folder first." };
  }
  return projectInspector.readProjectFile(relFilePath, currentAuthorizedProjectPath, maxBytes);
});

ipcMain.handle("dev:search-code", async (_event, query, maxMatches) => {
  if (!currentAuthorizedProjectPath) {
    return { error: "No project folder selected. Please select a project folder first." };
  }
  return { matches: projectInspector.searchProjectCode(query, currentAuthorizedProjectPath, maxMatches) };
});

ipcMain.handle("dev:diagnose", async (_event, { symptom, visibleError, files = [], screenBase64 }) => {
  try {
    const diagnosis = await diagnoseDeveloperCode({
      projectRoot: currentAuthorizedProjectPath,
      symptom,
      visibleError,
      files,
      screenBase64
    });
    return { success: true, text: diagnosis };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* =========================================================
   MONITORING SERVICE IPC
========================================================= */

ipcMain.handle("monitor:start", async (_event, { target, intervalMs, description }) => {
  try {
    const resolvedPath = currentAuthorizedProjectPath && !path.isAbsolute(target)
      ? path.join(currentAuthorizedProjectPath, target)
      : target;

    const task = monitoringService.startFileMonitor({
      targetPath: resolvedPath,
      intervalMs,
      label: description,
      onAlert: (alert) => {
        // Send alert to renderer
        if (resultWindow && !resultWindow.isDestroyed()) {
          resultWindow.webContents.send("monitor:alert", alert);
        }
        if (petWindow && !petWindow.isDestroyed()) {
          petWindow.webContents.send("companion-action", { action: "talk" });
        }
      }
    });

    return { success: true, task };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("monitor:stop", async (_event, monitorId) => {
  const stopped = monitoringService.stopMonitor(monitorId);
  return { success: stopped };
});

ipcMain.handle("monitor:status", async () => {
  return monitoringService.getActiveMonitors();
});

/* =========================================================
   GLOBAL SUMMON HOTKEY
========================================================= */

function summonLuna() {
  if (!petWindow || petWindow.isDestroyed()) {
    createWindow();
    return;
  }

  try {
    const cursorPos = screen.getCursorScreenPoint();
    const currentDisplay = screen.getDisplayNearestPoint(cursorPos);
    const workArea = currentDisplay.workArea;

    let newX = cursorPos.x - Math.floor(PET_W / 2);
    let newY = cursorPos.y - Math.floor(PET_H / 2);

    newX = Math.max(workArea.x, Math.min(newX, workArea.x + workArea.width - PET_W));
    newY = Math.max(workArea.y, Math.min(newY, workArea.y + workArea.height - PET_H));

    petWindow.setPosition(newX, newY);
    petWindow.show();
    petWindow.focus();
    sendAction("give-task");
  } catch (err) {
    console.error("Failed to position Luna on summon:", err);
    petWindow.show();
    petWindow.focus();
    sendAction("give-task");
  }
}

/* =========================================================
   APP START
========================================================= */

app.whenReady().then(
  () => {
    createWindow();
    applyPlacement(placement);

    // Register Global Summon Shortcuts
    try {
      const altSpaceRegistered = globalShortcut.register("Alt+Space", () => {
        console.log("[Luna] Summoned via Alt+Space");
        summonLuna();
      });

      if (!altSpaceRegistered) {
        console.log("[Luna] Alt+Space was not available, registering Ctrl+Shift+L fallback");
      }

      globalShortcut.register("CommandOrControl+Shift+L", () => {
        console.log("[Luna] Summoned via Ctrl+Shift+L");
        summonLuna();
      });
    } catch (scErr) {
      console.error("[Luna] Failed to register global shortcuts:", scErr);
    }
  }
);

/* =========================================================
   KEEP APP ALIVE
========================================================= */

app.on(
  "window-all-closed",
  (event) => {
    event.preventDefault();
  }
);

/* =========================================================
   CLEANUP
========================================================= */

app.on(
  "before-quit",
  () => {
    globalShortcut.unregisterAll();

    if (moveTimer) {
      clearInterval(
        moveTimer
      );

      moveTimer = null;
    }
  }
);