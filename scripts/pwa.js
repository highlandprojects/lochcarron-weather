(() => {
  if (!("serviceWorker" in navigator)) return;
  if (!["http:", "https:"].includes(window.location.protocol)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(() => {
      // The site works normally without install support.
    });
  });
})();
