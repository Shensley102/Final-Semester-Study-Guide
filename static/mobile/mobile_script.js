/* ===============================================================
   Final Semester Study Guide — Mobile bootstrap
   Uses the SHARED engine (desktop_script.js) which now implements
   UNTIL-MASTERY runs. This file only adds mobile UX glue.
=============================================================== */

// Import the shared engine (contains the until-mastery logic)
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

  // Ensure the top "Start New Quiz" button becomes visible on summary
  const restartTop = document.getElementById("restartBtnSummary");
  const summary = document.getElementById("summary");
  if (restartTop && summary) {
    const observer = new MutationObserver(() => {
      if (!summary.classList.contains("hidden")) {
        restartTop.classList.remove("hidden");
      }
    });
    observer.observe(summary, { attributes: true, attributeFilter: ["class"] });
  }
});
