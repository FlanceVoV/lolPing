/** Maps a click onto a video drawn with object-fit: contain; letterbox clicks do not send pings. */
export function desktopPoint(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  videoWidth: number, videoHeight: number,
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0 || videoWidth <= 0 || videoHeight <= 0) return null;
  const scale = Math.min(rect.width / videoWidth, rect.height / videoHeight);
  const width = videoWidth * scale;
  const height = videoHeight * scale;
  const left = rect.left + (rect.width - width) / 2;
  const top = rect.top + (rect.height - height) / 2;
  const x = (clientX - left) / width;
  const y = (clientY - top) / height;
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
}
