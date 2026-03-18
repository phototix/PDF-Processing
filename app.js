/* global Swal, pdfjsLib */

const state = {
  sessionId: "",
  pdfs: [],
  selected: new Set(),
  previewItem: null,
};

const elements = {
  sessionId: document.getElementById("sessionId"),
  sessionFilter: document.getElementById("sessionFilter"),
  uploadInput: document.getElementById("uploadInput"),
  uploadBtn: document.getElementById("uploadBtn"),
  refreshBtn: document.getElementById("refreshBtn"),
  generateThumbsBtn: document.getElementById("generateThumbsBtn"),
  mergeBtn: document.getElementById("mergeBtn"),
  splitBtn: document.getElementById("splitBtn"),
  pdfToImagesBtn: document.getElementById("pdfToImagesBtn"),
  imagesBtn: document.getElementById("imagesBtn"),
  grid: document.getElementById("pdfGrid"),
  selectedList: document.getElementById("selectedList"),
  previewTitle: document.getElementById("previewTitle"),
  previewFrame: document.getElementById("previewFrame"),
  previewArrange: document.getElementById("previewArrange"),
  previewRotateLeft: document.getElementById("previewRotateLeft"),
  previewRotateRight: document.getElementById("previewRotateRight"),
  arrangeGrid: document.getElementById("arrangeGrid"),
  arrangeConfirm: document.getElementById("arrangeConfirm"),
  imagesInput: document.getElementById("imagesInput"),
};

startApp();

async function startApp() {
  const pdfJsSources = await ensurePdfJs();

  if (!window.pdfjsLib) {
    console.error("pdfjsLib failed to load.", pdfJsSources);
    showToast("PDF preview is unavailable (pdf.js failed to load).", "error");
    return;
  }

  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfJsSources.workerSrc;
  init();
}

async function ensurePdfJs() {
  if (window.pdfjsLib) {
    return {
      libSrc: "existing",
      workerSrc: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js",
    };
  }

  const sources = [
    {
      libSrc: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.js",
      workerSrc: "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js",
    },
    {
      libSrc: "/files/assets/pdfjs/pdf.min.js",
      workerSrc: "/files/assets/pdfjs/pdf.worker.min.js",
    },
    {
      libSrc: "/files/assets/pdfjs/pdf.js",
      workerSrc: "/files/assets/pdfjs/pdf.worker.js",
    },
  ];

  for (const source of sources) {
    await loadScript(source.libSrc);
    if (window.pdfjsLib) {
      return source;
    }
  }

  const moduleSources = [
    {
      libSrc: "/files/assets/pdfjs/pdf.mjs",
      workerSrc: "/files/assets/pdfjs/pdf.worker.mjs",
    },
    {
      libSrc: "/files/assets/pdfjs/pdf.min.mjs",
      workerSrc: "/files/assets/pdfjs/pdf.worker.min.mjs",
    },
  ];

  for (const source of moduleSources) {
    const mod = await loadModule(source.libSrc);
    if (mod) {
      window.pdfjsLib = mod.default || mod;
      return source;
    }
  }

  return { libSrc: null, workerSrc: "" };
}

function loadScript(src) {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.head.appendChild(script);
  });
}

async function loadModule(src) {
  try {
    return await import(src);
  } catch (error) {
    console.warn("Failed to import module", src);
    return null;
  }
}

function init() {
  state.sessionId = getSessionId();
  elements.sessionId.textContent = state.sessionId;

  elements.uploadBtn.addEventListener("click", () => elements.uploadInput.click());
  elements.uploadInput.addEventListener("change", handleUpload);

  elements.refreshBtn.addEventListener("click", refreshPdfs);
  elements.generateThumbsBtn.addEventListener("click", generateThumbnails);
  elements.mergeBtn.addEventListener("click", mergeSelected);
  elements.splitBtn.addEventListener("click", splitSelected);
  elements.pdfToImagesBtn.addEventListener("click", renderPdfToImages);
  elements.imagesBtn.addEventListener("click", () => elements.imagesInput.click());
  elements.imagesInput.addEventListener("change", handleImagesToPdf);
  elements.sessionFilter.addEventListener("change", refreshPdfs);
  elements.previewArrange.addEventListener("click", openArrangeModal);
  elements.previewRotateLeft.addEventListener("click", () => rotatePreview("ccw"));
  elements.previewRotateRight.addEventListener("click", () => rotatePreview("cw"));
  elements.arrangeConfirm.addEventListener("click", submitArrange);

  refreshSessions();
}

function getSessionId() {
  const existing = localStorage.getItem("pdfSessionId");
  if (existing) {
    return existing;
  }

  const newId = (crypto.randomUUID && crypto.randomUUID()) || `session_${Date.now()}`;
  localStorage.setItem("pdfSessionId", newId);
  return newId;
}

async function apiFetch(path, options) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });

  const payload = await response.json();
  if (!payload.ok) {
    throw new Error(payload.error || "Request failed");
  }

  return payload;
}

async function refreshPdfs() {
  try {
    const sessionParam = elements.sessionFilter?.value || "all";
    const payload = await apiFetch(`/api/pdfs?sessionId=${state.sessionId}&filter=${encodeURIComponent(sessionParam)}`);
    state.pdfs = payload.items || [];
    state.selected.clear();
    renderGrid();
    renderSelected();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function refreshSessions() {
  try {
    const payload = await apiFetch("/api/sessions");
    let sessions = payload.items || [];
    const current = elements.sessionFilter.value || "all";

    if (!sessions.length) {
      sessions = await deriveSessionsFromPdfs();
    }

    elements.sessionFilter.innerHTML = "<option value=\"all\">All</option>";
    sessions.forEach((sessionId) => {
      const option = document.createElement("option");
      option.value = sessionId;
      option.textContent = `PDF/sessions/${sessionId}`;
      elements.sessionFilter.appendChild(option);
    });

    if (current && (current === "all" || sessions.includes(current))) {
      elements.sessionFilter.value = current;
    }

    await refreshPdfs();
  } catch (error) {
    console.error("Failed to load sessions", error);
    try {
      const fallbackSessions = await deriveSessionsFromPdfs();
      if (fallbackSessions.length) {
        elements.sessionFilter.innerHTML = "<option value=\"all\">All</option>";
        fallbackSessions.forEach((sessionId) => {
          const option = document.createElement("option");
          option.value = sessionId;
          option.textContent = `PDF/sessions/${sessionId}`;
          elements.sessionFilter.appendChild(option);
        });
      }
    } catch (fallbackError) {
      console.error("Failed to derive sessions", fallbackError);
    }
    showToast("Unable to load session list. Showing all files.", "warning");
    await refreshPdfs();
  }
}

async function deriveSessionsFromPdfs() {
  const payload = await apiFetch(`/api/pdfs?sessionId=${state.sessionId}&filter=all`);
  const items = payload.items || [];
  const sessions = new Set();

  items.forEach((item) => {
    const marker = "PDF/sessions/";
    const normalized = String(item.relativePath || "").replace(/\\/g, "/");
    const idx = normalized.indexOf(marker);
    if (idx >= 0) {
      const after = normalized.slice(idx + marker.length);
      const parts = after.split("/");
      if (parts.length > 1) {
        sessions.add(parts.slice(0, -1).join("/"));
      }
    }
  });

  return Array.from(sessions).sort((a, b) => a.localeCompare(b));
}

function renderGrid() {
  elements.grid.innerHTML = "";

  if (!state.pdfs.length) {
    elements.grid.innerHTML = `<div class="col-12 text-muted">No PDFs yet. Upload or refresh to see files.</div>`;
    return;
  }

  state.pdfs.forEach((item) => {
    const col = document.createElement("div");
    col.className = "col-sm-6 col-md-4 col-xl-3";

    const card = document.createElement("div");
    card.className = "card pdf-card h-100 selectable";
    if (state.selected.has(item.relativePath)) {
      card.classList.add("selected");
    }

    let thumbElement = null;
    if (item.thumbUrl) {
      const img = document.createElement("img");
      img.className = "pdf-thumb";
      img.alt = `${item.name} thumbnail`;
      img.src = item.thumbUrl;
      thumbElement = img;
    } else {
      const canvas = document.createElement("canvas");
      canvas.className = "pdf-thumb";
      thumbElement = canvas;
    }

    const cardBody = document.createElement("div");
    cardBody.className = "card-body d-flex flex-column";

    const title = document.createElement("h6");
    title.className = "card-title text-truncate";
    title.textContent = item.name;


    const actions = document.createElement("div");
    actions.className = "mt-auto d-flex justify-content-between align-items-center gap-2";

    const leftActions = document.createElement("div");
    leftActions.className = "d-flex gap-2 flex-wrap";

    const previewBtn = document.createElement("button");
    previewBtn.className = "btn btn-sm btn-outline-primary";
    previewBtn.innerHTML = "<img src=\"/files/assets/icons/preview.png\" alt=\"Preview\" width=\"16\" height=\"16\" />";
    previewBtn.addEventListener("click", () => openPreview(item));

    const rotateLeftBtn = document.createElement("button");
    rotateLeftBtn.className = "btn btn-sm btn-outline-secondary";
    rotateLeftBtn.title = "Rotate counter-clockwise";
    rotateLeftBtn.innerHTML = "<img src=\"/files/assets/icons/rotate-counter-clockwise.png\" alt=\"Rotate counter-clockwise\" width=\"16\" height=\"16\" />";
    rotateLeftBtn.addEventListener("click", () => rotatePdf(item, "ccw"));

    const rotateRightBtn = document.createElement("button");
    rotateRightBtn.className = "btn btn-sm btn-outline-secondary";
    rotateRightBtn.title = "Rotate clockwise";
    rotateRightBtn.innerHTML = "<img src=\"/files/assets/icons/rotate-clockwise.png\" alt=\"Rotate clockwise\" width=\"16\" height=\"16\" />";
    rotateRightBtn.addEventListener("click", () => rotatePdf(item, "cw"));

    const renameBtn = document.createElement("button");
    renameBtn.className = "btn btn-sm btn-outline-secondary";
    renameBtn.title = "Rename PDF";
    renameBtn.innerHTML = "<img src=\"/files/assets/icons/rename.png\" alt=\"Rename PDF\" width=\"16\" height=\"16\" />";
    renameBtn.addEventListener("click", () => renamePdf(item));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-sm btn-outline-danger";
    deleteBtn.title = "Delete PDF";
    deleteBtn.innerHTML = "<img src=\"/files/assets/icons/delete-file.png\" alt=\"Delete PDF\" width=\"16\" height=\"16\" />";
    deleteBtn.addEventListener("click", () => deletePdf(item));

    leftActions.appendChild(previewBtn);
    leftActions.appendChild(rotateLeftBtn);
    leftActions.appendChild(rotateRightBtn);
    leftActions.appendChild(renameBtn);
    leftActions.appendChild(deleteBtn);

    const selectionIndicator = document.createElement("span");
    selectionIndicator.className = "selection-indicator";
    selectionIndicator.textContent = state.selected.has(item.relativePath) ? "✓" : "";

    actions.appendChild(leftActions);
    actions.appendChild(selectionIndicator);

    cardBody.appendChild(title);
    cardBody.appendChild(actions);

    card.appendChild(thumbElement);
    card.appendChild(cardBody);
    col.appendChild(card);
    elements.grid.appendChild(col);

    card.addEventListener("click", (event) => {
      if (event.target.closest("button")) {
        return;
      }
      toggleSelection(item.relativePath);
      card.classList.toggle("selected", state.selected.has(item.relativePath));
      selectionIndicator.textContent = state.selected.has(item.relativePath) ? "✓" : "";
    });

    if (!item.thumbUrl) {
      renderThumbnail(item.url, thumbElement);
    }
  });
}

function renderSelected() {
  elements.selectedList.innerHTML = "";
  const selectedItems = state.pdfs.filter((item) => state.selected.has(item.relativePath));

  if (!selectedItems.length) {
    elements.selectedList.innerHTML = "<span class=\"text-muted\">No PDFs selected.</span>";
    return;
  }

  selectedItems.forEach((item) => {
    const badge = document.createElement("span");
    badge.className = "badge rounded-pill text-bg-primary me-2 mb-2";
    badge.textContent = item.name;
    elements.selectedList.appendChild(badge);
  });
}

function toggleSelection(relativePath) {
  if (state.selected.has(relativePath)) {
    state.selected.delete(relativePath);
  } else {
    state.selected.add(relativePath);
  }
  renderSelected();
}

async function renderThumbnail(url, canvas) {
  try {
    if (!window.pdfjsLib) {
      canvas.classList.add("thumb-error");
      return;
    }
    const pdf = await pdfjsLib.getDocument(url).promise;
    const page = await pdf.getPage(1);
    const viewport = page.getViewport({ scale: 0.5 });
    const context = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport }).promise;
  } catch (error) {
    canvas.classList.add("thumb-error");
  }
}

function openPreview(item) {
  state.previewItem = item;
  elements.previewTitle.textContent = item.name;
  elements.previewFrame.src = withCacheBust(item.url);
  if (window.bootstrap && window.bootstrap.Modal) {
    const modal = new window.bootstrap.Modal(document.getElementById("previewModal"));
    modal.show();
  } else {
    console.warn("Bootstrap Modal unavailable. Opening PDF in new tab.");
    window.open(item.url, "_blank");
  }
}

async function openArrangeModal() {
  if (!state.previewItem) {
    showToast("Open a PDF preview first.", "warning");
    return;
  }

  if (!window.pdfjsLib) {
    showToast("pdf.js is not available for arranging pages.", "error");
    return;
  }

  try {
    elements.arrangeGrid.innerHTML = "";
    const pdf = await pdfjsLib.getDocument(state.previewItem.url).promise;
    const pageCount = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 0.3 });

      const card = document.createElement("div");
      card.className = "arrange-card";
      card.draggable = true;
      card.dataset.pageNumber = String(pageNumber);

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "arrange-thumb";
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      thumbWrap.appendChild(canvas);

      const label = document.createElement("div");
      label.className = "arrange-label";
      label.textContent = `Page ${pageNumber}`;

      card.appendChild(thumbWrap);
      card.appendChild(label);
      elements.arrangeGrid.appendChild(card);

      const context = canvas.getContext("2d");
      await page.render({ canvasContext: context, viewport }).promise;

      card.addEventListener("dragstart", handleArrangeDragStart);
      card.addEventListener("dragend", handleArrangeDragEnd);
    }

    elements.arrangeGrid.addEventListener("dragover", handleArrangeDragOver);
    elements.arrangeGrid.addEventListener("drop", handleArrangeDrop);

    const modalElement = document.getElementById("arrangeModal");
    const previewModalElement = document.getElementById("previewModal");
    const modal = new window.bootstrap.Modal(modalElement);
    modal.show();

    previewModalElement.classList.add("preview-modal-dim");
    modalElement.addEventListener(
      "hidden.bs.modal",
      () => {
        previewModalElement.classList.remove("preview-modal-dim");
      },
      { once: true }
    );
  } catch (error) {
    console.error("Failed to load pages for arrange", error);
    showToast("Failed to load pages for arranging.", "error");
  }
}

function handleArrangeDragStart(event) {
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData("text/plain", event.currentTarget.dataset.pageNumber);
  event.currentTarget.classList.add("dragging");
}

function handleArrangeDragEnd(event) {
  event.currentTarget.classList.remove("dragging");
}

function handleArrangeDragOver(event) {
  event.preventDefault();
  const dragging = elements.arrangeGrid.querySelector(".dragging");
  const target = event.target.closest(".arrange-card");
  if (!dragging || !target || dragging === target) {
    return;
  }

  const cards = Array.from(elements.arrangeGrid.querySelectorAll(".arrange-card"));
  const draggingIndex = cards.indexOf(dragging);
  const targetIndex = cards.indexOf(target);
  if (draggingIndex < targetIndex) {
    elements.arrangeGrid.insertBefore(dragging, target.nextSibling);
  } else {
    elements.arrangeGrid.insertBefore(dragging, target);
  }
}

function handleArrangeDrop(event) {
  event.preventDefault();
}

async function submitArrange() {
  if (!state.previewItem) {
    return;
  }

  const order = Array.from(elements.arrangeGrid.querySelectorAll(".arrange-card")).map((card) =>
    Number(card.dataset.pageNumber)
  );

  try {
    await apiFetch("/api/arrange", {
      method: "POST",
      body: JSON.stringify({ file: state.previewItem.relativePath, order }),
    });

    showToast("Pages rearranged.", "success");
    await refreshPdfs();
    refreshPreview(state.previewItem);

    const modalElement = document.getElementById("arrangeModal");
    const modalInstance = window.bootstrap?.Modal?.getInstance(modalElement);
    if (modalInstance) {
      modalInstance.hide();
    }
  } catch (error) {
    console.error("Arrange pages failed", error);
    showToast(error.message || "Failed to arrange pages.", "error");
  }
}

async function handleUpload(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  try {
    showToast("Uploading PDFs...", "info");
    const payload = await uploadFiles(files);
    showToast(`Uploaded ${payload.items.length} file(s).`, "success");
    await refreshPdfs();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    event.target.value = "";
  }
}

async function handleImagesToPdf(event) {
  const files = Array.from(event.target.files || []);
  if (!files.length) {
    return;
  }

  try {
    showToast("Uploading images...", "info");
    const uploadPayload = await uploadFiles(files);
    const images = uploadPayload.items.map((item) => item.relativePath);

    const { value: outputName } = await Swal.fire({
      title: "Create PDF from images",
      input: "text",
      inputLabel: "Output PDF name",
      inputValue: "images.pdf",
      showCancelButton: true,
    });

    if (!outputName) {
      showToast("Image conversion cancelled.", "info");
      return;
    }

    await apiFetch("/api/images-to-pdf", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId, images, outputName }),
    });

    showToast("Images converted to PDF.", "success");
    await refreshPdfs();
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    event.target.value = "";
  }
}

async function uploadFiles(files) {
  const fileData = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      data: await readAsDataUrl(file),
    }))
  );

  return apiFetch("/api/upload", {
    method: "POST",
    body: JSON.stringify({ sessionId: state.sessionId, files: fileData }),
  });
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

async function mergeSelected() {
  const selected = Array.from(state.selected);
  if (selected.length < 2) {
    showToast("Select at least two PDFs to merge.", "warning");
    return;
  }

  const { value: outputName } = await Swal.fire({
    title: "Merge PDFs",
    input: "text",
    inputLabel: "Output PDF name",
    inputValue: "merged.pdf",
    showCancelButton: true,
  });

  if (!outputName) {
    return;
  }

  try {
    await apiFetch("/api/merge", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId, files: selected, outputName }),
    });
    showToast("Merge completed.", "success");
    await refreshPdfs();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function splitSelected() {
  const selected = Array.from(state.selected);
  if (selected.length !== 1) {
    showToast("Select exactly one PDF to split.", "warning");
    return;
  }

  const { value: prefix } = await Swal.fire({
    title: "Split PDF",
    input: "text",
    inputLabel: "Output prefix",
    inputValue: "page_",
    showCancelButton: true,
  });

  if (!prefix) {
    return;
  }

  try {
    await apiFetch("/api/split", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.sessionId, file: selected[0], prefix }),
    });
    showToast("Split completed.", "success");
    await refreshPdfs();
  } catch (error) {
    showToast(error.message, "error");
  }
}

async function renderPdfToImages() {
  const selected = Array.from(state.selected);
  if (selected.length !== 1) {
    showToast("Select exactly one PDF to render images.", "warning");
    return;
  }

  const { value: prefix } = await Swal.fire({
    title: "Render PDF to Images",
    input: "text",
    inputLabel: "Output prefix",
    inputValue: "page_",
    showCancelButton: true,
  });

  if (!prefix) {
    return;
  }

  try {
    await apiFetch("/api/pdf-to-images", {
      method: "POST",
      body: JSON.stringify({
        sessionId: state.sessionId,
        file: selected[0],
        prefix,
      }),
    });
    showToast("PDF rendered to images.", "success");
    await refreshPdfs();
  } catch (error) {
    console.error("PDF to images failed", { file: selected[0], error: error?.message || error });
    showToast(error.message || "Failed to render PDF to images.", "error");
  }
}

function showToast(message, icon) {
  Swal.fire({
    toast: true,
    position: "top-end",
    icon,
    title: message,
    showConfirmButton: false,
    timer: 2500,
    timerProgressBar: true,
  });
}

async function rotatePdf(item, direction) {
  try {
    await apiFetch("/api/rotate", {
      method: "POST",
      body: JSON.stringify({ file: item.relativePath, direction }),
    });
    showToast("PDF rotated.", "success");
    await refreshPdfs();
    if (state.previewItem && state.previewItem.relativePath === item.relativePath) {
      refreshPreview(state.previewItem);
    }
  } catch (error) {
    console.error("PDF rotation failed", {
      file: item.relativePath,
      direction,
      error: error?.message || error,
    });
    showToast(error.message || "Failed to rotate PDF.", "error");
  }
}

async function deletePdf(item) {
  const result = await Swal.fire({
    title: "Delete PDF?",
    text: `This will permanently delete ${item.name}.`,
    icon: "warning",
    showCancelButton: true,
    confirmButtonText: "Delete",
    confirmButtonColor: "#dc2626",
  });

  if (!result.isConfirmed) {
    return;
  }

  try {
    await apiFetch("/api/delete", {
      method: "POST",
      body: JSON.stringify({ file: item.relativePath }),
    });

    if (state.previewItem && state.previewItem.relativePath === item.relativePath) {
      state.previewItem = null;
      const modalElement = document.getElementById("previewModal");
      const modalInstance = window.bootstrap?.Modal?.getInstance(modalElement);
      if (modalInstance) {
        modalInstance.hide();
      }
    }

    showToast("PDF deleted.", "success");
    await refreshPdfs();
  } catch (error) {
    console.error("PDF delete failed", { file: item.relativePath, error: error?.message || error });
    showToast(error.message || "Failed to delete PDF.", "error");
  }
}

async function renamePdf(item) {
  const { value: newName } = await Swal.fire({
    title: "Rename PDF",
    input: "text",
    inputLabel: "New filename",
    inputValue: stripExtension(item.name),
    showCancelButton: true,
    inputValidator: (value) => {
      if (!value || !value.trim()) {
        return "Please enter a filename.";
      }
      return null;
    },
  });

  if (!newName) {
    return;
  }

  try {
    const payload = await apiFetch("/api/rename", {
      method: "POST",
      body: JSON.stringify({ file: item.relativePath, newName: stripExtension(newName) }),
    });

    if (state.previewItem && state.previewItem.relativePath === item.relativePath) {
      state.previewItem = payload.output || null;
      if (state.previewItem) {
        refreshPreview(state.previewItem);
      }
    }

    showToast("PDF renamed.", "success");
    await refreshPdfs();
  } catch (error) {
    console.error("PDF rename failed", { file: item.relativePath, error: error?.message || error });
    showToast(error.message || "Failed to rename PDF.", "error");
  }
}

function stripExtension(filename) {
  const value = String(filename || "").trim();
  if (!value) {
    return "";
  }

  const parts = value.split("/").pop().split("\\").pop();
  const dotIndex = parts.lastIndexOf(".");
  if (dotIndex <= 0) {
    return parts;
  }

  return parts.slice(0, dotIndex);
}

function rotatePreview(direction) {
  if (!state.previewItem) {
    return;
  }
  rotatePdf(state.previewItem, direction);
}

function refreshPreview(item) {
  if (!item) {
    return;
  }
  elements.previewTitle.textContent = item.name;
  elements.previewFrame.src = withCacheBust(item.url);
}

function withCacheBust(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}t=${Date.now()}`;
}

async function generateThumbnails() {
  try {
    await refreshPdfs();
    const pdfs = state.pdfs;

    if (!pdfs.length) {
      showToast("No PDFs available to generate thumbnails.", "info");
      return;
    }

    Swal.fire({
      title: "Generating thumbnails",
      html: `
        <div class="text-muted mb-2">Please wait while thumbnails are created.</div>
        <div class="progress" style="height: 14px;">
          <div class="progress-bar" role="progressbar" style="width: 0%"></div>
        </div>
        <div class="small text-muted mt-2" id="thumbProgressText">0 / ${pdfs.length}</div>
      `,
      allowOutsideClick: false,
      allowEscapeKey: false,
      allowEnterKey: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      },
    });

    const progressBar = Swal.getHtmlContainer()?.querySelector(".progress-bar");
    const progressText = Swal.getHtmlContainer()?.querySelector("#thumbProgressText");

    let completed = 0;
    let failures = 0;

    for (const item of pdfs) {
      try {
        await apiFetch("/api/thumbnail", {
          method: "POST",
          body: JSON.stringify({ file: item.relativePath }),
        });
      } catch (error) {
        console.error("Thumbnail generation failed", {
          file: item.relativePath,
          name: item.name,
          error: error?.message || error,
        });
        failures += 1;
      } finally {
        completed += 1;
        const percent = Math.round((completed / pdfs.length) * 100);
        if (progressBar) {
          progressBar.style.width = `${percent}%`;
        }
        if (progressText) {
          progressText.textContent = `${completed} / ${pdfs.length}`;
        }
      }
    }

    Swal.close();
    await refreshPdfs();

    if (failures) {
      showToast(`Generated thumbnails with ${failures} error(s).`, "warning");
    } else {
      showToast("Thumbnails generated.", "success");
    }
  } catch (error) {
    console.error("Thumbnail generation flow failed", error);
    Swal.close();
    showToast(error.message || "Failed to generate thumbnails.", "error");
  }
}
