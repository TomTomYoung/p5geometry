
# Roadmap

- [ ] **Background Design Panel**
    - [ ] Create UI for changing background color/style.
    - [ ] Store background settings in Scene.

- [ ] **Style Abstraction System**
    - [ ] Define `Style` object type (stroke, fill, weight).
    - [ ] Allow objects to reference `Style` objects by ID.
    - [ ] Implement priority logic: Object Custom Style > Referenced Style.
    - [ ] Create UI for creating/editing Style objects.

- [ ] **Object Inspector & Selection**
    - [ ] Implement raycasting/distance check for "Click to Select" on canvas.
    - [ ] Open Property Panel with selected object's data.
    - [ ] "Apply" button to update the object schema.

- [ ] **Playback Control Panel**
    - [ ] Create UI: Play, Pause, Step, Redraw.
    - [ ] Connect to p5 `loop()` / `noLoop()`.

- [ ] **Delta Animation System**
    - [ ] Add `delta` properties to schema (e.g., `dx`, `dy`).
    - [ ] Implement update loop to apply deltas on every frame during playback.

- [ ] **Component System (Physics/Transform)**
    - [ ] Refactor `delta` into `Physics` objects/components.
    - [ ] Refactor `transform` into `Transform` objects.
    - [ ] UI to attach/detach these components to objects.

- [ ] **Reference System (Dependency Graph)**
    - [ ] Allow properties to specify an `Interface` (Reference) instead of a value.
    - [ ] Resolve references during Scene Evaluation.

- [ ] **Math & Logic Nodes**
    - [ ] Implement `Sin`, `Cos`, `Random`, `Noise` objects.
    - [ ] Allow them to take inputs (constants or references) and output values.
