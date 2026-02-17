// Pixel Sort — Main Application
// UI wiring, image handling, state management

(function () {
    'use strict';

    // ============================================
    // DOM References
    // ============================================

    const $ = (sel) => document.querySelector(sel);
    const canvas = $('#canvas');
    const ctx = canvas.getContext('2d');
    const canvasContainer = $('#canvas-container');
    const dropZone = $('#drop-zone');
    const fileInput = $('#file-input');
    const btnUpload = $('#btn-upload');
    const btnExport = $('#btn-export');
    const btnSort = $('#btn-sort');
    const btnUndo = $('#btn-undo');
    const btnReset = $('#btn-reset');
    const btnClearSelection = $('#btn-clear-selection');
    const selectionOverlay = $('#selection-overlay');
    const selectionInfo = $('#selection-info');
    const selectionCoords = $('#selection-coords');

    // Slider / number pairs
    const threshLowerSlider = $('#threshold-lower');
    const threshLowerNum = $('#threshold-lower-num');
    const threshUpperSlider = $('#threshold-upper');
    const threshUpperNum = $('#threshold-upper-num');
    const noiseSlider = $('#noise-amount');
    const noiseNum = $('#noise-amount-num');

    // ============================================
    // App State
    // ============================================

    const state = {
        originalImage: null,    // HTMLImageElement — the original loaded image
        imageLoaded: false,
        sortMode: 'brightness',
        direction: 'horizontal',
        thresholdLower: 50,
        thresholdUpper: 200,
        noiseAmount: 0,
        selection: null,        // { x, y, w, h } in canvas coords
        undoStack: [],          // Array of ImageData snapshots
        isDragging: false,
        dragStart: null,        // { x, y } in canvas coords
    };

    // ============================================
    // Image Upload & Display
    // ============================================

    function loadImage(file) {
        if (!file || !file.type.startsWith('image/')) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                state.originalImage = img;
                state.imageLoaded = true;
                state.selection = null;
                state.undoStack = [];
                renderImage(img);
                updateUI();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function renderImage(img) {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        dropZone.classList.add('hidden');
        canvas.classList.remove('hidden');
    }

    // ============================================
    // Upload button & file input
    // ============================================

    btnUpload.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            loadImage(e.target.files[0]);
        }
    });

    // ============================================
    // Drag & Drop
    // ============================================

    canvasContainer.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    canvasContainer.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    canvasContainer.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        const file = e.dataTransfer.files[0];
        if (file) loadImage(file);
    });

    // Also allow dropping on the whole body when no image is loaded
    document.body.addEventListener('dragover', (e) => {
        if (!state.imageLoaded) {
            e.preventDefault();
            dropZone.classList.add('drag-over');
        }
    });

    document.body.addEventListener('drop', (e) => {
        if (!state.imageLoaded) {
            e.preventDefault();
            dropZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file) loadImage(file);
        }
    });

    // ============================================
    // Toggle Button Groups
    // ============================================

    // Sort mode toggles
    document.querySelectorAll('#sort-mode-group .btn-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#sort-mode-group .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sortMode = btn.dataset.mode;
        });
    });

    // Direction toggles
    document.querySelectorAll('#direction-group .btn-toggle').forEach((btn) => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#direction-group .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.direction = btn.dataset.direction;
        });
    });

    // ============================================
    // Slider ↔ Number Input Sync
    // ============================================

    function syncPair(slider, numInput, stateProp) {
        slider.addEventListener('input', () => {
            numInput.value = slider.value;
            state[stateProp] = parseInt(slider.value, 10);
        });
        numInput.addEventListener('input', () => {
            const v = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), parseInt(numInput.value) || 0));
            slider.value = v;
            numInput.value = v;
            state[stateProp] = v;
        });
    }

    syncPair(threshLowerSlider, threshLowerNum, 'thresholdLower');
    syncPair(threshUpperSlider, threshUpperNum, 'thresholdUpper');
    syncPair(noiseSlider, noiseNum, 'noiseAmount');

    // ============================================
    // UI Updates
    // ============================================

    function updateUI() {
        const hasImage = state.imageLoaded;
        const hasSelection = state.selection !== null;

        btnExport.disabled = !hasImage;
        btnSort.disabled = !hasImage || !hasSelection;
        btnUndo.disabled = state.undoStack.length === 0;
        btnReset.disabled = !hasImage;

        // Selection info
        if (hasSelection) {
            selectionInfo.hidden = false;
            const s = state.selection;
            selectionCoords.textContent = `x: ${s.x}  y: ${s.y}  w: ${s.w}  h: ${s.h}`;
        } else {
            selectionInfo.hidden = true;
            hideSelectionOverlay();
        }
    }

    // ============================================
    // Selection Overlay (visual)
    // ============================================

    function showSelectionOverlay(x, y, w, h) {
        // Convert canvas coords to screen coords
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width / canvas.width;
        const scaleY = rect.height / canvas.height;

        const containerRect = canvasContainer.getBoundingClientRect();
        const canvasOffsetX = rect.left - containerRect.left;
        const canvasOffsetY = rect.top - containerRect.top;

        selectionOverlay.hidden = false;
        selectionOverlay.style.left = (canvasOffsetX + x * scaleX) + 'px';
        selectionOverlay.style.top = (canvasOffsetY + y * scaleY) + 'px';
        selectionOverlay.style.width = (w * scaleX) + 'px';
        selectionOverlay.style.height = (h * scaleY) + 'px';
    }

    function hideSelectionOverlay() {
        selectionOverlay.hidden = true;
    }

    // ============================================
    // Region Selection (mouse drag on canvas)
    // ============================================

    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: Math.round((e.clientX - rect.left) * scaleX),
            y: Math.round((e.clientY - rect.top) * scaleY),
        };
    }

    canvas.addEventListener('mousedown', (e) => {
        if (!state.imageLoaded) return;
        const coords = getCanvasCoords(e);
        state.isDragging = true;
        state.dragStart = coords;
        state.selection = null;
        hideSelectionOverlay();
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!state.isDragging || !state.dragStart) return;
        const coords = getCanvasCoords(e);
        const x = Math.min(state.dragStart.x, coords.x);
        const y = Math.min(state.dragStart.y, coords.y);
        const w = Math.abs(coords.x - state.dragStart.x);
        const h = Math.abs(coords.y - state.dragStart.y);

        // Clamp to canvas bounds
        const cx = Math.max(0, x);
        const cy = Math.max(0, y);
        const cw = Math.min(canvas.width - cx, w);
        const ch = Math.min(canvas.height - cy, h);

        showSelectionOverlay(cx, cy, cw, ch);
    });

    canvas.addEventListener('mouseup', (e) => {
        if (!state.isDragging || !state.dragStart) return;
        state.isDragging = false;
        const coords = getCanvasCoords(e);

        const x = Math.max(0, Math.min(state.dragStart.x, coords.x));
        const y = Math.max(0, Math.min(state.dragStart.y, coords.y));
        const w = Math.min(canvas.width - x, Math.abs(coords.x - state.dragStart.x));
        const h = Math.min(canvas.height - y, Math.abs(coords.y - state.dragStart.y));

        if (w > 2 && h > 2) {
            state.selection = { x, y, w, h };
            showSelectionOverlay(x, y, w, h);
        } else {
            state.selection = null;
            hideSelectionOverlay();
        }
        state.dragStart = null;
        updateUI();
    });

    // Clear selection
    btnClearSelection.addEventListener('click', () => {
        state.selection = null;
        state.dragStart = null;
        hideSelectionOverlay();
        updateUI();
    });

    // ============================================
    // Reset
    // ============================================

    btnReset.addEventListener('click', () => {
        if (!state.originalImage) return;
        state.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
        renderImage(state.originalImage);
        state.selection = null;
        hideSelectionOverlay();
        updateUI();
    });

    // ============================================
    // Export
    // ============================================

    btnExport.addEventListener('click', () => {
        if (!state.imageLoaded) return;
        const link = document.createElement('a');
        link.download = 'pixel-sorted.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    });

    // ============================================
    // Sort (placeholder — will be wired in commit 4)
    // ============================================

    btnSort.addEventListener('click', () => {
        if (!state.imageLoaded || !state.selection) return;

        // Save current state for undo
        state.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));

        // Get full image data, sort the selected region, write it back
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        PixelSort.sort(imageData, state.selection, {
            mode: state.sortMode,
            direction: state.direction,
            thresholdLower: state.thresholdLower,
            thresholdUpper: state.thresholdUpper,
            noiseAmount: state.noiseAmount,
        });
        ctx.putImageData(imageData, 0, 0);

        updateUI();
    });

    // ============================================
    // Undo
    // ============================================

    btnUndo.addEventListener('click', () => {
        if (state.undoStack.length === 0) return;
        const prev = state.undoStack.pop();
        canvas.width = prev.width;
        canvas.height = prev.height;
        ctx.putImageData(prev, 0, 0);
        updateUI();
    });

    // ============================================
    // Recalculate selection overlay on resize
    // ============================================

    window.addEventListener('resize', () => {
        if (state.selection) {
            const s = state.selection;
            showSelectionOverlay(s.x, s.y, s.w, s.h);
        }
    });

    // ============================================
    // Init
    // ============================================

    updateUI();

})();
