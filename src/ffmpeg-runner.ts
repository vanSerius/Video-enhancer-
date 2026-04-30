import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export type ProgressCallback = (ratio: number, message: string) => void;

const BASE = import.meta.env.BASE_URL;
const CORE_BASE_URL = `${BASE}ffmpeg/mt`;
const CORE_BASE_URL_ST = `${BASE}ffmpeg/st`;

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function loadFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpegInstance) return ffmpegInstance;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const ffmpeg = new FFmpeg();
    if (onLog) {
      ffmpeg.on('log', ({ message }) => onLog(message));
    }

    const useMultiThread =
      typeof window !== 'undefined' && (window as Window).crossOriginIsolated === true;
    const baseURL = useMultiThread ? CORE_BASE_URL : CORE_BASE_URL_ST;

    const config: {
      coreURL: string;
      wasmURL: string;
      workerURL?: string;
    } = {
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    };
    if (useMultiThread) {
      config.workerURL = await toBlobURL(
        `${baseURL}/ffmpeg-core.worker.js`,
        'text/javascript',
      );
    }

    await ffmpeg.load(config);
    ffmpegInstance = ffmpeg;
    return ffmpeg;
  })();

  return loadPromise;
}

function inferOutputName(inputName: string): { input: string; output: string } {
  const dot = inputName.lastIndexOf('.');
  const base = dot > 0 ? inputName.slice(0, dot) : inputName;
  const ext = dot > 0 ? inputName.slice(dot + 1).toLowerCase() : 'mp4';
  const inputSafe = `input.${ext === 'mov' || ext === 'mkv' || ext === 'webm' || ext === 'mp4' ? ext : 'mp4'}`;
  return { input: inputSafe, output: `${base || 'enhanced'}-enhanced.mp4` };
}

export async function runFilter(
  file: File,
  filterChain: string,
  onProgress: ProgressCallback,
): Promise<Blob> {
  onProgress(0, 'FFmpeg wird geladen …');
  const ffmpeg = await loadFFmpeg();

  const { input, output } = inferOutputName(file.name);

  const progressHandler = ({ progress }: { progress: number }) => {
    const ratio = Math.max(0, Math.min(1, progress));
    onProgress(ratio, `Verarbeite … ${Math.round(ratio * 100)}%`);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    onProgress(0.02, 'Datei wird vorbereitet …');
    await ffmpeg.writeFile(input, await fetchFile(file));

    onProgress(0.05, 'Filter werden angewendet …');
    await ffmpeg.exec([
      '-i', input,
      '-vf', filterChain,
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '20',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      output,
    ]);

    onProgress(0.98, 'Datei wird ausgelesen …');
    const data = (await ffmpeg.readFile(output)) as Uint8Array;

    await ffmpeg.deleteFile(input).catch(() => {});
    await ffmpeg.deleteFile(output).catch(() => {});

    onProgress(1, 'Fertig.');
    return new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

export interface VideoMeta {
  fps: number;
  hasAudio: boolean;
}

export async function extractFramesAndAudio(
  file: File,
  onProgress: ProgressCallback,
): Promise<{ frameNames: string[]; audioName: string | null; meta: VideoMeta }> {
  onProgress(0, 'FFmpeg wird geladen …');
  const ffmpeg = await loadFFmpeg();
  const { input } = inferOutputName(file.name);

  await ffmpeg.writeFile(input, await fetchFile(file));

  onProgress(0.1, 'Frames werden extrahiert …');
  await ffmpeg.exec(['-i', input, '-q:v', '2', 'frame_%05d.png']);

  let hasAudio = true;
  try {
    await ffmpeg.exec(['-i', input, '-vn', '-acodec', 'copy', 'audio.aac']);
  } catch {
    hasAudio = false;
  }

  const dir = (await ffmpeg.listDir('/')) as Array<{ name: string; isDir: boolean }>;
  const frameNames = dir
    .filter((e) => !e.isDir && /^frame_\d+\.png$/.test(e.name))
    .map((e) => e.name)
    .sort();

  await ffmpeg.deleteFile(input).catch(() => {});

  return {
    frameNames,
    audioName: hasAudio ? 'audio.aac' : null,
    meta: { fps: 30, hasAudio },
  };
}

export async function readFrameAsBlob(name: string): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();
  const data = (await ffmpeg.readFile(name)) as Uint8Array;
  return new Blob([data.buffer as ArrayBuffer], { type: 'image/png' });
}

export async function writeFile(name: string, data: Uint8Array | ArrayBuffer): Promise<void> {
  const ffmpeg = await loadFFmpeg();
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  await ffmpeg.writeFile(name, bytes);
}

export async function deleteFile(name: string): Promise<void> {
  const ffmpeg = await loadFFmpeg();
  await ffmpeg.deleteFile(name).catch(() => {});
}

export async function probeFps(file: File): Promise<number> {
  const ffmpeg = await loadFFmpeg();
  const { input } = inferOutputName(file.name);

  let detectedFps = 30;
  const handler = ({ message }: { message: string }) => {
    const m = message.match(/(\d+(?:\.\d+)?)\s*fps/);
    if (m) {
      const v = parseFloat(m[1]);
      if (v > 0 && v < 240) detectedFps = v;
    }
  };
  ffmpeg.on('log', handler);
  try {
    await ffmpeg.writeFile(input, await fetchFile(file));
    try {
      await ffmpeg.exec(['-i', input]);
    } catch {
      // ffmpeg returns non-zero when called without output, ignore
    }
    await ffmpeg.deleteFile(input).catch(() => {});
  } finally {
    ffmpeg.off('log', handler);
  }
  return detectedFps;
}

export async function reassembleVideo(
  frameCount: number,
  audioName: string | null,
  fps: number,
  outputName: string,
  onProgress: ProgressCallback,
): Promise<Blob> {
  const ffmpeg = await loadFFmpeg();

  const progressHandler = ({ progress }: { progress: number }) => {
    const ratio = Math.max(0, Math.min(1, progress));
    onProgress(0.9 + ratio * 0.09, `Video wird zusammengesetzt … ${Math.round(ratio * 100)}%`);
  };
  ffmpeg.on('progress', progressHandler);

  try {
    const args = [
      '-framerate', String(fps),
      '-i', 'up_%05d.png',
    ];
    if (audioName) {
      args.push('-i', audioName);
    }
    args.push(
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
    );
    if (audioName) {
      args.push('-c:a', 'copy', '-shortest');
    }
    args.push(outputName);

    await ffmpeg.exec(args);

    const data = (await ffmpeg.readFile(outputName)) as Uint8Array;

    for (let i = 1; i <= frameCount; i++) {
      const n = String(i).padStart(5, '0');
      await ffmpeg.deleteFile(`frame_${n}.png`).catch(() => {});
      await ffmpeg.deleteFile(`up_${n}.png`).catch(() => {});
    }
    if (audioName) await ffmpeg.deleteFile(audioName).catch(() => {});
    await ffmpeg.deleteFile(outputName).catch(() => {});

    return new Blob([data.buffer as ArrayBuffer], { type: 'video/mp4' });
  } finally {
    ffmpeg.off('progress', progressHandler);
  }
}

export async function preloadFFmpeg(onLog?: (msg: string) => void): Promise<void> {
  await loadFFmpeg(onLog);
}
