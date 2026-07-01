(() => {
  let deferredInstallPrompt = null;

  const isIOS = () => {
    const ua = window.navigator.userAgent.toLowerCase();
    return /iphone|ipad|ipod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  };

  const isAndroid = () => /android/.test(window.navigator.userAgent.toLowerCase());
  const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

  function installCopy() {
    if (isStandalone()) {
      return "Installed on this device.";
    }
    if (isIOS()) {
      return "Tap the Share button, then choose Add to Home Screen.";
    }
    if (deferredInstallPrompt) {
      return "Install the planner for quick access when signal is poor.";
    }
    if (isAndroid()) {
      return "Open in Chrome and use the browser install option if shown.";
    }
    return "Open this site on your phone to add it to your Home Screen.";
  }

  function renderInstallPanel() {
    const help = document.getElementById("installHelp");
    const button = document.getElementById("installButton");
    if (!help || !button) return;

    help.textContent = installCopy();
    button.hidden = isStandalone() || isIOS() || !deferredInstallPrompt;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderInstallPanel();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    renderInstallPanel();
  });

  window.addEventListener("DOMContentLoaded", () => {
    renderInstallPanel();

    document.getElementById("installButton")?.addEventListener("click", async () => {
      if (!deferredInstallPrompt) return;
      const promptEvent = deferredInstallPrompt;
      deferredInstallPrompt = null;
      promptEvent.prompt();
      await promptEvent.userChoice.catch(() => null);
      renderInstallPanel();
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
