import { describe, expect, it } from 'vitest';
import { availableDesktopResolutions, desktopCaptureSize } from '../../src/renderer/settings/desktopResolution';

describe('desktop capture resolution', () => {
  it('offers common heights only below the selected display size', () => {
    expect(availableDesktopResolutions({ width: 1920, height: 1080 }))
      .toEqual(['360p', '480p', '540p', '720p', '900p', 'native']);
    expect(availableDesktopResolutions({ width: 3840, height: 2160 }))
      .toContain('1440p');
  });

  it('fits presets to non-16:9 screens without cropping the image', () => {
    expect(desktopCaptureSize({ width: 2520, height: 1680 }, '1080p')).toEqual({ width: 1620, height: 1080 });
    expect(desktopCaptureSize({ width: 3440, height: 1440 }, '720p')).toEqual({ width: 1720, height: 720 });
    expect(desktopCaptureSize({ width: 2520, height: 1680 }, 'native')).toBeNull();
    expect(desktopCaptureSize({ width: 1920, height: 1080 }, '1440p')).toBeNull();
  });
});
