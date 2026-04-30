import * as tf from '@tensorflow/tfjs';
import Upscaler from 'upscaler';
import x2 from '@upscalerjs/esrgan-slim/2x';
import {
  extractFramesAndAudio,
  readFrameAsBlob,
  writeFile,
  deleteFile,
  reassembleVideo,
  probeFps,
  type ProgressCallback,
} from './ffmpeg-runner';

type UpscalerInstance = InstanceType<typeof Upscaler>;
let upscalerInstance: UpscalerInstance | null = null;

const LOCAL_MODEL_URL = new URL('models/x2/model.json', document.baseURI).toString();

async function getUpscaler(): Promise<UpscalerInstance> {
  if (upscalerInstance) return upscalerInstance;
  await tf.ready();

  const modelDef = await x2;
  const localModel = {
    ...modelDef,
    path: LOCAL_MODEL_URL,
  };
  upscalerInstance = new Upscaler({ model: localModel });
  return upscalerInstance;
}

async function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // URL revoked after image is decoded into memory; image keeps its data.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Uint8Array> {
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/png',
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

async function srcToCanvas(src: HTMLImageElement | HTMLCanvasElement): Promise<HTMLCanvasElement> {
  if (src instanceof HTMLCanvasElement) return src;
  const canvas = document.createElement('canvas');
  canvas.width = src.naturalWidth;
  canvas.height = src.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context not available');
  ctx.drawImage(src, 0, 0);
  return canvas;
}

export async function runUpscale(
  file: File,
  onProgress: ProgressCallback,
): Promise<Blob> {
  onProgress(0, 'KI-Modell wird geladen …');
  const upscaler = await getUpscaler();

  onProgress(0.02, 'Bildrate wird ermittelt …');
  const fps = await probeFps(file);

  onProgress(0.04, 'Frames werden extrahiert …');
  const { frameNames, audioName } = await extractFramesAndAudio(file, () => {});

  if (frameNames.length === 0) {
    throw new Error('Keine Frames extrahiert — ist die Datei ein gültiges Video?');
  }

  const frameTotal = frameNames.length;
  const baseFraction = 0.05;
  const upscaleFraction = 0.85;

  for (let i = 0; i < frameTotal; i++) {
    const name = frameNames[i];
    const blob = await readFrameAsBlob(name);
    const img = await blobToImage(blob);
    const canvas = await srcToCanvas(img);

    const upscaled = await upscaler.upscale(canvas, { output: 'tensor' });
    const outCanvas = document.createElement('canvas');
    outCanvas.width = upscaled.shape[1];
    outCanvas.height = upscaled.shape[0];
    await tf.browser.toPixels(upscaled as tf.Tensor3D, outCanvas);
    upscaled.dispose();

    const png = await canvasToPng(outCanvas);
    const outName = name.replace(/^frame_/, 'up_');
    await writeFile(outName, png);
    await deleteFile(name);

    const ratio = (i + 1) / frameTotal;
    onProgress(
      baseFraction + ratio * upscaleFraction,
      `KI-Upscaling … Frame ${i + 1} / ${frameTotal}`,
    );

    if ((i + 1) % 8 === 0) await tf.nextFrame();
  }

  onProgress(0.92, 'Video wird zusammengesetzt …');
  const result = await reassembleVideo(
    frameTotal,
    audioName,
    fps,
    'upscaled.mp4',
    onProgress,
  );
  onProgress(1, 'Fertig.');
  return result;
}
