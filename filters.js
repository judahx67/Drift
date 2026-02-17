// Image Filters — Canvas 2D based
// Provides filter functions for common image adjustments

const ImageFilters = (function () {
    'use strict';

    // ============================================
    // Sharpen (manual 3×3 convolution)
    // ============================================

    function sharpen(imageData, amount) {
        // amount: 0–100, default center weight scales from 5 to 9
        const strength = 1 + (amount / 100) * 4; // 1.0 to 5.0
        const edge = -(strength - 1) / 4;
        const kernel = [
            0, edge, 0,
            edge, strength, edge,
            0, edge, 0,
        ];

        const src = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        const out = new Uint8ClampedArray(src.length);

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                for (let c = 0; c < 3; c++) {
                    let val = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            const idx = ((y + ky) * w + (x + kx)) * 4 + c;
                            val += src[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                        }
                    }
                    out[(y * w + x) * 4 + c] = val;
                }
                out[(y * w + x) * 4 + 3] = src[(y * w + x) * 4 + 3]; // alpha
            }
        }

        // Copy edges (first/last row/col)
        for (let x = 0; x < w; x++) {
            for (let c = 0; c < 4; c++) {
                out[x * 4 + c] = src[x * 4 + c];
                out[((h - 1) * w + x) * 4 + c] = src[((h - 1) * w + x) * 4 + c];
            }
        }
        for (let y = 0; y < h; y++) {
            for (let c = 0; c < 4; c++) {
                out[(y * w) * 4 + c] = src[(y * w) * 4 + c];
                out[(y * w + w - 1) * 4 + c] = src[(y * w + w - 1) * 4 + c];
            }
        }

        imageData.data.set(out);
        return imageData;
    }

    // ============================================
    // Apply a filter to a canvas using ctx.filter
    // ============================================

    /**
     * Apply a CSS filter to the current canvas content.
     * Redraws the canvas with the filter applied.
     *
     * @param {HTMLCanvasElement} canvas
     * @param {string} filterName - brightness|contrast|blur|invert|grayscale|sharpen
     * @param {number} value - Filter intensity (meaning depends on filter type)
     */
    function apply(canvas, filterName, value) {
        const ctx = canvas.getContext('2d');

        if (filterName === 'sharpen') {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            sharpen(imageData, value);
            ctx.putImageData(imageData, 0, 0);
            return;
        }

        // Use CSS filter via an off-screen canvas
        const offscreen = document.createElement('canvas');
        offscreen.width = canvas.width;
        offscreen.height = canvas.height;
        const offCtx = offscreen.getContext('2d');

        let filterString = '';
        switch (filterName) {
            case 'brightness':
                // value: -100 to 100 → CSS brightness 0 to 2
                filterString = `brightness(${1 + value / 100})`;
                break;
            case 'contrast':
                // value: -100 to 100 → CSS contrast 0 to 2
                filterString = `contrast(${1 + value / 100})`;
                break;
            case 'blur':
                // value: 0 to 20 pixels
                filterString = `blur(${value}px)`;
                break;
            case 'invert':
                filterString = 'invert(1)';
                break;
            case 'grayscale':
                filterString = 'grayscale(1)';
                break;
            default:
                return;
        }

        offCtx.filter = filterString;
        offCtx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(offscreen, 0, 0);
    }

    return { apply, sharpen };
})();
