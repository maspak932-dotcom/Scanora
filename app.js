/* =========================================================
   SCANORA — app.js
   Document Scanner + URL → QR
   Browser only / No backend / No database
   ========================================================= */

(() => {
  "use strict";

  /* -------------------------------------------------------
     Prevent duplicate initialization
     ------------------------------------------------------- */
  if (window.__SCANORA_STARTED__) return;
  window.__SCANORA_STARTED__ = true;

  /* -------------------------------------------------------
     CONFIG
     ------------------------------------------------------- */
  const CONFIG = {
    MAX_PAGES: 100,
    MAX_FILE_SIZE: 25 * 1024 * 1024,
    MAX_PIXELS: 16_000_000,

    PDF_MARGIN_MM: 8,

    QR_SIZE: 280,

    SUPPORTED_TYPES: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "image/bmp",
      "image/avif"
    ],

    SUPPORTED_EXTENSIONS: [
      "jpg",
      "jpeg",
      "png",
      "webp",
      "gif",
      "bmp",
      "avif"
    ]
  };

  /* -------------------------------------------------------
     APP STATE
     ------------------------------------------------------- */
  const state = {
    pages: [],
    selectedIndex: -1,
    url: "",
    pdfBusy: false,
    toastTimer: null
  };

  /* -------------------------------------------------------
     DOM
     ------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  const el = {
    home: $("homeSection"),
    documents: $("documentsSection"),
    qr: $("qrSection"),

    brand: $("brandButton"),

    fileInput: $("fileInput"),
    dropZone: $("dropZone"),
    thumbGrid: $("thumbGrid"),
    pageCountBadge: $("pageCountBadge"),

    emptyPreview: $("emptyPreview"),
    previewArea: $("previewArea"),
    mainPreview: $("mainPreview"),
    previewLabel: $("previewLabel"),

    clearAllBtn: $("clearAllBtn"),
    rotateLeftBtn: $("rotateLeftBtn"),
    rotateRightBtn: $("rotateRightBtn"),
    moveLeftBtn: $("moveLeftBtn"),
    moveRightBtn: $("moveRightBtn"),
    downloadPdfBtn: $("downloadPdfBtn"),

    pageSize: $("pageSize"),
    pdfQuality: $("pdfQuality"),

    urlInput: $("urlInput"),
    generateQrBtn: $("generateQrBtn"),
    urlStatus: $("urlStatus"),
    urlActions: $("urlActions"),
    openUrlBtn: $("openUrlBtn"),
    copyUrlBtn: $("copyUrlBtn"),

    qrEmpty: $("qrEmpty"),
    qrCanvas: $("qrCanvas"),
    downloadQrBtn: $("downloadQrBtn"),

    toast: $("toast")
  };

  /* -------------------------------------------------------
     TOAST
     ------------------------------------------------------- */
  function toast(message, type = "default") {
    if (!el.toast) {
      console.log("[Scanora]", message);
      return;
    }

    const backgrounds = {
      success: "bg-emerald-600",
      error: "bg-red-600",
      info: "bg-blue-600",
      default: "bg-slate-900"
    };

    el.toast.className =
      "pointer-events-none fixed bottom-5 left-1/2 z-[9999] " +
      "-translate-x-1/2 rounded-2xl px-5 py-3 text-sm " +
      "font-bold text-white shadow-2xl " +
      (backgrounds[type] || backgrounds.default);

    el.toast.textContent = message;
    el.toast.classList.remove("hidden");

    clearTimeout(state.toastTimer);

    state.toastTimer = setTimeout(() => {
      el.toast?.classList.add("hidden");
    }, 2800);
  }

  /* -------------------------------------------------------
     NAVIGATION
     ------------------------------------------------------- */
  function openSection(name) {
    el.home?.classList.add("hidden");
    el.documents?.classList.add("hidden");
    el.qr?.classList.add("hidden");

    if (name === "home") {
      el.home?.classList.remove("hidden");
    }

    if (name === "documents") {
      el.documents?.classList.remove("hidden");
    }

    if (name === "qr") {
      el.qr?.classList.remove("hidden");
    }

    document.querySelectorAll("[data-nav]").forEach((button) => {
      const active = button.dataset.nav === name;

      button.classList.toggle("bg-white/10", active);
      button.classList.toggle("text-white", active);
    });
  }

  /* -------------------------------------------------------
     PAGE HELPERS
     ------------------------------------------------------- */
  function generateId() {
    if (
      window.crypto &&
      typeof window.crypto.randomUUID === "function"
    ) {
      return window.crypto.randomUUID();
    }

    return (
      "page-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2)
    );
  }

  function isSupportedImage(file) {
    if (!file) return false;

    if (
      file.type &&
      CONFIG.SUPPORTED_TYPES.includes(file.type.toLowerCase())
    ) {
      return true;
    }

    const name = String(file.name || "").toLowerCase();
    const parts = name.split(".");

    if (parts.length < 2) return false;

    return CONFIG.SUPPORTED_EXTENSIONS.includes(
      parts.pop()
    );
  }

  function createPage(file) {
    return {
      id: generateId(),
      file,
      name: file.name || "Scan page",
      objectUrl: URL.createObjectURL(file),
      rotation: 0,
      width: 0,
      height: 0
    };
  }

  function revokePage(page) {
    if (!page?.objectUrl) return;

    try {
      URL.revokeObjectURL(page.objectUrl);
    } catch (_) {}
  }

  function selectedPage() {
    if (
      state.selectedIndex < 0 ||
      state.selectedIndex >= state.pages.length
    ) {
      return null;
    }

    return state.pages[state.selectedIndex];
  }

  /* -------------------------------------------------------
     ADD FILES
     ------------------------------------------------------- */
  function addFiles(fileList) {
    if (state.pdfBusy) return;

    const files = Array.from(fileList || []);

    if (!files.length) return;

    const available =
      CONFIG.MAX_PAGES - state.pages.length;

    if (available <= 0) {
      toast(
        `Maximum ${CONFIG.MAX_PAGES} pages allowed.`,
        "error"
      );
      return;
    }

    let added = 0;

    for (const file of files) {
      if (added >= available) break;

      if (!isSupportedImage(file)) {
        continue;
      }

      if (file.size > CONFIG.MAX_FILE_SIZE) {
        toast(
          `${file.name} is larger than 25 MB.`,
          "error"
        );
        continue;
      }

      state.pages.push(createPage(file));
      added++;
    }

    if (state.selectedIndex === -1 && state.pages.length) {
      state.selectedIndex = 0;
    }

    render();

    if (added > 0) {
      toast(
        `${added} photo${added === 1 ? "" : "s"} added.`,
        "success"
      );
    } else {
      toast(
        "No supported image was added.",
        "error"
      );
    }
  }

  /* -------------------------------------------------------
     IMAGE DIMENSIONS
     ------------------------------------------------------- */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();

      image.onload = () => resolve(image);

      image.onerror = () =>
        reject(
          new Error("Image could not be loaded.")
        );

      image.src = src;
    });
  }

  async function readPageSize(page) {
    if (page.width && page.height) {
      return {
        width: page.width,
        height: page.height
      };
    }

    const image = await loadImage(page.objectUrl);

    page.width = image.naturalWidth;
    page.height = image.naturalHeight;

    return {
      width: image.naturalWidth,
      height: image.naturalHeight
    };
  }

  /* -------------------------------------------------------
     RENDER
     ------------------------------------------------------- */
  function render() {
    renderCounter();
    renderThumbnails();
    renderPreview();
    updateButtons();
  }

  function renderCounter() {
    if (!el.pageCountBadge) return;

    const count = state.pages.length;

    el.pageCountBadge.textContent =
      `${count} page${count === 1 ? "" : "s"}`;
  }

  function renderThumbnails() {
    if (!el.thumbGrid) return;

    el.thumbGrid.replaceChildren();

    const fragment =
      document.createDocumentFragment();

    state.pages.forEach((page, index) => {
      const card = document.createElement("div");

      card.className =
        "relative overflow-hidden rounded-xl border-2 " +
        "bg-slate-100 cursor-pointer select-none " +
        "transition " +
        (
          index === state.selectedIndex
            ? "border-blue-600 ring-2 ring-blue-100"
            : "border-transparent"
        );

      const image =
        document.createElement("img");

      image.src = page.objectUrl;
      image.alt = `Page ${index + 1}`;
      image.loading = "lazy";
      image.decoding = "async";

      /*
        IMPORTANT:
        object-contain ensures the entire image
        remains visible in the thumbnail.
      */
      image.className =
        "aspect-[3/4] w-full bg-white object-contain";

      image.style.transform =
        `rotate(${page.rotation}deg)`;

      const pageNumber =
        document.createElement("span");

      pageNumber.className =
        "absolute bottom-1 left-1 rounded-lg " +
        "bg-slate-900/80 px-2 py-1 " +
        "text-[10px] font-bold text-white";

      pageNumber.textContent =
        String(index + 1);

      const remove =
        document.createElement("button");

      remove.type = "button";

      remove.className =
        "absolute right-1 top-1 grid h-7 w-7 " +
        "place-items-center rounded-full bg-white " +
        "text-sm font-black text-red-600 shadow";

      remove.textContent = "×";
      remove.title = "Remove page";

      remove.addEventListener(
        "click",
        (event) => {
          event.preventDefault();
          event.stopPropagation();

          removePage(index);
        }
      );

      card.addEventListener("click", () => {
        state.selectedIndex = index;
        render();
      });

      card.appendChild(image);
      card.appendChild(pageNumber);
      card.appendChild(remove);

      fragment.appendChild(card);
    });

    el.thumbGrid.appendChild(fragment);
  }

  function renderPreview() {
    const page = selectedPage();

    if (!page) {
      el.emptyPreview?.classList.remove("hidden");
      el.previewArea?.classList.add("hidden");

      if (el.previewLabel) {
        el.previewLabel.textContent =
          "No page selected";
      }

      return;
    }

    el.emptyPreview?.classList.add("hidden");
    el.previewArea?.classList.remove("hidden");

    if (el.previewLabel) {
      el.previewLabel.textContent =
        `Page ${state.selectedIndex + 1} of ${state.pages.length}`;
    }

    if (el.mainPreview) {
      el.mainPreview.src = page.objectUrl;
      el.mainPreview.alt = page.name;

      /*
        Full photo preview.
      */
      el.mainPreview.className =
        "max-h-[560px] max-w-full rounded-xl " +
        "object-contain shadow-xl";

      el.mainPreview.style.transform =
        `rotate(${page.rotation}deg)`;
    }
  }

  function updateButtons() {
    const page = selectedPage();
    const hasPage = !!page;
    const hasPages = state.pages.length > 0;

    if (el.downloadPdfBtn) {
      el.downloadPdfBtn.disabled =
        !hasPages || state.pdfBusy;

      el.downloadPdfBtn.textContent =
        state.pdfBusy
          ? "Creating PDF..."
          : "↓ Download PDF";
    }

    if (el.rotateLeftBtn) {
      el.rotateLeftBtn.disabled =
        !hasPage || state.pdfBusy;
    }

    if (el.rotateRightBtn) {
      el.rotateRightBtn.disabled =
        !hasPage || state.pdfBusy;
    }

    if (el.moveLeftBtn) {
      el.moveLeftBtn.disabled =
        !hasPage ||
        state.selectedIndex <= 0 ||
        state.pdfBusy;
    }

    if (el.moveRightBtn) {
      el.moveRightBtn.disabled =
        !hasPage ||
        state.selectedIndex >= state.pages.length - 1 ||
        state.pdfBusy;
    }

    if (el.clearAllBtn) {
      el.clearAllBtn.disabled =
        !hasPages || state.pdfBusy;
    }
  }

  /* -------------------------------------------------------
     PAGE ACTIONS
     ------------------------------------------------------- */
  function removePage(index) {
    if (state.pdfBusy) return;

    if (
      index < 0 ||
      index >= state.pages.length
    ) {
      return;
    }

    const removed =
      state.pages.splice(index, 1)[0];

    revokePage(removed);

    if (!state.pages.length) {
      state.selectedIndex = -1;
    } else if (
      state.selectedIndex > index
    ) {
      state.selectedIndex--;
    } else if (
      state.selectedIndex >= state.pages.length
    ) {
      state.selectedIndex =
        state.pages.length - 1;
    }

    render();

    toast(
      "Page removed.",
      "success"
    );
  }

  function clearAll() {
    if (state.pdfBusy) return;

    state.pages.forEach(revokePage);

    state.pages = [];
    state.selectedIndex = -1;

    if (el.fileInput) {
      el.fileInput.value = "";
    }

    render();

    toast(
      "All pages cleared.",
      "success"
    );
  }

  function rotatePage(amount) {
    if (state.pdfBusy) return;

    const page = selectedPage();

    if (!page) return;

    page.rotation =
      (page.rotation + amount + 360) % 360;

    render();
  }

  function movePage(direction) {
    if (state.pdfBusy) return;

    const from = state.selectedIndex;
    const to = from + direction;

    if (
      from < 0 ||
      to < 0 ||
      to >= state.pages.length
    ) {
      return;
    }

    [
      state.pages[from],
      state.pages[to]
    ] = [
      state.pages[to],
      state.pages[from]
    ];

    state.selectedIndex = to;

    render();
  }

  /* -------------------------------------------------------
     CANVAS
     ------------------------------------------------------- */
  async function makeCanvas(page) {
    const image =
      await loadImage(page.objectUrl);

    let width = image.naturalWidth;
    let height = image.naturalHeight;

    const rotated =
      page.rotation === 90 ||
      page.rotation === 270;

    if (rotated) {
      [width, height] =
        [height, width];
    }

    const pixels = width * height;

    let scale = 1;

    if (pixels > CONFIG.MAX_PIXELS) {
      scale = Math.sqrt(
        CONFIG.MAX_PIXELS / pixels
      );
    }

    const canvas =
      document.createElement("canvas");

    canvas.width =
      Math.max(
        1,
        Math.round(width * scale)
      );

    canvas.height =
      Math.max(
        1,
        Math.round(height * scale)
      );

    const ctx =
      canvas.getContext(
        "2d",
        { alpha: false }
      );

    if (!ctx) {
      throw new Error(
        "Canvas is not supported."
      );
    }

    /*
      White background.
      This also handles PNG transparency cleanly.
    */
    ctx.fillStyle = "#ffffff";

    ctx.fillRect(
      0,
      0,
      canvas.width,
      canvas.height
    );

    ctx.save();

    ctx.translate(
      canvas.width / 2,
      canvas.height / 2
    );

    ctx.rotate(
      page.rotation * Math.PI / 180
    );

    const drawWidth =
      image.naturalWidth * scale;

    const drawHeight =
      image.naturalHeight * scale;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    /*
      IMPORTANT:
      Draw the entire photo.
      No crop.
      No object-fit cover.
    */
    ctx.drawImage(
      image,
      -drawWidth / 2,
      -drawHeight / 2,
      drawWidth,
      drawHeight
    );

    ctx.restore();

    return canvas;
  }

  /* -------------------------------------------------------
     PDF
     ------------------------------------------------------- */
  function pdfSettings() {
    if (el.pageSize?.value === "letter") {
      return {
        format: "letter",
        width: 215.9,
        height: 279.4,
        filename: "scanora-letter"
      };
    }

    return {
      format: "a4",
      width: 210,
      height: 297,
      filename: "scanora-a4"
    };
  }

  function pdfQuality() {
    const value =
      Number(el.pdfQuality?.value);

    if (!Number.isFinite(value)) {
      return 0.92;
    }

    return Math.min(
      1,
      Math.max(0.4, value)
    );
  }

  async function downloadPDF() {
    if (state.pdfBusy) return;

    if (!state.pages.length) {
      toast(
        "Add photos first.",
        "error"
      );
      return;
    }

    const JsPDF =
      window.jspdf &&
      window.jspdf.jsPDF;

    if (typeof JsPDF !== "function") {
      toast(
        "PDF library is not loaded. Check your internet connection.",
        "error"
      );
      return;
    }

    state.pdfBusy = true;
    updateButtons();

    try {
      const settings = pdfSettings();

      const pdf =
        new JsPDF({
          orientation: "portrait",
          unit: "mm",
          format: settings.format,
          compress: true
        });

      const margin =
        CONFIG.PDF_MARGIN_MM;

      const usableWidth =
        settings.width - margin * 2;

      const usableHeight =
        settings.height - margin * 2;

      const quality = pdfQuality();

      for (
        let i = 0;
        i < state.pages.length;
        i++
      ) {
        if (i > 0) {
          pdf.addPage(
            settings.format,
            "portrait"
          );
        }

        const page =
          state.pages[i];

        const canvas =
          await makeCanvas(page);

        /*
          FIT — not CROP

          The complete photo is placed
          inside the available PDF page.

          Aspect ratio remains unchanged.
        */
        const scale =
          Math.min(
            usableWidth / canvas.width,
            usableHeight / canvas.height
          );

        const imageWidth =
          canvas.width * scale;

        const imageHeight =
          canvas.height * scale;

        const x =
          (settings.width - imageWidth) / 2;

        const y =
          (settings.height - imageHeight) / 2;

        const imageData =
          canvas.toDataURL(
            "image/jpeg",
            quality
          );

        pdf.addImage(
          imageData,
          "JPEG",
          x,
          y,
          imageWidth,
          imageHeight,
          `scanora-page-${i + 1}`,
          "FAST"
        );

        /*
          Give the mobile browser time
          between large pages.
        */
        await new Promise(
          (resolve) =>
            setTimeout(resolve, 0)
        );
      }

      const time =
        new Date()
          .toISOString()
          .replace(
            /[:.]/g,
            "-"
          );

      pdf.save(
        `${settings.filename}-${time}.pdf`
      );

      toast(
        `${state.pages.length}-page PDF downloaded.`,
        "success"
      );
    } catch (error) {
      console.error(
        "Scanora PDF error:",
        error
      );

      toast(
        "PDF creation failed. Try smaller photos.",
        "error"
      );
    } finally {
      state.pdfBusy = false;
      updateButtons();
    }
  }

  /* -------------------------------------------------------
     URL
     ------------------------------------------------------- */
  function normalizeUrl(value) {
    const text =
      String(value || "").trim();

    if (!text) return null;

    try {
      const url =
        new URL(text);

      if (
        url.protocol !== "http:" &&
        url.protocol !== "https:"
      ) {
        return null;
      }

      return url.href;
    } catch (_) {
      return null;
    }
  }

  function setUrlStatus(
    text,
    status = "normal"
  ) {
    if (!el.urlStatus) return;

    if (status === "success") {
      el.urlStatus.className =
        "mt-3 text-xs font-semibold text-emerald-600";
    } else if (status === "error") {
      el.urlStatus.className =
        "mt-3 text-xs font-semibold text-red-600";
    } else {
      el.urlStatus.className =
        "mt-3 text-xs font-semibold text-slate-500";
    }

    el.urlStatus.textContent = text;
  }

  function resetQr() {
    state.url = "";

    el.qrCanvas?.replaceChildren();
    el.qrCanvas?.classList.add("hidden");

    el.qrEmpty?.classList.remove("hidden");
    el.urlActions?.classList.add("hidden");
    el.downloadQrBtn?.classList.add("hidden");

    setUrlStatus(
      "Enter a complete URL beginning with http:// or https://",
      "normal"
    );
  }

  /* -------------------------------------------------------
     QR
     ------------------------------------------------------- */
  function generateQR() {
    if (!el.urlInput) return;

    const url =
      normalizeUrl(
        el.urlInput.value
      );

    if (!url) {
      resetQr();

      setUrlStatus(
        "Please enter a valid http:// or https:// URL.",
        "error"
      );

      toast(
        "Invalid URL.",
        "error"
      );

      return;
    }

    if (
      typeof window.QRCode !==
      "function"
    ) {
      toast(
        "QR library is not loaded. Check your internet connection.",
        "error"
      );

      return;
    }

    try {
      state.url = url;

      el.urlInput.value = url;

      el.qrCanvas?.replaceChildren();
      el.qrCanvas?.classList.remove("hidden");

      el.qrEmpty?.classList.add("hidden");

      const level =
        window.QRCode.CorrectLevel?.H ??
        2;

      new window.QRCode(
        el.qrCanvas,
        {
          text: url,
          width: CONFIG.QR_SIZE,
          height: CONFIG.QR_SIZE,
          colorDark: "#0f172a",
          colorLight: "#ffffff",
          correctLevel: level
        }
      );

      el.urlActions?.classList.remove("hidden");
      el.downloadQrBtn?.classList.remove("hidden");

      setUrlStatus(
        "QR code generated locally in your browser.",
        "success"
      );

      toast(
        "QR code generated.",
        "success"
      );
    } catch (error) {
      console.error(
        "Scanora QR error:",
        error
      );

      resetQr();

      toast(
        "QR generation failed.",
        "error"
      );
    }
  }

  function getQrCanvas() {
    return (
      el.qrCanvas?.querySelector(
        "canvas"
      ) || null
    );
  }

  function downloadQR() {
    const canvas =
      getQrCanvas();

    if (!canvas) {
      toast(
        "Generate the QR code first.",
        "info"
      );
      return;
    }

    try {
      const link =
        document.createElement("a");

      link.href =
        canvas.toDataURL(
          "image/png"
        );

      link.download =
        "scanora-qr.png";

      document.body.appendChild(link);

      link.click();

      link.remove();

      toast(
        "QR PNG downloaded.",
        "success"
      );
    } catch (error) {
      console.error(
        "QR download error:",
        error
      );

      toast(
        "QR download failed.",
        "error"
      );
    }
  }

  function openUrl() {
    if (!state.url) {
      toast(
        "Generate a QR code first.",
        "info"
      );
      return;
    }

    const newWindow =
      window.open(
        state.url,
        "_blank",
        "noopener,noreferrer"
      );

    if (!newWindow) {
      toast(
        "Browser blocked the new tab.",
        "error"
      );
    }
  }

  async function copyUrl() {
    if (!state.url) {
      toast(
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
          state.url
        );

        toast(
          "URL copied.",
          "success"
        );

        return;
      }
    } catch (_) {}

    try {
      const textarea =
        document.createElement(
          "textarea"
        );

      textarea.value =
        state.url;

      textarea.style.position =
        "fixed";

      textarea.style.opacity = "0";

      document.body.appendChild(
        textarea
      );

      textarea.select();

      const copied =
        document.execCommand(
          "copy"
        );

      textarea.remove();

      toast(
        copied
          ? "URL copied."
          : "Copy blocked by browser.",
        copied
          ? "success"
          : "error"
      );
    } catch (error) {
      console.error(
        "Copy error:",
        error
      );

      toast(
        "Unable to copy URL.",
        "error"
      );
    }
  }

  /* -------------------------------------------------------
     EVENTS
     ------------------------------------------------------- */
  function bindEvents() {

    // Navigation
    document
      .querySelectorAll("[data-nav]")
      .forEach((button) => {
        button.addEventListener(
          "click",
          () => {
            openSection(
              button.dataset.nav
            );
          }
        );
      });

    el.brand?.addEventListener(
      "click",
      () => openSection("home")
    );

    // File input
    el.fileInput?.addEventListener(
      "change",
      (event) => {
        addFiles(
          event.target.files
        );

        event.target.value = "";
      }
    );

    // Clear
    el.clearAllBtn?.addEventListener(
      "click",
      clearAll
    );

    // Rotate
    el.rotateLeftBtn?.addEventListener(
      "click",
      () => rotatePage(-90)
    );

    el.rotateRightBtn?.addEventListener(
      "click",
      () => rotatePage(90)
    );

    // Move
    el.moveLeftBtn?.addEventListener(
      "click",
      () => movePage(-1)
    );

    el.moveRightBtn?.addEventListener(
      "click",
      () => movePage(1)
    );

    // PDF
    el.downloadPdfBtn?.addEventListener(
      "click",
      downloadPDF
    );

    // QR
    el.generateQrBtn?.addEventListener(
      "click",
      generateQR
    );

    el.downloadQrBtn?.addEventListener(
      "click",
      downloadQR
    );

    el.openUrlBtn?.addEventListener(
      "click",
      openUrl
    );

    el.copyUrlBtn?.addEventListener(
      "click",
      copyUrl
    );

    // Enter key on URL
    el.urlInput?.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          generateQR();
        }
      }
    );

    // User changes URL → old QR becomes invalid
    el.urlInput?.addEventListener(
      "input",
      () => {
        state.url = "";

        el.qrCanvas?.replaceChildren();
        el.qrCanvas?.classList.add("hidden");

        el.qrEmpty?.classList.remove("hidden");
        el.urlActions?.classList.add("hidden");
        el.downloadQrBtn?.classList.add("hidden");

        setUrlStatus(
          "Enter a complete URL beginning with http:// or https://",
          "normal"
        );
      }
    );

    /* -----------------------------------------------------
       DRAG & DROP
       ----------------------------------------------------- */

    if (el.dropZone) {

      ["dragenter", "dragover"]
        .forEach((eventName) => {
          el.dropZone.addEventListener(
            eventName,
            (event) => {
              event.preventDefault();
              event.stopPropagation();

              el.dropZone.classList.add(
                "drop-active"
              );
            }
          );
        });

      ["dragleave", "drop"]
        .forEach((eventName) => {
          el.dropZone.addEventListener(
            eventName,
            (event) => {
              event.preventDefault();
              event.stopPropagation();

              el.dropZone.classList.remove(
                "drop-active"
              );
            }
          );
        });

      el.dropZone.addEventListener(
        "drop",
        (event) => {
          addFiles(
            event.dataTransfer?.files
          );
        }
      );
    }

    // Prevent accidental browser file opening
    window.addEventListener(
      "dragover",
      (event) => {
        event.preventDefault();
      }
    );

    window.addEventListener(
      "drop",
      (event) => {
        if (
          !el.dropZone?.contains(
            event.target
          )
        ) {
          event.preventDefault();
        }
      }
    );

    // Keyboard navigation between pages
    document.addEventListener(
      "keydown",
      (event) => {
        const tag =
          event.target?.tagName?.toLowerCase();

        if (
          tag === "input" ||
          tag === "textarea" ||
          tag === "select" ||
          event.target?.isContentEditable
        ) {
          return;
        }

        if (!selectedPage()) return;

        if (event.key === "ArrowLeft") {
          movePage(-1);
        }

        if (event.key === "ArrowRight") {
          movePage(1);
        }
      }
    );
  }

  /* -------------------------------------------------------
     CLEANUP
     ------------------------------------------------------- */
  window.addEventListener(
    "beforeunload",
    () => {
      state.pages.forEach(
        revokePage
      );
    }
  );

  /* -------------------------------------------------------
     START
     ------------------------------------------------------- */
  function start() {
    bindEvents();
    resetQr();
    render();
    openSection("home");

    console.log(
      "Scanora app.js loaded successfully."
    );
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      start,
      { once: true }
    );
  } else {
    start();
  }

})();
