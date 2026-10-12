import { DESKTOP_RESOLUTIONS, type DesktopResolution } from '../../shared/settings';

export interface DesktopSize { width: number; height: number }

/** Video height presets are fitted inside the selected display, retaining its original aspect ratio. */
export function desktopCaptureSize(native: DesktopSize, resolution: DesktopResolution): DesktopSize | null {
  if (resolution === 'native' || native.width <= 0 || native.height <= 0) return null;
  const height = Number.parseInt(resolution, 10);
  if (height >= native.height) return null;
  return { width: Math.max(1, Math.round(native.width * height / native.height)), height };
}

export function availableDesktopResolutions(native: DesktopSize): DesktopResolution[] {
  return DESKTOP_RESOLUTIONS.filter((resolution) => resolution === 'native' || desktopCaptureSize(native, resolution) !== null);
}
