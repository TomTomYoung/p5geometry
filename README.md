# Process Geometry Renderer (PGR)

This repository turns the design document in `specification.md` into a runnable foundation for the PGR runtime. The code defines the Scene data model, evaluation pipeline, and operator scaffolding in dependency-free ES modules so it can run in constrained environments.

## Features

- Declarative Scene model with Objects, Relations, Generators, Operators, Assets, and RenderConfig.
- Param evaluation (constant, keyframes, expression) with smooth interpolation.
- Transform utilities for 2D affine matrices and point transformation.
- Geometry evaluation for primitives plus placeholder text handling.
- Relation support for attach, align, follow-path, and repeat constraints.
- Minimal operator runtime: affine transform, rasterize, threshold, erode/dilate, and merge of operator outputs into evaluated objects.
- Generator expansion for instance, grid, and radial distributions before relation solving.

## Usage

Import the `renderScene` function and feed a `Scene` description along with the desired time value:

```js
import { renderScene } from './src/index.js';

const scene = {
  objects: [
    { id: 'p1', kind: 'primitive', geometry: { type: 'rect', width: 100, height: 100 } },
    { id: 'path', kind: 'primitive', geometry: { type: 'polyline', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] } },
  ],
  relations: [
    { id: 'follow', type: 'followPath', targets: { objectId: 'p1', pathId: 'path' }, params: { u: { type: 'constant', value: 0.5 } } },
  ],
};

const result = renderScene(scene, 0);
console.log(result.objects);
```

## Notes on Environment

The project intentionally avoids third-party dependencies. Running TypeScript tooling is optional; code is written in modern JavaScript with JSDoc typing so it can be consumed directly or fed to a bundler.

## Next Steps

- Expand relation support (Repeat, Tile) and generator expansion.
- Improve raster operators to use real drawing backends (p5.js) when available.
- Add persistence helpers to round-trip Scene JSON descriptions.
