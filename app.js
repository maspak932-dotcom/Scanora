/**
 * =========================================================
 * SCANORA
 * Browser-Based Document Scanner + URL/QR Toolkit
 * =========================================================
 *
 * No backend
 * No database
 * No authentication
 * No server-side document storage
 *
 * Required libraries in index.html:
 *  - jsPDF
 *  - QRCode.js
 * =========================================================
 */

"use strict";

/* =========================================================
   CONFIGURATION
   ========================================================= */

const CONFIG = Object.freeze({
  MAX_PAGES: 100,
  MAX_FILE_SIZE_MB: 25,
  MAX_IMAGE_PIXELS: 16000000,

  PDF_MARGIN_MM: 8,
  DEFAULT_PDF_QUALITY: 0.9,

  QR_SIZE: 280,

  TOAST_DURATION: 2600,

  IMAGE_TYPES: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp"
  ]
});


/* =========================================================
   APPLICATION STATE
   ========================================================= */

const state = {
  currentTool: "home",

  pages: [],

  selectedPageIndex: -1,

  currentUrl: "",

  qrGenerated: false,

  isExporting: false
};


/* =========================================================
   DOM ELEMENTS
   ========================================================= */

const DOM = {
  homeSection: document.getElementById("homeSection"),
  documentsSection: document.getElementById("documentsSection"),
  qrSection: document.getElementById("qrSection"),

  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  thumbGrid: document.getElementById("thumbGrid"),
  pageCountBadge: document.getElementById("pageCountBadge"),

  emptyPreview: document.getElementById("emptyPreview"),
  previewArea: document.getElementById("previewArea"),
  mainPreview: document.getElementById("mainPreview"),
  previewLabel: document.getElementById("previewLabel"),

  downloadPdfBtn: document.getElementById("downloadPdfBtn"),
  clearAllBtn: document.getElementById("clearAllBtn"),

  rotateLeftBtn: document.getElementById("rotateLeftBtn"),
  rotateRightBtn: document.getElementById("rotateRightBtn"),

  moveLeftBtn: document.getElementById("moveLeftBtn"),
  moveRightBtn: document.getElementById("moveRightBtn"),

  pageSize: document.getElementById("pageSize"),
  pdfQuality: document.getElementById("pdfQuality"),

  urlInput: document.getElementById("urlInput"),
  generateQrBtn: document.getElementById("generateQrBtn"),
  urlStatus: document.getElementById("urlStatus"),

  urlActions: document.getElementById("urlActions"),
  openUrlBtn: document.getElementById("openUrlBtn"),
  copyUrlBtn: document.getElementById("copyUrlBtn"),

  qrEmpty: document.getElementById("qrEmpty"),
  qrCanvas: document.getElementById("qrCanvas"),
  downloadQrBtn: document.getElementById("downloadQrBtn"),

  toast: document.getElementById("toast")
};


/* =========================================================
   BASIC HELPERS
   ========================================================= */

function createId() {
  if (window.crypto && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  return (
    "scanora-" +
    Date.now() +
    "-" +
    Math.random().toString(36).slice(2)
  );
}


function clamp(value, min, max) {
  return Math.min(
    Math.max(value, min),
    max
  );
}


function formatNumber(value) {
  return new Intl.NumberFormat("en-IN").format(value);
}


function getMaxFileSize() {
  return CONFIG.MAX_FILE_SIZE_MB * 1024 * 1024;
}


/* =========================================================
   TOAST SYSTEM
   ========================================================= */

let toastTimer = null;


function showToast(message, type = "default") {
  if (!DOM.toast) {
    return;
  }

  const styles = {
    default: "bg-slate-900 text-white",
    success: "bg-emerald-600 text-white",
    error: "bg-red-600 text-white",
    info: "bg-blue-600 text-white"
  };

  DOM.toast.className =
    "pointer-events-none fixed bottom-5 left-1/2 z-[100] " +
    "-translate-x-1/2 rounded-2xl px-5 py-3 text-sm " +
    "font-bold shadow-2xl " +
    (styles[type] || styles.default);

  DOM.toast.textContent = message;

  DOM.toast.classList.remove("hidden");

  clearTimeout(toastTimer);

  toastTimer = setTimeout(() => {
    DOM.toast.classList.add("hidden");
  }, CONFIG.TOAST_DURATION);
}


/* =========================================================
   URL STATUS
   ========================================================= */

function setUrlStatus(message, type = "neutral") {
  if (!DOM.urlStatus) {
    return;
  }

  const colors = {
    neutral: "text-slate-500",
    success: "text-emerald-600",
    error: "text-red-600",
    info: "text-blue-600"
  };

  DOM.urlStatus.className =
    "mt-3 text-xs font-semibold " +
    (colors[type] || colors.neutral);

  DOM.urlStatus.textContent = message;
}


/* =========================================================
   NAVIGATION
   ========================================================= */

function showTool(tool) {
  const sections = {
    home: DOM.homeSection,
    documents: DOM.documentsSection,
    qr: DOM.qrSection
  };

  if (!sections[tool]) {
    return;
  }

  Object.entries(sections).forEach(
    ([name, section]) => {
      if (!section) {
        return;
      }

      section.classList.toggle(
        "hidden",
        name !== tool
      );
    }
  );

  state.currentTool = tool;

  document
    .querySelectorAll(".nav-btn")
    .forEach(button => {
      const active =
        button.dataset.nav === tool;

      button.classList.toggle(
        "bg-white/10",
        active
      );

      button.classList.toggle(
        "text-white",
        active
      );

      button.classList.toggle(
        "text-slate-200",
        !active
      );
    });

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}


/* =========================================================
   FILE VALIDATION
   ========================================================= */

function isSupportedImage(file) {
  if (!file) {
    return false;
  }

  if (CONFIG.IMAGE_TYPES.includes(file.type)) {
    return true;
  }

  const extension =
    String(file.name || "")
      .split(".")
      .pop()
      .toLowerCase();

  return [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "bmp"
  ].includes(extension);
}


function validateFile(file) {
  if (!isSupportedImage(file)) {
    return {
      valid: false,
      message:
        `${file.name}: unsupported image format.`
    };
  }

  if (file.size > getMaxFileSize()) {
    return {
      valid: false,
      message:
        `${file.name}: file is larger than ` +
        `${CONFIG.MAX_FILE_SIZE_MB} MB.`
    };
  }

  return {
    valid: true,
    message: ""
  };
}


/* =========================================================
   PAGE CREATION
   ========================================================= */

function createPage(file) {
  return {
    id: createId(),

    file,

    name:
      file.name ||
      "Scanned document",

    size: file.size,

    type: file.type,

    objectUrl:
      URL.createObjectURL(file),

    rotation: 0
  };
}


/* =========================================================
   ADD FILES
   ========================================================= */

function addFiles(fileList) {
  const files =
    Array.from(fileList || []);

  if (!files.length) {
    return;
  }

  const remaining =
    CONFIG.MAX_PAGES -
    state.pages.length;

  if (remaining <= 0) {
    showToast(
      `Maximum ${CONFIG.MAX_PAGES} pages allowed.`,
      "error"
    );

    return;
  }

  const accepted = [];
  const rejected = [];

  for (const file of files) {
    if (accepted.length >= remaining) {
      rejected.push(
        "Maximum page limit reached."
      );

      break;
    }

    const result =
      validateFile(file);

    if (result.valid) {
      accepted.push(file);
    } else {
      rejected.push(result.message);
    }
  }

  if (rejected.length) {
    showToast(
      rejected[0],
      "error"
    );
  }

  if (!accepted.length) {
    return;
  }

  const newPages =
    accepted.map(createPage);

  state.pages.push(
    ...newPages
  );

  if (
    state.selectedPageIndex === -1
  ) {
    state.selectedPageIndex = 0;
  }

  renderDocumentUI();

  showToast(
    `${newPages.length} page` +
    `${newPages.length === 1 ? "" : "s"} added.`,
    "success"
  );
}


/* =========================================================
   RELEASE OBJECT URL
   ========================================================= */

function releasePage(page) {
  if (!page || !page.objectUrl) {
    return;
  }

  try {
    URL.revokeObjectURL(
      page.objectUrl
    );
  } catch {
    // Nothing to do.
  }
}


function releaseAllPages() {
  state.pages.forEach(
    releasePage
  );
}


/* =========================================================
   RESET DOCUMENT
   ========================================================= */

function clearAllPages() {
  if (!state.pages.length) {
    showToast(
      "There are no pages to clear.",
      "info"
    );

    return;
  }

  releaseAllPages();

  state.pages = [];

  state.selectedPageIndex = -1;

  if (DOM.fileInput) {
    DOM.fileInput.value = "";
  }

  renderDocumentUI();

  showToast(
    "All pages cleared.",
    "success"
  );
}


/* =========================================================
   SELECTED PAGE
   ========================================================= */

function getSelectedPage() {
  if (
    state.selectedPageIndex < 0 ||
    state.selectedPageIndex >=
      state.pages.length
  ) {
    return null;
  }

  return state.pages[
    state.selectedPageIndex
  ];
}


function selectPage(index) {
  if (
    index < 0 ||
    index >= state.pages.length
  ) {
    return;
  }

  state.selectedPageIndex = index;

  renderDocumentUI();
}


/* =========================================================
   RENDER DOCUMENT UI
   ========================================================= */

function renderDocumentUI() {
  renderPageCounter();

  renderThumbnails();

  renderMainPreview();

  updateDocumentButtons();
}


/* =========================================================
   PAGE COUNTER
   ========================================================= */

function renderPageCounter() {
  if (!DOM.pageCountBadge) {
    return;
  }

  const count =
    state.pages.length;

  DOM.pageCountBadge.textContent =
    `${formatNumber(count)} page` +
    `${count === 1 ? "" : "s"}`;
}


/* =========================================================
   THUMBNAIL GRID
   ========================================================= */

function renderThumbnails() {
  if (!DOM.thumbGrid) {
    return;
  }

  DOM.thumbGrid.innerHTML = "";

  state.pages.forEach(
    (page, index) => {
      const card =
        document.createElement("div");

      card.className =
        "page-card relative cursor-pointer " +
        "overflow-hidden rounded-xl border-2 " +
        "bg-slate-100 " +
        (
          index ===
          state.selectedPageIndex
            ? "border-blue-600 ring-2 ring-blue-100"
            : "border-transparent"
        );

      const image =
        document.createElement("img");

      image.src =
        page.objectUrl;

      image.alt =
        `Document page ${index + 1}`;

      image.loading =
        "lazy";

      image.className =
        "aspect-[3/4] w-full object-cover";

      image.style.transform =
        `rotate(${page.rotation}deg)`;


      const number =
        document.createElement("span");

      number.className =
        "absolute bottom-1 left-1 " +
        "rounded-lg bg-slate-900/80 " +
        "px-2 py-1 text-[10px] " +
        "font-bold text-white";

      number.textContent =
        String(index + 1);


      const remove =
        document.createElement("button");

      remove.type =
        "button";

      remove.className =
        "absolute right-1 top-1 " +
        "grid h-6 w-6 place-items-center " +
        "rounded-full bg-white/95 " +
        "text-xs font-black text-red-600 shadow";

      remove.textContent =
        "×";

      remove.title =
        "Remove page";


      remove.addEventListener(
        "click",
        event => {
          event.preventDefault();

          event.stopPropagation();

          removePage(index);
        }
      );


      card.addEventListener(
        "click",
        () => {
          selectPage(index);
        }
      );


      card.append(
        image,
        number,
        remove
      );

      DOM.thumbGrid.appendChild(
        card
      );
    }
  );
}


/* =========================================================
   MAIN PREVIEW
   ========================================================= */

function renderMainPreview() {
  const page =
    getSelectedPage();

  if (!page) {
    DOM.emptyPreview
      ?.classList
      .remove("hidden");

    DOM.previewArea
      ?.classList
      .add("hidden");

    if (DOM.previewLabel) {
      DOM.previewLabel.textContent =
        "No page selected";
    }

    return;
  }

  DOM.emptyPreview
    ?.classList
    .add("hidden");

  DOM.previewArea
    ?.classList
    .remove("hidden");

  if (DOM.previewLabel) {
    DOM.previewLabel.textContent =
      `Page ${state.selectedPageIndex + 1} ` +
      `of ${state.pages.length}`;
  }

  if (DOM.mainPreview) {
    DOM.mainPreview.src =
      page.objectUrl;

    DOM.mainPreview.alt =
      page.name;

    DOM.mainPreview.style.transform =
      `rotate(${page.rotation}deg)`;
  }
}


/* =========================================================
   DOCUMENT BUTTON STATE
   ========================================================= */

function updateDocumentButtons() {
  const hasPages =
    state.pages.length > 0;

  const hasSelected =
    Boolean(getSelectedPage());

  if (DOM.downloadPdfBtn) {
    DOM.downloadPdfBtn.disabled =
      !hasPages ||
      state.isExporting;

    DOM.downloadPdfBtn.textContent =
      state.isExporting
        ? "Creating PDF…"
        : "↓ Download PDF";
  }

  if (DOM.rotateLeftBtn) {
    DOM.rotateLeftBtn.disabled =
      !hasSelected;
  }

  if (DOM.rotateRightBtn) {
    DOM.rotateRightBtn.disabled =
      !hasSelected;
  }

  if (DOM.moveLeftBtn) {
    DOM.moveLeftBtn.disabled =
      !hasSelected ||
      state.selectedPageIndex <= 0;
  }

  if (DOM.moveRightBtn) {
    DOM.moveRightBtn.disabled =
      !hasSelected ||
      state.selectedPageIndex >=
        state.pages.length - 1;
  }
}


/* =========================================================
   REMOVE PAGE
   ========================================================= */

function removePage(index) {
  if (
    index < 0 ||
    index >= state.pages.length
  ) {
    return;
  }

  const removed =
    state.pages.splice(
      index,
      1
    )[0];

  releasePage(removed);

  if (!state.pages.length) {
    state.selectedPageIndex = -1;
  } else if (
    index <
    state.selectedPageIndex
  ) {
    state.selectedPageIndex--;
  } else if (
    state.selectedPageIndex >=
    state.pages.length
  ) {
    state.selectedPageIndex =
      state.pages.length - 1;
  }

  renderDocumentUI();

  showToast(
    "Page removed.",
    "success"
  );
}


/* =========================================================
   ROTATE PAGE
   ========================================================= */

function rotateSelectedPage(
  degrees
) {
  const page =
    getSelectedPage();

  if (!page) {
    return;
  }

  page.rotation =
    (
      page.rotation +
      degrees +
      360
    ) % 360;

  renderDocumentUI();
}


/* =========================================================
   MOVE PAGE
   ========================================================= */

function moveSelectedPage(
  direction
) {
  const current =
    state.selectedPageIndex;

  const target =
    current + direction;

  if (
    current < 0 ||
    target < 0 ||
    target >= state.pages.length
  ) {
    return;
  }

  [
    state.pages[current],
    state.pages[target]
  ] = [
    state.pages[target],
    state.pages[current]
  ];

  state.selectedPageIndex =
    target;

  renderDocumentUI();
}


/* =========================================================
   LOAD IMAGE
   ========================================================= */

function loadImage(file) {
  return new Promise(
    (resolve, reject) => {
      const temporaryUrl =
        URL.createObjectURL(file);

      const image =
        new Image();

      image.onload = () => {
        URL.revokeObjectURL(
          temporaryUrl
        );

        resolve(image);
      };

      image.onerror = () => {
        URL.revokeObjectURL(
          temporaryUrl
        );

        reject(
          new Error(
            `Unable to load ${file.name}`
          )
        );
      };

      image.src =
        temporaryUrl;
    }
  );
}


/* =========================================================
   ORIENTATION
   ========================================================= */

function getOrientedDimensions(
  width,
  height,
  rotation
) {
  const normalized =
    ((rotation % 360) + 360) % 360;

  if (
    normalized === 90 ||
    normalized === 270
  ) {
    return {
      width: height,
      height: width
    };
  }

  return {
    width,
    height
  };
}


/* =========================================================
   IMAGE → CANVAS
   ========================================================= */

/*
 * Important:
 *
 * The entire source photo is preserved.
 *
 * No automatic cropping is performed.
 *
 * The image is rotated when necessary and
 * scaled down only when required to keep
 * browser memory under control.
 */

async function pageToCanvas(
  page,
  quality
) {
  const image =
    await loadImage(
      page.file
    );

  if (
    !image.naturalWidth ||
    !image.naturalHeight
  ) {
    throw new Error(
      "Invalid image dimensions."
    );
  }

  const oriented =
    getOrientedDimensions(
      image.naturalWidth,
      image.naturalHeight,
      page.rotation
    );

  const pixels =
    oriented.width *
    oriented.height;

  const scale =
    Math.min(
      1,
      Math.sqrt(
        CONFIG.MAX_IMAGE_PIXELS /
        Math.max(pixels, 1)
      )
    );

  const canvasWidth =
    Math.max(
      1,
      Math.round(
        oriented.width * scale
      )
    );

  const canvasHeight =
    Math.max(
      1,
      Math.round(
        oriented.height * scale
      )
    );

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    canvasWidth;

  canvas.height =
    canvasHeight;

  const context =
    canvas.getContext(
      "2d",
      {
        alpha: false
      }
    );

  if (!context) {
    throw new Error(
      "Canvas is unavailable."
    );
  }

  context.fillStyle =
    "#ffffff";

  context.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  context.save();

  context.translate(
    canvas.width / 2,
    canvas.height / 2
  );

  context.rotate(
    page.rotation *
    Math.PI /
    180
  );

  const drawWidth =
    image.naturalWidth *
    scale;

  const drawHeight =
    image.naturalHeight *
    scale;

  context.imageSmoothingEnabled =
    true;

  context.imageSmoothingQuality =
    "high";

  context.drawImage(
    image,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight
  );

  context.restore();

  return {
    canvas,
    width: canvas.width,
    height: canvas.height,
    quality: clamp(
      Number(quality) || 0.9,
      0.55,
      0.98
    )
  };
}


/* =========================================================
   PDF CONFIGURATION
   ========================================================= */

function getPdfFormat() {
  if (
    DOM.pageSize &&
    DOM.pageSize.value === "letter"
  ) {
    return {
      name: "letter",
      width: 215.9,
      height: 279.4
    };
  }

  return {
    name: "a4",
    width: 210,
    height: 297
  };
}


/* =========================================================
   PDF IMAGE FIT
   ========================================================= */

function calculateImageFit(
  imageWidth,
  imageHeight,
  pageWidth,
  pageHeight,
  margin
) {
  const availableWidth =
    pageWidth -
    margin * 2;

  const availableHeight =
    pageHeight -
    margin * 2;

  const scale =
    Math.min(
      availableWidth /
        imageWidth,

      availableHeight /
        imageHeight
    );

  const width =
    imageWidth * scale;

  const height =
    imageHeight * scale;

  return {
    x:
      (pageWidth - width) /
      2,

    y:
      (pageHeight - height) /
      2,

    width,
    height
  };
}


/* =========================================================
   PDF FILE NAME
   ========================================================= */

function createPdfFilename() {
  const date =
    new Date();

  const year =
    date.getFullYear();

  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      date.getDate()
    ).padStart(2, "0");

  const hours =
    String(
      date.getHours()
    ).padStart(2, "0");

  const minutes =
    String(
      date.getMinutes()
    ).padStart(2, "0");

  return (
    `scanora-document-` +
    `${year}-${month}-${day}-` +
    `${hours}-${minutes}.pdf`
  );
}


/* =========================================================
   PDF EXPORT
   ========================================================= */

async function downloadPdf() {
  if (
    !state.pages.length ||
    state.isExporting
  ) {
    return;
  }

  const JsPDF =
    window.jspdf?.jsPDF;

  if (!JsPDF) {
    showToast(
      "PDF engine is not available. Reload the page.",
      "error"
    );

    return;
  }

  state.isExporting =
    true;

  updateDocumentButtons();

  try {
    const format =
      getPdfFormat();

    const quality =
      clamp(
        Number(
          DOM.pdfQuality?.value
        ) ||
        CONFIG.DEFAULT_PDF_QUALITY,
        0.55,
        0.98
      );

    const pdf =
      new JsPDF({
        orientation: "portrait",
        unit: "mm",
        format: format.name,
        compress: true
      });


    for (
      let index = 0;
      index < state.pages.length;
      index++
    ) {
      const page =
        state.pages[index];

      if (index > 0) {
        pdf.addPage(
          format.name,
          "portrait"
        );
      }

      const rendered =
        await pageToCanvas(
          page,
          quality
        );

      const fit =
        calculateImageFit(
          rendered.width,
          rendered.height,

          format.width,
          format.height,

          CONFIG.PDF_MARGIN_MM
        );

      const imageData =
        rendered.canvas.toDataURL(
          "image/jpeg",
          rendered.quality
        );

      pdf.addImage(
        imageData,
        "JPEG",

        fit.x,
        fit.y,

        fit.width,
        fit.height,

        undefined,
        "FAST"
      );

      /*
       * Give the browser a tiny opportunity
       * to remain responsive while exporting
       * many pages.
       */
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            0
          )
      );
    }


    pdf.save(
      createPdfFilename()
    );

    showToast(
      `${state.pages.length} page PDF downloaded.`,
      "success"
    );

  } catch (error) {

    console.error(
      "Scanora PDF Error:",
      error
    );

    showToast(
      "PDF creation failed. Try smaller images.",
      "error"
    );

  } finally {

    state.isExporting =
      false;

    updateDocumentButtons();
  }
}


/* =========================================================
   URL VALIDATION
   ========================================================= */

function normalizeUrl(value) {
  const input =
    String(value || "")
      .trim();

  if (!input) {
    return null;
  }

  try {
    const url =
      new URL(input);

    if (
      url.protocol !== "http:" &&
      url.protocol !== "https:"
    ) {
      return null;
    }

    return url.href;

  } catch {
    return null;
  }
}


/* =========================================================
   QR RESET
   ========================================================= */

function clearQr() {
  state.currentUrl = "";

  state.qrGenerated =
    false;

  if (DOM.qrCanvas) {
    DOM.qrCanvas.innerHTML = "";

    DOM.qrCanvas.classList.add(
      "hidden"
    );
  }

  DOM.qrEmpty
    ?.classList
    .remove("hidden");

  DOM.downloadQrBtn
    ?.classList
    .add("hidden");

  DOM.urlActions
    ?.classList
    .add("hidden");
}


/* =========================================================
   GENERATE QR
   ========================================================= */

function generateQr() {
  if (!DOM.urlInput) {
    return;
  }

  const url =
    normalizeUrl(
      DOM.urlInput.value
    );

  if (!url) {

    clearQr();

    setUrlStatus(
      "Please enter a valid http:// or https:// URL.",
      "error"
    );

    showToast(
      "Invalid URL.",
      "error"
    );

    return;
  }


  if (
    typeof window.QRCode !==
    "function"
  ) {

    setUrlStatus(
      "QR library could not be loaded.",
      "error"
    );

    showToast(
      "QR engine unavailable.",
      "error"
    );

    return;
  }


  state.currentUrl =
    url;

  DOM.urlInput.value =
    url;


  DOM.qrCanvas.innerHTML = "";

  DOM.qrCanvas.classList.remove(
    "hidden"
  );

  DOM.qrEmpty
    ?.classList
    .add("hidden");


  try {

    new window.QRCode(
      DOM.qrCanvas,
      {
        text: url,

        width:
          CONFIG.QR_SIZE,

        height:
          CONFIG.QR_SIZE,

        colorDark:
          "#0f172a",

        colorLight:
          "#ffffff",

        correctLevel:
          window.QRCode
            .CorrectLevel
            .H
      }
    );


    state.qrGenerated =
      true;


    DOM.urlActions
      ?.classList
      .remove("hidden");

    DOM.downloadQrBtn
      ?.classList
      .remove("hidden");


    setUrlStatus(
      "Valid URL. QR code generated locally.",
      "success"
    );

    showToast(
      "QR code generated.",
      "success"
    );

  } catch (error) {

    console.error(
      "QR Error:",
      error
    );

    clearQr();

    setUrlStatus(
      "Could not generate QR code.",
      "error"
    );

    showToast(
      "QR generation failed.",
      "error"
    );
  }
}


/* =========================================================
   DOWNLOAD QR
   ========================================================= */

function downloadQr() {
  if (
    !state.qrGenerated
  ) {
    showToast(
      "Generate a QR code first.",
      "info"
    );

    return;
  }

  const canvas =
    DOM.qrCanvas?.querySelector(
      "canvas"
    );

  if (!canvas) {
    showToast(
      "QR image is not ready.",
      "error"
    );

    return;
  }

  try {

    const link =
      document.createElement(
        "a"
      );

    link.href =
      canvas.toDataURL(
        "image/png"
      );

    link.download =
      "scanora-qr.png";

    document.body.appendChild(
      link
    );

    link.click();

    link.remove();

    showToast(
      "QR image downloaded.",
      "success"
    );

  } catch (error) {

    console.error(
      "QR Download Error:",
      error
    );

    showToast(
      "Could not download QR.",
      "error"
    );
  }
}


/* =========================================================
   OPEN URL
   ========================================================= */

function openUrl() {
  if (!state.currentUrl) {
    showToast(
      "Generate a QR code first.",
      "info"
    );

    return;
  }

  window.open(
    state.currentUrl,
    "_blank",
    "noopener,noreferrer"
  );
}


/* =========================================================
   COPY URL
   ========================================================= */

async function copyUrl() {
  if (!state.currentUrl) {
    showToast(
      "Generate a QR code first.",
      "info"
    );

    return;
  }

  try {

    if (
      navigator.clipboard &&
      navigator.clipboard.writeText
    ) {

      await navigator.clipboard.writeText(
        state.currentUrl
      );

      showToast(
        "URL copied.",
        "success"
      );

      return;
    }


    const textarea =
      document.createElement(
        "textarea"
      );

    textarea.value =
      state.currentUrl;

    textarea.style.position =
      "fixed";

    textarea.style.opacity =
      "0";

    document.body.appendChild(
      textarea
    );

    textarea.select();

    const success =
      document.execCommand(
        "copy"
      );

    textarea.remove();


    if (success) {
      showToast(
        "URL copied.",
        "success"
      );
    } else {
      showToast(
        "Copy was blocked.",
        "error"
      );
    }

  } catch (error) {

    console.error(
      "Clipboard Error:",
      error
    );

    showToast(
      "Copy was blocked by browser.",
      "error"
    );
  }
}


/* =========================================================
   DRAG & DROP
   ========================================================= */

function setDropZoneActive(
  active
) {
  if (!DOM.dropZone) {
    return;
  }

  DOM.dropZone.classList.toggle(
    "drop-active",
    active
  );
}


function bindDragDrop() {
  if (!DOM.dropZone) {
    return;
  }


  DOM.dropZone.addEventListener(
    "dragenter",
    event => {
      event.preventDefault();

      setDropZoneActive(
        true
      );
    }
  );


  DOM.dropZone.addEventListener(
    "dragover",
    event => {
      event.preventDefault();

      setDropZoneActive(
        true
      );
    }
  );


  DOM.dropZone.addEventListener(
    "dragleave",
    event => {
      event.preventDefault();

      setDropZoneActive(
        false
      );
    }
  );


  DOM.dropZone.addEventListener(
    "drop",
    event => {
      event.preventDefault();

      setDropZoneActive(
        false
      );

      const files
