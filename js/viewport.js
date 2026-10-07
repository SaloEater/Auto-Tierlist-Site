// Pan and zoom of the tierlist area: one element with translate(x, y) scale(k).

const MIN_K = 0.25;
const MAX_K = 3;

export class Viewport {
  /**
   * @param canvas   the clipping container that receives pointer and wheel events
   * @param el       the element to transform
   * @param onChange called with (x, y, k) after every change
   */
  constructor(canvas, el, onChange) {
    this.canvas = canvas;
    this.el = el;
    this.onChange = onChange;
    this.x = 0;
    this.y = 0;
    this.k = 1;
    this.drag = null;
    // Active pointers (touch fingers, or the mouse) by pointerId → last canvas position
    this.pointers = new Map();
    this.pinch = null;

    canvas.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    canvas.addEventListener('pointerdown', e => this.onPointerDown(e));
    canvas.addEventListener('pointermove', e => this.onPointerMove(e));
    canvas.addEventListener('pointerup', e => this.onPointerUp(e));
    canvas.addEventListener('pointercancel', e => this.onPointerUp(e));
  }

  set(x, y, k) {
    this.x = x;
    this.y = y;
    this.k = Math.min(MAX_K, Math.max(MIN_K, k));
    this.el.style.transform = `translate(${this.x}px, ${this.y}px) scale(${this.k})`;
    this.onChange(this.x, this.y, this.k);
  }

  /** Zoom by a factor keeping the canvas point (cx, cy) fixed. */
  zoomAt(factor, cx, cy) {
    const k = Math.min(MAX_K, Math.max(MIN_K, this.k * factor));
    const ratio = k / this.k;
    this.set(cx - (cx - this.x) * ratio, cy - (cy - this.y) * ratio, k);
  }

  /**
   * Pan so that the content point (px, py) is at the centre of the canvas, or at the
   * centre of the top part when `bottomReserved` pixels are covered (the mobile sheet).
   */
  centerOn(px, py, bottomReserved = 0) {
    const r = this.canvas.getBoundingClientRect();
    const visibleH = Math.max(1, r.height - bottomReserved);
    this.set(r.width / 2 - px * this.k, visibleH / 2 - py * this.k, this.k);
  }

  canvasPoint(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // ctrl+wheel and trackpad pinch (reported as ctrl+wheel) zoom around the cursor
      const [cx, cy] = this.canvasPoint(e);
      this.zoomAt(Math.exp(-e.deltaY * 0.002), cx, cy);
    } else {
      // plain wheel / two-finger scroll pans
      const scale = e.deltaMode === 1 ? 16 : 1;
      this.set(this.x - e.deltaX * scale, this.y - e.deltaY * scale, this.k);
    }
  }

  onPointerDown(e) {
    if (e.button !== 0) return;
    const onNode = !!e.target.closest('.node');
    this.pointers.set(e.pointerId, this.canvasPoint(e));

    if (this.pointers.size === 2) {
      // Second finger: switch from pan to pinch, anchored at the fingers' midpoint
      this.drag = null;
      this.capture(e.pointerId);
      this.startPinch();
      return;
    }
    // Nodes handle their own clicks; capturing here would retarget the click to the
    // canvas and the node would never be pinned. A second finger on a node still pinches.
    if (onNode) return;
    this.capture(e.pointerId);
    this.drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: this.x, oy: this.y, moved: false };
    this.canvas.classList.add('dragging');
  }

  /** Keep receiving this pointer's events while panning or pinching, even outside the canvas. */
  capture(pointerId) {
    try {
      this.canvas.setPointerCapture(pointerId);
    } catch (err) {
      // Synthetic pointers cannot be captured; real ones can
    }
  }

  onPointerMove(e) {
    if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, this.canvasPoint(e));

    if (this.pinch && this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }
    if (!this.drag || e.pointerId !== this.drag.id) return;
    const dx = e.clientX - this.drag.sx;
    const dy = e.clientY - this.drag.sy;
    if (Math.abs(dx) + Math.abs(dy) > 2) this.drag.moved = true;
    this.set(this.drag.ox + dx, this.drag.oy + dy, this.k);
  }

  onPointerUp(e) {
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);

    if (this.pinch) {
      if (this.pointers.size >= 2) {
        this.startPinch(); // re-anchor on the remaining pair
      } else {
        this.pinch = null;
        // Hand over to a fresh pan with the remaining finger so the view does not jump
        const [id, [cx, cy]] = this.pointers.entries().next().value ?? [null, [0, 0]];
        const r = this.canvas.getBoundingClientRect();
        this.drag = id === null ? null
          : { id, sx: cx + r.left, sy: cy + r.top, ox: this.x, oy: this.y, moved: true };
        if (!this.drag) this.canvas.classList.remove('dragging');
      }
      return;
    }

    if (!this.drag || e.pointerId !== this.drag.id) return;
    const moved = this.drag.moved;
    this.drag = null;
    this.canvas.classList.remove('dragging');
    if (!moved) this.canvas.dispatchEvent(new CustomEvent('emptyclick'));
  }

  /** Two-finger gesture: remember distance, midpoint and the world point under it. */
  startPinch() {
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    this.pinch = {
      dist,
      k: this.k,
      // Content point under the midpoint, kept under the moving midpoint while pinching
      wx: (mid[0] - this.x) / this.k,
      wy: (mid[1] - this.y) / this.k,
    };
    this.canvas.classList.add('dragging');
  }

  updatePinch() {
    const [a, b] = [...this.pointers.values()];
    const dist = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const k = Math.min(MAX_K, Math.max(MIN_K, this.pinch.k * dist / this.pinch.dist));
    this.set(mid[0] - this.pinch.wx * k, mid[1] - this.pinch.wy * k, k);
  }
}
