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

  // Set when the user taps "Перезапустить": that tap is the signal to reload, even in the very
  // session where the app was first installed (when there was no previous controller).
  let updateRequested = false;
  // The banner is shown once; if a second release lands before the tap, the first worker is
  // already discarded, so the message goes to whichever worker is waiting at that moment.
  const offerUpdate = (worker) => showUpdateBanner(() => {
    updateRequested = true;
    (registration.waiting ?? worker).postMessage({ type: 'SKIP_WAITING' });
  });

  // A new version was downloaded earlier and is waiting.
  if (registration.waiting && hadController) offerUpdate(registration.waiting);

  // A new version is being downloaded now.
  registration.addEventListener('updatefound', () => {
    const worker = registration.installing;
    worker?.addEventListener('statechange', () => {
      if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
    });
  });

  // The new version took over → reload once to run its code. Not on the very first install,
  // unless the user asked for the update.
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || !(hadController || updateRequested)) return;
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
  document.body.classList.add('has-update-banner'); // extra bottom padding, so the banner covers nothing
}

const VERSION_TIMEOUT_MS = 1000;

/**
 * Version of the service worker that serves this page, i.e. of the installed app.
 * null when there is no service worker (local run) or it does not answer.
 */
export function installedVersion() {
  const controller = navigator.serviceWorker?.controller;
  if (!controller) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), VERSION_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(typeof event.data === 'string' ? event.data : null);
    };
    controller.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
  });
}

/**
 * Asks the server for a new version right now. Returns 'found' (the "Доступно обновление" banner
 * will appear), 'latest', 'offline' (the check failed) or 'unsupported' (no service worker).
 */
export async function checkForUpdate() {
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return 'unsupported';
  try {
    await registration.update();
  } catch {
    return 'offline';
  }
  return registration.installing || registration.waiting ? 'found' : 'latest';
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
