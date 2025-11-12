/* ===============================================================
   Final Semester Study Guide — Mobile bootstrap
   - Reuse the shared desktop engine
   - Add small mobile-only enhancements
=============================================================== */
import "/static/desktop/desktop_script.js";

/* Mobile glue: make the whole option card tappable and keep
   the button states in sync without changing shared logic. */
document.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("is-mobile");

  const form = document.getElementById("optionsForm");
  if (form) {
    form.addEventListener("click", (e) => {
      const card = e.target.closest(".opt");
      if (!card) return;

      const input = card.querySelector("input");
      if (!input) return;

      if (input.type === "radio") {
        if (!input.checked) {
          input.checked = true;
          input.dispatchEvent(new Event("change", { bubbles: true }));
        }
      } else if (input.type === "checkbox") {
        input.checked = !input.checked;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
  }

  // Ensure the restart button on the summary is prominent and ready
  const restartTop = document.getElementById("restartBtnSummary");
  if (restartTop) {
    // The shared engine already wires up #restartBtnSummary.
    // If it was hidden initially, just ensure it gets unhidden when summary shows.
    const summary = document.getElementById("summary");
    const observer = new MutationObserver(() => {
      if (!summary.classList.contains("hidden")) {
        restartTop.classList.remove("hidden");
      }
    });
    observer.observe(summary, { attributes: true, attributeFilter: ["class"] });
  }
});
