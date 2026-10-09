const { exec, spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

/* =========================================================
   TOOL DECLARATIONS (for Gemma 4 Function Calling)
========================================================= */

const TOOL_DECLARATIONS = [
  {
    name: "control_volume",
    description: "Adjust or mute the Windows system audio volume.",
    parameters: {
      type: "OBJECT",
      properties: {
        action: {
          type: "STRING",
          enum: ["mute", "unmute", "up", "down", "set"],
          description: "Action to perform on system volume."
        },
        level: {
          type: "INTEGER",
          description: "Volume level from 0 to 100 (for 'set' action)."
        }
      },
      required: ["action"]
    }
  },
  {
    name: "browser_action",
    description: "Launch or navigate the web browser: open specific known websites (e.g. GitHub, Reddit, Gmail, Netflix, YouTube) or specific URLs when the user explicitly asks to open an external browser or play a media track. DO NOT call this tool for research, factual questions, or trending news queries.",
    parameters: {
      type: "OBJECT",
      properties: {
        action: {
          type: "STRING",
          enum: ["open_website", "search", "open_url"],
          description: "Action: 'open_website' (for known sites like GitHub, Reddit), 'search' (for media/songs), or 'open_url'."
        },
        query_or_url: {
          type: "STRING",
          description: "Website name, search query (e.g. 'Hanuman Chalisa', 'latest AI models'), or URL."
        },
        search_engine: {
          type: "STRING",
          enum: ["google", "youtube", "wikipedia", "duckduckgo"],
          description: "Search engine to use (defaults to 'youtube' for media/songs, 'google' for general search)."
        },
        browser: {
          type: "STRING",
          enum: ["firefox", "chrome", "edge", "default"],
          description: "Browser to launch (defaults to 'firefox' if mentioned, else default browser)."
        }
      },
      required: ["query_or_url"]
    }
  },
  {
    name: "open_app_or_media",
    description: "Open desktop applications (Firefox, Notepad, Calculator, Spotify, etc.) or play media/search YouTube.",
    parameters: {
      type: "OBJECT",
      properties: {
        target: {
          type: "STRING",
          description: "Application or destination: 'firefox', 'chrome', 'browser', 'notepad', 'calc', 'spotify', 'explorer'."
        },
        query: {
          type: "STRING",
          description: "Search query, media title (e.g. 'hanuman chalisa'), or web URL."
        }
      },
      required: ["target"]
    }
  },
  {
    name: "take_screenshot",
    description: "Capture a full screenshot of the user's desktop ONLY when the user explicitly requests to capture/take a screenshot or screen grab. DO NOT call this tool when the user asks to analyze, explain, or inspect what is currently on the screen.",
    parameters: {
      type: "OBJECT",
      properties: {
        notes: {
          type: "STRING",
          description: "Optional reason or note for the screenshot."
        }
      }
    }
  },
  {
    name: "analyze_screen",
    description: "Analyze, inspect, or diagnose what is currently visible on the user's screen using vision when the user asks 'analyze my screen', 'what is on my screen', 'whats in it', or asks to check for errors/code on screen.",
    parameters: {
      type: "OBJECT",
      properties: {
        question: {
          type: "STRING",
          description: "Specific question or focus for the screen analysis."
        }
      }
    }
  },
  {
    name: "set_timer",
    description: "Set a countdown timer or alarm for a specified duration in minutes.",
    parameters: {
      type: "OBJECT",
      properties: {
        minutes: {
          type: "NUMBER",
          description: "Duration in minutes (e.g. 5, 10, 0.5)."
        },
        label: {
          type: "STRING",
          description: "What the timer is for (e.g. 'Wake up', 'Check tea', 'Stretch')."
        }
      },
      required: ["minutes"]
    }
  },
  {
    name: "get_system_time",
    description: "Get the live date, clock time, day of the week, and timezone from the Windows system.",
    parameters: {
      type: "OBJECT",
      properties: {}
    }
  }
];

/* =========================================================
   POWERSHELL HELPER
========================================================= */

function runPowerShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(`powershell -NoProfile -Command "${cmd}"`, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout ? stdout.trim() : "");
    });
  });
}

/* =========================================================
   TOOL IMPLEMENTATIONS
========================================================= */

// 1. Volume Control
async function handleVolume(args) {
  const action = (args?.action || "mute").toLowerCase();

  try {
    if (action === "mute" || action === "unmute") {
      // Toggle mute via WScript.Shell SendKeys key code 173
      await runPowerShell(`$wscript = New-Object -ComObject WScript.Shell; $wscript.SendKeys([char]173)`);
      return {
        success: true,
        message: action === "mute" ? "🔇 Volume has been muted." : "🔊 Volume has been un-muted."
      };
    }

    if (action === "up") {
      // Send volume up (175) 5 times (+10%)
      await runPowerShell(`$wscript = New-Object -ComObject WScript.Shell; 1..5 | ForEach-Object { $wscript.SendKeys([char]175) }`);
      return {
        success: true,
        message: "🔊 System volume increased."
      };
    }

    if (action === "down") {
      // Send volume down (174) 5 times (-10%)
      await runPowerShell(`$wscript = New-Object -ComObject WScript.Shell; 1..5 | ForEach-Object { $wscript.SendKeys([char]174) }`);
      return {
        success: true,
        message: "🔉 System volume decreased."
      };
    }

    if (action === "set") {
      // Estimate steps
      const targetLevel = Math.max(0, Math.min(100, Number(args?.level || 50)));
      // Zero out first then step up
      await runPowerShell(`
        $w = New-Object -ComObject WScript.Shell;
        1..50 | ForEach-Object { $w.SendKeys([char]174) };
        $steps = [math]::Round(${targetLevel} / 2);
        1..$steps | ForEach-Object { $w.SendKeys([char]175) }
      `.replace(/\n/g, " "));
      return {
        success: true,
        message: `🔊 System volume set to approximately ${targetLevel}%.`
      };
    }

    return { success: false, message: `Unknown volume action: ${action}` };
  } catch (error) {
    return { success: false, message: `Failed to adjust volume: ${error.message}` };
  }
}

// 2. Open App or Play Media
async function handleOpenAppOrMedia(args) {
  const target = (args?.target || "firefox").toLowerCase();
  const query = (args?.query || "").trim();

  try {
    let url = "";
    if (query) {
      if (query.startsWith("http://") || query.startsWith("https://")) {
        url = query;
      } else {
        // Construct YouTube search/play URL
        url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      }
    }

    if (target.includes("firefox")) {
      // Try launching with firefox directly
      if (url) {
        exec(`start firefox "${url}"`, (err) => {
          if (err) {
            // Fallback to default browser
            exec(`start "" "${url}"`);
          }
        });
        return {
          success: true,
          message: `🦊 Opened Firefox with **${query || "YouTube"}**!`
        };
      } else {
        exec(`start firefox`);
        return {
          success: true,
          message: `🦊 Launched Firefox browser.`
        };
      }
    }

    if (target.includes("chrome")) {
      if (url) {
        exec(`start chrome "${url}"`);
        return { success: true, message: `Opened Chrome with **${query}**.` };
      }
      exec(`start chrome`);
      return { success: true, message: `Launched Google Chrome.` };
    }

    if (target.includes("calc")) {
      exec(`start calc`);
      return { success: true, message: `🔢 Opened Windows Calculator.` };
    }

    if (target.includes("notepad")) {
      exec(`start notepad`);
      return { success: true, message: `📝 Opened Notepad.` };
    }

    if (target.includes("spotify")) {
      if (query) {
        exec(`start "" "spotify:search:${encodeURIComponent(query)}"`, (err) => {
          if (err) exec(`start "" "${url || "https://open.spotify.com"}"`);
        });
        return { success: true, message: `🎵 Opened Spotify searching for **${query}**.` };
      }
      exec(`start spotify:`);
      return { success: true, message: `🎵 Opened Spotify.` };
    }

    // Default browser fallback if URL exists
    if (url) {
      exec(`start "" "${url}"`);
      return {
        success: true,
        message: `🌐 Opened **${query || url}** in your browser.`
      };
    }

    // Generic app launch
    exec(`start ${target}`);
    return {
      success: true,
      message: `Launched **${target}**.`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to open ${target}: ${error.message}`
    };
  }
}

// 3. Capture Screenshot
async function handleScreenshot(screenshotsDir, context = {}) {
  try {
    if (typeof context.captureScreen === "function") {
      const captured = await context.captureScreen();
      const imgMd = captured?.base64Data ? `![Screenshot](data:image/jpeg;base64,${captured.base64Data})\n\n` : "";
      const resInfo = (captured?.width && captured?.height) ? `- **Resolution:** ${captured.width} × ${captured.height}\n` : "";
      const savedInfo = captured?.filePath ? `- **Saved to:** \`${captured.filePath}\`\n` : "";
      return {
        success: true,
        filePath: captured?.filePath,
        message: `${imgMd}📸 **Screenshot Captured Successfully!**\n${resInfo}${savedInfo}`
      };
    }

    const dir = screenshotsDir || path.resolve(__dirname, "../../screenshots");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filename = `screenshot-${Date.now()}.png`;
    const fullPath = path.join(dir, filename);
    const normPath = fullPath.replace(/\\/g, "/");

    const psScript = `Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $s = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds; $b = New-Object System.Drawing.Bitmap $s.Width, $s.Height; $g = [System.Drawing.Graphics]::FromImage($b); $g.CopyFromScreen($s.X, $s.Y, 0, 0, $s.Size); $b.Save('${normPath}', [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose();`;

    await runPowerShell(psScript);

    return {
      success: true,
      filePath: fullPath,
      message: `📸 **Screenshot captured successfully!**\n\n- **Saved to:** \`${fullPath}\``
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to take screenshot: ${error.message}`
    };
  }
}

// 3b. Analyze Screen with Vision
async function handleAnalyzeScreen(args = {}, context = {}) {
  try {
    if (typeof context.captureScreen !== "function" || typeof context.analyzeScreen !== "function") {
      return {
        success: false,
        message: "Screen vision analysis is not available in the current context."
      };
    }
    const captured = await context.captureScreen();
    if (!captured || !captured.base64Data) {
      return {
        success: false,
        message: "Failed to capture screen for vision analysis."
      };
    }
    const prompt = args?.question || "Analyze my current screen. Report visible active applications, windows, code, errors, text, and any issues.";
    const visionResult = await context.analyzeScreen(captured.base64Data, prompt);
    const analysisText = typeof visionResult === "string" ? visionResult : (visionResult?.text || "Screen inspected, but no details were generated.");
    return {
      success: true,
      message: analysisText
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to analyze screen: ${error.message}`
    };
  }
}

// 4. Timer / Alarm
function handleTimer(args, onTimerFired) {
  const minutes = Math.max(0.1, Number(args?.minutes || 5));
  const label = args?.label || "Timer Alert";
  const ms = Math.round(minutes * 60 * 1000);

  setTimeout(async () => {
    // Play system chime sound
    try {
      await runPowerShell(`[System.Media.SystemSounds]::Exclamation.Play()`);
    } catch {}

    if (typeof onTimerFired === "function") {
      onTimerFired({ minutes, label });
    }
  }, ms);

  const displayTime = minutes < 1 ? `${Math.round(minutes * 60)} seconds` : `${minutes} minute${minutes === 1 ? "" : "s"}`;
  return {
    success: true,
    message: `⏰ **Timer set for ${displayTime}!** I will wake you up when time is up.`
  };
}

/* =========================================================
   BROWSER & SEARCH AUTOMATION
========================================================= */

const KNOWN_SITES = {
  github: "https://github.com",
  reddit: "https://reddit.com",
  youtube: "https://youtube.com",
  twitter: "https://x.com",
  x: "https://x.com",
  google: "https://google.com",
  gmail: "https://mail.google.com",
  netflix: "https://netflix.com",
  amazon: "https://amazon.com",
  wikipedia: "https://wikipedia.org",
  chatgpt: "https://chatgpt.com",
  linkedin: "https://linkedin.com",
  stackoverflow: "https://stackoverflow.com",
  spotify: "https://open.spotify.com"
};

async function handleBrowserAction(args) {
  const rawInput = (args?.query_or_url || args?.query || "").trim();
  const engine = (args?.search_engine || "").toLowerCase();
  const chosenBrowser = (args?.browser || args?.target || "").toLowerCase();

  let browserCmd = "";
  let browserLabel = "your browser";
  if (chosenBrowser.includes("firefox")) {
    browserCmd = "firefox";
    browserLabel = "Firefox";
  } else if (chosenBrowser.includes("chrome")) {
    browserCmd = "chrome";
    browserLabel = "Chrome";
  } else if (chosenBrowser.includes("edge")) {
    browserCmd = "msedge";
    browserLabel = "Edge";
  }

  let finalUrl = "";
  let actionDescription = "";
  const lowerInput = rawInput.toLowerCase();

  // 1. Direct URL check
  if (rawInput.startsWith("http://") || rawInput.startsWith("https://")) {
    finalUrl = rawInput;
    actionDescription = `Opened URL directly: \`${finalUrl}\``;
  }
  // 2. Known site match
  else if (KNOWN_SITES[lowerInput] || KNOWN_SITES[lowerInput.replace(/^open\s+/, "")]) {
    const siteKey = KNOWN_SITES[lowerInput] ? lowerInput : lowerInput.replace(/^open\s+/, "");
    finalUrl = KNOWN_SITES[siteKey];
    actionDescription = `Navigated directly to **${siteKey}** (${finalUrl})`;
  }
  // 3. Domain format check
  else if (/^[a-zA-Z0-9-]+\.[a-zA-Z]{2,}(\/.*)?$/.test(rawInput)) {
    finalUrl = `https://${rawInput}`;
    actionDescription = `Navigated to **${rawInput}**`;
  }
  // 4. Media or song queries
  else if (engine === "youtube" || lowerInput.includes("chalisa") || lowerInput.includes("song") || lowerInput.includes("play") || lowerInput.includes("music") || lowerInput.includes("video")) {
    const cleanSearch = rawInput.replace(/^(?:play|open|search)\s+/i, "");
    finalUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(cleanSearch)}`;
    actionDescription = `Searched YouTube and queued: **${cleanSearch}**`;
  }
  // 5. Wikipedia search
  else if (engine === "wikipedia") {
    finalUrl = `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(rawInput)}`;
    actionDescription = `Searched Wikipedia for: **${rawInput}**`;
  }
  // 6. DuckDuckGo search
  else if (engine === "duckduckgo") {
    finalUrl = `https://duckduckgo.com/?q=${encodeURIComponent(rawInput)}`;
    actionDescription = `Searched DuckDuckGo for: **${rawInput}**`;
  }
  // 7. General Google Web Search
  else {
    finalUrl = `https://www.google.com/search?q=${encodeURIComponent(rawInput)}`;
    actionDescription = `Searched Google for: **${rawInput}**`;
  }

  try {
    if (browserCmd) {
      exec(`start ${browserCmd} "${finalUrl}"`, (err) => {
        if (err) {
          exec(`start "" "${finalUrl}"`);
        }
      });
    } else {
      exec(`start "" "${finalUrl}"`);
    }

    return {
      success: true,
      url: finalUrl,
      message: `🌐 **${browserLabel} Action Completed!**\n\n* **Action:** ${actionDescription}\n* **Destination:** [${finalUrl}](${finalUrl})\n\nStep 1: Target resolved.\nStep 2: Launched ${browserLabel}.\nStep 3: Navigated to destination URL.`
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to open ${browserLabel}: ${error.message}`
    };
  }
}

function handleGetTime() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  return {
    success: true,
    message: `🕒 **Current System Time:** **${timeStr} (IST)** on **${dateStr}** 🐾`
  };
}

/* =========================================================
   DISPATCHER
========================================================= */

async function executeTool(name, args, context = {}) {
  console.log(`[WindowsTools] Executing tool '${name}' with args:`, args);

  switch (name) {
    case "get_system_time":
      return handleGetTime();

    case "control_volume":
      return await handleVolume(args);

    case "browser_action":
      return await handleBrowserAction(args);

    case "open_app_or_media":
      // If query is present, also route through comprehensive browser/media handler
      if (args?.query) {
        return await handleBrowserAction({ query_or_url: args.query, browser: args.target });
      }
      return await handleOpenAppOrMedia(args);

    case "take_screenshot":
      return await handleScreenshot(context.screenshotsDir, context);

    case "analyze_screen":
      return await handleAnalyzeScreen(args, context);

    case "set_timer":
      return handleTimer(args, context.onTimerFired);

    default:
      return { success: false, message: `Tool '${name}' is not recognized.` };
  }
}

module.exports = {
  TOOL_DECLARATIONS,
  executeTool
};
