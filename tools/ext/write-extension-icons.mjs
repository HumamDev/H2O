import fs from "node:fs";
// @version 1.0.0
import path from "node:path";
import zlib from "node:zlib";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function crc32(buf) {
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0);
    }
  }
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePngRGBA(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

function canvas(w, h) {
  const buf = Buffer.alloc(w * h * 4, 0);
  function idx(x, y) {
    return (y * w + x) * 4;
  }
  function setPx(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = idx(x, y);
    if (a >= 255) {
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255;
      return;
    }
    const dstA = buf[i + 3] / 255;
    const srcA = a / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) {
      buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0;
      return;
    }
    const dstR = buf[i] / 255;
    const dstG = buf[i + 1] / 255;
    const dstB = buf[i + 2] / 255;
    const srcR = r / 255;
    const srcG = g / 255;
    const srcB = b / 255;
    const outR = (srcR * srcA + dstR * dstA * (1 - srcA)) / outA;
    const outG = (srcG * srcA + dstG * dstA * (1 - srcA)) / outA;
    const outB = (srcB * srcA + dstB * dstA * (1 - srcA)) / outA;
    buf[i] = Math.round(outR * 255);
    buf[i + 1] = Math.round(outG * 255);
    buf[i + 2] = Math.round(outB * 255);
    buf[i + 3] = Math.round(outA * 255);
  }
  function fillRect(x, y, ww, hh, c) {
    for (let yy = y; yy < y + hh; yy++) {
      for (let xx = x; xx < x + ww; xx++) {
        setPx(xx, yy, c[0], c[1], c[2], c[3] ?? 255);
      }
    }
  }
  function fillRoundRect(x, y, ww, hh, radius, c) {
    const r = Math.max(0, Math.min(radius, Math.floor(Math.min(ww, hh) / 2)));
    for (let yy = y; yy < y + hh; yy++) {
      for (let xx = x; xx < x + ww; xx++) {
        const rx = xx < x + r ? x + r - 1 - xx : (xx >= x + ww - r ? xx - (x + ww - r) : 0);
        const ry = yy < y + r ? y + r - 1 - yy : (yy >= y + hh - r ? yy - (y + hh - r) : 0);
        if (rx > 0 && ry > 0 && (rx * rx + ry * ry > r * r)) continue;
        setPx(xx, yy, c[0], c[1], c[2], c[3] ?? 255);
      }
    }
  }
  function fillCircle(cx, cy, r, c) {
    const rr = r * r;
    for (let yy = Math.floor(cy - r); yy <= Math.ceil(cy + r); yy++) {
      for (let xx = Math.floor(cx - r); xx <= Math.ceil(cx + r); xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= rr) {
          setPx(xx, yy, c[0], c[1], c[2], c[3] ?? 255);
        }
      }
    }
  }
  function diagStripe(x, y, ww, hh, c, step = 6) {
    for (let yy = y; yy < y + hh; yy++) {
      for (let xx = x; xx < x + ww; xx++) {
        if (((xx + yy) % step) < 2) setPx(xx, yy, c[0], c[1], c[2], c[3] ?? 255);
      }
    }
  }
  return { w, h, buf, setPx, fillRect, fillRoundRect, fillCircle, diagStripe };
}

function drawBorder(cv, x, y, w, h, r, c) {
  cv.fillRoundRect(x, y, w, h, r, c);
  cv.fillRoundRect(x + 1, y + 1, w - 2, h - 2, Math.max(0, r - 1), [0, 0, 0, 0]);
}

function drawDevIcon(size) {
  const cv = canvas(size, size);
  const p = Math.max(1, Math.round(size * 0.06));
  const r = Math.max(2, Math.round(size * 0.18));

  cv.fillRoundRect(0, 0, size, size, Math.round(size * 0.22), [10, 11, 13, 0]);
  cv.fillRoundRect(0, 0, size, size, Math.round(size * 0.22), [17, 20, 25, 255]);
  cv.fillRoundRect(p, p, size - 2 * p, size - 2 * p, r, [26, 31, 38, 255]);
  drawBorder(cv, p, p, size - 2 * p, size - 2 * p, r, [65, 74, 87, 180]);

  const pillX = p + 2;
  const pillY = p + 2;
  const pillW = size - pillX - p - 2;
  const pillH = Math.max(4, Math.round(size * 0.27));
  cv.fillRoundRect(pillX, pillY, pillW, pillH, Math.round(pillH / 2), [92, 163, 44, 255]);
  cv.fillRoundRect(pillX + 1, pillY + 1, pillW - 2, pillH - 2, Math.round((pillH - 2) / 2), [112, 187, 58, 235]);
  cv.fillCircle(pillX + Math.round(pillH * 0.52), pillY + pillH / 2, Math.max(2, Math.round(pillH * 0.34)), [234, 246, 238, 255]);

  const cardX = p + 2;
  const cardY = pillY + pillH + Math.max(2, Math.round(size * 0.08));
  const cardW = size - cardX - p - 2;
  const cardH = size - cardY - p - 2;
  cv.fillRoundRect(cardX, cardY, cardW, cardH, Math.max(2, Math.round(size * 0.09)), [20, 24, 30, 255]);
  cv.fillRoundRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2, Math.max(2, Math.round(size * 0.08)), [32, 37, 45, 255]);

  const linePad = Math.max(2, Math.round(size * 0.09));
  const lineH = Math.max(1, Math.round(size * 0.06));
  const y1 = cardY + linePad;
  const y2 = y1 + lineH + Math.max(2, Math.round(size * 0.08));
  const y3 = y2 + lineH + Math.max(2, Math.round(size * 0.08));
  cv.fillRoundRect(cardX + linePad, y1, Math.max(4, Math.round(cardW * 0.62)), lineH, lineH, [224, 230, 238, 255]);
  cv.fillRoundRect(cardX + linePad, y2, Math.max(4, Math.round(cardW * 0.78)), lineH, lineH, [133, 209, 95, 245]);
  cv.fillRoundRect(cardX + linePad, y3, Math.max(4, Math.round(cardW * 0.48)), lineH, lineH, [223, 151, 66, 255]);

  const tag = Math.max(4, Math.round(size * 0.22));
  const tagX = size - p - tag - 1;
  const tagY = size - p - tag - 1;
  const tagR = Math.max(1, Math.round(tag * 0.28));
  cv.fillRoundRect(tagX, tagY, tag, tag, tagR, [99, 214, 255, 248]);
  cv.fillRoundRect(tagX + 1, tagY + 1, tag - 2, tag - 2, Math.max(1, tagR - 1), [138, 228, 255, 245]);
  const cInset = Math.max(1, Math.round(tag * 0.2));
  const cTh = Math.max(1, Math.round(tag * 0.18));
  const cColor = [15, 38, 52, 255];
  cv.fillRoundRect(tagX + cInset, tagY + cInset, Math.max(cTh + 1, Math.round(tag * 0.58)), cTh, cTh, cColor);
  cv.fillRoundRect(tagX + cInset, tagY + cInset, cTh, tag - cInset * 2, cTh, cColor);
  cv.fillRoundRect(tagX + cInset, tagY + tag - cInset - cTh, Math.max(cTh + 1, Math.round(tag * 0.58)), cTh, cTh, cColor);

  return encodePngRGBA(size, size, cv.buf);
}

function drawDevLeanIcon(size) {
  const cv = canvas(size, size);
  const p = Math.max(1, Math.round(size * 0.06));
  const r = Math.max(2, Math.round(size * 0.18));

  cv.fillRoundRect(0, 0, size, size, Math.round(size * 0.22), [10, 12, 18, 0]);
  cv.fillRoundRect(0, 0, size, size, Math.round(size * 0.22), [16, 20, 30, 255]);
  cv.fillRoundRect(p, p, size - 2 * p, size - 2 * p, r, [24, 29, 40, 255]);
  drawBorder(cv, p, p, size - 2 * p, size - 2 * p, r, [86, 96, 116, 180]);

  const pillX = p + 2;
  const pillY = p + 2;
  const pillW = size - pillX - p - 2;
  const pillH = Math.max(4, Math.round(size * 0.27));
  cv.fillRoundRect(pillX, pillY, pillW, pillH, Math.round(pillH / 2), [76, 122, 176, 255]);
  cv.fillRoundRect(pillX + 1, pillY + 1, pillW - 2, pillH - 2, Math.round((pillH - 2) / 2), [103, 151, 210, 235]);
  cv.fillCircle(pillX + Math.round(pillH * 0.52), pillY + pillH / 2, Math.max(2, Math.round(pillH * 0.34)), [235, 242, 252, 255]);

  const cardX = p + 2;
  const cardY = pillY + pillH + Math.max(2, Math.round(size * 0.08));
  const cardW = size - cardX - p - 2;
  const cardH = size - cardY - p - 2;
  cv.fillRoundRect(cardX, cardY, cardW, cardH, Math.max(2, Math.round(size * 0.09)), [18, 22, 29, 255]);
  cv.fillRoundRect(cardX + 1, cardY + 1, cardW - 2, cardH - 2, Math.max(2, Math.round(size * 0.08)), [28, 33, 43, 255]);

  const linePad = Math.max(2, Math.round(size * 0.09));
  const lineH = Math.max(1, Math.round(size * 0.06));
  const y1 = cardY + linePad;
  const y2 = y1 + lineH + Math.max(2, Math.round(size * 0.08));
  const y3 = y2 + lineH + Math.max(2, Math.round(size * 0.08));
  cv.fillRoundRect(cardX + linePad, y1, Math.max(4, Math.round(cardW * 0.62)), lineH, lineH, [223, 230, 241, 255]);
  cv.fillRoundRect(cardX + linePad, y2, Math.max(4, Math.round(cardW * 0.78)), lineH, lineH, [125, 166, 221, 245]);
  cv.fillRoundRect(cardX + linePad, y3, Math.max(4, Math.round(cardW * 0.48)), lineH, lineH, [167, 176, 191, 240]);

  const slashW = Math.max(2, Math.round(size * 0.14));
  const slashH = Math.max(6, Math.round(size * 0.44));
  const sx = size - p - slashW - Math.max(2, Math.round(size * 0.03));
  const sy = cardY + Math.max(1, Math.round(size * 0.02));
  cv.fillRoundRect(sx, sy, slashW, slashH, Math.max(1, Math.round(slashW * 0.35)), [206, 220, 238, 90]);
  cv.diagStripe(sx, sy, slashW, slashH, [226, 237, 252, 150], 3);

  const tag = Math.max(4, Math.round(size * 0.22));
  const tagX = size - p - tag - 1;
  const tagY = size - p - tag - 1;
  const tagR = Math.max(1, Math.round(tag * 0.28));
  cv.fillRoundRect(tagX, tagY, tag, tag, tagR, [214, 224, 238, 248]);
  cv.fillRoundRect(tagX + 1, tagY + 1, tag - 2, tag - 2, Math.max(1, tagR - 1), [232, 238, 248, 245]);
  const lInset = Math.max(1, Math.round(tag * 0.22));
  const lTh = Math.max(1, Math.round(tag * 0.2));
  const lColor = [45, 58, 76, 255];
  cv.fillRoundRect(tagX + lInset, tagY + lInset, lTh, tag - lInset * 2, lTh, lColor);
  cv.fillRoundRect(tagX + lInset, tagY + tag - lInset - lTh, Math.max(lTh + 1, Math.round(tag * 0.52)), lTh, lTh, lColor);

  return encodePngRGBA(size, size, cv.buf);
}

function drawPanelIcon(size) {
  const cv = canvas(size, size);
  const p = Math.max(1, Math.round(size * 0.06));
  const r = Math.max(2, Math.round(size * 0.2));
  cv.fillRoundRect(0, 0, size, size, Math.round(size * 0.24), [244, 242, 236, 255]);
  cv.fillRoundRect(p, p, size - 2 * p, size - 2 * p, r, [255, 252, 244, 255]);
  drawBorder(cv, p, p, size - 2 * p, size - 2 * p, r, [196, 184, 170, 210]);

  const railW = Math.max(3, Math.round(size * 0.22));
  const railX = p + 2;
  const railY = p + 2;
  const railH = size - (p + 2) * 2;
  cv.fillRoundRect(railX, railY, railW, railH, Math.max(2, Math.round(size * 0.09)), [13, 107, 95, 255]);
  cv.fillRoundRect(railX + 1, railY + 1, railW - 2, railH - 2, Math.max(2, Math.round(size * 0.08)), [20, 128, 113, 220]);
  const dotR = Math.max(1, Math.round(size * 0.045));
  for (let i = 0; i < 3; i++) {
    cv.fillCircle(railX + Math.round(railW / 2), railY + Math.round((i + 1) * railH / 4), dotR, [236, 251, 247, 255]);
  }

  const gap = Math.max(2, Math.round(size * 0.06));
  const rightX = railX + railW + gap;
  const rightW = size - rightX - (p + 2);
  const topH = Math.max(4, Math.round(size * 0.26));
  cv.fillRoundRect(rightX, railY, rightW, topH, Math.max(2, Math.round(size * 0.08)), [217, 137, 52, 255]);
  cv.fillRoundRect(rightX + 1, railY + 1, rightW - 2, topH - 2, Math.max(2, Math.round(size * 0.07)), [234, 164, 89, 240]);

  const bottomY = railY + topH + gap;
  const bottomH = railH - topH - gap;
  cv.fillRoundRect(rightX, bottomY, rightW, bottomH, Math.max(2, Math.round(size * 0.08)), [250, 247, 238, 255]);
  cv.fillRoundRect(rightX + 1, bottomY + 1, rightW - 2, bottomH - 2, Math.max(2, Math.round(size * 0.07)), [255, 255, 255, 255]);
  drawBorder(cv, rightX, bottomY, rightW, bottomH, Math.max(2, Math.round(size * 0.08)), [209, 198, 185, 200]);

  const lPad = Math.max(2, Math.round(size * 0.06));
  const lh = Math.max(1, Math.round(size * 0.05));
  const ly1 = bottomY + lPad;
  const ly2 = ly1 + lh + Math.max(2, Math.round(size * 0.06));
  const ly3 = ly2 + lh + Math.max(2, Math.round(size * 0.06));
  cv.fillRoundRect(rightX + lPad, ly1, Math.max(3, Math.round(rightW * 0.72)), lh, lh, [42, 52, 62, 220]);
  cv.fillRoundRect(rightX + lPad, ly2, Math.max(3, Math.round(rightW * 0.55)), lh, lh, [13, 107, 95, 220]);
  cv.fillRoundRect(rightX + lPad, ly3, Math.max(3, Math.round(rightW * 0.42)), lh, lh, [217, 137, 52, 220]);

  return encodePngRGBA(size, size, cv.buf);
}

export function writeExtensionIcons(outDir, kind = "dev") {
  const kindNorm = String(kind).toLowerCase();
  const draw = kindNorm === "panel" ? drawPanelIcon : (kindNorm === "dev-lean" ? drawDevLeanIcon : drawDevIcon);
  const sizes = [16, 32, 48, 128];
  for (const size of sizes) {
    const png = draw(size);
    fs.writeFileSync(path.join(outDir, `icon${size}.png`), png);
  }
}
