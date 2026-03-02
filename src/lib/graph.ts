export interface Node {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

export interface Edge {
  id: string;
  sourceId: string;
  targetId: string;
  distance: number;
  pathCoords?: [number, number][];
  trafficMultiplier?: number; // 1 = normal, >1 = traffic
}

export interface Graph {
  nodes: Node[];
  edges: Edge[];
}

class MinHeap {
  private data: { id: string; dist: number }[] = [];

  push(id: string, dist: number) {
    this.data.push({ id, dist });
    this.bubbleUp(this.data.length - 1);
  }

  pop(): { id: string; dist: number } | undefined {
    if (this.data.length === 0) return undefined;
    const min = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this.sinkDown(0);
    }
    return min;
  }

  isEmpty() {
    return this.data.length === 0;
  }

  private bubbleUp(index: number) {
    const element = this.data[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.data[parentIndex];
      if (element.dist >= parent.dist) break;
      this.data[index] = parent;
      this.data[parentIndex] = element;
      index = parentIndex;
    }
  }

  private sinkDown(index: number) {
    const length = this.data.length;
    const element = this.data[index];
    while (true) {
      const leftChildIndex = 2 * index + 1;
      const rightChildIndex = 2 * index + 2;
      let leftChild, rightChild;
      let swap = null;

      if (leftChildIndex < length) {
        leftChild = this.data[leftChildIndex];
        if (leftChild.dist < element.dist) {
          swap = leftChildIndex;
        }
      }
      if (rightChildIndex < length) {
        rightChild = this.data[rightChildIndex];
        if (
          (swap === null && rightChild.dist < element.dist) ||
          (swap !== null && rightChild.dist < leftChild!.dist)
        ) {
          swap = rightChildIndex;
        }
      }

      if (swap === null) break;
      this.data[index] = this.data[swap];
      this.data[swap] = element;
      index = swap;
    }
  }
}

export function buildAdjacencyList(graph: Graph) {
  const adj = new Map<string, { neighbor: string; edge: Edge }[]>();
  for (const node of graph.nodes) {
    adj.set(node.id, []);
  }
  for (const edge of graph.edges) {
    adj.get(edge.sourceId)?.push({ neighbor: edge.targetId, edge });
    adj.get(edge.targetId)?.push({ neighbor: edge.sourceId, edge });
  }
  return adj;
}

export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const d = R * c; // Distance in km
  return d;
}

function deg2rad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function autoLinkNetwork(nodes: Node[], k: number = 3): Edge[] {
  const edges: Edge[] = [];
  const addedEdges = new Set<string>();

  for (let i = 0; i < nodes.length; i++) {
    const distances = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i !== j) {
        const dist = haversineDistance(nodes[i].lat, nodes[i].lng, nodes[j].lat, nodes[j].lng);
        distances.push({ target: nodes[j], dist });
      }
    }
    
    // Sort by distance and pick top k
    distances.sort((a, b) => a.dist - b.dist);
    const nearest = distances.slice(0, k);

    for (const neighbor of nearest) {
      const id1 = nodes[i].id;
      const id2 = neighbor.target.id;
      const edgeId = [id1, id2].sort().join('-');
      
      if (!addedEdges.has(edgeId)) {
        edges.push({
          id: edgeId,
          sourceId: id1,
          targetId: id2,
          distance: neighbor.dist,
          trafficMultiplier: 1 + Math.random() * 2 // Random traffic between 1x and 3x
        });
        addedEdges.add(edgeId);
      }
    }
  }

  // Ensure graph is connected by adding a minimum spanning tree if needed, 
  // but for simplicity, k=3 usually connects small random graphs well.
  return edges;
}

export interface SearchResult {
  path: string[]; // Node IDs
  exploredEdges: string[]; // Edge IDs
  distance: number;
  exp: number;
}

export function dijkstra(graph: Graph, startId: string, endId: string): SearchResult {
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const exploredEdges: string[] = [];
  let exp = 0;

  for (const node of graph.nodes) {
    distances.set(node.id, Infinity);
  }
  distances.set(startId, 0);

  const pq = new MinHeap();
  pq.push(startId, 0);
  const visited = new Set<string>();
  const adj = buildAdjacencyList(graph);

  while (!pq.isEmpty()) {
    const current = pq.pop()!;
    const currentId = current.id;

    if (visited.has(currentId)) continue;
    visited.add(currentId);

    if (currentId === endId) {
      break; // Found
    }

    exp++;

    const neighbors = adj.get(currentId) || [];
    
    for (const { neighbor: neighborId, edge } of neighbors) {
      if (visited.has(neighborId)) continue;

      exploredEdges.push(edge.id);

      const weight = edge.distance;
      const alt = distances.get(currentId)! + weight;
      if (alt < distances.get(neighborId)!) {
        distances.set(neighborId, alt);
        previous.set(neighborId, currentId);
        pq.push(neighborId, alt);
      }
    }
  }

  const path: string[] = [];
  let current = endId;
  if (previous.has(current) || current === startId) {
    while (current) {
      path.unshift(current);
      current = previous.get(current)!;
    }
  }

  return {
    path: path.length > 1 ? path : [],
    exploredEdges,
    distance: distances.get(endId) === Infinity ? 0 : distances.get(endId)!,
    exp
  };
}

export function astar(graph: Graph, startId: string, endId: string): SearchResult {
  const distances = new Map<string, number>();
  const fScores = new Map<string, number>();
  const previous = new Map<string, string>();
  const exploredEdges: string[] = [];
  let exp = 0;

  const endNode = graph.nodes.find(n => n.id === endId);
  if (!endNode) return { path: [], exploredEdges: [], distance: 0, exp: 0 };

  for (const node of graph.nodes) {
    distances.set(node.id, Infinity);
    fScores.set(node.id, Infinity);
  }
  
  distances.set(startId, 0);
  const startNode = graph.nodes.find(n => n.id === startId)!;
  fScores.set(startId, haversineDistance(startNode.lat, startNode.lng, endNode.lat, endNode.lng));

  const pq = new MinHeap();
  pq.push(startId, fScores.get(startId)!);
  const visited = new Set<string>();
  const adj = buildAdjacencyList(graph);

  while (!pq.isEmpty()) {
    const current = pq.pop()!;
    const currentId = current.id;

    if (visited.has(currentId)) continue;
    visited.add(currentId);

    if (currentId === endId) {
      break; // Found
    }

    exp++;

    const neighbors = adj.get(currentId) || [];
    
    for (const { neighbor: neighborId, edge } of neighbors) {
      if (visited.has(neighborId)) continue;

      exploredEdges.push(edge.id);

      const weight = edge.distance;
      const alt = distances.get(currentId)! + weight;
      if (alt < distances.get(neighborId)!) {
        distances.set(neighborId, alt);
        previous.set(neighborId, currentId);
        
        const neighborNode = graph.nodes.find(n => n.id === neighborId)!;
        const h = haversineDistance(neighborNode.lat, neighborNode.lng, endNode.lat, endNode.lng);
        const fScore = alt + h;
        fScores.set(neighborId, fScore);
        pq.push(neighborId, fScore);
      }
    }
  }

  const path: string[] = [];
  let current = endId;
  if (previous.has(current) || current === startId) {
    while (current) {
      path.unshift(current);
      current = previous.get(current)!;
    }
  }

  return {
    path: path.length > 1 ? path : [],
    exploredEdges,
    distance: distances.get(endId) === Infinity ? 0 : distances.get(endId)!,
    exp
  };
}

export function bfs(graph: Graph, startId: string, endId: string): SearchResult {
  const queue: string[] = [startId];
  const visited = new Set<string>([startId]);
  const previous = new Map<string, string>();
  const exploredEdges: string[] = [];
  let exp = 0;
  const adj = buildAdjacencyList(graph);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    exp++;

    if (currentId === endId) {
      break;
    }

    const neighbors = adj.get(currentId) || [];
    
    for (const { neighbor: neighborId, edge } of neighbors) {
      if (!visited.has(neighborId)) {
        visited.add(neighborId);
        previous.set(neighborId, currentId);
        exploredEdges.push(edge.id);
        queue.push(neighborId);
      }
    }
  }

  const path: string[] = [];
  let current = endId;
  let distance = 0;
  
  if (previous.has(current) || current === startId) {
    while (current) {
      path.unshift(current);
      const prev = previous.get(current);
      if (prev) {
        const edge = graph.edges.find(e => 
          (e.sourceId === current && e.targetId === prev) || 
          (e.sourceId === prev && e.targetId === current)
        );
        if (edge) distance += edge.distance;
      }
      current = prev!;
    }
  }

  return {
    path: path.length > 1 ? path : [],
    exploredEdges,
    distance,
    exp
  };
}

export function dfs(graph: Graph, startId: string, endId: string): SearchResult {
  const stack: string[] = [startId];
  const visited = new Set<string>();
  const previous = new Map<string, string>();
  const exploredEdges: string[] = [];
  let exp = 0;
  const adj = buildAdjacencyList(graph);

  while (stack.length > 0) {
    const currentId = stack.pop()!;
    
    if (!visited.has(currentId)) {
      visited.add(currentId);
      exp++;

      if (currentId === endId) {
        break;
      }

      const neighbors = adj.get(currentId) || [];
      
      for (const { neighbor: neighborId, edge } of neighbors) {
        if (!visited.has(neighborId)) {
          previous.set(neighborId, currentId);
          exploredEdges.push(edge.id);
          stack.push(neighborId);
        }
      }
    }
  }

  const path: string[] = [];
  let current = endId;
  let distance = 0;
  
  if (previous.has(current) || current === startId) {
    while (current) {
      path.unshift(current);
      const prev = previous.get(current);
      if (prev) {
        const edge = graph.edges.find(e => 
          (e.sourceId === current && e.targetId === prev) || 
          (e.sourceId === prev && e.targetId === current)
        );
        if (edge) distance += edge.distance;
      }
      current = prev!;
    }
  }

  return {
    path: path.length > 1 ? path : [],
    exploredEdges,
    distance,
    exp
  };
}
export function dijkstraAll(graph: Graph, startId: string, adj: Map<string, { neighbor: string; edge: Edge }[]>): Map<string, SearchResult> {
  const distances = new Map<string, number>();
  const previous = new Map<string, string>();
  const exploredEdges: string[] = [];
  let exp = 0;

  for (const node of graph.nodes) {
    distances.set(node.id, Infinity);
  }
  distances.set(startId, 0);

  const pq = new MinHeap();
  pq.push(startId, 0);
  const visited = new Set<string>();

  while (!pq.isEmpty()) {
    const current = pq.pop()!;
    const currentId = current.id;

    if (visited.has(currentId)) continue;
    visited.add(currentId);
    exp++;

    const neighbors = adj.get(currentId) || [];
    
    for (const { neighbor: neighborId, edge } of neighbors) {
      if (visited.has(neighborId)) continue;

      exploredEdges.push(edge.id);

      const weight = edge.distance;
      const alt = distances.get(currentId)! + weight;
      if (alt < distances.get(neighborId)!) {
        distances.set(neighborId, alt);
        previous.set(neighborId, currentId);
        pq.push(neighborId, alt);
      }
    }
  }

  const results = new Map<string, SearchResult>();
  
  for (const target of graph.nodes) {
    if (target.id === startId) continue;
    
    const path: string[] = [];
    let current = target.id;
    let distance = distances.get(target.id) === Infinity ? 0 : distances.get(target.id)!;
    
    if (previous.has(current)) {
      while (current) {
        path.unshift(current);
        current = previous.get(current)!;
      }
    }
    
    results.set(target.id, {
      path: path.length > 1 ? path : [],
      exploredEdges,
      distance,
      exp
    });
  }
  
  return results;
}

export function solveTSP(graph: Graph, startId: string, endId: string): SearchResult {
  // We need to visit all nodes.
  // First, compute all-pairs shortest paths using Dijkstra
  const allPaths = new Map<string, Map<string, SearchResult>>();
  const adj = buildAdjacencyList(graph);
  
  for (const node of graph.nodes) {
    allPaths.set(node.id, dijkstraAll(graph, node.id, adj));
  }

  const nodesToVisit = graph.nodes.map(n => n.id).filter(id => id !== startId && id !== endId);
  
  // If graph is small enough, use brute force for exact TSP
  if (nodesToVisit.length <= 8) {
    let minDistance = Infinity;
    let bestPermutation: string[] = [];
    let totalExp = 0;

    const permute = (arr: string[], m: string[] = []) => {
      if (arr.length === 0) {
        let currentDist = 0;
        let valid = true;
        let currentId = startId;
        
        for (const nextId of m) {
          const res = allPaths.get(currentId)!.get(nextId)!;
          if (res.path.length === 0) {
            valid = false;
            break;
          }
          currentDist += res.distance;
          totalExp += res.exp;
          currentId = nextId;
        }

        // Return to endId
        if (valid) {
          if (currentId !== endId) {
            const res = allPaths.get(currentId)!.get(endId)!;
            if (res.path.length === 0) {
              valid = false;
            } else {
              currentDist += res.distance;
              totalExp += res.exp;
            }
          }
        }

        if (valid && currentDist < minDistance) {
          minDistance = currentDist;
          bestPermutation = [...m];
        }
      } else {
        for (let i = 0; i < arr.length; i++) {
          const curr = arr.slice();
          const next = curr.splice(i, 1);
          permute(curr.slice(), m.concat(next));
        }
      }
    };

    permute(nodesToVisit);

    if (bestPermutation.length > 0 || nodesToVisit.length === 0) {
      const finalPath: string[] = [startId];
      const finalExploredEdges: string[] = [];
      let currentId = startId;
      
      for (const nextId of bestPermutation) {
        const res = allPaths.get(currentId)!.get(nextId)!;
        finalPath.push(...res.path.slice(1));
        finalExploredEdges.push(...res.exploredEdges);
        currentId = nextId;
      }

      // Add path to endId
      if (currentId !== endId) {
        const endRes = allPaths.get(currentId)!.get(endId)!;
        if (endRes.path.length > 0) {
          finalPath.push(...endRes.path.slice(1));
          finalExploredEdges.push(...endRes.exploredEdges);
        }
      }

      return {
        path: finalPath,
        exploredEdges: finalExploredEdges,
        distance: minDistance,
        exp: totalExp
      };
    }
  }

  // Fallback to Nearest Neighbor heuristic
  let currentId = startId;
  const unvisited = new Set(nodesToVisit);
  
  const finalPath: string[] = [startId];
  const finalExploredEdges: string[] = [];
  let totalDistance = 0;
  let totalExp = 0;

  while (unvisited.size > 0) {
    let nearestId: string | null = null;
    let minDist = Infinity;
    let bestResult: SearchResult | null = null;

    for (const targetId of unvisited) {
      const result = allPaths.get(currentId)!.get(targetId)!;
      if (result.path.length > 0 && result.distance < minDist) {
        minDist = result.distance;
        nearestId = targetId;
        bestResult = result;
      }
    }

    if (!nearestId || !bestResult) {
      break; // Graph is disconnected
    }

    finalPath.push(...bestResult.path.slice(1));
    finalExploredEdges.push(...bestResult.exploredEdges);
    totalDistance += bestResult.distance;
    totalExp += bestResult.exp;
    
    unvisited.delete(nearestId);
    currentId = nearestId;
  }

  // Go to endId
  if (currentId !== endId) {
    const endResult = allPaths.get(currentId)!.get(endId)!;
    if (endResult.path.length > 0) {
      finalPath.push(...endResult.path.slice(1));
      finalExploredEdges.push(...endResult.exploredEdges);
      totalDistance += endResult.distance;
      totalExp += endResult.exp;
    }
  }

  return {
    path: finalPath,
    exploredEdges: finalExploredEdges,
    distance: totalDistance,
    exp: totalExp
  };
}
