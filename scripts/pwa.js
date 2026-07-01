(() => {
  let deferredInstallPrompt = null;

  const isIOS = () => {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  };

  const isAndroid = () => /android/.test(window.navigator.userAgent.toLowerCase());
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  function canOfferInstall() {
    return !isStandalone() && (isIOS() || Boolean(deferredInstallPrompt));
  }

  function renderInstallButton() {
    const button = document.getElementById("installFab");
    if (!button) return;
    button.hidden = !canOfferInstall();
  }

  function setIOSDialog(open) {
    const dialog = document.getElementById("iosInstallDialog");
    if (!dialog) return;
    dialog.hidden = !open;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    renderInstallButton();
    setIOSDialog(false);
  });

  window.addEventListener("DOMContentLoaded", () => {
    renderInstallButton();

    document.getElementById("installFab")?.addEventListener("click", async () => {
      if (isIOS()) {
        setIOSDialog(true);
        return;
      }

      if (!deferredInstallPrompt) return;
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      await promptEvent.userChoice.catch(() => null);
      renderInstallButton();
    });

    document.getElementById("iosInstallDialog")?.addEventListener("click", (event) => {
      if (event.target.id === "iosInstallDialog" || event.target.closest("[data-install-close]")) {
        setIOSDialog(false);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") setIOSDialog(false);
    });
  });

  if (!("serviceWorker" in navigator)) return;
  if (!["http:", "https:"].includes(window.location.protocol)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js", { scope: "./" }).catch(() => {
      // The site works normally without install support.
    });
  });
})();
