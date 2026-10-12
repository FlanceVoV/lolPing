export interface DesktopText {
  text: string;
  color: string;
  size: number;
}

export const DESKTOP_TEXT_MIN_SIZE = 16;
export const DESKTOP_TEXT_MAX_SIZE = 72;
export const DESKTOP_TEXT_MAX_LENGTH = 256;
export const DESKTOP_TEXT_MAX_LINES = 8;
export const DESKTOP_TEXT_MAX_BYTES = 600;

/** Small enough for one encrypted LAN datagram, with no markup or control characters. */
export function isDesktopText(value: unknown): value is DesktopText {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const { text, color, size } = value as Record<string, unknown>;
  return typeof text === 'string' && text.trim().length > 0 && [...text].length <= DESKTOP_TEXT_MAX_LENGTH
    && text.split('\n').length <= DESKTOP_TEXT_MAX_LINES && new TextEncoder().encode(text).length <= DESKTOP_TEXT_MAX_BYTES
    && !/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/.test(text)
    && typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)
    && Number.isInteger(size) && (size as number) >= DESKTOP_TEXT_MIN_SIZE && (size as number) <= DESKTOP_TEXT_MAX_SIZE;
}
