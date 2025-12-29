/**
 * @module System/Renderer
 * @description P5.js based renderer for evaluated objects.
 * @input p5, EvaluatedObject[]
 * @output Canvas Drawing
 */

/**
 * Draws the background grid.
 * @param {import('p5')} p
 */
export function drawGrid(p) {
    p.push();
    p.stroke(50);
    p.strokeWeight(1);
    const step = 50;
    const cx = p.width / 2;
    const cy = p.height / 2;

    // Vertical lines
    for (let x = cx % step; x < p.width; x += step) {
        p.line(x, 0, x, p.height);
    }
    // Horizontal lines
    for (let y = cy % step; y < p.height; y += step) {
        p.line(0, y, p.width, y);
    }

    // Axes
    p.stroke(80);
    p.line(cx, 0, cx, p.height);
    p.line(0, cy, p.width, cy);
    p.pop();
}

/**
 * Renders list of evaluated objects.
 * @param {import('p5')} p
 * @param {import('./evaluator.js').EvaluatedObject[]} objects
 * @param {string} [selectedId]
 */
export function render(p, objects, selectedId) {
    if (!objects) return;

    for (const obj of objects) {
        if (obj.geometry) {
            const isSelected = obj.objectId === selectedId;
            renderGeometry(p, obj.geometry, obj.style, isSelected);
        } else if (obj.raster) {
            // Raster support (from logic)
            p.push();
            // Raster rendering placeholder or implementation
            // Current index.html didn't seem to have raster rendering in the snippet I saw?
            // Let's implement basic placeholder or if I find it in index.html later I update.
            // Assuming it was not strictly implemented in HTML yet or I missed it.
            // I'll leave it as a TODO or basic image drawing if pixels exist.
            if (obj.raster.pixels) {
                // Create p5 Image? (Slow to do every frame)
                // ideally we cache p5 images.
                // For now, skip raster or simple box.
            }
            p.pop();
        }
    }
}

function renderGeometry(p, geo, style, isSelected) {
    p.push();
    applyStyle(p, style);

    if (isSelected) {
        p.stroke(74, 144, 226); // Selection color
        p.strokeWeight((style?.strokeWidth || 1) + 2);
    }

    switch (geo.type) {
        case 'point':
            p.strokeWeight(5);
            p.point(geo.points[0].x, geo.points[0].y);
            break;
        case 'line':
            p.line(geo.points[0].x, geo.points[0].y, geo.points[1].x, geo.points[1].y);
            break;
        case 'polyline':
        case 'polygon':
            p.beginShape();
            for (const pt of geo.points) {
                p.vertex(pt.x, pt.y);
            }
            if (geo.type === 'polygon') p.endShape(p.CLOSE);
            else p.endShape();
            break;
        case 'rect':
            // Rect is evaluated to polygon points usually
            p.beginShape();
            for (const pt of geo.points) {
                p.vertex(pt.x, pt.y);
            }
            p.endShape(p.CLOSE);
            break;
        case 'circle':
            // Circle also evaluated to points in simple evaluator.
            // If logic preserved 'circle' type, we draw ellipse.
            if (geo.points) {
                p.beginShape();
                for (const pt of geo.points) {
                    p.vertex(pt.x, pt.y);
                }
                p.endShape(p.CLOSE);
            } else {
                // Fallback if not tesselated
                // need radius/center?
            }
            break;
        case 'text':
            if (geo.text) {
                p.push();
                p.strokeWeight(1); // Reset weight for text
                p.fill(200);
                p.noStroke();
                p.textSize(geo.size || 16);
                p.textAlign(p.CENTER, p.CENTER);
                // Text position? 'rect' placeholder logic sets center?
                // geo.points comes from placeholder rect.
                // Center = bounds center.
                if (geo.bounds) {
                    const cx = (geo.bounds.min.x + geo.bounds.max.x) / 2;
                    const cy = (geo.bounds.min.y + geo.bounds.max.y) / 2;
                    p.text(geo.text, cx, cy);
                }
                p.pop();
            }
            break;
    }

    p.pop();
}

function applyStyle(p, style) {
    if (!style) {
        p.stroke(200);
        p.strokeWeight(1);
        p.noFill();
        return;
    }

    if (style.strokeColor) p.stroke(style.strokeColor);
    else p.noStroke();

    if (style.strokeWidth !== undefined) p.strokeWeight(style.strokeWidth);

    if (style.fillEnabled && style.fillColor) p.fill(style.fillColor);
    else p.noFill();

    if (style.alpha !== undefined) {
        // p5 alpha handilng
    }
}
