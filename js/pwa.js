/**
 * PWA plumbing: service worker registration, the "update available" banner
 * and asking the browser to keep our storage (navigator.storage.persist()).
 */

/**
 * The service worker is enabled on HTTPS (GitHub Pages). Locally it is off, so edits show up
 * on reload; add `?sw` to the URL (http://localhost:8000/?sw) to test offline mode on the Mac.
 * Over http://192.168.x.x browsers do not allow service workers at all.
 */
export function shouldUseServiceWorker(location = window.location) {
  return location.protocol === 'https:' || new URLSearchParams(location.search).has('sw');
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !shouldUseServiceWorker()) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let registration;
  try {
    registration = await navigator.serviceWorker.register('./sw.js');
  } catch (err) {
    console.error('Service worker registration failed', err);
    return;
  }

  const offerUpdate = (worker) => showUpdateBanner(() => worker.postMessage({ type: 'SKIP_WAITING' }));

  // A new version was downloaded earlier and is waiting.
  if (registration.waiting && hadController) offerUpdate(registration.waiting);

  // A new version is being downloaded now.
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  });

  // The new version took over → reload once to run its code. Not on the very first install.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  // A home-screen app can stay open for days: look for updates whenever it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') registration.update().catch(() => {});
  });
}

function showUpdateBanner(onUpdate) {
  if (document.getElementById('update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.className = 'update-banner';
  banner.setAttribute('role', 'status');

  const text = document.createElement('span');
  text.textContent = 'Доступно обновление';

  const button = document.createElement('button');
  button.className = 'btn btn--primary';
  button.textContent = 'Перезапустить';
  button.addEventListener('click', () => {
    button.disabled = true;
    onUpdate();
  });

  banner.append(text, button);
  document.body.append(banner);
}

/**
 * Asks the browser not to evict our data under storage pressure.
 * Returns true/false, or null if the browser does not support the API.
 */
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isStoragePersistent() {
  if (!navigator.storage?.persisted) return null;
  try {
    return await navigator.storage.persisted();
  } catch {
    return null;
  }
}
