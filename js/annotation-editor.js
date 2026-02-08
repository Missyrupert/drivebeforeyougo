/**
 * AnnotationEditor
 * Fabric.js canvas overlay for annotating junction Street View images
 * with arrows, text labels, and highlights.
 */
const AnnotationEditor = (() => {
  'use strict';

  const STORAGE_KEY = 'dbug-annotations';

  const SIZES = {
    small:  { arrow: 60,  arrowHead: 10, text: 16, highlight: 30, stroke: 2 },
    medium: { arrow: 100, arrowHead: 16, text: 22, highlight: 50, stroke: 3 },
    large:  { arrow: 150, arrowHead: 22, text: 30, highlight: 75, stroke: 4 },
  };

  let canvas = null;
  let containerEl = null;
  let editing = false;
  let currentKey = null;
  let activeTool = null;
  let colour = '#ff3333';
  let size = 'medium';

  /**
   * Create Fabric.js canvas, size to container.
   */
  function init(canvasId, container) {
    containerEl = container;
    const canvasEl = document.getElementById(canvasId);
    if (!canvasEl) return;

    canvas = new fabric.Canvas(canvasId, {
      selection: false,
      renderOnAddRemove: true,
    });

    resize();
    _setReadOnly(true);
  }

  /**
   * Resize canvas to match container dimensions.
   */
  function resize() {
    if (!canvas || !containerEl) return;
    const w = containerEl.clientWidth;
    const h = containerEl.clientHeight;
    canvas.setWidth(w);
    canvas.setHeight(h);
    canvas.calcOffset();
    canvas.renderAll();
  }

  /**
   * Enter edit mode for a junction.
   */
  function enter(junctionKey) {
    if (!canvas) return;
    currentKey = junctionKey;
    editing = true;
    activeTool = null;

    // Enable pointer events on upper canvas
    const upperCanvas = containerEl.querySelector('.upper-canvas');
    if (upperCanvas) upperCanvas.style.pointerEvents = 'auto';

    // Load existing annotations if any
    const data = _loadFromStorage(junctionKey);
    if (data && data.objects) {
      canvas.loadFromJSON(data.objects, () => {
        _setReadOnly(false);
        canvas.renderAll();
      });
    } else {
      canvas.clear();
      _setReadOnly(false);
    }

    // Listen for clicks to place objects
    canvas.on('mouse:down', _onCanvasClick);

    document.body.classList.add('editing');
  }

  /**
   * Exit edit mode, discard unsaved changes.
   */
  function exit() {
    if (!canvas) return;
    editing = false;
    activeTool = null;

    canvas.off('mouse:down', _onCanvasClick);
    document.body.classList.remove('editing');

    // Reload saved state or clear
    if (currentKey) {
      const key = currentKey;
      currentKey = null;
      load(key);
    } else {
      canvas.clear();
      _setReadOnly(true);
      hide();
    }
  }

  /**
   * Serialize canvas to JSON, store in localStorage.
   */
  function save() {
    if (!canvas || !currentKey) return;

    const all = _getAllAnnotations();
    all[currentKey] = {
      objects: canvas.toJSON(),
      updated: Date.now(),
    };
    _saveToStorage(all);

    editing = false;
    activeTool = null;
    canvas.off('mouse:down', _onCanvasClick);
    document.body.classList.remove('editing');
    _setReadOnly(true);

    // Keep annotations visible as read-only
    const upperCanvas = containerEl.querySelector('.upper-canvas');
    if (upperCanvas) upperCanvas.style.pointerEvents = 'none';
  }

  /**
   * Load + render saved annotations (read-only mode).
   */
  function load(junctionKey) {
    if (!canvas) return;
    currentKey = junctionKey;

    const data = _loadFromStorage(junctionKey);
    if (data && data.objects) {
      // Show the canvas
      const wrapper = containerEl.querySelector('.canvas-container');
      if (wrapper) wrapper.style.display = '';
      const upperCanvas = containerEl.querySelector('.upper-canvas');
      if (upperCanvas) upperCanvas.style.pointerEvents = 'none';

      canvas.loadFromJSON(data.objects, () => {
        _setReadOnly(true);
        canvas.renderAll();
      });
    } else {
      hide();
    }
  }

  /**
   * Clear all objects from canvas.
   */
  function clear() {
    if (!canvas) return;
    canvas.clear();
    canvas.renderAll();
  }

  /**
   * Hide canvas overlay.
   */
  function hide() {
    if (!canvas) return;
    canvas.clear();
    canvas.renderAll();
    const wrapper = containerEl.querySelector('.canvas-container');
    if (wrapper) wrapper.style.display = 'none';
  }

  /**
   * Boolean: currently in edit mode?
   */
  function isEditing() {
    return editing;
  }

  /**
   * Set the active drawing tool.
   */
  function setTool(tool) {
    activeTool = tool;
  }

  /**
   * Set the annotation colour.
   */
  function setColour(c) {
    colour = c;
  }

  /**
   * Set the annotation size.
   */
  function setSize(s) {
    if (SIZES[s]) size = s;
  }

  /**
   * Check if annotations exist for a junction key.
   */
  function hasAnnotations(junctionKey) {
    const data = _loadFromStorage(junctionKey);
    return !!(data && data.objects && data.objects.objects && data.objects.objects.length > 0);
  }

  // ---- Tool placement on canvas click ----

  function _onCanvasClick(opt) {
    if (!editing || !activeTool) return;

    // Don't place new objects when clicking on existing ones
    if (opt.target) return;

    const pointer = canvas.getPointer(opt.e);
    const x = pointer.x;
    const y = pointer.y;

    switch (activeTool) {
      case 'arrow':  _placeArrow(x, y); break;
      case 'text':   _placeText(x, y); break;
      case 'highlight': _placeHighlight(x, y); break;
    }
  }

  function _placeArrow(x, y) {
    const s = SIZES[size];
    const lineLength = s.arrow;
    const headSize = s.arrowHead;

    // Arrow shaft pointing right by default
    const line = new fabric.Line([0, 0, lineLength, 0], {
      stroke: colour,
      strokeWidth: s.stroke,
      originX: 'center',
      originY: 'center',
    });

    // Arrowhead triangle
    const head = new fabric.Triangle({
      width: headSize,
      height: headSize,
      fill: colour,
      left: lineLength,
      top: 0,
      angle: 90,
      originX: 'center',
      originY: 'center',
    });

    const group = new fabric.Group([line, head], {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
    });

    canvas.add(group);
    canvas.setActiveObject(group);
    canvas.renderAll();
  }

  function _placeText(x, y) {
    const s = SIZES[size];

    const text = new fabric.IText('Label', {
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      fontSize: s.text,
      fill: colour,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
      fontWeight: '600',
      backgroundColor: 'rgba(255,255,255,0.85)',
      padding: 4,
    });

    canvas.add(text);
    canvas.setActiveObject(text);
    text.enterEditing();
    text.selectAll();
    canvas.renderAll();
  }

  function _placeHighlight(x, y) {
    const s = SIZES[size];

    // Convert hex colour to rgba for semi-transparent fill
    const rgb = _hexToRgb(colour);
    const fillColour = rgb
      ? `rgba(${rgb.r},${rgb.g},${rgb.b},0.25)`
      : 'rgba(255,51,51,0.25)';

    const circle = new fabric.Circle({
      left: x,
      top: y,
      originX: 'center',
      originY: 'center',
      radius: s.highlight,
      fill: fillColour,
      stroke: colour,
      strokeWidth: s.stroke,
    });

    canvas.add(circle);
    canvas.setActiveObject(circle);
    canvas.renderAll();
  }

  // ---- Helpers ----

  function _setReadOnly(readonly) {
    if (!canvas) return;
    canvas.selection = !readonly;
    canvas.forEachObject(obj => {
      obj.selectable = !readonly;
      obj.evented = !readonly;
    });
  }

  function _hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  }

  function _getAllAnnotations() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function _loadFromStorage(key) {
    const all = _getAllAnnotations();
    return all[key] || null;
  }

  function _saveToStorage(all) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (e) {
      console.warn('AnnotationEditor: failed to save to localStorage', e);
    }
  }

  return {
    init,
    enter,
    exit,
    save,
    load,
    clear,
    hide,
    resize,
    isEditing,
    setTool,
    setColour,
    setSize,
    hasAnnotations,
  };

})();
