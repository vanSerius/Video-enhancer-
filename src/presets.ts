export type PresetKind = 'ffmpeg' | 'upscale';

export interface Preset {
  id: string;
  label: string;
  description: string;
  kind: PresetKind;
  filter?: string;
}

export const PRESETS: Preset[] = [
  {
    id: 'auto',
    label: 'Auto-Verbesserung',
    description: 'Schärfe + Rauschen + Farbe (ausgewogen)',
    kind: 'ffmpeg',
    filter: 'unsharp=5:5:0.8:5:5:0.0,hqdn3d=2:1:3:3,eq=contrast=1.08:saturation=1.15:gamma=1.02',
  },
  {
    id: 'sharpen',
    label: 'Schärfen',
    description: 'Aggressive Detailverstärkung',
    kind: 'ffmpeg',
    filter: 'unsharp=7:7:1.4:7:7:0.0',
  },
  {
    id: 'color',
    label: 'Farbe auffrischen',
    description: 'Sättigung, Vibrance, Kontrast',
    kind: 'ffmpeg',
    filter: 'eq=contrast=1.12:saturation=1.3:gamma=1.05,vibrance=intensity=0.35,curves=preset=increase_contrast',
  },
  {
    id: 'denoise',
    label: 'Rauschen entfernen',
    description: 'Stark — für körnige Aufnahmen',
    kind: 'ffmpeg',
    filter: 'hqdn3d=4:3:6:4.5',
  },
  {
    id: 'upscale',
    label: 'KI-Upscaling 2×',
    description: 'Real-ESRGAN — langsam, beste Qualität',
    kind: 'upscale',
  },
];
