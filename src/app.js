import { renderScene, getSortedExecutionOrder, validateConnection, findHitObject } from './scene.js';

export class App {
  constructor(p5Instance) {
    this.p5 = p5Instance;
    this.scene = {
      objects: [],
      relations: [],
      generators: [],
      operators: [],
      // New Architecture: Styles & Components
      background: { color: '#222222' },
      styles: [
        { id: 'default_style', name: 'Default', strokeColor: '#ffffff', strokeWeight: 1, fillEnabled: false }
      ],
      components: [],
      assets: [
        { id: 'default', kind: 'font', source: 'sans-serif', loadState: 'ready' }
      ],
      renderConfig: { width: window.innerWidth, height: window.innerHeight },
      timeline: { t: 0, isPlaying: false }
    };

    // Execution Order List (Cache)
    this.executionOrder = [];

    // Initial state
    this.selectedObjectId = null;
    this.renderLoop = this.renderLoop.bind(this);

    // Initial redraw
    this.updateExecutionOrder(); // Initial sort
    this.requestRender();
  }

  updateExecutionOrder() {
    this.executionOrder = getSortedExecutionOrder(this.scene);
    console.log('Execution Order Updated:', this.executionOrder.map(o => `${o.id} (Rank ?) `));
  }

  // Playback Control
  play() {
    if (!this.scene.timeline.isPlaying) {
      if (this.scene.timeline.t === 0) {
        this.captureInitialState();
      }
      this.scene.timeline.isPlaying = true;
      this.renderLoop(); // Start loop
      console.log('Playback Started');
    }
  }

  pause() {
    this.scene.timeline.isPlaying = false;
    console.log('Playback Paused');
  }

  resetTimeline() {
    this.scene.timeline.isPlaying = false; // Stop first
    this.scene.timeline.t = 0;
    this.restoreInitialState();
    this.requestRender();
    console.log('Timeline Reset');
  }

  captureInitialState() {
    // Deep clone object transforms to cache
    this.initialStateCache = new Map();
    for (const obj of this.scene.objects) {
      if (obj.transform && obj.transform.translate) { // Only caching translate for now
        this.initialStateCache.set(obj.id, {
          x: obj.transform.translate.value.x,
          y: obj.transform.translate.value.y
        });
      }
    }
  }

  restoreInitialState() {
    if (!this.initialStateCache) return;

    for (const obj of this.scene.objects) {
      if (this.initialStateCache.has(obj.id)) {
        const cached = this.initialStateCache.get(obj.id);
        if (!obj.transform) obj.transform = { translate: { type: 'constant', value: { x: 0, y: 0 } } };
        if (!obj.transform.translate) obj.transform.translate = { type: 'constant', value: { x: 0, y: 0 } };

        obj.transform.translate.value.x = cached.x;
        obj.transform.translate.value.y = cached.y;
      }
    }
  }

  // Update loop
  renderLoop() {
    if (this.scene.timeline.isPlaying) {
      this.scene.timeline.t += 1; // Increment time frame

      // Update Animation/Deltas (Basic Delta System Integration)
      // Iterate sorted objects and apply updates?
      this.updateState();

      this.p5.redraw();
      requestAnimationFrame(this.renderLoop);
    }
  }

  updateState() {
    // Apply Component Logic (Physics)
    // Iterate sorted objects and check for attached components
    if (!this.scene.components) return;

    const componentMap = new Map(this.scene.components.map(c => [c.id, c]));

    for (const obj of this.scene.objects) {
      if (obj.components && obj.components.physics) {
        const physId = obj.components.physics;
        const physComp = componentMap.get(physId);

        if (physComp && physComp.delta) {
          // Apply Physics Delta
          if (!obj.transform) obj.transform = {};
          if (!obj.transform.translate) obj.transform.translate = { type: 'constant', value: { x: 0, y: 0 } };

          if (obj.transform.translate.type === 'constant') {
            if (physComp.delta.x) obj.transform.translate.value.x += physComp.delta.x;
            if (physComp.delta.y) obj.transform.translate.value.y += physComp.delta.y;
          }
        }
      }
      // Fallback legacy delta support (optional, can remove if full refactor)
      else if (obj.delta) {
        if (!obj.transform) obj.transform = {};
        if (!obj.transform.translate) obj.transform.translate = { type: 'constant', value: { x: 0, y: 0 } };
        if (obj.transform.translate.type === 'constant') {
          obj.transform.translate.value.x += (obj.delta.x || 0);
          obj.transform.translate.value.y += (obj.delta.y || 0);
        }
      }
    }
  }

  requestRender() {
    this.p5.redraw();
  }

  getStyles() {
    return this.scene.styles;
  }

  handleMousePressed(x, y) {
    // Map screen coordinates to world coordinates (centered origin)
    const worldX = x - this.scene.renderConfig.width / 2;
    const worldY = y - this.scene.renderConfig.height / 2;

    // Get currently evaluated objects (render list)
    // We need the *Evaluated* geometry for hit testing, not the raw params.
    // But renderScene returns evaluated objects inside `p.draw`.
    // We need access to the latest RenderResult.
    // Let's store the last render result or re-evaluate?
    // Re-evaluating is safer for now.

    // Note: We need the full evaluation chain including Styles & Transforms.
    const scene = this.getScene();
    const objects = this.getRenderList(); // Raw sorted objects

    // We need to evaluate them to get world geometry
    // Import evaluateObjects locally if allowed or move logic to scene.js
    // Simpler: Trigger a "Pick" pass in scene.js using current state

    // Or just cheat: The p5.draw loop has the result.
    // But purely logic-side:
    const result = renderScene(scene, this.scene.timeline.t);
    const hitId = findHitObject(result.objects, { x: worldX, y: worldY });

    if (hitId) {
      this.setSelectedId(hitId);
      console.log('Selected:', hitId);
      // Open Property Panel for Editing
      const editData = this.openEditPanel(hitId);
      if (editData) {
        return { id: hitId, ...editData };
      }
      return { id: hitId, type: null, params: {} }; // Fallback if openEditPanel doesn't find it
    } else {
      this.setSelectedId(null);
      return null;
    }
  }

  getScene() {
    return this.scene;
  }

  // Use this for rendering instead of raw scene.objects
  getRenderList() {
    // If executionOrder is empty (e.g. cleared), fall back or re-sort
    if (!this.executionOrder || this.executionOrder.length === 0) {
      if (this.scene.objects.length > 0) this.updateExecutionOrder();
    }
    return this.executionOrder;
  }

  getSelectedId() {
    return this.selectedObjectId;
  }

  setSelectedId(id) {
    this.selectedObjectId = id;
    console.log('Selected:', id);
    this.requestRender();
  }

  openEditPanel(id) {
    let obj = this.scene.objects.find(o => o.id === id);
    let type = obj ? (obj.type || obj.kind) : null;

    // If not object, check styles/components
    if (!obj) {
      if (this.scene.styles) {
        obj = this.scene.styles.find(s => s.id === id);
        if (obj) type = 'style';
      }
      if (!obj && this.scene.components) {
        obj = this.scene.components.find(c => c.id === id);
        if (obj) type = obj.type;
      }
    }

    if (!obj) return null;

    const fmt = (v) => {
      if (v && typeof v === 'object' && v.type === 'ref') {
        return `@${v.targetId}.${v.targetProp}`;
      }
      return v;
    };

    let params = {};

    if (type === 'style') {
      // Return style properties directly
      params = { ...obj };
      delete params.id; // Hide ID from fields if we show it separately
    } else if (type === 'physics') {
      if (obj.delta) {
        params = { x: fmt(obj.delta.x), y: fmt(obj.delta.y) };
      }
    } else if (type === 'transform') {
      if (obj.translate) {
        params = { x: fmt(obj.translate.x), y: fmt(obj.translate.y) };
      }
      params.rotate = fmt(obj.rotate);
    }
    else if (obj.kind === 'primitive' || obj.kind === 'text') {
      if (obj.geometry.type === 'circle') params = { radius: fmt(obj.geometry.radius) };
      else if (obj.geometry.type === 'rect') params = { width: fmt(obj.geometry.width), height: fmt(obj.geometry.height) };
      else if (obj.geometry.type === 'line') {
        const p0 = obj.geometry.points ? obj.geometry.points[0] : { x: 0, y: 0 };
        const p1 = obj.geometry.points ? obj.geometry.points[1] : { x: 0, y: 0 };
        params = { dx: Math.abs(p1.x - p0.x) * 2 };
      }
      else if (obj.geometry.type === 'text') params = { text: fmt(obj.geometry.text), size: fmt(obj.geometry.size) };

      if (obj.transform && obj.transform.translate) {
        params.x = fmt(obj.transform.translate.value.x);
        params.y = fmt(obj.transform.translate.value.y);
      }

      // Physics (Legacy Delta)
      let dx = 0, dy = 0;
      if (obj.components && obj.components.physics) {
        const physComp = this.scene.components ? this.scene.components.find(c => c.id === obj.components.physics) : null;
        if (physComp && physComp.delta) {
          dx = physComp.delta.x;
          dy = physComp.delta.y;
        }
      }
      params.moveX = dx;
      params.moveY = dy;

      // Style
      if (obj.style && obj.style.mode === 'ref') {
        params.styleId = obj.style.refId;
      } else {
        params.styleId = '';
      }

    } else if (obj.kind === 'math') {
      params.input = fmt(obj.params.input);
      params.amp = fmt(obj.params.amp);
      params.freq = fmt(obj.params.freq);
      params.phase = fmt(obj.params.phase);
      if (obj.transform && obj.transform.translate) {
        params.x = fmt(obj.transform.translate.value.x);
        params.y = fmt(obj.transform.translate.value.y);
      }
    }
    return { type, params };
  }

  // Interaction State
  openCreationPanel(type) {
    this.pendingType = type;
    if (type === 'circle') return this.getDefaultParams('circle');
    if (type === 'rect') return this.getDefaultParams('rect');
    if (type === 'line') return this.getDefaultParams('line');
    if (type === 'polygon') return this.getDefaultParams('polygon');
    if (type === 'text') return this.getDefaultParams('text');
    if (type === 'grid') return { rows: 5, cols: 5, spacing: 50 };
    if (type === 'radial') return { count: 8, radius: 100 };
    // Math
    if (type === 'sin' || type === 'cos') return { input: '@time.t', amp: 100, freq: 0.1, phase: 0 };

    return {};
  }

  getDefaultParams(type) {
    if (type === 'circle') return { type: 'circle', radius: 50, x: 0, y: 0 };
    if (type === 'rect') return { type: 'rect', width: 100, height: 80, x: 0, y: 0 };
    if (type === 'line') return { type: 'line', dx: 100, dy: 0, x: -50, y: 0 };
    if (type === 'polygon') return { type: 'polygon', radius: 40, sides: 3, x: 0, y: 0 };
    if (type === 'text') return { type: 'text', text: 'Hello', size: 40, x: 0, y: 0 };
    if (type === 'grid') return { type: 'grid', rows: 5, cols: 5, spacing: 60 };
    if (type === 'radial') return { type: 'radial', count: 8, radius: 100 };

    // New Types
    if (type === 'style') return { type: 'style', strokeColor: '#ffffff', strokeWidth: 2, fillEnabled: false, fillColor: '#808080' };
    if (type === 'physics') return { type: 'physics', x: 1, y: 1 }; // x,y represents delta velocity
    if (type === 'transform') return { type: 'transform', x: 0, y: 0, rotate: 0 };

    return {};
  }

  confirmCreation(params) {
    const type = this.pendingType;
    if (!type) return;

    if (type === 'style') {
      this.addStyle(params);
    } else if (type === 'physics' || type === 'transform') {
      this.addComponent(type, params);
    } else if (type === 'grid' || type === 'radial') {
      this.addGenerator(type, params);
    } else {
      this.addObject(type, params);
    }
    // Reset
    this.pendingType = null;
    this.pendingParams = null;
    this.requestRender();
  }

  addStyle(params) {
    const id = params.id || `style_${Date.now()}`;
    const newStyle = {
      id,
      name: params.name || `Style ${this.scene.styles.length + 1}`,
      strokeColor: params.strokeColor || '#ffffff',
      strokeWidth: Number(params.strokeWidth) || 1,
      fillEnabled: params.fillEnabled === 'true' || params.fillEnabled === true,
      fillColor: params.fillColor || '#888888'
    };
    // If user provided specific ID in params (e.g. from JSON), respect it?
    this.scene.styles.push(newStyle);
    this.setSelectedId(newStyle.id);
  }

  addComponent(type, params) {
    const id = `comp_${type}_${Date.now()}`;
    const newComp = {
      id,
      type, // physics / transform
      name: `${type}_${(this.scene.components ? this.scene.components.length : 0) + 1}`
    };

    if (type === 'physics') {
      newComp.delta = {
        x: Number(params.x) || 0,
        y: Number(params.y) || 0
      };
    } else if (type === 'transform') {
      newComp.translate = { x: Number(params.x) || 0, y: Number(params.y) || 0 };
      newComp.rotate = Number(params.rotate) || 0;
    }

    if (!this.scene.components) this.scene.components = [];
    this.scene.components.push(newComp);
    this.setSelectedId(newComp.id);
  }

  addObject(type, params) {
    // Determine kind
    let kind = 'primitive';
    if (type === 'text') kind = 'text';
    if (type === 'sin' || type === 'cos') kind = 'math';

    const id = `obj_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const newObj = {
      id,
      kind,
      name: `${type}_${this.scene.objects.length + 1}`,
      visibility: true,
      style: { strokeColor: '#ffffff', strokeWeight: 1, fillEnabled: false },
      geometry: {},
      params: {}, // For math nodes or generators
      transform: { translate: { type: 'constant', value: { x: 0, y: 0 } } }
    };

    // Parse params helper
    const parse = (v) => {
      if (typeof v === 'string' && v.startsWith('@')) {
        const parts = v.substring(1).split('.');
        return { type: 'ref', targetId: parts[0], targetProp: parts[1] || 'value' };
      }
      return parseFloat(v);
    };

    if (kind === 'math') {
      // Store raw params or parsed?
      // We need to parse them to allow Refs.
      newObj.type = type; // sin/cos
      newObj.params = {
        input: parse(params.input),
        amp: parse(params.amp),
        freq: parse(params.freq),
        phase: parse(params.phase)
      };
      // Math nodes usually don't need geometry/transform in the same way,
      // but having a visual representation (like a box) helps selection.
      // Let's give it a dummy geometry for clicking.
      newObj.geometry = { type: 'rect', width: 40, height: 40 }; // Visual placeholder
      newObj.transform.translate.value = { x: 50, y: 50 }; // Default pos
    }
    else if (kind === 'primitive') {
      // ... existing geometry creation ...
      newObj.geometry = this.createPrimitiveGeometry(type, params);
      // Set pos?
      if (params.x) newObj.transform.translate.value.x = parseFloat(params.x);
      if (params.y) newObj.transform.translate.value.y = parseFloat(params.y);
    } else if (kind === 'text') {
      // ...
      newObj.geometry = {
        type: 'text',
        fontAssetId: 'default',
        text: params.text || 'text',
        size: parseFloat(params.size) || 40
      };
      if (params.x) newObj.transform.translate.value.x = parseFloat(params.x);
      if (params.y) newObj.transform.translate.value.y = parseFloat(params.y);
    }

    this.scene.objects.push(newObj);
    this.setSelectedId(newObj.id);
    this.updateExecutionOrder();
    this.requestRender();
    return newObj;
  }

  confirmEdit(params) {
    if (!this.selectedObjectId) return;
    const obj = this.scene.objects.find(o => o.id === this.selectedObjectId);
    if (!obj) return;

    // PARSE HELPER
    const parse = (v, isNum = true) => {
      if (typeof v === 'string' && v.startsWith('@')) {
        // Reference Syntax: @objId.propName
        const parts = v.substring(1).split('.');
        if (parts.length >= 2) {
          const targetId = parts[0];
          const targetProp = parts.slice(1).join('.');
          return { type: 'ref', targetId, targetProp };
        }
      }
      return isNum ? parseFloat(v) : v;
    };

    // Update Transform
    if (params.x !== undefined && params.y !== undefined) {
      // Assume translate is type constant for now
      if (obj.transform && obj.transform.translate) {
        obj.transform.translate.value = { x: parse(params.x), y: parse(params.y) };
      } else {
        // Create if missing
        obj.transform = { translate: { type: 'constant', value: { x: parse(params.x), y: parse(params.y) } } };
      }
    }

    // Update Geometry
    if (obj.kind === 'primitive') {
      // We need to re-create geometry spec based on new params
      // But createPrimitiveGeometry creates a NEW spec.
      // However, createPrimitiveGeometry expects raw numbers for things like radius.
      // If we pass a REF object, createPrimitiveGeometry might break or just store it?
      // I need to update createPrimitiveGeometry to accommodate partial params or handle assignment differently.
      // Or just assign directly to obj.geometry keys.

      if (obj.geometry.type === 'circle') {
        if (params.radius) obj.geometry.radius = parse(params.radius);
      } else if (obj.geometry.type === 'rect') {
        if (params.width) obj.geometry.width = parse(params.width);
        if (params.height) obj.geometry.height = parse(params.height);
      }
      // Line/Poly - minimal ref support for now

    } else if (obj.kind === 'text') {
      if (params.text) obj.geometry.text = parse(params.text, false);
      if (params.size) obj.geometry.size = parse(params.size);
    } else if (obj.kind === 'math') {
      // Update Math Params
      if (params.input !== undefined) obj.params.input = parse(params.input);
      if (params.amp !== undefined) obj.params.amp = parse(params.amp);
      if (params.freq !== undefined) obj.params.freq = parse(params.freq);
      if (params.phase !== undefined) obj.params.phase = parse(params.phase);
    }

    // Update Style Reference
    if (params.styleId !== undefined) {
      if (params.styleId) {
        obj.style = { mode: 'ref', refId: params.styleId };
      } else {
        // Unlink: Reset to default local style
        // Ideally we would detach and keep current visuals, but simpler to reset for now.
        obj.style = { strokeColor: '#ffffff', strokeWeight: 1, fillEnabled: false };
      }
    }

    // Update Delta (Physics Component)
    const moveX = parseFloat(params.moveX);
    const moveY = parseFloat(params.moveY);

    if (!isNaN(moveX) || !isNaN(moveY)) {
      // Ensure components structure
      if (!obj.components) obj.components = {};

      if (obj.components.physics) {
        // Update existing
        const physComp = this.scene.components.find(c => c.id === obj.components.physics);
        if (physComp) {
          physComp.delta = { x: moveX || 0, y: moveY || 0 };
        }
      } else {
        // Create new Physics Component
        const physId = `phys_${Date.now()}`;
        const physComp = {
          id: physId,
          type: 'physics',
          delta: { x: moveX || 0, y: moveY || 0 }
        };
        if (!this.scene.components) this.scene.components = [];
        this.scene.components.push(physComp);
        obj.components.physics = physId;
      }
    }

    console.log('Updated Object:', obj);
    this.updateExecutionOrder();
    this.requestRender();
  }

  addGenerator(type, params) {
    const generator = {
      id: `gen_${Date.now()}`,
      type,
      inputIds: [this.selectedObjectId],
      params: {}
    };

    if (type === 'grid') {
      const rows = parseInt(params.rows) || 5;
      const cols = parseInt(params.cols) || 5;
      const spacing = parseFloat(params.spacing) || 60;
      generator.params = {
        a: { x: spacing, y: 0 },
        b: { x: 0, y: spacing },
        range: { i: [0, cols - 1], j: [0, rows - 1] }
      };
    } else if (type === 'radial') {
      generator.params = {
        count: parseInt(params.count) || 8,
        radius: parseFloat(params.radius) || 100,
        angleRange: [0, Math.PI * 2]
      };
    }

    if (!this.scene.generators) this.scene.generators = [];
    this.scene.generators.push(generator);
    console.log('Added generator:', generator);

    // For now, Generators in v0.9 (implied) modify the scene by Adding objects? 
    // Or does the Render phase evaluate them? 
    // The previous implementation of `renderScene` (in scene.js, effectively) likely generated temp objects.
    // If we want them to persist as nodes, we should probably let `renderScene` handle them dynamically.
    // But for `updateExecutionOrder` to work, it needs to see "Output Objects".

    // IMPORTANT: As per current scene.js logic (which we assume expands generators), 
    // we should ensure the generated objects are part of the execution list IF they are persistent.
    // If they are transient (render-time only), then they don't need sorting, just the Generator need to be sorted vs Input.

    this.updateExecutionOrder();
    this.requestRender();
  }

  clearScene() {
    this.scene.objects = [];
    this.scene.relations = [];
    this.scene.generators = [];
    this.updateExecutionOrder();
    this.requestRender();
  }

  setBackgroundColor(hex) {
    this.scene.background.color = hex;
    this.requestRender();
  }

  addStyle(params) {
    const id = `style_${Date.now()}`;
    const style = { id, ...params };
    if (!this.scene.styles) this.scene.styles = [];
    this.scene.styles.push(style);
    console.log('Added Style:', style);
    this.requestRender();
    return style;
  }

  getStyles() {
    return this.scene.styles || [];
  }

  createPrimitiveGeometry(type, params) {
    switch (type) {
      case 'circle':
        return { type: 'circle', radius: parseFloat(params.radius) || 50 };
      case 'rect':
        return { type: 'rect', width: parseFloat(params.width) || 100, height: parseFloat(params.height) || 80 };
      case 'line':
        const dx = parseFloat(params.dx) || 100;
        return { type: 'line', points: [{ x: -dx / 2, y: 0 }, { x: dx / 2, y: 0 }] };
      case 'polygon':
        return { type: 'polygon', points: [{ x: 0, y: -50 }, { x: 40, y: 30 }, { x: -40, y: 30 }] };
      default:
        return { type: 'point' };
    }
  }
}
