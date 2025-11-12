/* Mobile bootstrap: import shared engine & add tap-friendly behavior */
import "/static/desktop/desktop_script.js";

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

  const restartTop = document.getElementById("restartBtnSummary");
  const summary = document.getElementById("summary");
  if (restartTop && summary) {
    const obs = new MutationObserver(() => {
      if (!summary.classList.contains("hidden")) restartTop.classList.remove("hidden");
    });
    obs.observe(summary, { attributes: true, attributeFilter: ["class"] });
  }
});
