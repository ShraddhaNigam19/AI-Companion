const fs = require("fs");
const path = require("path");

class MonitoringService {
  constructor() {
    this.monitors = new Map();
  }

  /**
   * Starts monitoring a target file or log for changes.
   *
   * @param {Object} options
   * @param {string} options.targetPath - Absolute or relative path to file/log to watch
   * @param {string} [options.label] - Human readable label
   * @param {number} [options.intervalMs] - Polling interval (default 5000ms)
   * @param {Function} options.onAlert - Callback invoked when a meaningful change is detected
   * @returns {{ success: boolean, monitorId: string, label: string }}
   */
  startFileMonitor({ targetPath, label, intervalMs = 5000, onAlert }) {
    const resolvedPath = path.resolve(targetPath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Cannot monitor: Target path does not exist (${targetPath})`);
    }

    const monitorId = `mon-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let initialStat;
    try {
      initialStat = fs.statSync(resolvedPath);
    } catch (e) {
      throw new Error(`Failed to read target status: ${e.message}`);
    }

    let lastMtime = initialStat.mtimeMs;
    let lastSize = initialStat.size;
    let lastChecked = Date.now();

    const timer = setInterval(() => {
      lastChecked = Date.now();
      try {
        if (!fs.existsSync(resolvedPath)) {
          this.stopMonitor(monitorId);
          if (typeof onAlert === "function") {
            onAlert({
              monitorId,
              label: label || path.basename(resolvedPath),
              change: "Target file was deleted or moved.",
              timestamp: Date.now()
            });
          }
          return;
        }

        const currentStat = fs.statSync(resolvedPath);
        if (currentStat.mtimeMs !== lastMtime || currentStat.size !== lastSize) {
          const sizeDiff = currentStat.size - lastSize;
          lastMtime = currentStat.mtimeMs;
          lastSize = currentStat.size;

          // Read the newly appended log lines if the file grew
          let snippet = "";
          if (sizeDiff > 0 && sizeDiff < 8192) {
            try {
              const fd = fs.openSync(resolvedPath, "r");
              const buf = Buffer.alloc(sizeDiff);
              fs.readSync(fd, buf, 0, sizeDiff, currentStat.size - sizeDiff);
              fs.closeSync(fd);
              snippet = buf.toString("utf8").trim();
            } catch {}
          }

          if (typeof onAlert === "function") {
            onAlert({
              monitorId,
              label: label || path.basename(resolvedPath),
              targetPath: resolvedPath,
              change: `File modified (${sizeDiff >= 0 ? `+${sizeDiff} bytes` : `${sizeDiff} bytes`})`,
              snippet: snippet || null,
              timestamp: Date.now()
            });
          }
        }
      } catch (err) {
        console.error(`[MonitoringService] Error checking ${resolvedPath}:`, err.message);
      }
    }, Math.max(3000, intervalMs));

    const monitorRecord = {
      id: monitorId,
      label: label || path.basename(resolvedPath),
      targetPath: resolvedPath,
      type: "file",
      startedAt: Date.now(),
      lastChecked: () => lastChecked,
      timer
    };

    this.monitors.set(monitorId, monitorRecord);

    return {
      success: true,
      monitorId,
      label: monitorRecord.label,
      targetPath: resolvedPath
    };
  }

  stopMonitor(monitorId) {
    const record = this.monitors.get(monitorId);
    if (!record) return false;
    clearInterval(record.timer);
    this.monitors.delete(monitorId);
    return true;
  }

  stopAll() {
    for (const [id, record] of this.monitors.entries()) {
      clearInterval(record.timer);
    }
    this.monitors.clear();
    return true;
  }

  getActiveMonitors() {
    const list = [];
    for (const [id, record] of this.monitors.entries()) {
      list.push({
        id,
        label: record.label,
        targetPath: record.targetPath,
        type: record.type,
        startedAt: record.startedAt,
        lastChecked: record.lastChecked()
      });
    }
    return list;
  }
}

const instance = new MonitoringService();

module.exports = instance;
