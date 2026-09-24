// Loading a picture, shared by the tools that take one: the file button,
// dropping a file anywhere on the page, or pasting it. Nothing is uploaded.
// The page provides #file, #dropzone, #preview, #changeImg and #imageCard.

import { t } from './i18n.js';
import { toast } from './ui.js';

const $ = id => document.getElementById(id);

// A copy of the image at most maxSide pixels on its longest side, as ImageData.
export function pixels(img, maxSide) {
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Calls onImage(img) with a decoded <img> each time the user brings a picture.
export function setupImageInput(onImage) {
  let previewUrl = null;

  async function load(file) {
    if (!file || !file.type.startsWith('image/')) { toast(t('image.notImage')); return; }
    const url = URL.createObjectURL(file);
    const probe = new Image();
    probe.src = url;
    try { await probe.decode(); } catch {
      URL.revokeObjectURL(url);
      toast(t('image.openFailed'));
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = url;
    const img = $('preview');
    img.src = url;
    img.hidden = false;
    $('dropzone').hidden = true;
    $('changeImg').hidden = false;
    onImage(probe);
  }

  $('file').addEventListener('change', e => { load(e.target.files[0]); e.target.value = ''; });
  $('changeImg').addEventListener('click', () => $('file').click());

  // Dropping anywhere on the page loads the image (and keeps the browser from
  // navigating away to the file).
  let dragDepth = 0;
  const setOver = on => $('imageCard').classList.toggle('over', on);
  document.addEventListener('dragenter', e => { if (e.dataTransfer?.types.includes('Files')) { dragDepth++; setOver(true); } });
  document.addEventListener('dragleave', () => { dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) setOver(false); });
  document.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
  document.addEventListener('drop', e => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    dragDepth = 0; setOver(false);
    load(e.dataTransfer.files[0]);
  });
  document.addEventListener('paste', e => {
    const item = [...(e.clipboardData?.items ?? [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); load(item.getAsFile()); }
  });
}
