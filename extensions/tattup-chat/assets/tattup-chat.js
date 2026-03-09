(function () {
  "use strict";

  const POLL_INTERVAL = 3000; // 3 seconds
  const MAX_POLLS = 120; // 6 minutes max

  class TattupApp {
    constructor(container) {
      this.container = container;
      this.proxyBase = container.dataset.proxyBase || "/apps/tattup";
      this.loggedIn = container.dataset.loggedIn === "true";
      this.tattooVariantId = container.dataset.tattooVariantId || null;
      this.credits = 0;
      this.generating = false;
      this.gallery = [];

      if (this.loggedIn) {
        this.init();
      }
    }

    // ─── Elements ───

    el(id) {
      return document.getElementById(id);
    }

    // ─── Init ───

    async init() {
      this.bindEvents();
      await this.fetchCredits();
      await this.fetchGallery();
    }

    bindEvents() {
      // Generate button
      const genBtn = this.el("tattup-generate-btn");
      if (genBtn) {
        genBtn.addEventListener("click", () => this.generate());
      }

      // Enter key in textarea
      const textarea = this.el("tattup-prompt");
      if (textarea) {
        textarea.addEventListener("keydown", (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            this.generate();
          }
        });
      }

      // Credits badge → open buy modal
      const badge = this.el("tattup-credits-badge");
      if (badge) {
        badge.addEventListener("click", () => this.showBuyModal());
      }

      // Modal close
      const closeBtn = this.el("tattup-modal-close");
      if (closeBtn) {
        closeBtn.addEventListener("click", () => this.hideBuyModal());
      }

      // Modal overlay click
      const overlay = this.el("tattup-buy-modal");
      if (overlay) {
        overlay.addEventListener("click", (e) => {
          if (e.target === overlay) this.hideBuyModal();
        });
      }

      // Package buttons
      document.querySelectorAll(".tattup-package-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const variantId = btn.dataset.variantId;
          const sellingPlanId = btn.dataset.sellingPlanId;
          this.addToCart(variantId, sellingPlanId, btn);
        });
      });

      // Gallery "Book" button (event delegation)
      const gridEl = this.el("tattup-gallery-grid");
      if (gridEl) {
        gridEl.addEventListener("click", (e) => {
          const btn = e.target.closest(".tattup-gallery-book-btn");
          if (!btn) return;
          const imageUrl = btn.dataset.imageUrl;
          const prompt = btn.dataset.prompt;
          this.bookTattooDesign(imageUrl, prompt, btn);
        });
      }
    }

    // ─── API Calls ───

    async api(path, options = {}) {
      const url = `${this.proxyBase}${path}`;
      const response = await fetch(url, {
        headers: { "Content-Type": "application/json" },
        ...options,
      });
      return response.json();
    }

    // ─── Credits ───

    async fetchCredits() {
      try {
        const data = await this.api("/credits");
        this.credits = data.credits || 0;
        this.updateCreditsDisplay();
      } catch (err) {
        console.error("Failed to fetch credits:", err);
      }
    }

    updateCreditsDisplay() {
      const el = this.el("tattup-credit-count");
      if (el) el.textContent = this.credits;
    }

    // ─── Generate ───

    async generate() {
      if (this.generating) return;

      const promptEl = this.el("tattup-prompt");
      const modelEl = this.el("tattup-model");
      const styleEl = this.el("tattup-style");

      const prompt = promptEl?.value?.trim();
      if (!prompt) {
        promptEl?.focus();
        return;
      }

      const model = modelEl?.value || "standard";
      const style = styleEl?.value || "";
      const cost = model === "pro" ? 2 : 1;

      // Check credits
      if (this.credits < cost) {
        this.showBuyModal();
        return;
      }

      this.setGenerating(true);

      try {
        const data = await this.api("/generate", {
          method: "POST",
          body: JSON.stringify({ prompt, model, style }),
        });

        if (data.error) {
          if (data.credits !== undefined || data.required !== undefined) {
            this.showBuyModal();
            return;
          }
          throw new Error(data.error);
        }

        // Update credits from response
        if (data.creditsRemaining !== undefined) {
          this.credits = data.creditsRemaining;
          this.updateCreditsDisplay();
        }

        // Start polling
        if (data.jobId) {
          promptEl.value = "";
          await this.pollStatus(data.jobId, prompt);
        }
      } catch (err) {
        console.error("Generate failed:", err);
        this.showStatus("Generation failed. Please try again.", true);
        // Refetch credits in case deduction happened
        await this.fetchCredits();
      } finally {
        this.setGenerating(false);
      }
    }

    setGenerating(active) {
      this.generating = active;
      const btn = this.el("tattup-generate-btn");
      const text = this.el("tattup-generate-text");
      if (btn) btn.disabled = active;
      if (text) text.textContent = active ? "Generating..." : "Generate";
    }

    // ─── Poll Status ───

    async pollStatus(jobId, prompt) {
      this.showStatus("Generating your tattoo...");

      let polls = 0;
      while (polls < MAX_POLLS) {
        try {
          const data = await this.api(`/status/${jobId}`);

          if (data.status === "completed" && data.imageUrl) {
            this.hideStatus();
            this.addToGallery({ prompt, imageUrl: data.imageUrl });
            return;
          }

          if (data.status === "failed") {
            this.showStatus("Generation failed. Please try again.", true);
            return;
          }

          // Update status text
          const statusText =
            data.status === "processing"
              ? "AI is working on your tattoo..."
              : "Waiting in queue...";
          this.showStatus(statusText);
        } catch (err) {
          console.error("Poll error:", err);
        }

        polls++;
        await this.sleep(POLL_INTERVAL);
      }

      this.showStatus("Generation timed out. Please try again.", true);
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

      gridEl.innerHTML = this.gallery
        .map(
          (item) => `
        <div class="tattup-gallery-item">
          <img src="${this.escapeHtml(item.imageUrl)}" alt="Generated tattoo" loading="lazy" />
          <div class="tattup-gallery-item-info">
            <div class="tattup-gallery-item-prompt">${this.escapeHtml(item.prompt || "")}</div>
            ${this.tattooVariantId ? `
            <button
              class="tattup-gallery-book-btn"
              data-image-url="${this.escapeHtml(item.imageUrl)}"
              data-prompt="${this.escapeHtml(item.prompt || "")}"
            >Book This Design</button>` : ""}
          </div>
        </div>
      `
        )
        .join("");
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

    async bookTattooDesign(imageUrl, prompt, btn) {
      if (!this.tattooVariantId) return;

      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Adding...";

      try {
        const response = await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: parseInt(this.tattooVariantId, 10),
            quantity: 1,
            properties: {
              "Design Image": imageUrl,
              Prompt: prompt,
            },
          }),
        });

        if (!response.ok) throw new Error("Failed to add to cart");

        btn.textContent = "Redirecting...";
        setTimeout(() => {
          window.location.href = "/cart";
        }, 800);
      } catch (err) {
        console.error("Book design failed:", err);
        btn.disabled = false;
        btn.textContent = origText;
      }
    }

    async addToCart(variantId, sellingPlanId, clickedBtn) {
      const statusEl = this.el("tattup-cart-status");

      // Disable all package buttons and show loading on clicked one
      const allBtns = document.querySelectorAll(".tattup-package-btn");
      allBtns.forEach((btn) => {
        btn.disabled = true;
        btn.style.opacity = "0.5";
        btn.style.pointerEvents = "none";
      });
      if (clickedBtn) {
        clickedBtn.classList.add("tattup-loading");
        const nameEl = clickedBtn.querySelector(".tattup-package-name");
        if (nameEl) nameEl.dataset.origText = nameEl.textContent;
        if (nameEl) nameEl.textContent = "Adding to cart...";
      }

      try {
        const body = { id: parseInt(variantId, 10), quantity: 1 };
        if (sellingPlanId) {
          body.selling_plan = parseInt(sellingPlanId, 10);
        }

        const response = await fetch("/cart/add.js", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (!response.ok) throw new Error("Failed to add to cart");

        if (clickedBtn) {
          const nameEl = clickedBtn.querySelector(".tattup-package-name");
          if (nameEl) nameEl.textContent = "Redirecting to cart...";
        }

        if (statusEl) {
          statusEl.className = "tattup-cart-status success";
          statusEl.textContent = "Added to cart! Redirecting...";
          statusEl.style.display = "";
        }

        // Redirect to cart after a short delay
        setTimeout(() => {
          window.location.href = "/cart";
        }, 1000);
      } catch (err) {
        console.error("Add to cart failed:", err);
        // Re-enable buttons
        allBtns.forEach((btn) => {
          btn.disabled = false;
          btn.style.opacity = "";
          btn.style.pointerEvents = "";
        });
        if (clickedBtn) {
          clickedBtn.classList.remove("tattup-loading");
          const nameEl = clickedBtn.querySelector(".tattup-package-name");
          if (nameEl && nameEl.dataset.origText) {
            nameEl.textContent = nameEl.dataset.origText;
          }
        }
        if (statusEl) {
          statusEl.className = "tattup-cart-status error";
          statusEl.textContent = "Failed to add to cart. Please try again.";
          statusEl.style.display = "";
        }
      }
    }

    // ─── Status Display ───

    showStatus(text, isError = false) {
      const el = this.el("tattup-status");
      const textEl = this.el("tattup-status-text");
      if (el) {
        el.style.display = "";
        if (isError) {
          el.style.borderColor = "var(--tattup-danger)";
        } else {
          el.style.borderColor = "";
        }
      }
      if (textEl) textEl.textContent = text;
    }

    hideStatus() {
      const el = this.el("tattup-status");
      if (el) el.style.display = "none";
    }

    // ─── Helpers ───

    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    }

    escapeHtml(str) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    }
  }

  // ─── Bootstrap ───

  function boot() {
    const container = document.getElementById("tattup-app");
    if (container) {
      new TattupApp(container);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
