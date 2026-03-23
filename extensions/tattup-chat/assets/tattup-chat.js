(function () {
  "use strict";

  const POLL_INTERVAL = 3000;
  const MAX_POLLS = 120;
  const CHAR_LIMIT = 500;

  class TattupApp {
    constructor(container) {
      this.container = container;
      this.proxyBase = container.dataset.proxyBase || "/apps/tattup";
      this.loggedIn = container.dataset.loggedIn === "true";
      this.tattooVariantId = container.dataset.tattooVariantId || null;
      this.credits = parseInt(container.dataset.credits || "0", 10);
      this.gallery = [];
      this.activeJobs = 0;

      if (this.loggedIn) this.init();
    }

    el(id) { return document.getElementById(id); }

    async init() {
      this.bindEvents();
      this.updateCreditsDisplay();
      this.updateCharCount();
      this.updateCostDisplay();
      await this.fetchGallery();
    }

    bindEvents() {
      // Tab navigation
      this.container.querySelectorAll(".tattup-nav-btn[data-tab]").forEach((btn) => {
        btn.addEventListener("click", () => this.switchTab(btn.dataset.tab));
      });

      // Generate
      const genBtn = this.el("tattup-generate-btn");
      if (genBtn) genBtn.addEventListener("click", () => this.generate());

      // Enter key
      const textarea = this.el("tattup-prompt");
      if (textarea) {
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.generate(); }
        });
        textarea.addEventListener("input", () => this.updateCharCount());
      }

      // Model change updates cost display
      const modelEl = this.el("tattup-model");
      if (modelEl) modelEl.addEventListener("change", () => this.updateCostDisplay());

      // Credits badge
      const badge = this.el("tattup-credits-badge");
      if (badge) badge.addEventListener("click", () => this.showBuyModal());

      // Modal close
      const closeBtn = this.el("tattup-modal-close");
      if (closeBtn) closeBtn.addEventListener("click", () => this.hideBuyModal());
      const overlay = this.el("tattup-buy-modal");
      if (overlay) overlay.addEventListener("click", (e) => { if (e.target === overlay) this.hideBuyModal(); });

      // Package buttons
      document.querySelectorAll(".tattup-package-btn").forEach((btn) => {
        btn.addEventListener("click", () => this.addToCart(btn.dataset.variantId, btn.dataset.sellingPlanId, btn));
      });

      // Gallery delegation (prompt toggle, copy, test design)
      const gridEl = this.el("tattup-gallery-grid");
      if (gridEl) {
        gridEl.addEventListener("click", (e) => {
          const toggle = e.target.closest(".tattup-prompt-toggle");
          if (toggle) {
            toggle.classList.toggle("open");
            const detail = toggle.nextElementSibling;
            if (detail) detail.classList.toggle("open");
            return;
          }
          const copyBtn = e.target.closest(".tattup-prompt-copy");
          if (copyBtn) {
            navigator.clipboard.writeText(copyBtn.dataset.prompt || "");
            copyBtn.textContent = "Copied!";
            setTimeout(() => { copyBtn.textContent = "Copy prompt"; }, 1500);
            return;
          }
          const testBtn = e.target.closest(".tattup-overlay-btn.primary");
          if (testBtn) {
            const imageUrl = testBtn.dataset.imageUrl;
            if (imageUrl) this.testDesign(imageUrl);
          }
        });
      }
    }

    // ─── Tabs ───

    switchTab(tab) {
      this.container.querySelectorAll(".tattup-nav-btn").forEach((b) => b.classList.remove("active"));
      this.container.querySelector(`.tattup-nav-btn[data-tab="${tab}"]`)?.classList.add("active");
      this.container.querySelectorAll(".tattup-tab-panel").forEach((p) => p.classList.remove("active"));
      this.el(`tattup-panel-${tab}`)?.classList.add("active");
    }

    // ─── Char Count ───

    updateCharCount() {
      const textarea = this.el("tattup-prompt");
      const counter = this.el("tattup-char-count");
      if (!textarea || !counter) return;
      const len = textarea.value.length;
      counter.textContent = `${len} / ${CHAR_LIMIT}`;
      counter.classList.remove("near-limit", "at-limit");
      if (len >= CHAR_LIMIT) counter.classList.add("at-limit");
      else if (len >= CHAR_LIMIT * 0.85) counter.classList.add("near-limit");
    }

    // ─── Cost Display ───

    updateCostDisplay() {
      const modelEl = this.el("tattup-model");
      const costEl = this.el("tattup-cost-display");
      if (!costEl) return;
      costEl.textContent = modelEl?.value === "pro" ? "2" : "1";
    }

    // ─── API ───

    async api(path, options = {}) {
      const url = `${this.proxyBase}${path}`;
      const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
      return response.json();
    }

    // ─── Credits ───

    updateCreditsDisplay() {
      const el = this.el("tattup-credit-count");
      if (el) el.textContent = this.credits;
    }

    // ─── Generate (allows multiple simultaneous) ───

    async generate() {
      const promptEl = this.el("tattup-prompt");
      const modelEl = this.el("tattup-model");
      const styleEl = this.el("tattup-style");
      const aspectRatioEl = this.el("tattup-aspect-ratio");
      const numImagesEl = this.el("tattup-num-images");
      const sizeEl = this.el("tattup-size");

      const prompt = promptEl?.value?.trim();
      if (!prompt) { promptEl?.focus(); return; }

      const model = modelEl?.value || "standard";
      const style = styleEl?.value || "";
      const aspectRatio = aspectRatioEl?.value || "1:1";
      const numImages = parseInt(numImagesEl?.value || "1", 10);
      const size = sizeEl?.value || "medium";
      const cost = model === "pro" ? 2 : 1;

      if (this.credits < cost) { this.showBuyModal(); return; }

      // Add loading placeholder(s) to gallery
      const placeholderId = "job-" + Date.now();
      this.addLoadingPlaceholder(placeholderId);
      this.activeJobs++;
      this.updateGenerateBtn();

      try {
        const data = await this.api("/generate", {
          method: "POST",
          body: JSON.stringify({ prompt, model, style, aspectRatio, numImages, size }),
        });

        if (data.error) {
          this.removeLoadingPlaceholder(placeholderId);
          if (data.credits !== undefined || data.required !== undefined) { this.showBuyModal(); }
          else { this.showToast("Something went wrong. Please try again."); }
          return;
        }

        if (data.creditsRemaining !== undefined) {
          this.credits = data.creditsRemaining;
          this.updateCreditsDisplay();
        }

        if (data.jobId) {
          promptEl.value = "";
          this.updateCharCount();
          await this.pollStatus(data.jobId, prompt, placeholderId);
        } else {
          this.removeLoadingPlaceholder(placeholderId);
        }
      } catch (err) {
        console.error("Generate failed:", err);
        this.removeLoadingPlaceholder(placeholderId);
        this.showToast("Something went wrong. Please try again.");
      } finally {
        this.activeJobs = Math.max(0, this.activeJobs - 1);
        this.updateGenerateBtn();
      }
    }

    updateGenerateBtn() {
      const text = this.el("tattup-generate-text");
      if (text) text.textContent = this.activeJobs > 0 ? `Generate (${this.activeJobs} running)` : "Generate";
    }

    // ─── Loading Placeholders ───

    addLoadingPlaceholder(id) {
      const emptyEl = this.el("tattup-gallery-empty");
      if (emptyEl) emptyEl.style.display = "none";
      const gridEl = this.el("tattup-gallery-grid");
      if (!gridEl) return;
      const div = document.createElement("div");
      div.className = "tattup-gallery-item is-loading";
      div.id = id;
      div.innerHTML = '<div class="tattup-spinner-sm"></div><span class="tattup-loading-text">Generating...</span>';
      gridEl.prepend(div);
    }

    removeLoadingPlaceholder(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
      // Show empty state if no items left
      const gridEl = this.el("tattup-gallery-grid");
      const emptyEl = this.el("tattup-gallery-empty");
      if (gridEl && gridEl.children.length === 0 && emptyEl) emptyEl.style.display = "";
    }

    replaceLoadingWithImage(id, item) {
      const el = document.getElementById(id);
      if (!el) {
        this.addToGallery(item);
        return;
      }
      el.classList.remove("is-loading");
      el.id = "";
      el.innerHTML = this.renderGalleryItemInner(item);
    }

    // ─── Poll Status ───

    async pollStatus(jobId, prompt, placeholderId) {
      let polls = 0;
      const loadingText = document.querySelector(`#${placeholderId} .tattup-loading-text`);

      while (polls < MAX_POLLS) {
        try {
          const data = await this.api(`/status/${jobId}`);

          if (data.status === "completed" && data.imageUrl) {
            const item = { prompt, imageUrl: data.imageUrl };
            this.gallery.unshift(item);
            this.replaceLoadingWithImage(placeholderId, item);
            if (data.creditsRemaining !== undefined) {
              this.credits = data.creditsRemaining;
              this.updateCreditsDisplay();
            }
            return;
          }

          if (data.status === "failed") {
            this.removeLoadingPlaceholder(placeholderId);
            this.showToast("Generation failed. Please try again.");
            return;
          }

          if (loadingText) {
            loadingText.textContent = data.status === "processing" ? "AI is working..." : "Waiting in queue...";
          }
        } catch (err) {
          console.error("Poll error:", err);
        }

        polls++;
        await this.sleep(POLL_INTERVAL);
      }

      this.removeLoadingPlaceholder(placeholderId);
      this.showToast("Generation timed out. Please try again.");
    }

    // ─── Gallery ───

    async fetchGallery() {
      try {
        const data = await this.api("/gallery");
        if (data.tattoos?.length) {
          this.gallery = data.tattoos;
          this.renderGallery();
        }
      } catch (err) {
        console.error("Failed to fetch gallery:", err);
      }
    }

    addToGallery(item) {
      this.gallery.unshift(item);
      this.renderGallery();
    }

    renderGalleryItemInner(item) {
      const esc = (s) => this.escapeHtml(s);
      return `
        <img src="${esc(item.imageUrl)}" alt="Generated tattoo" loading="lazy" />
        <div class="tattup-img-overlay">
          <button class="tattup-overlay-btn primary" data-image-url="${esc(item.imageUrl)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            Test Your Design
          </button>
        </div>
        <div class="tattup-gallery-item-info">
          <button class="tattup-prompt-toggle">
            <span>Prompt</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div class="tattup-prompt-detail">
            ${esc(item.prompt || "")}
            <br/>
            <button class="tattup-prompt-copy" data-prompt="${esc(item.prompt || "")}">Copy prompt</button>
          </div>
        </div>`;
    }

    renderGallery() {
      const emptyEl = this.el("tattup-gallery-empty");
      const gridEl = this.el("tattup-gallery-grid");
      if (!gridEl) return;

      if (this.gallery.length === 0) {
        if (emptyEl) emptyEl.style.display = "";
        gridEl.innerHTML = "";
        return;
      }

      if (emptyEl) emptyEl.style.display = "none";
      gridEl.innerHTML = this.gallery.map((item) =>
        `<div class="tattup-gallery-item">${this.renderGalleryItemInner(item)}</div>`
      ).join("");
    }

    // ─── Test Your Design ───

    testDesign(imageUrl) {
      // For now, open the image in a new tab for preview/visualization
      // This will be replaced with a proper AR/visualization tool later
      window.open(imageUrl, "_blank");
    }

    // ─── Toast (generic error) ───

    showToast(msg) {
      const toast = this.el("tattup-toast");
      if (!toast) return;
      toast.textContent = msg;
      toast.classList.add("visible");
      setTimeout(() => toast.classList.remove("visible"), 4000);
    }

    // ─── Buy Credits Modal ───

    showBuyModal() {
      const modal = this.el("tattup-buy-modal");
      if (modal) modal.style.display = "";
    }

    hideBuyModal() {
      const modal = this.el("tattup-buy-modal");
      if (modal) modal.style.display = "none";
      const status = this.el("tattup-cart-status");
      if (status) status.style.display = "none";
    }

    async addToCart(variantId, sellingPlanId, clickedBtn) {
      const statusEl = this.el("tattup-cart-status");
      const allBtns = document.querySelectorAll(".tattup-package-btn");
      allBtns.forEach((btn) => { btn.disabled = true; btn.style.opacity = "0.5"; });
      if (clickedBtn) {
        const nameEl = clickedBtn.querySelector(".tattup-package-name");
        if (nameEl) { nameEl.dataset.origText = nameEl.textContent; nameEl.textContent = "Adding to cart..."; }
      }

      try {
        const body = { id: parseInt(variantId, 10), quantity: 1 };
        if (sellingPlanId) body.selling_plan = parseInt(sellingPlanId, 10);
        const response = await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error("Failed");

        if (clickedBtn) {
          const nameEl = clickedBtn.querySelector(".tattup-package-name");
          if (nameEl) nameEl.textContent = "Redirecting...";
        }
        if (statusEl) {
          statusEl.className = "tattup-cart-status success";
          statusEl.textContent = "Added to cart! Redirecting...";
          statusEl.style.display = "";
        }
        setTimeout(() => { window.location.href = "/cart"; }, 1000);
      } catch (err) {
        console.error("Add to cart failed:", err);
        allBtns.forEach((btn) => { btn.disabled = false; btn.style.opacity = ""; });
        if (clickedBtn) {
          const nameEl = clickedBtn.querySelector(".tattup-package-name");
          if (nameEl && nameEl.dataset.origText) nameEl.textContent = nameEl.dataset.origText;
        }
        if (statusEl) {
          statusEl.className = "tattup-cart-status error";
          statusEl.textContent = "Failed to add to cart. Please try again.";
          statusEl.style.display = "";
        }
      }
    }

    // ─── Helpers ───

    sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

    escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }
  }

  function boot() {
    const container = document.getElementById("tattup-app");
    if (container) new TattupApp(container);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
