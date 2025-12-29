
import { renderScene } from './scene.js';

export class App {
  constructor(p5Instance) {
    this.p5 = p5Instance;
    this.scene = {
      objects: [],
      relations: [],
      generators: [],
      operators: [],
      generators: [],
      operators: [],
      assets: [
        { id: 'default', kind: 'font', source: 'sans-serif', loadState: 'ready' }
      ],
      renderConfig: { width: window.innerWidth, height: window.innerHeight },
      timeline: { t: 0 }
    };

    // Initial state
    this.selectedObjectId = null;

    // Initial redraw
    this.requestRender();
  }

  requestRender() {
    this.p5.redraw();
  }

  getScene() {
    return this.scene;
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

    this.requestRender();
  }

  clearScene() {
    this.scene.objects = [];
    this.scene.relations = [];
    this.scene.generators = [];
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
