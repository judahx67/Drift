// Pixel Sort Engine
// Pure pixel sorting functions — no DOM dependency

const PixelSort = (function () {
    'use strict';

    // ============================================
    // Pixel Value Extractors
    // ============================================

    function getBrightness(r, g, b) {
        return 0.299 * r + 0.587 * g + 0.114 * b;
    }

    function getGamma(r, g, b) {
        const linearR = Math.pow(r / 255, 2.2);
        const linearG = Math.pow(g / 255, 2.2);
        const linearB = Math.pow(b / 255, 2.2);
        return (0.2126 * linearR + 0.7152 * linearG + 0.0722 * linearB) * 255;
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const l = (max + min) / 2;
        let h = 0, s = 0;

        if (max !== min) {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }
        return { h: h * 360, s: s * 100, l: l * 100 };
    }

    function getHue(r, g, b) {
        return rgbToHsl(r, g, b).h;
    }

    function getSaturation(r, g, b) {
        return rgbToHsl(r, g, b).s;
    }

    function getPixelValue(r, g, b, mode) {
        switch (mode) {
            case 'brightness': return getBrightness(r, g, b);
            case 'hue': return getHue(r, g, b);
            case 'saturation': return getSaturation(r, g, b);
            case 'red': return r;
            case 'green': return g;
            case 'blue': return b;
            case 'gamma': return getGamma(r, g, b);
            default: return getBrightness(r, g, b);
        }
    }

    // Normalize pixel value to 0-255 range for threshold checks
    function normalizeValue(val, mode) {
        if (mode === 'hue') return (val / 360) * 255;
        if (mode === 'saturation') return (val / 100) * 255;
        return val;
    }

    // ============================================
    // Polygon Mask Geometry
    // ============================================

    // Geometry maths completely replaced by native Canvas API in mask generations

    // ============================================
    // Core Sort Function (optimized for large images)
    // ============================================

    function sort(imageData, selection, options) {
        const { mode, direction, noiseAmount } = options;
        const data = imageData.data;
        const imgWidth = imageData.width;
        const { x, y, w, h } = selection;
        const lower = options.thresholdLower;
        const upper = options.thresholdUpper;
        const selectionPoints = options.selectionPoints;
        const hasPolygon = selectionPoints && selectionPoints.length > 2;

        // Cache original data for feather blending later
        let originalData = null;
        if (options.feather && options.featherRadius > 0) {
            originalData = new Uint8ClampedArray(data);
        }

        // Pre-build polygon mask bitmap for fast lookup (avoids per-pixel ray casting per line)
        let polygonMask = null;
        if (hasPolygon) {
            let maskCanvas;
            if (typeof OffscreenCanvas !== 'undefined') {
                maskCanvas = new OffscreenCanvas(w, h);
            } else {
                maskCanvas = document.createElement('canvas');
                maskCanvas.width = w;
                maskCanvas.height = h;
            }
            const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });
            maskCtx.fillStyle = '#FFF';
            maskCtx.beginPath();
            maskCtx.moveTo(selectionPoints[0].x - x, selectionPoints[0].y - y);
            for (let i = 1; i < selectionPoints.length; i++) {
                maskCtx.lineTo(selectionPoints[i].x - x, selectionPoints[i].y - y);
            }
            maskCtx.closePath();
            maskCtx.fill();

            const maskData = maskCtx.getImageData(0, 0, w, h).data;
            polygonMask = new Uint8Array(w * h);
            for (let i = 0; i < w * h; i++) {
                // Alpha > 127 is inside
                polygonMask[i] = maskData[i * 4 + 3] > 127 ? 1 : 0;
            }
        }

        // Process lines (rows for horizontal, columns for vertical)
        const lineCount = direction === 'horizontal' ? h : w;

        for (let lineIdx = 0; lineIdx < lineCount; lineIdx++) {
            const lineLen = direction === 'horizontal' ? w : h;

            // Build flat arrays of byte-offsets, threshold-normalized values, and mask flags
            const indices = new Int32Array(lineLen);
            const values = new Float32Array(lineLen);
            const inMask = polygonMask ? new Uint8Array(lineLen) : null;

            for (let i = 0; i < lineLen; i++) {
                let row, col;
                if (direction === 'horizontal') {
                    row = y + lineIdx;
                    col = x + i;
                } else {
                    row = y + i;
                    col = x + lineIdx;
                }
                const idx = (row * imgWidth + col) * 4;
                indices[i] = idx;
                values[i] = normalizeValue(getPixelValue(data[idx], data[idx + 1], data[idx + 2], mode), mode);

                if (polygonMask) {
                    if (direction === 'horizontal') {
                        inMask[i] = polygonMask[lineIdx * w + i];
                    } else {
                        inMask[i] = polygonMask[i * w + lineIdx];
                    }
                }
            }

            // Detect intervals and sort each one (inline for speed)
            let intervalStart = -1;
            for (let i = 0; i <= lineLen; i++) {
                const inInterval = i < lineLen &&
                    (!inMask || inMask[i]) &&
                    values[i] >= lower && values[i] <= upper;

                if (inInterval) {
                    if (intervalStart === -1) intervalStart = i;
                } else {
                    if (intervalStart !== -1) {
                        const len = i - intervalStart;
                        if (len > 1) {
                            sortInterval(data, indices, intervalStart, len, mode, noiseAmount);
                        }
                        intervalStart = -1;
                    }
                }
            }
        }

        // ============================================
        // Post-Processing: Feather Edges
        // ============================================
        if (options.feather && options.featherRadius > 0 && originalData) {
            applyFeathering(data, originalData, imgWidth, x, y, w, h, options.featherRadius, selectionPoints);
        }

        return imageData;
    }

    // Sort a contiguous interval of pixels in-place
    function sortInterval(data, indices, start, len, mode, noiseAmount) {
        // Build sortable entries
        const entries = new Array(len);
        for (let i = 0; i < len; i++) {
            const idx = indices[start + i];
            entries[i] = {
                idx: idx,
                val: getPixelValue(data[idx], data[idx + 1], data[idx + 2], mode),
                r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3]
            };
        }

        // Sort by pixel value
        entries.sort((a, b) => a.val - b.val);

        // Apply noise (random swaps)
        if (noiseAmount > 0 && len > 1) {
            const swapCount = Math.floor((noiseAmount / 100) * len);
            for (let s = 0; s < swapCount; s++) {
                const a = Math.floor(Math.random() * len);
                const b = Math.floor(Math.random() * len);
                const tmpR = entries[a].r, tmpG = entries[a].g, tmpB = entries[a].b, tmpA = entries[a].a;
                entries[a].r = entries[b].r; entries[a].g = entries[b].g;
                entries[a].b = entries[b].b; entries[a].a = entries[b].a;
                entries[b].r = tmpR; entries[b].g = tmpG;
                entries[b].b = tmpB; entries[b].a = tmpA;
            }
        }

        // Write back at original positions
        for (let i = 0; i < len; i++) {
            const idx = indices[start + i];
            data[idx] = entries[i].r;
            data[idx + 1] = entries[i].g;
            data[idx + 2] = entries[i].b;
            data[idx + 3] = entries[i].a;
        }
    }

    // Feather blending pass
    function applyFeathering(data, originalData, imgWidth, x, y, w, h, radius, selectionPoints) {
        const hasPolygon = selectionPoints && selectionPoints.length > 2;

        if (hasPolygon) {
            // Polygon feathering — massively sped up using native Canvas blur
            let maskCanvas;
            if (typeof OffscreenCanvas !== 'undefined') {
                maskCanvas = new OffscreenCanvas(w, h);
            } else {
                maskCanvas = document.createElement('canvas');
                maskCanvas.width = w;
                maskCanvas.height = h;
            }
            const maskCtx = maskCanvas.getContext('2d', { willReadFrequently: true });

            maskCtx.filter = `blur(${radius}px)`;
            maskCtx.fillStyle = '#FFF';

            maskCtx.beginPath();
            maskCtx.moveTo(selectionPoints[0].x - x, selectionPoints[0].y - y);
            for (let i = 1; i < selectionPoints.length; i++) {
                maskCtx.lineTo(selectionPoints[i].x - x, selectionPoints[i].y - y);
            }
            maskCtx.closePath();
            maskCtx.fill();

            const maskData = maskCtx.getImageData(0, 0, w, h).data;

            for (let row = 0; row < h; row++) {
                for (let col = 0; col < w; col++) {
                    const alpha = maskData[(row * w + col) * 4 + 3];
                    if (alpha < 255) {
                        const factor = alpha / 255;
                        const idx = ((y + row) * imgWidth + (x + col)) * 4;
                        data[idx] = originalData[idx] + (data[idx] - originalData[idx]) * factor;
                        data[idx + 1] = originalData[idx + 1] + (data[idx + 1] - originalData[idx + 1]) * factor;
                        data[idx + 2] = originalData[idx + 2] + (data[idx + 2] - originalData[idx + 2]) * factor;
                        data[idx + 3] = originalData[idx + 3] + (data[idx + 3] - originalData[idx + 3]) * factor;
                    }
                }
            }
        } else {
            // Rectangular feathering — only process the border strip, skip the center
            for (let row = y; row < y + h; row++) {
                const dy1 = row - y;
                const dy2 = (y + h) - row;
                const minDy = dy1 < dy2 ? dy1 : dy2;

                if (minDy >= radius) {
                    // Only need to blend left/right edges
                    const maxCol = Math.min(x + radius, x + w);
                    for (let col = x; col < maxCol; col++) {
                        blendPixel(data, originalData, imgWidth, row, col, col - x, radius);
                    }
                    const minCol = Math.max(x + w - radius, x);
                    for (let col = minCol; col < x + w; col++) {
                        blendPixel(data, originalData, imgWidth, row, col, (x + w) - col, radius);
                    }
                } else {
                    // Near top/bottom edge — process entire row
                    for (let col = x; col < x + w; col++) {
                        const dx1 = col - x;
                        const dx2 = (x + w) - col;
                        const minDx = dx1 < dx2 ? dx1 : dx2;
                        const dist = minDy < minDx ? minDy : minDx;
                        if (dist < radius) {
                            blendPixel(data, originalData, imgWidth, row, col, dist, radius);
                        }
                    }
                }
            }
        }
    }

    function blendPixel(data, originalData, imgWidth, row, col, dist, radius) {
        const t = dist / radius;
        const factor = t * t * (3 - 2 * t);
        const idx = (row * imgWidth + col) * 4;
        data[idx] = originalData[idx] + (data[idx] - originalData[idx]) * factor;
        data[idx + 1] = originalData[idx + 1] + (data[idx + 1] - originalData[idx + 1]) * factor;
        data[idx + 2] = originalData[idx + 2] + (data[idx + 2] - originalData[idx + 2]) * factor;
        data[idx + 3] = originalData[idx + 3] + (data[idx + 3] - originalData[idx + 3]) * factor;
    }

    // ============================================
    // Public API
    // ============================================

    return { sort };
})();

export default PixelSort;
