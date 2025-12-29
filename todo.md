
# Roadmap

- [x] **Dependency Graph & Execution Order (Rank System)**
    - [x] Implement `Rank` property for connectivity validation.
        - Constants/Inputs: Rank 0.
        - Derived Objects: Rank = Max(Input Ranks) + 1.
    - [x] Implement `Topological Sort` at Edit-time.
    - [x] Execution: Iterate sorted list `executionOrder`.
    - [x] Cycle Detection: Reject connections that violate `Rank(A) < Rank(B)` or detect cycles during sort.

- [x] **Background Design Panel**
    - [x] Create UI for changing background color/style.
    - [x] Store background settings in Scene.

- [x] **Style Abstraction System**
    - [x] Define `Style` object type (stroke, fill, weight).
    - [x] Allow objects to reference `Style` objects by ID.
    - [x] Implement priority logic: Object Custom Style > Referenced Style.
    - [x] Create UI for creating/editing Style objects.

- [x] **Object Inspector & Selection**
    - [x] Implement raycasting/distance check for "Click to Select" on canvas.
    - [x] Open Property Panel with selected object's data.
    - [x] "Apply" button to update the object schema.

- [x] **Playback Control Panel**
    - [x] Create UI: Play, Pause, Step, Redraw.
    - [x] Connect to p5 `loop()` / `noLoop()`.

- [x] **Delta Animation System**
    - [x] Add `delta` properties to schema (e.g., `dx`, `dy`).
    - [x] Implement update loop to apply deltas on every frame during playback.

- [x] **Component System (Physics/Transform)**
    - [x] Refactor `delta` into `Physics` objects/components.
    - [x] Refactor `transform` into `Transform` objects.
    - [x] UI to attach/detach these components to objects.

- [x] **Reference System (Dependency Graph)**
    - [x] Allow properties to specify an `Interface` (Reference) instead of a value.
    - [x] Resolve references during Scene Evaluation.

- [ ] **Math & Logic Nodes**
    - [ ] Implement `Sin`, `Cos`, `Random`, `Noise` objects.
    - [ ] Allow them to take inputs (constants or references) and output values.
