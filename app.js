import JSZip from 'jszip';
import PixelSort from './pixelsort.js';
import ImageFilters from './filters.js';

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
const btnReset = $('#btn-reset');
const btnClearSelection = $('#btn-clear-selection');
const btnSelectAll = $('#btn-select-all');
const chkAutoUpdate = $('#chk-auto-update');
const btnPreview = $('#btn-preview');
const chkLassoMode = $('#chk-lasso-mode');
const selectionOverlay = $('#selection-overlay');
const selectionInfo = $('#selection-info');
const selectionCoords = $('#selection-coords');

// History nav
const historyNav = $('#history-nav');
const btnHistoryBack = $('#btn-history-back');
const btnHistoryForward = $('#btn-history-forward');
const btnFlatten = $('#btn-flatten');
const historyCounter = $('#history-counter');

// Storage info
const storageInfo = $('#storage-info');
const storageIndicator = $('#storage-indicator');
const btnClearHistory = $('#btn-clear-history');
const btnExportZip = $('#btn-export-zip');

// Slider / number pairs
const threshLowerSlider = $('#threshold-lower');
const threshLowerNum = $('#threshold-lower-num');
const threshUpperSlider = $('#threshold-upper');
const threshUpperNum = $('#threshold-upper-num');
const noiseSlider = $('#noise-amount');
const noiseNum = $('#noise-amount-num');

// Feather Edge controls
const chkFeather = $('#chk-feather');
const featherSlider = $('#feather-radius');
const featherNum = $('#feather-radius-num');

// Filter controls
const filterGroup = $('#filter-group');
const filterIntensityRow = $('#filter-intensity-row');
const filterIntensitySlider = $('#filter-intensity');
const filterIntensityNum = $('#filter-intensity-num');
const btnApplyFilter = $('#btn-apply-filter');

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
    feather: true,          // Enable smooth edges
    featherRadius: 20,      // Smooth edges radius
    selection: null,        // { x, y, w, h } in canvas coords
    history: [],            // Array of ImageData snapshots
    historyIndex: -1,       // Current position in history (-1 = no history)
    previewBase: null,      // ImageData snapshot before live sort preview
    isDragging: false,
    dragStart: null,        // { x, y } in canvas coords
    selectionPoints: [],    // Array of {x, y} for lasso mode
};

// ============================================
// IndexedDB State Persistence
// ============================================

const DB_NAME = 'PixelSortDB';
const DB_VERSION = 1;
const STORE_NAME = 'appState';

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            req.result.createObjectStore(STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveState() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);

        // Save canvas as blob
        const blob = await new Promise(resolve => {
            canvas.toBlob(resolve, 'image/png');
        });

        // Save original image as data URL
        let origDataUrl = null;
        if (state.originalImage) {
            const tmpCanvas = document.createElement('canvas');
            tmpCanvas.width = state.originalImage.naturalWidth;
            tmpCanvas.height = state.originalImage.naturalHeight;
            tmpCanvas.getContext('2d').drawImage(state.originalImage, 0, 0);
            origDataUrl = tmpCanvas.toDataURL('image/png');
        }

        store.put(blob, 'canvasBlob');
        store.put(origDataUrl, 'originalImage');
        store.put({
            sortMode: state.sortMode,
            direction: state.direction,
            thresholdLower: state.thresholdLower,
            thresholdUpper: state.thresholdUpper,
            noiseAmount: state.noiseAmount,
            feather: state.feather,
            featherRadius: state.featherRadius,
            imageLoaded: state.imageLoaded,
        }, 'settings');

        await new Promise((resolve, reject) => {
            tx.oncomplete = resolve;
            tx.onerror = reject;
        });
        db.close();
    } catch (e) {
        console.warn('Failed to save state:', e);
    }
}

async function restoreState() {
    try {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);

        const [blob, origDataUrl, settings] = await Promise.all([
            new Promise(r => { const req = store.get('canvasBlob'); req.onsuccess = () => r(req.result); req.onerror = () => r(null); }),
            new Promise(r => { const req = store.get('originalImage'); req.onsuccess = () => r(req.result); req.onerror = () => r(null); }),
            new Promise(r => { const req = store.get('settings'); req.onsuccess = () => r(req.result); req.onerror = () => r(null); }),
        ]);
        db.close();

        if (settings) {
            state.sortMode = settings.sortMode || 'brightness';
            state.direction = settings.direction || 'horizontal';
            state.thresholdLower = settings.thresholdLower ?? 50;
            state.thresholdUpper = settings.thresholdUpper ?? 200;
            state.noiseAmount = settings.noiseAmount ?? 0;
            state.feather = settings.feather ?? true;
            state.featherRadius = settings.featherRadius ?? 20;
            state.imageLoaded = settings.imageLoaded || false;

            // Restore UI controls
            document.querySelectorAll('#sort-mode-group .btn-toggle').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === state.sortMode);
            });
            document.querySelectorAll('#direction-group .btn-toggle').forEach(b => {
                b.classList.toggle('active', b.dataset.direction === state.direction);
            });
            threshLowerSlider.value = state.thresholdLower;
            threshLowerNum.value = state.thresholdLower;
            threshUpperSlider.value = state.thresholdUpper;
            threshUpperNum.value = state.thresholdUpper;
            noiseSlider.value = state.noiseAmount;
            noiseNum.value = state.noiseAmount;
            chkFeather.checked = state.feather;
            featherSlider.value = state.featherRadius;
            featherNum.value = state.featherRadius;

            // Toggle feather slider visibility based on checkbox
            document.getElementById('feather-row').style.display = state.feather ? 'flex' : 'none';
        }

        // Restore original image
        if (origDataUrl) {
            const img = new Image();
            img.onload = () => { state.originalImage = img; };
            img.src = origDataUrl;
        }

        // Restore canvas
        if (blob && state.imageLoaded) {
            const img = new Image();
            img.onload = () => {
                canvas.width = img.naturalWidth;
                canvas.height = img.naturalHeight;
                ctx.drawImage(img, 0, 0);
                dropZone.classList.add('hidden');
                canvas.classList.remove('hidden');
                updateUI();
            };
            img.src = URL.createObjectURL(blob);
        }
    } catch (e) {
        console.warn('Failed to restore state:', e);
    }
}

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
            state.history = [];
            state.historyIndex = -1;
            renderImage(img);
            pushHistory(); // save initial state as step 0
            updateUI();
            saveState();
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
        hotApplySort();
    });
});

// Direction toggles
document.querySelectorAll('#direction-group .btn-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('#direction-group .btn-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.direction = btn.dataset.direction;
        hotApplySort();
    });
});

// ============================================
// Slider ↔ Number Input Sync
// ============================================

function syncPair(slider, numInput, stateProp) {
    slider.addEventListener('input', () => {
        numInput.value = slider.value;
        state[stateProp] = parseInt(slider.value, 10);
        hotApplySort();
    });
    numInput.addEventListener('input', () => {
        const v = Math.max(parseInt(slider.min), Math.min(parseInt(slider.max), parseInt(numInput.value) || 0));
        slider.value = v;
        numInput.value = v;
        state[stateProp] = v;
        hotApplySort();
    });
}

syncPair(threshLowerSlider, threshLowerNum, 'thresholdLower');
syncPair(threshUpperSlider, threshUpperNum, 'thresholdUpper');
syncPair(noiseSlider, noiseNum, 'noiseAmount');
syncPair(featherSlider, featherNum, 'featherRadius');

chkFeather.addEventListener('change', () => {
    state.feather = chkFeather.checked;
    document.getElementById('feather-row').style.display = state.feather ? 'flex' : 'none';
    hotApplySort();
});

// Filter intensity sync
filterIntensitySlider.addEventListener('input', () => {
    filterIntensityNum.value = filterIntensitySlider.value;
});
filterIntensityNum.addEventListener('input', () => {
    const v = Math.max(-100, Math.min(100, parseInt(filterIntensityNum.value) || 0));
    filterIntensitySlider.value = v;
    filterIntensityNum.value = v;
});

// ============================================
// Filter Controls
// ============================================

let activeFilter = null;

// Show/hide intensity slider based on filter type
function updateFilterIntensity() {
    const binaryFilters = ['invert', 'grayscale'];
    if (!activeFilter || binaryFilters.includes(activeFilter)) {
        filterIntensityRow.style.display = 'none';
    } else {
        filterIntensityRow.style.display = '';
        // Adjust range for blur
        if (activeFilter === 'blur') {
            filterIntensitySlider.min = 0;
            filterIntensitySlider.max = 20;
            filterIntensitySlider.value = 3;
            filterIntensityNum.min = 0;
            filterIntensityNum.max = 20;
            filterIntensityNum.value = 3;
        } else if (activeFilter === 'sharpen') {
            filterIntensitySlider.min = 0;
            filterIntensitySlider.max = 100;
            filterIntensitySlider.value = 50;
            filterIntensityNum.min = 0;
            filterIntensityNum.max = 100;
            filterIntensityNum.value = 50;
        } else {
            filterIntensitySlider.min = -100;
            filterIntensitySlider.max = 100;
            filterIntensitySlider.value = 50;
            filterIntensityNum.min = -100;
            filterIntensityNum.max = 100;
            filterIntensityNum.value = 50;
        }
    }
}

// Toggle filter buttons
document.querySelectorAll('#filter-group .btn-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
        const filter = btn.dataset.filter;
        if (activeFilter === filter) {
            // Deselect
            btn.classList.remove('active');
            activeFilter = null;
        } else {
            document.querySelectorAll('#filter-group .btn-toggle').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeFilter = filter;
        }
        updateFilterIntensity();
        btnApplyFilter.disabled = !activeFilter || !state.imageLoaded;
    });
});

// Apply selected filter
function applyFilter() {
    if (!state.imageLoaded || !activeFilter) return;
    const value = parseInt(filterIntensitySlider.value) || 0;
    ImageFilters.apply(canvas, activeFilter, value);
    pushHistory();

    const toast = document.getElementById('toast');
    toast.textContent = `${activeFilter} applied`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);

    updateUI();
    saveState();
}

// Double-click a filter button to apply immediately
document.querySelectorAll('#filter-group .btn-toggle').forEach((btn) => {
    btn.addEventListener('dblclick', () => {
        activeFilter = btn.dataset.filter;
        applyFilter();
    });
});

// Apply filter keyboard shortcut: F key
document.addEventListener('keydown', (e) => {
    if (e.key === 'f' && !e.ctrlKey && !e.altKey && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        applyFilter();
    }
});

// Apply filter button
btnApplyFilter.addEventListener('click', applyFilter);

// ============================================
// History Management
// ============================================

function pushHistory() {
    // Discard any forward history
    state.history = state.history.slice(0, state.historyIndex + 1);
    // Save current canvas state
    state.history.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    state.historyIndex = state.history.length - 1;
}

function navigateHistory(index) {
    if (index < 0 || index >= state.history.length) return;
    state.historyIndex = index;
    const snapshot = state.history[index];
    canvas.width = snapshot.width;
    canvas.height = snapshot.height;
    ctx.putImageData(snapshot, 0, 0);
    updateUI();
    saveState();
}

// ============================================
// UI Updates
// ============================================

function updateUI() {
    const hasImage = state.imageLoaded;
    const hasSelection = state.selection !== null;

    btnExport.disabled = !hasImage;
    btnSort.disabled = !hasImage || !hasSelection;
    btnReset.disabled = !hasImage;

    // Selection info
    if (hasImage) {
        selectionInfo.hidden = false;
        if (hasSelection) {
            const s = state.selection;
            selectionCoords.textContent = `x: ${s.x}  y: ${s.y}  w: ${s.w}  h: ${s.h}`;
            btnSelectAll.disabled = false;
        } else {
            selectionCoords.textContent = 'No selection';
            btnSelectAll.disabled = false;
        }
    } else {
        selectionInfo.hidden = true;
    }

    if (!hasSelection) {
        hideSelectionOverlay();
    }

    // History nav
    if (hasImage && state.history.length > 0) {
        historyNav.hidden = false;
        btnHistoryBack.disabled = state.historyIndex <= 0;
        btnHistoryForward.disabled = state.historyIndex >= state.history.length - 1;
        btnFlatten.disabled = state.history.length <= 1;
        historyCounter.textContent = `Step ${state.historyIndex + 1} / ${state.history.length}`;
    } else {
        historyNav.hidden = true;
    }

    // Storage info
    if (hasImage && state.history.length > 0) {
        const totalBytes = state.history.reduce((sum, img) => sum + img.data.length, 0);
        const mb = (totalBytes / (1024 * 1024)).toFixed(1);
        const WARNING_MB = 50;

        storageInfo.hidden = false;
        if (totalBytes / (1024 * 1024) > WARNING_MB) {
            storageInfo.classList.add('warning');
            storageIndicator.textContent = `\u26a0\ufe0f ${state.history.length} steps \u00b7 ~${mb} MB`;
        } else {
            storageInfo.classList.remove('warning');
            storageIndicator.textContent = `\ud83d\udcbe ${state.history.length} steps \u00b7 ~${mb} MB`;
        }
    } else {
        storageInfo.hidden = true;
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

// Helper to get bounding box of a polygon
function getPolygonBoundingBox(points) {
    if (points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
    let minX = points[0].x, maxX = points[0].x;
    let minY = points[0].y, maxY = points[0].y;
    for (const p of points) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    }
    return {
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY
    };
}

// Draw the custom lasso polygon using the SVG overlay
function drawLassoPreview() {
    if (!state.selectionPoints || state.selectionPoints.length === 0) {
        lassoOverlay.hidden = true;
        return;
    }

    const rect = canvas.getBoundingClientRect();
    const containerRect = canvasContainer.getBoundingClientRect();
    const canvasOffsetX = rect.left - containerRect.left;
    const canvasOffsetY = rect.top - containerRect.top;

    lassoOverlay.style.left = canvasOffsetX + 'px';
    lassoOverlay.style.top = canvasOffsetY + 'px';
    lassoOverlay.style.width = rect.width + 'px';
    lassoOverlay.style.height = rect.height + 'px';
    lassoOverlay.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    lassoOverlay.hidden = false;

    // The vector-effect="non-scaling-stroke" on the polygon ensures stroke-width stays consistent
    const pointsStr = state.selectionPoints.map(p => `${p.x},${p.y}`).join(' ');
    lassoPolygon.setAttribute('points', pointsStr);
}

// Bind mousedown to container to allow starting drag from outside
canvasContainer.addEventListener('mousedown', (e) => {
    if (!state.imageLoaded) return;
    if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;

    const coords = getCanvasCoords(e);
    state.isDragging = true;
    state.dragStart = coords;

    // Clear previous selection/preview on new drag start
    if (state.previewBase) {
        ctx.putImageData(state.previewBase, 0, 0);
    } else {
        // Save the clean canvas state before drawing lasso lines
        state.previewBase = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    state.selection = null;
    hideSelectionOverlay();
    lassoOverlay.hidden = true;

    if (chkLassoMode.checked) {
        state.selectionPoints = [coords];
        drawLassoPreview();
    } else {
        state.selectionPoints = [];
    }
});

// Bind move/up to window to handle dragging off-screen/outside container
window.addEventListener('mousemove', (e) => {
    if (!state.isDragging || !state.dragStart) return;
    const coords = getCanvasCoords(e);

    if (chkLassoMode.checked) {
        // Add point to polygon string
        state.selectionPoints.push(coords);
        drawLassoPreview();
    } else {
        // Rectangular tracking
        let x = Math.min(state.dragStart.x, coords.x);
        let y = Math.min(state.dragStart.y, coords.y);
        let w = Math.abs(coords.x - state.dragStart.x);
        let h = Math.abs(coords.y - state.dragStart.y);

        const x1 = Math.max(0, Math.min(canvas.width, x));
        const y1 = Math.max(0, Math.min(canvas.height, y));
        const x2 = Math.max(0, Math.min(canvas.width, x + w));
        const y2 = Math.max(0, Math.min(canvas.height, y + h));

        showSelectionOverlay(x1, y1, x2 - x1, y2 - y1);
    }
});

window.addEventListener('mouseup', (e) => {
    if (!state.isDragging || !state.dragStart) return;
    state.isDragging = false;
    const coords = getCanvasCoords(e);

    if (chkLassoMode.checked) {
        state.selectionPoints.push(coords);
        drawLassoPreview(); // Redraw with closed path

        const bbox = getPolygonBoundingBox(state.selectionPoints);
        if (bbox.w > 2 && bbox.h > 2) {
            state.selection = bbox;
            // Note: we're passing the BOUNDING BOX to state.selection.
            // The PixelSort engine will need to know about state.selectionPoints to do the mask check!
            hotApplySort();
        } else {
            state.selection = null;
            state.selectionPoints = [];
            lassoOverlay.hidden = true;
            ctx.putImageData(state.previewBase, 0, 0);
            state.previewBase = null;
        }
    } else {
        let rawX = Math.min(state.dragStart.x, coords.x);
        let rawY = Math.min(state.dragStart.y, coords.y);
        let rawW = Math.abs(coords.x - state.dragStart.x);
        let rawH = Math.abs(coords.y - state.dragStart.y);

        const x1 = Math.max(0, Math.min(canvas.width, rawX));
        const y1 = Math.max(0, Math.min(canvas.height, rawY));
        const x2 = Math.max(0, Math.min(canvas.width, rawX + rawW));
        const y2 = Math.max(0, Math.min(canvas.height, rawY + rawH));

        const w = x2 - x1;
        const h = y2 - y1;

        if (w > 2 && h > 2) {
            state.selection = { x: x1, y: y1, w, h };
            showSelectionOverlay(x1, y1, w, h);
            // Already saved previewBase in mousedown
            hotApplySort();
        } else {
            state.selection = null;
            hideSelectionOverlay();
            if (state.previewBase) {
                ctx.putImageData(state.previewBase, 0, 0);
                state.previewBase = null;
            }
        }
    }

    state.dragStart = null;
    updateUI();
});

// Clear selection when toggling lasso mode
chkLassoMode.addEventListener('change', () => {
    if (state.previewBase) {
        ctx.putImageData(state.previewBase, 0, 0);
        state.previewBase = null;
    }
    state.selection = null;
    state.selectionPoints = [];
    state.dragStart = null;
    hideSelectionOverlay();
    lassoOverlay.hidden = true;
    updateUI();
});

// Select All
btnSelectAll.addEventListener('click', () => {
    if (!state.imageLoaded) return;

    // Clear lasso entirely
    state.selectionPoints = [];
    chkLassoMode.checked = false;
    lassoOverlay.hidden = true;

    // Restore any previous preview first
    if (state.previewBase) {
        ctx.putImageData(state.previewBase, 0, 0);
    }

    const w = canvas.width;
    const h = canvas.height;

    state.selection = { x: 0, y: 0, w, h };
    showSelectionOverlay(0, 0, w, h);

    state.previewBase = ctx.getImageData(0, 0, w, h);
    hotApplySort();
    updateUI();
});

// Clear selection
btnClearSelection.addEventListener('click', () => {
    // Clear lasso entirely
    state.selectionPoints = [];
    lassoOverlay.hidden = true;

    // Restore previewBase if we have one (discard live preview)
    if (state.previewBase) {
        ctx.putImageData(state.previewBase, 0, 0);
        state.previewBase = null;
    }
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
    renderImage(state.originalImage);
    pushHistory();
    state.selection = null;
    state.selectionPoints = [];
    hideSelectionOverlay();
    lassoOverlay.hidden = true;
    updateUI();
    saveState();
});

// ============================================
// Export Helpers
// ============================================

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();

    // Use a longer timeout for cleanup to ensure the browser has started the download
    setTimeout(() => {
        if (document.body.contains(link)) {
            document.body.removeChild(link);
        }
        URL.revokeObjectURL(url);
    }, 2000);
}

// ============================================
// Export
// ============================================

btnExport.addEventListener('click', async () => {
    if (!state.imageLoaded) return;
    canvas.toBlob((blob) => {
        if (blob) {
            downloadFile(blob, 'pixel-sorted.png');
            showToast('Image exported!');
        } else {
            showToast('Export failed (canvas error)');
        }
    }, 'image/png');
});

// ============================================
// Hot-Apply (debounced live sort preview)
// ============================================



let hotApplyTimer = null;

function hotApplySort(force = false) {
    if (!state.imageLoaded || !state.selection || !state.previewBase) return;

    const autoUpdate = chkAutoUpdate.checked;

    // Toggle manual preview button
    btnPreview.style.display = autoUpdate ? 'none' : 'inline-block';

    // If auto-update is off and not forced, stop here (skip sort)
    if (!autoUpdate && !force) return;

    // Clear existing timer
    if (hotApplyTimer) clearTimeout(hotApplyTimer);

    // If strictly manual (forced), run immediately without debounce
    if (force) {
        performSort();
        return;
    }

    // Otherwise, debounce the auto-update
    hotApplyTimer = setTimeout(() => {
        performSort();
    }, 150);
}

function performSort() {
    // Restore from previewBase, then sort
    const imageData = new ImageData(
        new Uint8ClampedArray(state.previewBase.data),
        state.previewBase.width,
        state.previewBase.height
    );

    const sortParams = {
        mode: state.sortMode,
        direction: state.direction,
        thresholdLower: state.thresholdLower,
        thresholdUpper: state.thresholdUpper,
        noiseAmount: state.noiseAmount,
        feather: state.feather,
        featherRadius: state.featherRadius,
        selectionPoints: chkLassoMode.checked ? state.selectionPoints : null
    };

    // Use a Web Worker or async if possible? For now, sync is fine but keep UI responsive
    // Using simple requestAnimationFrame to allow UI to breathe if needed? 
    // Actual sort is synchronous in current implementation.

    PixelSort.sort(imageData, state.selection, sortParams);
    ctx.putImageData(imageData, 0, 0);
}

// Checkbox Listener
chkAutoUpdate.addEventListener('change', () => {
    const isChecked = chkAutoUpdate.checked;
    btnPreview.style.display = isChecked ? 'none' : 'inline-block';
    if (isChecked) hotApplySort(true); // Immediate update when turning ON
});

// Manual Preview Listener
btnPreview.addEventListener('click', () => hotApplySort(true));

// ============================================
// Commit (save live preview to history)
// ============================================

btnSort.addEventListener('click', () => {
    if (!state.imageLoaded || !state.selection) return;

    // Commit the current canvas state (which is the live preview) to history
    pushHistory();
    state.previewBase = null;
    state.selection = null;
    hideSelectionOverlay();

    const toast = document.getElementById('toast');
    toast.textContent = 'Sort committed!';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);

    updateUI();
    saveState();
});

// ============================================
// History Navigation
// ============================================

btnHistoryBack.addEventListener('click', () => {
    navigateHistory(state.historyIndex - 1);
});

btnHistoryForward.addEventListener('click', () => {
    navigateHistory(state.historyIndex + 1);
});

btnFlatten.addEventListener('click', () => {
    if (state.history.length <= 1) return;
    // Keep only the current snapshot
    const current = state.history[state.historyIndex];
    state.history = [current];
    state.historyIndex = 0;

    const toast = document.getElementById('toast');
    toast.textContent = 'History flattened';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);

    updateUI();
    saveState();
});


// ============================================
// Storage Management
// ============================================

btnClearHistory.addEventListener('click', () => {
    if (state.history.length <= 1) return;
    const current = state.history[state.historyIndex];
    state.history = [current];
    state.historyIndex = 0;

    const toast = document.getElementById('toast');
    toast.textContent = 'History cleared — kept current step';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);

    updateUI();
    saveState();
});

btnExportZip.addEventListener('click', async () => {
    if (state.history.length === 0) return;

    const toast = document.getElementById('toast');
    toast.textContent = 'Creating ZIP...';
    toast.classList.add('show');

    try {
        if (typeof JSZip === 'undefined') {
            throw new Error('JSZip library not loaded. Check your internet connection.');
        }

        const zip = new JSZip();
        const tmpCanvas = document.createElement('canvas');
        const tmpCtx = tmpCanvas.getContext('2d');

        for (let i = 0; i < state.history.length; i++) {
            const snap = state.history[i];
            tmpCanvas.width = snap.width;
            tmpCanvas.height = snap.height;
            tmpCtx.putImageData(snap, 0, 0);

            const blob = await new Promise(resolve => {
                tmpCanvas.toBlob((b) => resolve(b), 'image/png');
            });

            if (!blob) continue;

            const padded = String(i + 1).padStart(3, '0');
            zip.file(`step_${padded}.png`, blob);
        }

        // Generate ZIP as uint8array then create Blob manually for better compatibility
        const content = await zip.generateAsync({
            type: 'uint8array',
            compression: 'STORE' // No compression for faster local processing
        });
        const zipBlob = new Blob([content], { type: 'application/zip' });

        downloadFile(zipBlob, 'pixel-sort-history.zip');

        toast.textContent = `Exported ${state.history.length} steps as ZIP`;
    } catch (err) {
        console.error('ZIP export failed:', err);
        toast.textContent = err.message || 'ZIP export failed';
    }

    setTimeout(() => toast.classList.remove('show'), 2000);
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

//

// ============================================
// Keyboard Shortcuts
// ============================================

document.addEventListener('keydown', (e) => {
    // Ctrl+O — Upload
    if (e.ctrlKey && e.key === 'o') {
        e.preventDefault();
        fileInput.click();
    }
    // Ctrl+S — Export
    if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (state.imageLoaded) {
            btnExport.click();
            showToast('Image exported!');
        }
    }
    // Ctrl+Z — History Back
    if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (state.historyIndex > 0) {
            navigateHistory(state.historyIndex - 1);
        }
    }
    // Ctrl+Y / Ctrl+Shift+Z — History Forward
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
        e.preventDefault();
        if (state.historyIndex < state.history.length - 1) {
            navigateHistory(state.historyIndex + 1);
        }
    }
    // Enter — Apply Sort
    if (e.key === 'Enter' && !e.ctrlKey && !e.altKey) {
        // Don't fire if focused on an input
        if (document.activeElement.tagName === 'INPUT') return;
        e.preventDefault();
        if (!btnSort.disabled) {
            btnSort.click();
        }
    }
    // Escape — Clear selection
    if (e.key === 'Escape') {
        state.selection = null;
        state.dragStart = null;
        hideSelectionOverlay();
        updateUI();
    }
});

// ============================================
// Init
// ============================================

restoreState().then(() => updateUI());
