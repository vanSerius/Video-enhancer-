import { PRESETS, type Preset } from './presets';
import { runFilter } from './ffmpeg-runner';

interface State {
  file: File | null;
  fileURL: string | null;
  selectedPreset: Preset | null;
  resultURL: string | null;
}

const state: State = {
  file: null,
  fileURL: null,
  selectedPreset: null,
  resultURL: null,
};

function $(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Element #${id} fehlt`);
  return el;
}

function show(id: string) {
  $(id).classList.remove('hidden');
}

function hide(id: string) {
  $(id).classList.add('hidden');
}

function setProgress(ratio: number, text: string) {
  ($('progress-fill') as HTMLDivElement).style.width = `${Math.round(ratio * 100)}%`;
  ($('progress-text') as HTMLParagraphElement).textContent = text;
}

function showError(msg: string) {
  ($('error-text') as HTMLParagraphElement).textContent = msg;
  show('error');
}

function clearError() {
  hide('error');
}

function buildPresetButtons() {
  const grid = $('preset-grid');
  grid.innerHTML = '';
  for (const preset of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn';
    btn.dataset.id = preset.id;
    btn.innerHTML = `<strong>${preset.label}</strong><small>${preset.description}</small>`;
    btn.addEventListener('click', () => selectPreset(preset));
    grid.appendChild(btn);
  }
}

function selectPreset(preset: Preset) {
  state.selectedPreset = preset;
  for (const el of document.querySelectorAll<HTMLButtonElement>('.preset-btn')) {
    el.classList.toggle('selected', el.dataset.id === preset.id);
  }
  ($('run-btn') as HTMLButtonElement).disabled = false;
}

function setFile(file: File) {
  if (state.fileURL) URL.revokeObjectURL(state.fileURL);
  if (state.resultURL) URL.revokeObjectURL(state.resultURL);
  state.file = file;
  state.fileURL = URL.createObjectURL(file);
  state.resultURL = null;

  const before = $('video-before') as HTMLVideoElement;
  before.onerror = () => {
    showError(
      'Browser kann das Video-Format nicht direkt anzeigen (z. B. HEVC/MOV von iPhones). Die Verarbeitung läuft trotzdem — FFmpeg unterstützt die meisten Formate. Klicke auf „Verbessern".',
    );
  };
  before.src = state.fileURL;
  const after = $('video-after') as HTMLVideoElement;
  after.removeAttribute('src');
  after.load();

  show('presets');
  show('action');
  show('preview');
  hide('download');
  hide('progress');
  clearError();

  ($('run-btn') as HTMLButtonElement).disabled = state.selectedPreset === null;
}

function reset() {
  if (state.fileURL) URL.revokeObjectURL(state.fileURL);
  if (state.resultURL) URL.revokeObjectURL(state.resultURL);
  state.file = null;
  state.fileURL = null;
  state.resultURL = null;
  state.selectedPreset = null;
  for (const el of document.querySelectorAll<HTMLButtonElement>('.preset-btn')) {
    el.classList.remove('selected');
  }
  hide('presets');
  hide('action');
  hide('preview');
  hide('progress');
  hide('download');
  clearError();
  ($('file-input') as HTMLInputElement).value = '';
}

async function runEnhancement() {
  if (!state.file || !state.selectedPreset) return;
  clearError();

  const runBtn = $('run-btn') as HTMLButtonElement;
  const resetBtn = $('reset-btn') as HTMLButtonElement;
  runBtn.disabled = true;
  resetBtn.disabled = true;
  show('progress');
  hide('download');
  setProgress(0, 'Wird vorbereitet …');

  try {
    const onProgress = (ratio: number, message: string) => setProgress(ratio, message);

    let blob: Blob;
    if (state.selectedPreset.kind === 'upscale') {
      onProgress(0, 'KI-Modul wird geladen …');
      const { runUpscale } = await import('./upscaler');
      blob = await runUpscale(state.file, onProgress);
    } else {
      blob = await runFilter(state.file, state.selectedPreset.filter!, onProgress);
    }

    state.resultURL = URL.createObjectURL(blob);
    const after = $('video-after') as HTMLVideoElement;
    after.src = state.resultURL;

    const dl = $('download-link') as HTMLAnchorElement;
    dl.href = state.resultURL;
    const baseName = state.file.name.replace(/\.[^.]+$/, '') || 'video';
    dl.download = `${baseName}-${state.selectedPreset.id}.mp4`;
    show('download');
    setProgress(1, 'Fertig.');
  } catch (err) {
    console.error(err);
    showError(`Verarbeitung fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`);
    hide('progress');
  } finally {
    runBtn.disabled = false;
    resetBtn.disabled = false;
  }
}

function setupDropzone() {
  const dz = $('dropzone');
  const input = $('file-input') as HTMLInputElement;

  dz.addEventListener('click', () => input.click());

  dz.addEventListener('dragover', (e) => {
    e.preventDefault();
    dz.classList.add('dragging');
  });
  dz.addEventListener('dragleave', () => dz.classList.remove('dragging'));
  dz.addEventListener('drop', (e) => {
    e.preventDefault();
    dz.classList.remove('dragging');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
  });
}

function handleFile(file: File) {
  if (!file.type.startsWith('video/') && !/\.(mp4|mov|webm|mkv)$/i.test(file.name)) {
    showError('Bitte eine Video-Datei wählen (MP4, MOV, WebM, MKV).');
    return;
  }
  setFile(file);
}

function checkIsolation() {
  if (!('crossOriginIsolated' in window) || !window.crossOriginIsolated) {
    console.warn(
      'Cross-Origin-Isolation nicht aktiv — FFmpeg läuft im Single-Thread-Modus (langsamer). Bei GitHub Pages sollte der Service-Worker das beim nächsten Reload aktivieren.',
    );
  }
}

export function initUI() {
  checkIsolation();
  buildPresetButtons();
  setupDropzone();
  ($('run-btn') as HTMLButtonElement).addEventListener('click', runEnhancement);
  ($('reset-btn') as HTMLButtonElement).addEventListener('click', reset);
}
