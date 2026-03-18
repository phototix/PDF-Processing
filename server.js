const https = require("https");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { PDFDocument, degrees } = require("pdf-lib");

const ROOT = __dirname;
const PDF_ROOT = path.join(ROOT, "PDF");
const SESSIONS_ROOT = path.join(PDF_ROOT, "sessions");
const LOG_DIR = path.join(ROOT, "logs");

const CERT_PATH = path.join(ROOT, "localhost.pem");
const KEY_PATH = path.join(ROOT, "localhost-key.pem");

const PORT = 8080;

const ALLOWED_FILE_EXTS = new Set([".pdf", ".png", ".jpg", ".jpeg", ".webp", ".js", ".mjs"]);

ensureDir(PDF_ROOT);
ensureDir(SESSIONS_ROOT);
ensureDir(LOG_DIR);

const server = https.createServer(
  {
    cert: fs.readFileSync(CERT_PATH),
    key: fs.readFileSync(KEY_PATH),
  },
  (req, res) => {
    const parsedUrl = new URL(req.url, `https://${req.headers.host}`);
    const pathname = decodeURIComponent(parsedUrl.pathname || "/");

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      return sendFile(res, path.join(ROOT, "index.html"), "text/html; charset=utf-8");
    }

    if (req.method === "GET" && pathname === "/favicon.ico") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && pathname === "/styles.css") {
      return sendFile(res, path.join(ROOT, "styles.css"), "text/css; charset=utf-8");
    }

    if (req.method === "GET" && pathname === "/app.js") {
      return sendFile(res, path.join(ROOT, "app.js"), "application/javascript; charset=utf-8");
    }

    if (req.method === "GET" && pathname.startsWith("/files/")) {
      const relativePath = pathname.replace(/^\/files\//, "");
      return handleFileServe(relativePath, res);
    }

    if (req.method === "GET" && pathname === "/api/pdfs") {
      const sessionId = sanitizeSessionId(parsedUrl.searchParams.get("sessionId") || "");
      const filter = sanitizeSessionFilter(parsedUrl.searchParams.get("filter") || "all");
      const payload = listPdfFiles(sessionId, filter);
      return sendJson(res, 200, payload);
    }

    if (req.method === "GET" && pathname === "/api/sessions") {
      const payload = listSessionFolders();
      return sendJson(res, 200, payload);
    }

    if (req.method === "GET" && pathname === "/api/images") {
      const sessionId = sanitizeSessionId(parsedUrl.searchParams.get("sessionId") || "");
      const payload = listImageFiles(sessionId);
      return sendJson(res, 200, payload);
    }

    if (req.method === "POST" && pathname === "/api/upload") {
      return handleUpload(req, res);
    }

    if (req.method === "POST" && pathname === "/api/merge") {
      return handleMerge(req, res);
    }

    if (req.method === "POST" && pathname === "/api/split") {
      return handleSplit(req, res);
    }

    if (req.method === "POST" && pathname === "/api/images-to-pdf") {
      return handleImagesToPdf(req, res);
    }

    if (req.method === "POST" && pathname === "/api/pdf-to-images") {
      return handlePdfToImages(req, res);
    }

    if (req.method === "POST" && pathname === "/api/thumbnail") {
      return handleGenerateThumbnail(req, res);
    }

    if (req.method === "POST" && pathname === "/api/rotate") {
      return handleRotatePdf(req, res);
    }

    if (req.method === "POST" && pathname === "/api/delete") {
      return handleDeletePdf(req, res);
    }

    if (req.method === "POST" && pathname === "/api/rename") {
      return handleRenamePdf(req, res);
    }

    if (req.method === "POST" && pathname === "/api/arrange") {
      return handleArrangePages(req, res);
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  }
);

server.listen(PORT, () => {
  console.log(`PDF Processing server running at https://localhost:${PORT}`);
});

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function sanitizeSessionId(value) {
  return String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 64);
}

function safeOutputName(name, fallback) {
  const base = String(name || fallback || "output").trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!base.toLowerCase().endsWith(".pdf")) {
    return `${base || fallback || "output"}.pdf`;
  }
  return base;
}

function ensureSessionDir(sessionId) {
  const id = sanitizeSessionId(sessionId) || "default";
  const sessionDir = path.join(SESSIONS_ROOT, id);
  ensureDir(sessionDir);
  return sessionDir;
}

function listPdfFiles(sessionId, filter) {
  const items = [];
  const mode = (filter || "all").toLowerCase();
  const sessionFolders = listSessionFolders().items || [];

  if (mode === "all" || mode === "project") {
    const rootPdfs = listFilesShallow(ROOT, (filePath) => path.extname(filePath).toLowerCase() === ".pdf");
    rootPdfs.forEach((filePath) => {
      const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
      items.push(buildFileInfo(filePath, relativePath, "project"));
    });
  }

  if (mode === "all" || mode === "library") {
    const pdfFolder = listFiles(PDF_ROOT, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const isPdf = ext === ".pdf";
      const isSession = filePath.includes(`${path.sep}sessions${path.sep}`);
      return isPdf && !isSession;
    });

    pdfFolder.forEach((filePath) => {
      const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
      items.push(buildFileInfo(filePath, relativePath, "library"));
    });
  }

  if (mode === "all") {
    sessionFolders.forEach((session) => {
      const sessionDir = path.join(SESSIONS_ROOT, session);
      if (fs.existsSync(sessionDir)) {
        const sessionPdfs = listFiles(sessionDir, (filePath) => path.extname(filePath).toLowerCase() === ".pdf");
        sessionPdfs.forEach((filePath) => {
          const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
          items.push(buildFileInfo(filePath, relativePath, "session"));
        });
      }
    });
  } else if (mode === "session" && sessionId) {
    const sessionDir = path.join(SESSIONS_ROOT, sessionId);
    if (fs.existsSync(sessionDir)) {
      const sessionPdfs = listFiles(sessionDir, (filePath) => path.extname(filePath).toLowerCase() === ".pdf");
      sessionPdfs.forEach((filePath) => {
        const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
        items.push(buildFileInfo(filePath, relativePath, "session"));
      });
    }
  } else if (mode && !["project", "library"].includes(mode)) {
    const sessionDir = path.join(SESSIONS_ROOT, mode);
    if (fs.existsSync(sessionDir)) {
      const sessionPdfs = listFiles(sessionDir, (filePath) => path.extname(filePath).toLowerCase() === ".pdf");
      sessionPdfs.forEach((filePath) => {
        const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
        items.push(buildFileInfo(filePath, relativePath, "session"));
      });
    }
  }

  return { ok: true, items };
}

function listSessionFolders() {
  if (!fs.existsSync(SESSIONS_ROOT)) {
    return { ok: true, items: [] };
  }

  const items = listSessionFoldersRecursive(SESSIONS_ROOT, "").sort((a, b) => a.localeCompare(b));
  return { ok: true, items };
}

function listSessionFoldersRecursive(rootDir, relativeBase) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const results = [];

  entries.forEach((entry) => {
    if (!entry.isDirectory()) {
      return;
    }
    const relativePath = relativeBase ? `${relativeBase}/${entry.name}` : entry.name;
    const fullPath = path.join(rootDir, entry.name);
    results.push(relativePath);
    results.push(...listSessionFoldersRecursive(fullPath, relativePath));
  });

  return results;
}

function sanitizeSessionFilter(value) {
  const raw = String(value || "").trim();
  if (!raw) {
    return "all";
  }

  if (["all", "project", "library", "session"].includes(raw)) {
    return raw;
  }

  const normalized = path.posix.normalize(raw.replace(/\\/g, "/")).replace(/^\.{1,2}\//g, "");
  if (!normalized || normalized.includes("..")) {
    return "all";
  }

  return normalized;
}

function listImageFiles(sessionId) {
  if (!sessionId) {
    return { ok: true, items: [] };
  }

  const sessionDir = path.join(SESSIONS_ROOT, sessionId);
  if (!fs.existsSync(sessionDir)) {
    return { ok: true, items: [] };
  }

  const images = listFiles(sessionDir, (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    return ext === ".png" || ext === ".jpg" || ext === ".jpeg" || ext === ".webp";
  });

  const items = images.map((filePath) => {
    const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
    return buildFileInfo(filePath, relativePath, "session");
  });

  return { ok: true, items };
}

function listFiles(dir, filterFn) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  entries.forEach((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.toLowerCase() === "sessions") {
        return;
      }
      results.push(...listFiles(fullPath, filterFn));
    } else if (!filterFn || filterFn(fullPath)) {
      results.push(fullPath);
    }
  });

  return results;
}

function listFilesShallow(dir, filterFn) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];

  entries.forEach((entry) => {
    if (entry.isDirectory()) {
      return;
    }
    const fullPath = path.join(dir, entry.name);
    if (!filterFn || filterFn(fullPath)) {
      results.push(fullPath);
    }
  });

  return results;
}

function buildFileInfo(fullPath, relativePath, source) {
  const info = {
    name: path.basename(fullPath),
    relativePath,
    url: `/files/${relativePath}`,
    source,
  };

  const ext = path.extname(fullPath).toLowerCase();
  if (ext === ".pdf") {
    const thumbPath = getThumbnailPath(fullPath);
    if (thumbPath && fs.existsSync(thumbPath)) {
      const thumbRelative = path.relative(ROOT, thumbPath).replace(/\\/g, "/");
      info.thumbUrl = `/files/${thumbRelative}`;
    }
  }

  return info;
}

function handleFileServe(relativePath, res) {
  const normalized = path.normalize(relativePath).replace(/^([.\\/])+/, "");
  if (!normalized || normalized.includes("..")) {
    return sendJson(res, 400, { ok: false, error: "Invalid path" });
  }

  const absPath = path.resolve(ROOT, normalized);
  const ext = path.extname(absPath).toLowerCase();
  if (!ALLOWED_FILE_EXTS.has(ext)) {
    return sendJson(res, 403, { ok: false, error: "File type not allowed" });
  }

  const inPdfRoot = absPath.startsWith(PDF_ROOT + path.sep);
  const inRoot = absPath.startsWith(ROOT + path.sep);

  if (!inPdfRoot && !inRoot) {
    return sendJson(res, 403, { ok: false, error: "Access denied" });
  }

  if (!fs.existsSync(absPath)) {
    return sendJson(res, 404, { ok: false, error: "File not found" });
  }

  return sendFile(res, absPath, guessMimeType(ext));
}

function guessMimeType(ext) {
  switch (ext) {
    case ".pdf":
      return "application/pdf";
    case ".js":
    case ".mjs":
      return "application/javascript";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

function sendFile(res, filePath, contentType) {
  try {
    const buffer = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType, "Content-Length": buffer.length });
    res.end(buffer);
  } catch (error) {
    sendJson(res, 500, { ok: false, error: "Failed to read file" });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 50 * 1024 * 1024) {
        reject(new Error("Payload too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function handleUpload(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const sessionId = sanitizeSessionId(payload.sessionId || "") || "default";
    const sessionDir = ensureSessionDir(sessionId);

    const files = Array.isArray(payload.files) ? payload.files : [];
    if (!files.length) {
      return sendJson(res, 400, { ok: false, error: "No files provided" });
    }

    const saved = [];

    for (const file of files) {
      const name = String(file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_");
      const ext = path.extname(name).toLowerCase();
      if (!ALLOWED_FILE_EXTS.has(ext)) {
        continue;
      }
      const data = String(file.data || "");
      if (!data) {
        continue;
      }

      const base64 = data.includes("base64,") ? data.split("base64,")[1] : data;
      const buffer = Buffer.from(base64, "base64");
      const outputPath = path.join(sessionDir, name);
      fs.writeFileSync(outputPath, buffer);

      const relativePath = path.relative(ROOT, outputPath).replace(/\\/g, "/");
      saved.push(buildFileInfo(outputPath, relativePath, "session"));
    }

    return sendJson(res, 200, { ok: true, items: saved });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Upload failed" });
  }
}

async function handleMerge(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const sessionId = sanitizeSessionId(payload.sessionId || "") || "default";

    const files = Array.isArray(payload.files) ? payload.files : [];
    if (files.length < 2) {
      return sendJson(res, 400, { ok: false, error: "Select at least two PDFs" });
    }

    const inputPaths = files.map(resolveAllowedPath).filter(Boolean);
    if (inputPaths.length !== files.length) {
      return sendJson(res, 400, { ok: false, error: "Invalid file selection" });
    }

    const outputName = safeOutputName(payload.outputName, "merged");
    const sessionDir = ensureSessionDir(sessionId);
    const outputPath = path.join(sessionDir, outputName);

    const gsPath = path.join(ROOT, "gswin64c.exe");
    if (!fs.existsSync(gsPath)) {
      return sendJson(res, 500, { ok: false, error: "gswin64c.exe not found" });
    }

    const args = ["-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite", `-sOutputFile=${outputPath}`];
    args.push(...inputPaths);

    await runProcess(gsPath, args);

    const relativePath = path.relative(ROOT, outputPath).replace(/\\/g, "/");
    return sendJson(res, 200, {
      ok: true,
      output: buildFileInfo(outputPath, relativePath, "session"),
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Merge failed" });
  }
}

async function handleSplit(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const sessionId = sanitizeSessionId(payload.sessionId || "") || "default";

    const inputPath = resolveAllowedPath(payload.file);
    if (!inputPath) {
      return sendJson(res, 400, { ok: false, error: "Invalid PDF file" });
    }

    const prefixRaw = String(payload.prefix || "page_");
    const prefix = prefixRaw.replace(/[^a-zA-Z0-9._-]/g, "_") || "page_";

    const sessionDir = ensureSessionDir(sessionId);
    const outputPattern = path.join(sessionDir, `${prefix}%03d.pdf`);

    const gsPath = path.join(ROOT, "gswin64c.exe");
    if (!fs.existsSync(gsPath)) {
      return sendJson(res, 500, { ok: false, error: "gswin64c.exe not found" });
    }

    const args = ["-dBATCH", "-dNOPAUSE", "-q", "-sDEVICE=pdfwrite", `-sOutputFile=${outputPattern}`, inputPath];

    await runProcess(gsPath, args);

    return sendJson(res, 200, { ok: true, message: "Split completed" });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Split failed" });
  }
}

async function handleImagesToPdf(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const sessionId = sanitizeSessionId(payload.sessionId || "") || "default";

    const images = Array.isArray(payload.images) ? payload.images : [];
    if (!images.length) {
      return sendJson(res, 400, { ok: false, error: "No images provided" });
    }

    const imagePaths = images.map(resolveAllowedPath).filter(Boolean);
    if (imagePaths.length !== images.length) {
      return sendJson(res, 400, { ok: false, error: "Invalid image selection" });
    }

    const outputName = safeOutputName(payload.outputName, "images");
    const sessionDir = ensureSessionDir(sessionId);
    const outputPath = path.join(sessionDir, outputName);

    const magickPath = path.join(ROOT, "magick.exe");
    if (!fs.existsSync(magickPath)) {
      return sendJson(res, 500, { ok: false, error: "magick.exe not found" });
    }

    const a4Width = 2480;
    const a4Height = 3508;
    const args = [
      "-units",
      "PixelsPerInch",
      "-density",
      "300",
      ...imagePaths,
      "-resize",
      `${a4Width}x${a4Height}^`,
      "-gravity",
      "center",
      "-extent",
      `${a4Width}x${a4Height}`,
      outputPath,
    ];
    await runProcess(magickPath, args);

    const relativePath = path.relative(ROOT, outputPath).replace(/\\/g, "/");
    return sendJson(res, 200, {
      ok: true,
      output: buildFileInfo(outputPath, relativePath, "session"),
    });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Image conversion failed" });
  }
}

async function handlePdfToImages(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const sessionId = sanitizeSessionId(payload.sessionId || "") || "default";

    const inputPath = resolveAllowedPdfPath(payload.file);
    if (!inputPath) {
      return sendJson(res, 400, { ok: false, error: "Invalid PDF file" });
    }

    const prefixRaw = String(payload.prefix || "page_");
    const prefix = prefixRaw.replace(/[^a-zA-Z0-9._-]/g, "_") || "page_";
    const sessionDir = ensureSessionDir(sessionId);
    const outputPattern = path.join(sessionDir, `${prefix}%03d.png`);

    const magickPath = path.join(ROOT, "magick.exe");
    if (!fs.existsSync(magickPath)) {
      return sendJson(res, 500, { ok: false, error: "magick.exe not found" });
    }

    const args = [inputPath, outputPattern];
    await runProcess(magickPath, args);

    const images = listFilesShallow(sessionDir, (filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      const name = path.basename(filePath);
      return ext === ".png" && name.startsWith(prefix);
    });

    const items = images.map((filePath) => {
      const relativePath = path.relative(ROOT, filePath).replace(/\\/g, "/");
      return buildFileInfo(filePath, relativePath, "session");
    });

    return sendJson(res, 200, { ok: true, items });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "PDF to images failed" });
  }
}

async function handleGenerateThumbnail(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const inputPath = resolveAllowedPdfPath(payload.file);
    if (!inputPath) {
      logToFile("thumbnail:invalid-path", { file: payload.file });
      return sendJson(res, 400, { ok: false, error: "Invalid PDF file" });
    }

    const outputPath = getThumbnailPath(inputPath);
    if (!outputPath) {
      logToFile("thumbnail:invalid-output", { file: inputPath });
      return sendJson(res, 400, { ok: false, error: "Unable to create thumbnail path" });
    }

    ensureDir(path.dirname(outputPath));

    const gsPath = path.join(ROOT, "gswin64c.exe");
    if (!fs.existsSync(gsPath)) {
      logToFile("thumbnail:ghostscript-missing", { gsPath, file: inputPath });
      return sendJson(res, 500, { ok: false, error: "gswin64c.exe not found" });
    }

    const args = [
      "-dBATCH",
      "-dNOPAUSE",
      "-q",
      "-sDEVICE=png16m",
      "-dFirstPage=1",
      "-dLastPage=1",
      "-r120",
      `-sOutputFile=${outputPath}`,
      inputPath,
    ];

    try {
      await runProcess(gsPath, args, { timeoutMs: 120000, name: "thumbnail" });
    } catch (error) {
      logToFile("thumbnail:process-error", {
        file: inputPath,
        output: outputPath,
        args,
        error: error?.message || error,
      });
      throw error;
    }

    assertNonEmptyFile(outputPath, "thumbnail");

    const thumbRelative = path.relative(ROOT, outputPath).replace(/\\/g, "/");
    return sendJson(res, 200, {
      ok: true,
      thumbUrl: `/files/${thumbRelative}`,
      thumbRelativePath: thumbRelative,
    });
  } catch (error) {
    logToFile("thumbnail:handler-error", { error: error?.message || error });
    return sendJson(res, 500, { ok: false, error: error.message || "Thumbnail failed" });
  }
}

async function handleRotatePdf(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const inputPath = resolveAllowedPdfPath(payload.file);
    if (!inputPath) {
      logToFile("rotate:invalid-path", { file: payload.file });
      return sendJson(res, 400, { ok: false, error: "Invalid PDF file" });
    }

    const direction = String(payload.direction || "").toLowerCase();
    const angle = direction === "cw" ? 90 : direction === "ccw" ? 270 : null;
    if (!angle) {
      logToFile("rotate:invalid-direction", { file: inputPath, direction });
      return sendJson(res, 400, { ok: false, error: "Invalid rotate direction" });
    }

    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const tempPath = path.join(dir, `${baseName}.rotate_tmp.pdf`);

    const pdfBytes = fs.readFileSync(inputPath);
    const pdfDoc = await PDFDocument.load(pdfBytes);
    const pages = pdfDoc.getPages();

    pages.forEach((page) => {
      const current = page.getRotation().angle || 0;
      page.setRotation(degrees((current + angle) % 360));
    });

    const rotatedBytes = await pdfDoc.save();
    fs.writeFileSync(tempPath, rotatedBytes);

    replaceFileSafely(inputPath, tempPath);

    const thumbPath = getThumbnailPath(inputPath);
    if (thumbPath && fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    try {
      await generateThumbnailForPath(inputPath);
    } catch (error) {
      logToFile("rotate:thumbnail-error", { file: inputPath, error: error?.message || error });
    }

    return sendJson(res, 200, { ok: true, message: "Rotated" });
  } catch (error) {
    logToFile("rotate:handler-error", { error: error?.message || error });
    return sendJson(res, 500, { ok: false, error: error.message || "Rotate failed" });
  }
}

async function handleDeletePdf(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const inputPath = resolveAllowedPdfPath(payload.file);
    if (!inputPath) {
      logToFile("delete:invalid-path", { file: payload.file });
      return sendJson(res, 400, { ok: false, error: "Invalid PDF file" });
    }

    const thumbPath = getThumbnailPath(inputPath);

    fs.unlinkSync(inputPath);
    if (thumbPath && fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    return sendJson(res, 200, { ok: true, message: "Deleted" });
  } catch (error) {
    logToFile("delete:handler-error", { error: error?.message || error });
    return sendJson(res, 500, { ok: false, error: error.message || "Delete failed" });
  }
}

async function handleRenamePdf(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const inputPath = resolveAllowedPdfPath(payload.file);
    if (!inputPath) {
      logToFile("rename:invalid-path", { file: payload.file });
      return sendJson(res, 400, { ok: false, error: "Invalid PDF file" });
    }

    const rawName = String(payload.newName || "").trim();
    if (!rawName) {
      return sendJson(res, 400, { ok: false, error: "New filename required" });
    }

    const baseName = stripExtension(path.basename(rawName));
    if (!baseName) {
      return sendJson(res, 400, { ok: false, error: "New filename required" });
    }

    const safeName = safeOutputName(baseName, path.basename(inputPath));
    const dir = path.dirname(inputPath);
    const outputPath = path.join(dir, safeName);

    if (fs.existsSync(outputPath)) {
      return sendJson(res, 400, { ok: false, error: "File with that name already exists" });
    }

    fs.renameSync(inputPath, outputPath);

    const oldThumb = getThumbnailPath(inputPath);
    const newThumb = getThumbnailPath(outputPath);
    if (oldThumb && newThumb && fs.existsSync(oldThumb)) {
      fs.renameSync(oldThumb, newThumb);
    }

    const relativePath = path.relative(ROOT, outputPath).replace(/\\/g, "/");
    return sendJson(res, 200, { ok: true, output: buildFileInfo(outputPath, relativePath, "session") });
  } catch (error) {
    logToFile("rename:handler-error", { error: error?.message || error });
    return sendJson(res, 500, { ok: false, error: error.message || "Rename failed" });
  }
}

async function handleArrangePages(req, res) {
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body || "{}");
    const inputPath = resolveAllowedPdfPath(payload.file);
    if (!inputPath) {
      return sendJson(res, 400, { ok: false, error: "Invalid PDF file" });
    }

    const order = Array.isArray(payload.order) ? payload.order.map((n) => Number(n)) : [];
    if (!order.length || order.some((n) => !Number.isInteger(n) || n <= 0)) {
      return sendJson(res, 400, { ok: false, error: "Invalid page order" });
    }

    const pdfBytes = fs.readFileSync(inputPath);
    const srcDoc = await PDFDocument.load(pdfBytes);
    const pageCount = srcDoc.getPageCount();

    if (order.length !== pageCount) {
      return sendJson(res, 400, { ok: false, error: "Page order length mismatch" });
    }

    const unique = new Set(order);
    if (unique.size !== pageCount) {
      return sendJson(res, 400, { ok: false, error: "Page order contains duplicates" });
    }

    if (order.some((n) => n > pageCount)) {
      return sendJson(res, 400, { ok: false, error: "Page order contains invalid pages" });
    }

    const newDoc = await PDFDocument.create();
    const pages = await newDoc.copyPages(srcDoc, order.map((n) => n - 1));
    pages.forEach((page) => newDoc.addPage(page));

    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    const tempPath = path.join(dir, `${baseName}.arrange_tmp.pdf`);
    const arrangedBytes = await newDoc.save();
    fs.writeFileSync(tempPath, arrangedBytes);

    replaceFileSafely(inputPath, tempPath);

    const thumbPath = getThumbnailPath(inputPath);
    if (thumbPath && fs.existsSync(thumbPath)) {
      fs.unlinkSync(thumbPath);
    }

    try {
      await generateThumbnailForPath(inputPath);
    } catch (error) {
      logToFile("arrange:thumbnail-error", { file: inputPath, error: error?.message || error });
    }

    return sendJson(res, 200, { ok: true, message: "Arranged" });
  } catch (error) {
    logToFile("arrange:handler-error", { error: error?.message || error });
    return sendJson(res, 500, { ok: false, error: error.message || "Arrange failed" });
  }
}

function stripExtension(filename) {
  const value = String(filename || "").trim();
  if (!value) {
    return "";
  }

  const base = path.basename(value);
  const dotIndex = base.lastIndexOf(".");
  if (dotIndex <= 0) {
    return base;
  }

  return base.slice(0, dotIndex);
}

function logToFile(event, details = {}) {
  try {
    const now = new Date();
    const datePart = now.toISOString().slice(0, 10);
    const timePart = now.toISOString();
    const logPath = path.join(LOG_DIR, `${datePart}.log`);
    const line = `${timePart} ${event} ${JSON.stringify(details)}\n`;
    fs.appendFileSync(logPath, line, "utf8");
  } catch (error) {
    console.error("Failed to write log", error);
  }
}

function resolveAllowedPath(relativePath) {
  if (!relativePath || typeof relativePath !== "string") {
    return null;
  }

  const normalized = path.normalize(relativePath).replace(/^([.\\/])+/, "");
  if (!normalized || normalized.includes("..")) {
    return null;
  }

  const absPath = path.resolve(ROOT, normalized);
  const ext = path.extname(absPath).toLowerCase();
  if (!ALLOWED_FILE_EXTS.has(ext)) {
    return null;
  }

  const inPdfRoot = absPath.startsWith(PDF_ROOT + path.sep);
  const inRoot = path.dirname(absPath) === ROOT;

  if (!inPdfRoot && !inRoot) {
    return null;
  }

  if (!fs.existsSync(absPath)) {
    return null;
  }

  return absPath;
}

function resolveAllowedPdfPath(relativePath) {
  const absPath = resolveAllowedPath(relativePath);
  if (!absPath) {
    return null;
  }

  if (path.extname(absPath).toLowerCase() !== ".pdf") {
    return null;
  }

  return absPath;
}

function getThumbnailPath(pdfPath) {
  if (!pdfPath || path.extname(pdfPath).toLowerCase() !== ".pdf") {
    return null;
  }

  const dir = path.dirname(pdfPath);
  const baseName = path.basename(pdfPath, path.extname(pdfPath));
  return path.join(dir, `${baseName}.thumb.png`);
}

function replaceFileSafely(targetPath, tempPath) {
  const backupPath = `${targetPath}.bak_${Date.now()}`;

  fs.renameSync(targetPath, backupPath);
  try {
    fs.renameSync(tempPath, targetPath);
    fs.unlinkSync(backupPath);
  } catch (error) {
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
    } catch (cleanupError) {
      logToFile("rotate:cleanup-error", { error: cleanupError?.message || cleanupError });
    }

    try {
      fs.renameSync(backupPath, targetPath);
    } catch (restoreError) {
      logToFile("rotate:restore-error", { error: restoreError?.message || restoreError });
    }

    throw error;
  }
}

async function generateThumbnailForPath(inputPath) {
  const outputPath = getThumbnailPath(inputPath);
  if (!outputPath) {
    throw new Error("Unable to create thumbnail path");
  }

  ensureDir(path.dirname(outputPath));

  const gsPath = path.join(ROOT, "gswin64c.exe");
  if (!fs.existsSync(gsPath)) {
    throw new Error("gswin64c.exe not found");
  }

  const args = [
    "-dBATCH",
    "-dNOPAUSE",
    "-q",
    "-sDEVICE=png16m",
    "-dFirstPage=1",
    "-dLastPage=1",
    "-r120",
    `-sOutputFile=${outputPath}`,
    inputPath,
  ];

  await runProcess(gsPath, args, { timeoutMs: 120000, name: "thumbnail" });
  assertNonEmptyFile(outputPath, "thumbnail");
  return outputPath;
}

function assertNonEmptyFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} output file was not created`);
  }

  const stats = fs.statSync(filePath);
  if (!stats.size) {
    throw new Error(`${label} output file is empty`);
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 300000;
    const name = options.name || path.basename(command);
    const child = spawn(command, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });

    let stderr = "";
    let stdout = "";

    const timer = timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`${name} timed out after ${timeoutMs}ms`));
        }, timeoutMs)
      : null;

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.on("close", (code) => {
      if (timer) {
        clearTimeout(timer);
      }
      if (code === 0) {
        resolve();
      } else {
        const details = stderr || stdout || `Process failed with code ${code}`;
        reject(new Error(details));
      }
    });
  });
}
