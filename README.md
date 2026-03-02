# GeoTour: Vector Path

[Live Website](https://geotour.soumyas.tech/)

GeoTour is a sophisticated web application for visualizing complex pathfinding and graph traversal algorithms on an interactive map. Built with React, TypeScript, and Leaflet, it provides a powerful tool for developers, students, and enthusiasts to understand and experiment with classic algorithms in a real-world context.

Users can dynamically build a network of locations (nodes), fetch actual road routing data to form connections (edges), and then apply a suite of algorithms to find optimal paths or tours. The application visualizes the entire process, including the final route, all explored nodes, and key performance statistics, offering deep insights into how each algorithm operates under real-world conditions.

## ✨ Features

- **Interactive Map Interface:** Add, move, and manage locations directly on a live Leaflet map.
- **Global Location Search:** Instantly find and add any location worldwide with an autocomplete search feature powered by the Photon API.
- **Real-World Routing:** Utilizes the OSRM API to fetch actual road network distances and geometries, providing weighted edges for realistic pathfinding.
- **Dynamic Network Generation:** Automatically create a connected graph by heuristically linking nearby nodes.
- **Rich Algorithm Suite:** Implement and compare a wide range of pathfinding and tour-optimization algorithms.
- **Detailed Visualization:** Clearly see the final path, all explored edges during the search, and key stats like distance and nodes visited.

## Core Logic & Architecture

The application's core is a custom-built graph data structure and a suite of pathfinding algorithms implemented in TypeScript. The architecture is designed to be modular and extensible.

### Graph Representation
- **Nodes:** Each location on the map is a `Node` object, containing an `id`, geographical coordinates (`lat`, `lng`), and a `name`.
- **Edges:** A connection between two nodes is an `Edge` object, containing a unique `id`, `sourceId`, `targetId`, and a `distance` (weight). For visualization, it also stores the `pathCoords` from the OSRM API.
- **Data Structure:** The graph is managed as a collection of `nodes` and `edges`, which is then converted into an adjacency list representation in memory for efficient traversal by the algorithms.

### Real-World Routing & Network Generation
1.  **Node Creation:** Users add nodes by clicking on the map (reverse geocoded) or using the search bar.
2.  **Auto-Linking:** The "Auto-Link Network" feature uses a k-nearest neighbors heuristic (`autoLinkNetwork`) to propose connections between the closest nodes.
3.  **Edge Weighting:** For each proposed edge, the application calls the OSRM API to get the true road distance between the two points. This distance becomes the weight of the edge. If the API fails or is rate-limited, it falls back to the direct haversine distance.

## 🤖 Algorithms Implemented

GeoTour showcases a variety of algorithms, each with detailed explanations of their logic.

### A* Search
- **Description:** A* is an informed search algorithm that aims to find the shortest path from a start to an end node. It is efficient because it prioritizes paths that are already short and are estimated to be close to the destination.
- **Logic:** It uses a priority queue and a cost function `f(n) = g(n) + h(n)`:
    - `g(n)`: The actual distance from the start node to the current node `n`.
    - `h(n)`: A heuristic estimate of the distance from `n` to the end node. In this project, the **haversine distance** (straight-line geographic distance) is used as the heuristic. This heuristic is **admissible** (it never overestimates the true distance), which guarantees that A* will find the optimal path.

### Dijkstra's Algorithm
- **Description:** Dijkstra's algorithm is a foundational shortest path algorithm that works on graphs with non-negative edge weights.
- **Logic:** It is similar to A* but does not use a heuristic to guide its search (`h(n) = 0`). It explores radially from the start node, always expanding the node with the lowest `g(n)` (cumulative distance). It guarantees the shortest path but can be less efficient than A* in large, open maps because it explores in all directions.

### Breadth-First Search (BFS)
- **Description:** BFS explores a graph layer by layer, guaranteeing that it finds the path with the fewest number of edges.
- **Logic:** It uses a standard queue (First-In, First-Out). Since it doesn't consider edge weights (distance), the path it finds is only optimal in terms of the number of segments, not the total travel distance. It is best used for unweighted graphs.

### Depth-First Search (DFS)
- **Description:** DFS explores a graph by traversing as far as possible down each branch before backtracking.
- **Logic:** It uses a stack (Last-In, First-Out). DFS finds a path quickly but offers no guarantee of optimality in any sense (neither shortest distance nor fewest edges). Its path can often be long and unnatural.

### Tour Optimization Algorithms
- **Visit in Order (A*):** This algorithm calculates the path required to visit a series of pre-defined waypoints in a specific, user-defined order. It does this by running A* search sequentially between each waypoint in the list.
- **Optimize Order (TSP):** This feature tackles the Traveling Salesperson Problem (TSP). Given a set of nodes, it finds an approximation of the shortest possible tour that visits every node exactly once before returning to the start. Since TSP is NP-hard, this implementation uses a **Nearest Neighbor heuristic** combined with 2-opt refinements to find a high-quality approximate solution efficiently.

### Current Works
- When you have more than two locations, it will automatically compare the "Visit in Order" and "Optimize Order (TSP)" algorithms and select the one that produces a shorter route.
- The chosen algorithm will be displayed in the results panel.

## 🛠️ Tech Stack

- **Core Framework:** React (with Vite), TypeScript
- **State Management:** React Hooks (`useState`, `useRef`, `useEffect`, `useCallback`)
- **Styling:** Tailwind CSS with `tailwind-merge` for utility class management.
- **UI Components:** `lucide-react` for icons.
- **Mapping:**
    - `leaflet`: The core interactive map library.
    - `react-leaflet`: React components for Leaflet.
- **APIs & Geolocation:**
    - **OSRM API:** For real-world road routing and edge weights.
    - **Photon API:** For geocoding and location search.
    - **OpenStreetMap API:** For reverse geocoding (naming locations clicked on the map).

## 🚀 Running Locally

To run GeoTour on your local machine, follow these steps:

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/soumyasswt/geotour.git
    cd geotour
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Run the development server:**
    ```bash
    npm run dev
    ```

The application will be available at a local port, typically `http://localhost:5173`.

## 📄 License

This project is licensed under the MIT License.

```
Copyright (c) 2024 soumyasswt

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, to a subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
