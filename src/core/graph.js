/**
 * @module Core/Graph
 * @description Generic Graph algorithms for dependency resolution and cycle detection.
 * @input Nodes array, Accessor functions
 * @output Sorted Nodes, Ranks, Logic Booleans
 */

/**
 * Calculates the rank of each node in a DAG.
 * Rank 0: No dependencies.
 * Rank N: Max(Dependency Ranks) + 1.
 * @template T
 * @param {T[]} nodes - List of nodes
 * @param {function(T): string} getId - Function to get unique ID of a node
 * @param {function(T): string[]} getDependencies - Function to get list of dependency IDs
 * @returns {Map<string, number>} Map of Node ID to Rank
 */
export function calculateRanks(nodes, getId, getDependencies) {
    const ranks = new Map();
    const nodeMap = new Map(nodes.map(n => [getId(n), n]));
    const processing = new Set();
    const memo = new Map();

    function visit(id) {
        if (memo.has(id)) return memo.get(id);
        if (processing.has(id)) {
            console.warn(`Cycle detected involving node ${id}`);
            return Infinity;
        }
        if (!nodeMap.has(id)) {
            // External dependency or missing? Assume rank 0.
            return 0;
        }

        processing.add(id);

        const node = nodeMap.get(id);
        const deps = getDependencies(node);
        let maxRank = -1;

        for (const depId of deps) {
            const r = visit(depId);
            if (r > maxRank) maxRank = r;
        }

        const rank = maxRank + 1;
        memo.set(id, rank);
        processing.delete(id);
        return rank;
    }

    for (const node of nodes) {
        visit(getId(node));
    }

    return memo;
}

/**
 * Returns a topologically sorted list of nodes based on rank.
 * @template T
 * @param {T[]} nodes
 * @param {function(T): string} getId
 * @param {function(T): string[]} getDependencies
 * @returns {T[]} Sorted nodes
 */
export function topologicalSort(nodes, getId, getDependencies) {
    const ranks = calculateRanks(nodes, getId, getDependencies);

    // Sort by rank ascending
    // Create shallow copy
    return [...nodes].sort((a, b) => {
        const ra = ranks.get(getId(a)) || 0;
        const rb = ranks.get(getId(b)) || 0;
        return ra - rb;
    });
}

/**
 * Checks if adding a dependency (Target depends on Source) would create a cycle.
 * This effectively checks if Source is already an ancestor of Target.
 * @param {string} sourceId - The node being depended ON
 * @param {string} targetId - The node that wants to depend on source
 * @param {function(string): string[]} getParents - Function to get existing dependencies (parents) of a node ID
 * @returns {boolean} True if cycle detected (connection is invalid)
 */
export function detectsCycle(sourceId, targetId, getParents) {
    // If we add Target -> Source connection.
    // Cycle if Source reaches Target via existing paths.
    // Search from Source.

    const visited = new Set();
    const stack = [sourceId];

    while (stack.length > 0) {
        const curr = stack.pop();
        if (curr === targetId) return true; // Found Target in ancestry

        if (visited.has(curr)) continue;
        visited.add(curr);

        const parents = getParents(curr) || [];
        for (const p of parents) {
            stack.push(p);
        }
    }

    return false;
}
