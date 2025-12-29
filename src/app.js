import { renderScene, getSortedExecutionOrder, validateConnection } from './scene.js';

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

  // Update loop
  renderLoop() {
    if (this.scene.timeline.isPlaying) {
      this.p5.redraw();
      requestAnimationFrame(this.renderLoop);
    }
  }

  requestRender() {
    this.p5.redraw();
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

  // Interaction State
  openCreationPanel(type) {
    this.pendingType = type;
    this.pendingParams = this.getDefaultParams(type);
    return this.pendingParams;
  }

  getDefaultParams(type) {
    if (type === 'circle') return { type: 'circle', radius: 50, x: 0, y: 0 };
    if (type === 'rect') return { type: 'rect', width: 100, height: 80, x: 0, y: 0 };
    if (type === 'line') return { type: 'line', dx: 100, dy: 0, x: -50, y: 0 };
    if (type === 'polygon') return { type: 'polygon', radius: 40, sides: 3, x: 0, y: 0 };
    if (type === 'text') return { type: 'text', text: 'Hello', size: 40, x: 0, y: 0 };
    if (type === 'grid') return { type: 'grid', rows: 5, cols: 5, spacing: 60 };
    if (type === 'radial') return { type: 'radial', count: 8, radius: 100 };
    return {};
  }

  confirmCreation(params) {
    const type = this.pendingType;
    if (!type) return;

    if (type === 'grid' || type === 'radial') {
      this.addGenerator(type, params);
    } else {
      this.addObject(type, params);
    }
    // Reset
    this.pendingType = null;
    this.pendingParams = null;
    this.requestRender();
  }

  addObject(type, params) {
    const kind = type === 'text' ? 'text' : 'primitive';
    const id = `obj_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const newObj = {
      id,
      kind,
      name: `${type}_${this.scene.objects.length + 1}`,
      visibility: true,
      transform: {
        matrix: { type: 'constant', value: [1, 0, 0, 0, 1, 0, 0, 0, 1] }
      },
      style: {
        strokeColor: '#ffffff',
        strokeWidth: 1,
        fillEnabled: false
      },
      geometry: {}
    };

    const x = params.x !== undefined ? parseFloat(params.x) : (Math.random() - 0.5) * 400;
    const y = params.y !== undefined ? parseFloat(params.y) : (Math.random() - 0.5) * 400;
    newObj.transform = {
      translate: { type: 'constant', value: { x, y } }
    };

    if (kind === 'primitive') {
      newObj.geometry = this.createPrimitiveGeometry(type, params);
    } else if (kind === 'text') {
      newObj.geometry = {
        type: 'text',
        fontAssetId: 'default',
        text: params.text || 'Hello',
        size: parseFloat(params.size) || 40
      };
    }

    this.scene.objects.push(newObj);
    this.setSelectedId(newObj.id);
    console.log('Added object:', newObj);

    // Update Graph
    this.updateExecutionOrder();
    this.requestRender();
    return newObj;
  }

  addGenerator(type, params) {
    if (!this.selectedObjectId) {
      console.warn('No object selected for generator');
      return;
    }
    const sourceExists = this.scene.objects.some(o => o.id === this.selectedObjectId);
    if (!sourceExists) return;

    // Validate Connection (Pre-check)
    // Here we are creating a new Generator that connects Selected -> New Output.
    // Since New Output is brand new, it cannot cause a cycle unless we are connecting TO an existing object (which we aren't here yet).
    // So simple creation is safe. But if we supported "Connect to existing", we would need:
    // if (!validateConnection(this.scene, this.selectedObjectId, targetId)) return;

    const id = `gen_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const generator = {
      id,
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
