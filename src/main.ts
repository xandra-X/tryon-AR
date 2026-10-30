import { explainConnectionError } from './connection-errors';
import { connectionDiagnostics } from './connection-diagnostics';
import { createDecartClient, models, type RealTimeClient } from '@decartai/sdk';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const camera = $<HTMLVideoElement>('camera');
const output = $<HTMLVideoElement>('output');
const start = $<HTMLButtonElement>('start');
const apply = $<HTMLButtonElement>('apply');
const dialog = $<HTMLDialogElement>('settings-dialog');
const fileInput = $<HTMLInputElement>('file');
const keyInput = $<HTMLInputElement>('api-key');
const prompt = $<HTMLTextAreaElement>('prompt');
let apiKey = '';
let stream: MediaStream | null = null;
let session: RealTimeClient | null = null;
let outfit: File | null = null;
let outfitURL = '';
let busy = false;
let openingCamera = false;
let epoch = 0;
let clock: ReturnType<typeof setInterval> | undefined;
let sessionStarted = 0;
let lastActivity = Date.now();

function message(text: string, error = false) {
  if (apiKey) text = text.split(apiKey).join('[redacted]');
  text = text.replace(/(api_key[=:]\s*)[^\s&]+/gi, '$1[redacted]');
  $('message').textContent = text;
  $('connection-feedback').hidden = !error;
  $('connection-feedback-text').textContent = error ? text : '';
  $('message').classList.toggle('error', error);
}
function status(text: string, live = false) {
  const indicator = $('status');
  indicator.replaceChildren(Object.assign(document.createElement('i')), document.createTextNode(text));
  indicator.dataset.live = String(live);
}
function controls() {
  start.hidden = !!session;
  start.disabled = busy || openingCamera || !outfit;
  start.textContent = busy ? 'Connecting…' : 'Start live try-on ↗';
  apply.hidden = !session;
  apply.disabled = busy || !outfit;
  $('stop').hidden = !session && !busy;
  $('camera-off').hidden = !stream || busy;
  fileInput.disabled = busy;
  $('remove').hidden = !!session || busy;
  $('settings').toggleAttribute('disabled', busy || !!session);
}
function explain(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError') return 'Camera access was denied. Allow this site to use your camera in browser settings, then try again.';
    if (error.name === 'NotFoundError') return 'No camera was found. Connect a webcam and try again.';
    if (error.name === 'NotReadableError') return 'Your camera is busy. Close other apps using it and try again.';
  }
  return explainConnectionError(error);
}
async function enableCamera() {
  if (stream) return true;
  if (openingCamera) return false;
  const attempt = epoch;
  openingCamera = true;
  controls();
  const enable = $<HTMLButtonElement>('enable-camera');
  enable.disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera access requires localhost or HTTPS. Open this app through its local server.');
    const incoming = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 } } });
    if (attempt !== epoch) { incoming.getTracks().forEach(t => t.stop()); return false; }
    stream = incoming;
    camera.srcObject = stream;
    await camera.play();
    $('empty').hidden = true;
    status('CAMERA PREVIEW');
    stream.getVideoTracks()[0].addEventListener('ended', () => {
      if (stream === incoming) { stopCamera(); message('The camera was disconnected. Enable it again to continue.', true); }
    });
    message('Camera ready. Add an outfit and start your live session.');
    return true;
  } catch (error) {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
    camera.srcObject = null;
    $('empty').hidden = false;
    message(explain(error), true);
    return false;
  } finally { openingCamera = false; enable.disabled = false; controls(); }
}
function stopSession(note = 'Live session ended. Your camera preview stays local.') {
  ++epoch;
  const old = session;
  session = null;
  old?.disconnect();
  clearInterval(clock);
  clock = undefined;
  output.srcObject = null;
  $('timer').textContent = '00:00';
  $('stage-hint').textContent = 'Stand back so your upper body is visible';
  document.querySelector('.stage')!.classList.remove('live');
  busy = false;
  status(stream ? 'CAMERA PREVIEW' : 'CAMERA OFF');
  message(note);
  controls();
}
function stopCamera() {
  stopSession('Camera off.');
  const old = stream;
  stream = null;
  old?.getTracks().forEach(t => t.stop());
  camera.srcObject = null;
  $('empty').hidden = false;
  status('CAMERA OFF');
  controls();
}
function outfitPrompt() {
  return prompt.value.trim() || 'Replace the person’s clothing with the outfit in the reference image. Preserve their face, identity, pose, and background.';
}
async function selectOutfit(file?: File) {
  if (!file || busy) return;
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { message('Choose a JPG, PNG, or WebP image.', true); return; }
  if (file.size > 15 * 1024 * 1024) { message('Choose an image smaller than 15 MB.', true); return; }
  try { const bitmap = await createImageBitmap(file); bitmap.close(); }
  catch { message('That image could not be read. Choose another file.', true); return; }
  if (outfitURL) URL.revokeObjectURL(outfitURL);
  outfit = file;
  outfitURL = URL.createObjectURL(file);
  const image = $<HTMLImageElement>('garment');
  image.src = outfitURL;
  image.hidden = false;
  $('drop-copy').hidden = true;
  $('garment-meta').hidden = false;
  $('filename').textContent = file.name;
  message(session ? 'New outfit ready. Click Apply new outfit to switch.' : 'Outfit ready. Start your live try-on when you’re ready.');
  controls();
}
async function connect() {
  if (busy || session || !outfit) return;
  if (!apiKey) { dialog.showModal(); keyInput.focus(); return; }
  const attempt = epoch;
  const selectedOutfit = outfit;
  const diagnostics = connectionDiagnostics();
  busy = true;
  controls();
  try {
    if (!await enableCamera() || attempt !== epoch) return;
    status('CONNECTING TO AI');
    message('Connecting your live fitting room…');
    $('stage-hint').textContent = 'Connecting to Decart AI…';
    const client = createDecartClient({ apiKey, logger: diagnostics.logger });
    const active = await client.realtime.connect(stream!, {
      model: models.realtime('lucy-vton-latest'),
      mirror: true,
      retries: 0,
      capacityRetryBudgetMs: 30000,
      onQueuePosition: () => {
        if (attempt === epoch) message('Waiting for an available AI session…');
      },
      onCapacityWait: () => {
        if (attempt === epoch) message('Decart is at capacity. Retrying for up to 30 seconds…');
      },
      onRemoteStream: remote => {
        if (attempt !== epoch) return;
        output.srcObject = remote;
        void output.play().catch(() => message('Click the fitting room to resume video playback.'));
        document.querySelector('.stage')!.classList.add('live');
        status('LIVE TRY-ON', true);
      },
      onConnectionChange: state => {
        if (attempt !== epoch) return;
        if (state === 'disconnected') {
          if (!session) return;
          const disconnectedSession = session;
          queueMicrotask(() => {
            if (attempt === epoch && session === disconnectedSession) {
              stopSession();
              message('The live connection was interrupted. Try again. If this repeats in the in-app browser, open this address in Chrome.', true);
            }
          });
        } else status(state === 'connected' || state === 'generating' ? 'AI CONNECTED' : state.toUpperCase(), state === 'connected' || state === 'generating');
      },
    });
    if (attempt !== epoch) { active.disconnect(); return; }
    session = active;
    if (!active.isConnected()) throw new Error('The AI session closed before it was ready. Please try again.');
    sessionStarted = Date.now();
    lastActivity = Date.now();
    clock = setInterval(() => {
      const seconds = Math.floor((Date.now() - sessionStarted) / 1000);
      $('timer').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      if (Date.now() - lastActivity > 5 * 60 * 1000) stopSession('Session stopped after 5 minutes without interaction to avoid unused API charges.');
    }, 1000);
    active.on('error', error => { if (session === active) { stopSession(); message(explain(error), true); } });
    active.on('sessionEnded', ({ reason }) => {
      if (session !== active) return;
      stopSession();
      message(reason === 'session_limit'
        ? 'Decart session limit reached. End other Decart or Anywear sessions using this account, then try again.'
        : `Decart ended the live session (${reason}). Check your account access and selected outfit.`, true);
    });
    message('AI connected. Sending your outfit…');
    await active.setImage(selectedOutfit, { prompt: outfitPrompt(), enhance: false });
    if (attempt !== epoch || session !== active) return;
    $('stage-hint').textContent = 'Your AI fitting room · switch outfits anytime';
    message(output.srcObject ? 'You’re live. Move naturally, or upload another outfit to switch.' : 'Outfit accepted. Waiting for live video from Decart…');
  } catch (error) {
    if (attempt === epoch) { stopSession(); message(explain(diagnostics.error(error)), true); }
  } finally { if (attempt === epoch || !session) { busy = false; controls(); } }
}
$('enable-camera').addEventListener('click', () => void enableCamera());
$('settings').addEventListener('click', () => { dialog.showModal(); keyInput.focus(); });
$('close-settings').addEventListener('click', () => dialog.close());
$('settings-form').addEventListener('submit', event => {
  event.preventDefault();
  apiKey = keyInput.value.trim();
  keyInput.value = '';
  if (apiKey) { dialog.close(); message('API key ready for this tab. Click Start live try-on to connect.'); }
});
fileInput.addEventListener('change', () => { void selectOutfit(fileInput.files?.[0]); fileInput.value = ''; });
const zone = $('dropzone');
zone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!busy) fileInput.click(); } });
for (const name of ['dragenter', 'dragover']) zone.addEventListener(name, event => { event.preventDefault(); zone.classList.add('dragging'); });
zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
zone.addEventListener('drop', event => { event.preventDefault(); zone.classList.remove('dragging'); void selectOutfit(event.dataTransfer?.files[0]); });
$('remove').addEventListener('click', () => {
  if (busy || session) return;
  outfit = null;
  URL.revokeObjectURL(outfitURL);
  outfitURL = '';
  $<HTMLImageElement>('garment').removeAttribute('src');
  $('garment').hidden = true;
  $('drop-copy').hidden = false;
  $('garment-meta').hidden = true;
  controls();
  message('Choose another outfit.');
});
start.addEventListener('click', () => void connect());
apply.addEventListener('click', async () => {
  const active = session;
  if (!active || !outfit || busy) return;
  busy = true;
  controls();
  message('Applying your new outfit…');
  try {
    await active.setImage(outfit, { prompt: outfitPrompt(), enhance: false });
    if (session === active) message('New outfit applied.');
  } catch (error) { if (session === active) message(explain(error), true); }
  finally { if (session === active) { busy = false; controls(); } }
});
$('stop').addEventListener('click', () => {
  if (busy && !session) stopCamera();
  else stopSession();
});
$('camera-off').addEventListener('click', stopCamera);
$('fullscreen').addEventListener('click', async () => {
  try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.querySelector('.stage')!.requestFullscreen(); }
  catch { message('Fullscreen is not available in this browser.', true); }
});
output.addEventListener('click', () => void output.play());
for (const name of ['pointerdown', 'keydown']) window.addEventListener(name, () => { lastActivity = Date.now(); });
window.addEventListener('pagehide', () => { stopCamera(); apiKey = ''; });
controls();
