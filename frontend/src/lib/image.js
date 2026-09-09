/**
 * Client-side image preparation.
 *
 * Resizing in the browser before upload means a 4 MB phone photo becomes a
 * ~25 KB square, which is why avatars can live in a database column instead of
 * requiring an object-storage service. It also means the user never waits on a
 * long upload over a forecourt's mobile connection.
 */

const readFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('That file is not a readable image.'));
    img.src = src;
  });

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

/**
 * Square avatar, centre-cropped.
 * @returns {Promise<string>} a data URL under ~40 KB
 */
export const toAvatar = async (file, size = 256, quality = 0.85) => {
  if (!ACCEPTED_TYPES.includes(file.type)) {
    throw new Error('Please choose a PNG, JPEG or WebP image.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is very large. Please choose one under 12 MB.');
  }

  const img = await loadImage(await readFile(file));

  // Centre-crop to a square before scaling, so portraits are not squashed.
  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  return canvas.toDataURL('image/jpeg', quality);
};

/**
 * Logo: fitted inside a box, transparency preserved, so a PNG with a
 * transparent background does not come back with black corners.
 */
export const toLogo = async (file, max = 512) => {
  if (![...ACCEPTED_TYPES, 'image/svg+xml'].includes(file.type)) {
    throw new Error('Please choose a PNG, JPEG, WebP or SVG image.');
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error('That image is very large. Please choose one under 12 MB.');
  }

  // An SVG is already small and scales perfectly; passing it through a canvas
  // would only rasterise it and lose that.
  if (file.type === 'image/svg+xml') {
    if (file.size > 300 * 1024) throw new Error('Please use an SVG under 300 KB.');
    return readFile(file);
  }

  const img = await loadImage(await readFile(file));
  const scale = Math.min(max / img.width, max / img.height, 1);

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
};

/** Roughly how many bytes a data URL will occupy once decoded. */
export const dataUrlBytes = (dataUrl) =>
  dataUrl ? Math.floor((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75) : 0;
