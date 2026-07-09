// St. Mary's Bank — shared site behavior

document.addEventListener("DOMContentLoaded", () => {
  // Mobile nav toggle
  const toggle = document.querySelector(".menu-toggle");
  const nav = document.querySelector(".main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Footer year
  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // Basic client-side validation for any form with data-validate
  document.querySelectorAll("form[data-validate]").forEach((form) => {
    const successBox = form.querySelector(".form-success");

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      let valid = true;

      form.querySelectorAll("[data-required]").forEach((field) => {
        const errorEl = form.querySelector(`[data-error-for="${field.id}"]`);
        const value = field.value.trim();
        let message = "";

        if (!value) {
          message = "This field is required.";
        } else if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          message = "Enter a valid email address.";
        } else if (field.type === "tel" && !/^[0-9()+\-.\s]{7,}$/.test(value)) {
          message = "Enter a valid phone number.";
        }

        if (errorEl) errorEl.textContent = message;
        if (message) valid = false;
      });

      if (valid) {
        form.reset();
        if (successBox) {
          successBox.classList.add("visible");
          successBox.setAttribute("tabindex", "-1");
          successBox.focus();
        }
      }
    });
  });
});
