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
        // Perceived luminance via gamma-corrected sRGB
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

    // Map mode name to extractor function
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

    // ============================================
    // Polygon Mask Geometry
    // ============================================

    /**
     * Ray-Casting algorithm to check if a point (x, y) is inside a polygon defined by points.
     */
    function isPointInPolygon(point, vs) {
        if (!vs || vs.length < 3) return true; // Treat as a standard rectangle if no polygon

        const x = point.x, y = point.y;
        let inside = false;

        for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
            const xi = vs[i].x, yi = vs[i].y;
            const xj = vs[j].x, yj = vs[j].y;

            const intersect = ((yi > y) !== (yj > y))
                && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
            if (intersect) inside = !inside;
        }
        return inside;
    }

    // ============================================
    // Interval Detection
    // ============================================

    /**
     * Split a line of pixels into intervals based on threshold and polygon mask.
     *
     * @param {Array} pixels - Array of { x, y, r, g, b, a, idx... }
     * @param {Object} options - { mode, thresholdLower, thresholdUpper, selectionPoints }
     * @returns {Array} Array of intervals, each an array of pixel objects
     */
    function detectIntervals(pixels, options) {
        const { mode, thresholdLower: lower, thresholdUpper: upper, selectionPoints } = options;
        const intervals = [];
        let current = [];

        const hasPolygon = selectionPoints && selectionPoints.length > 2;

        for (let i = 0; i < pixels.length; i++) {
            const p = pixels[i];

            // 1. Check if inside polygon mask (if provided)
            let inMask = true;
            if (hasPolygon) {
                inMask = isPointInPolygon({ x: p.x, y: p.y }, selectionPoints);
            }

            // 2. Check threshold
            const val = getPixelValue(p.r, p.g, p.b, mode);
            let normVal = val;
            if (mode === 'hue') normVal = (val / 360) * 255;
            if (mode === 'saturation') normVal = (val / 100) * 255;

            // Pixel is in interval ONLY if inside Mask AND within Threshold bounds
            if (inMask && normVal >= lower && normVal <= upper) {
                current.push(p);
            } else {
                if (current.length > 1) {
                    intervals.push(current);
                }
                current = [];
            }
        }
        if (current.length > 1) {
            intervals.push(current);
        }
        return intervals;
    }

    // ============================================
    // Noise Function
    // ============================================

    /**
     * Apply noise to a sorted interval by randomly swapping some pixels.
     * @param {Array} pixels - Sorted array of pixel objects
     * @param {number} amount - Noise amount 0-100 (percentage of pixels to swap)
     * @returns {Array} Modified pixel array
     */
    function applyNoise(pixels, amount) {
        if (amount <= 0 || pixels.length < 2) return pixels;

        const result = [...pixels];
        const swapCount = Math.floor((amount / 100) * result.length);

        for (let i = 0; i < swapCount; i++) {
            const a = Math.floor(Math.random() * result.length);
            const b = Math.floor(Math.random() * result.length);
            // Swap the pixel color data (keep original positions)
            const temp = { r: result[a].r, g: result[a].g, b: result[a].b, a: result[a].a };
            result[a].r = result[b].r;
            result[a].g = result[b].g;
            result[a].b = result[b].b;
            result[a].a = result[b].a;
            result[b].r = temp.r;
            result[b].g = temp.g;
            result[b].b = temp.b;
            result[b].a = temp.a;
        }
        return result;
    }

    // ============================================
    // Core Sort Function
    // ============================================

    /**
     * Sort pixels within a selected region of an ImageData.
     *
     * @param {ImageData} imageData - The full image data
     * @param {Object} selection - { x, y, w, h } in pixel coordinates
     * @param {Object} options - { mode, direction, thresholdLower, thresholdUpper, noiseAmount, selectionPoints }
     * @returns {ImageData} Modified image data (mutated in place)
     */
    function sort(imageData, selection, options) {
        const { mode, direction, noiseAmount } = options;
        const data = imageData.data;
        const imgWidth = imageData.width;
        const { x, y, w, h } = selection;

        if (direction === 'horizontal') {
            // Process each row in the selection
            for (let row = y; row < y + h; row++) {
                // Extract pixels for this row within the selection
                const pixels = [];
                for (let col = x; col < x + w; col++) {
                    const idx = (row * imgWidth + col) * 4;
                    pixels.push({
                        x: col,
                        y: row,
                        r: data[idx],
                        g: data[idx + 1],
                        b: data[idx + 2],
                        a: data[idx + 3],
                        origCol: col,
                    });
                }

                // Detect intervals and sort each one
                const intervals = detectIntervals(pixels, options);

                for (const interval of intervals) {
                    // Remember the original positions
                    const positions = interval.map(p => p.origCol);

                    // Sort by the chosen mode
                    interval.sort((a, b) => {
                        return getPixelValue(a.r, a.g, a.b, mode) - getPixelValue(b.r, b.g, b.b, mode);
                    });

                    // Apply noise
                    const noised = applyNoise(interval, noiseAmount);

                    // Write back to image data at original positions
                    for (let i = 0; i < positions.length; i++) {
                        const idx = (row * imgWidth + positions[i]) * 4;
                        data[idx] = noised[i].r;
                        data[idx + 1] = noised[i].g;
                        data[idx + 2] = noised[i].b;
                        data[idx + 3] = noised[i].a;
                    }
                }
            }
        } else {
            // Vertical: process each column in the selection
            for (let col = x; col < x + w; col++) {
                const pixels = [];
                for (let row = y; row < y + h; row++) {
                    const idx = (row * imgWidth + col) * 4;
                    pixels.push({
                        x: col,
                        y: row,
                        r: data[idx],
                        g: data[idx + 1],
                        b: data[idx + 2],
                        a: data[idx + 3],
                        origRow: row,
                    });
                }

                const intervals = detectIntervals(pixels, options);

                for (const interval of intervals) {
                    const positions = interval.map(p => p.origRow);

                    interval.sort((a, b) => {
                        return getPixelValue(a.r, a.g, a.b, mode) - getPixelValue(b.r, b.g, b.b, mode);
                    });

                    const noised = applyNoise(interval, noiseAmount);

                    for (let i = 0; i < positions.length; i++) {
                        const idx = (positions[i] * imgWidth + col) * 4;
                        data[idx] = noised[i].r;
                        data[idx + 1] = noised[i].g;
                        data[idx + 2] = noised[i].b;
                        data[idx + 3] = noised[i].a;
                    }
                }
            }
        }

        return imageData;
    }

    // ============================================
    // Public API
    // ============================================

    return { sort };
})();

export default PixelSort;
