const fs = require("fs");
const path = require("path");

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  ".svn",
  ".hg",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".output",
  ".turbo",
  "coverage",
  ".cache",
  ".vscode",
  ".idea",
  "bin",
  "obj",
  "vendor",
  "tmp",
  "temp"
]);

const SENSITIVE_PATTERNS = [
  /^\.env(?:\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /id_rsa/i,
  /id_ed25519/i,
  /credentials\.json$/i,
  /secrets?\.json$/i,
  /token\.json$/i,
  /\.pfx$/i
];

const ALLOWED_EXTENSIONS = new Set([
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
  ".json", ".html", ".css", ".scss", ".less",
  ".py", ".rs", ".go", ".java", ".c", ".cpp", ".h", ".hpp",
  ".cs", ".php", ".rb", ".sh", ".bash", ".ps1",
  ".md", ".txt", ".yaml", ".yml", ".toml", ".sql", ".xml"
]);

/**
 * Validates that a target file is safely situated inside the authorized root directory
 * and does not point to sensitive secret files.
 */
function isPathSafe(targetPath, rootPath) {
  if (!targetPath || !rootPath) return false;
  try {
    const resolvedRoot = path.resolve(rootPath);
    const resolvedTarget = path.resolve(resolvedRoot, targetPath);

    // Prevent directory traversal attacks
    if (!resolvedTarget.startsWith(resolvedRoot)) {
      return false;
    }

    const baseName = path.basename(resolvedTarget);
    // Block sensitive secrets / environment configurations
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(baseName)) {
        return false;
      }
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively lists source files inside an authorized project directory.
 */
function listProjectFiles(rootPath, maxDepth = 3) {
  const filesList = [];
  const resolvedRoot = path.resolve(rootPath);

  function walk(currentDir, currentDepth) {
    if (currentDepth > maxDepth || filesList.length >= 150) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".github") continue;
      if (IGNORED_DIRS.has(entry.name)) continue;

      const fullPath = path.join(currentDir, entry.name);
      const relPath = path.relative(resolvedRoot, fullPath).replace(/\\/g, "/");

      if (entry.isDirectory()) {
        walk(fullPath, currentDepth + 1);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (ALLOWED_EXTENSIONS.has(ext)) {
          // Check sensitive names
          let isSecret = false;
          for (const pattern of SENSITIVE_PATTERNS) {
            if (pattern.test(entry.name)) {
              isSecret = true;
              break;
            }
          }
          if (!isSecret) {
            try {
              const stat = fs.statSync(fullPath);
              filesList.push({
                relativePath: relPath,
                size: stat.size,
                extension: ext
              });
            } catch {}
          }
        }
      }
    }
  }

  walk(resolvedRoot, 0);
  return filesList;
}

/**
 * Reads a single file safely from the project directory.
 */
function readProjectFile(targetPath, rootPath, maxBytes = 48000) {
  if (!isPathSafe(targetPath, rootPath)) {
    throw new Error("Access denied: File is outside authorized project folder or is a restricted configuration file.");
  }

  const resolvedRoot = path.resolve(rootPath);
  const resolvedTarget = path.resolve(resolvedRoot, targetPath);

  if (!fs.existsSync(resolvedTarget)) {
    throw new Error(`File not found: ${targetPath}`);
  }

  const stat = fs.statSync(resolvedTarget);
  if (stat.size > 200000) {
    throw new Error(`File exceeds inspection size limit (${Math.round(stat.size / 1024)}KB > 200KB).`);
  }

  const fd = fs.openSync(resolvedTarget, "r");
  const buffer = Buffer.alloc(Math.min(stat.size, maxBytes));
  const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, 0);
  fs.closeSync(fd);

  const content = buffer.toString("utf8", 0, bytesRead);
  const lines = content.split("\n");
  const numberedContent = lines.map((line, idx) => `${idx + 1}: ${line}`).join("\n");

  return {
    success: true,
    relativePath: path.relative(resolvedRoot, resolvedTarget).replace(/\\/g, "/"),
    totalLines: lines.length,
    content: numberedContent,
    truncated: stat.size > maxBytes
  };
}

/**
 * Searches source files in the project for a keyword or error string (e.g. function name, error code).
 */
function searchProjectCode(keyword, rootPath, maxMatches = 5) {
  if (!keyword || typeof keyword !== "string" || keyword.trim().length < 3) {
    return [];
  }

  const searchTarget = keyword.trim().toLowerCase();
  const allFiles = listProjectFiles(rootPath, 3);
  const matches = [];

  for (const file of allFiles) {
    if (matches.length >= maxMatches) break;
    try {
      const fullPath = path.resolve(rootPath, file.relativePath);
      const raw = fs.readFileSync(fullPath, "utf8");
      if (raw.toLowerCase().includes(searchTarget)) {
        const lines = raw.split("\n");
        const matchingLines = [];
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes(searchTarget) && matchingLines.length < 3) {
            matchingLines.push({ lineNumber: idx + 1, text: line.trim() });
          }
        });
        matches.push({
          file: file.relativePath,
          snippets: matchingLines
        });
      }
    } catch {}
  }

  return matches;
}

module.exports = {
  isPathSafe,
  listProjectFiles,
  readProjectFile,
  searchProjectCode
};
