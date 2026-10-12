import { describe, expect, it } from 'vitest';
import { desktopPoint } from '../../src/renderer/settings/desktopGeometry';

describe('desktop video ping coordinates', () => {
  it('maps a scaled desktop to the same normalized point', () => {
    expect(desktopPoint(350, 225, { left: 100, top: 100, width: 500, height: 250 }, 1920, 960))
      .toEqual({ x: 0.5, y: 0.5 });
  });

  it('ignores black bars and maps the visible image when the wall tile has another aspect ratio', () => {
    const rect = { left: 100, top: 50, width: 400, height: 225 };
    expect(desktopPoint(120, 162.5, rect, 400, 300)).toBeNull();
    expect(desktopPoint(300, 162.5, rect, 400, 300)).toEqual({ x: 0.5, y: 0.5 });
  });
});
