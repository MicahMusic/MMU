// MMU interactions: mobile menu + expandable cards + active tab highlight

function setActiveNav() {
  const path = (location.pathname || "").toLowerCase();
  document.querySelectorAll(".pill").forEach(a => {
    const href = (a.getAttribute("href") || "").toLowerCase();
    if (!href) return;
    if (path.endsWith("/" + href) || path.endsWith(href)) a.classList.add("active");
  });
}

function setupDrawer() {
  const drawer = document.getElementById("mmuDrawer");
  const openBtn = document.getElementById("mmuOpen");
  const closeBtn = document.getElementById("mmuClose");

  if (!drawer || !openBtn || !closeBtn) return;

  const open = () => drawer.classList.add("open");
  const close = () => drawer.classList.remove("open");

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);

  // close when clicking backdrop
  drawer.addEventListener("click", (e) => {
    if (e.target === drawer) close();
  });

  // close on escape
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
}

function setupExpandableCards() {
  document.querySelectorAll('[data-expand="card"]').forEach(card => {
    card.style.cursor = "pointer";
    card.addEventListener("click", (e) => {
      // if user clicked a link/button, don't toggle
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "a" || tag === "button") return;

      // collapse others for a clean feel
      document.querySelectorAll(".card.expanded").forEach(c => {
        if (c !== card) c.classList.remove("expanded");
      });
      card.classList.toggle("expanded");
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  setActiveNav();
  setupDrawer();
  setupExpandableCards();
});
