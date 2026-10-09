const { desktopCapturer, screen } = require("electron");
const fs = require("fs");
const path = require("path");

/**
 * Safely captures a full desktop screenshot without Luna or the result window
 * covering the target application.
 *
 * @param {Object} options
 * @param {BrowserWindow} options.petWindow - Floating pet companion window
 * @param {BrowserWindow} options.resultWindow - Result / chat window
 * @param {string} [options.screenshotsDir] - Optional directory to save file
 * @returns {Promise<{ success: boolean, base64Data: string, filePath?: string, width: number, height: number, timestamp: number }>}
 */
async function captureScreenSafe({ petWindow, resultWindow, screenshotsDir }) {
  const petWasVisible = Boolean(petWindow && !petWindow.isDestroyed() && petWindow.isVisible());
  const resultWasVisible = Boolean(resultWindow && !resultWindow.isDestroyed() && resultWindow.isVisible());

  try {
    // 1. Temporarily hide both windows so they do not obstruct the underlying application
    if (petWasVisible) {
      petWindow.hide();
    }
    if (resultWasVisible) {
      resultWindow.hide();
    }

    // 2. Allow the OS Desktop Window Manager (DWM) composition buffer to repaint without Luna
    await new Promise((resolve) => setTimeout(resolve, 250));

    // 3. Obtain desktop screen dimensions and capture full primary display
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.size;
    const scaleFactor = primaryDisplay.scaleFactor || 1;
    const targetW = Math.round(width * scaleFactor);
    const targetH = Math.round(height * scaleFactor);

    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: {
        width: targetW,
        height: targetH
      }
    });

    if (!sources || sources.length === 0) {
      throw new Error("No desktop screen source available for capture.");
    }

    // Prefer primary display source
    const source = sources.find((s) => s.display_id === String(primaryDisplay.id)) || sources[0];
    const image = source.thumbnail;
    const jpegBuffer = image.toJPEG(85);
    const base64Data = jpegBuffer.toString("base64");

    // Optionally persist to screenshots folder for auditing/debugging
    let savedFilePath = null;
    if (screenshotsDir) {
      try {
        if (!fs.existsSync(screenshotsDir)) {
          fs.mkdirSync(screenshotsDir, { recursive: true });
        }
        savedFilePath = path.join(screenshotsDir, `luna-capture-${Date.now()}.jpg`);
        fs.writeFileSync(savedFilePath, jpegBuffer);
      } catch (saveErr) {
        console.warn("[ScreenCapture] Could not save screenshot to disk:", saveErr.message);
      }
    }

    return {
      success: true,
      base64Data,
      filePath: savedFilePath,
      width: targetW,
      height: targetH,
      timestamp: Date.now()
    };
  } finally {
    // 4. GUARANTEED CLEANUP PATH: Always restore window visibility and focus
    try {
      if (petWasVisible && petWindow && !petWindow.isDestroyed()) {
        petWindow.show();
      }
      if (resultWasVisible && resultWindow && !resultWindow.isDestroyed()) {
        resultWindow.show();
        resultWindow.focus();
      }
    } catch (restoreErr) {
      console.error("[ScreenCapture] Error restoring windows:", restoreErr.message);
    }
  }
}

module.exports = {
  captureScreenSafe
};
