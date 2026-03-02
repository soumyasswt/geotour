import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Share2, Info, Search, Link as LinkIcon, Zap, RotateCcw, Trash2, Activity, MapPin, ChevronDown } from 'lucide-react';
import { MapArea } from './components/MapArea';
import { Node, Edge, autoLinkNetwork, solveTSP, findOrderedWaypointPath, dijkstra, astar, bfs, dfs, SearchResult, haversineDistance } from './lib/graph';
import { cn } from './lib/utils';

async function fetchRoadRoute(lat1: number, lng1: number, lat2: number, lng2: number) {
  try {
    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=full&geometries=geojson`);
    if (res.status === 429) {
      // Rate limited, silently fallback to straight line
      return {
        distance: haversineDistance(lat1, lng1, lat2, lng2),
        coords: [[lat1, lng1], [lat2, lng2]] as [number, number][]
      };
    }
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      const route = data.routes[0];
      const coords = route.geometry.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
      return { distance: route.distance / 1000, coords };
    }
  } catch (e) {
    console.warn("Failed to fetch route, falling back to straight line");
  }
  return {
    distance: haversineDistance(lat1, lng1, lat2, lng2),
    coords: [[lat1, lng1], [lat2, lng2]] as [number, number][]
  };
}

interface SearchSuggestion {
  place_id: string; // Photon uses osm_id, we can convert it to string
  display_name: string;
  lat: string;
  lon: string;
}

const ALGORITHM_DISPLAY_NAMES: Record<'A*' | 'Dijkstra' | 'BFS' | 'DFS' | 'Ordered (A*)' | 'TSP', string> = {
  'A*': 'A* Search (Recommended)',
  'Dijkstra': "Dijkstra's",
  'BFS': 'Breadth-First Search',
  'DFS': 'Depth-First Search',
  'Ordered (A*)': 'Visit in Order',
  'TSP': 'Optimize Order (TSP)',
};

export default function App() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [startNodeId, setStartNodeId] = useState<string | null>(null);
  const [endNodeId, setEndNodeId] = useState<string | null>(null);
  const [selectedNodes, setSelectedNodes] = useState<string[]>([]);
  const [algorithm, setAlgorithm] = useState<'A*' | 'Dijkstra' | 'BFS' | 'DFS' | 'Ordered (A*)' | 'TSP'>('A*');
  const [isLinking, setIsLinking] = useState(false);
  
  const [searchResult, setSearchResult] = useState<SearchResult | null>(null);
  const [focusedLocation, setFocusedLocation] = useState<[number, number] | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Dropdown state
  const [isAlgorithmDropdownOpen, setIsAlgorithmDropdownOpen] = useState(false);
  const algorithmDropdownRef = useRef<HTMLDivElement>(null);
  
  const [userLocation, setUserLocation] = useState<{lat: number, lon: number} | null>(null);

  useEffect(() => {
    if (nodes.length > 2) {
      if (['A*', 'Dijkstra', 'BFS', 'DFS'].includes(algorithm)) {
        setAlgorithm('Ordered (A*)');
      }
    } else {
      if (['Ordered (A*)', 'TSP'].includes(algorithm)) {
        setAlgorithm('A*');
      }
    }
  }, [nodes.length, algorithm]);

  const fetchSuggestions = async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      return;
    }
    setIsSearching(true);
    try {
      let url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5`;
      if (userLocation) {
        url += `&lat=${userLocation.lat}&lon=${userLocation.lon}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      
      const formattedSuggestions: SearchSuggestion[] = data.features.map((f: any) => {
        const props = f.properties;
        const nameParts = [props.name, props.city, props.state, props.country].filter(Boolean);
        const displayName = Array.from(new Set(nameParts)).join(', ');
        
        return {
          place_id: `${props.osm_type}${props.osm_id}`,
          display_name: displayName || 'Unknown Location',
          lat: f.geometry.coordinates[1].toString(),
          lon: f.geometry.coordinates[0].toString()
        };
      });
      
      setSuggestions(formattedSuggestions);
    } catch (e) {
      console.error("Failed to fetch suggestions", e);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    if (searchQuery) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchSuggestions(searchQuery);
      }, 500);
    } else {
      setSuggestions([]);
    }
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [searchQuery]);

  const handleAddCityFromSearch = (suggestion: SearchSuggestion) => {
    const lat = parseFloat(suggestion.lat);
    const lng = parseFloat(suggestion.lon);
    const newNode: Node = {
      id: `node-${Date.now()}`,
      lat,
      lng,
      name: suggestion.display_name.split(',')[0] // Use just the first part of the name
    };
    setNodes(prev => [...prev, newNode]);
    setFocusedLocation([lat, lng]);
    setSearchQuery('');
    setShowSuggestions(false);
  };

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // Temporary name while fetching
    const tempId = `node-${Date.now()}`;
    const newNode: Node = {
      id: tempId,
      lat,
      lng,
      name: `Loading...`
    };
    setNodes(prev => [...prev, newNode]);
    setFocusedLocation([lat, lng]);

    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
      const data = await res.json();
      
      let placeName = 'Unknown Location';
      if (data && data.display_name) {
        // Use the first two parts of the display name for a concise but descriptive name
        const parts = data.display_name.split(',').map((p: string) => p.trim());
        placeName = parts.slice(0, 2).join(', ');
      } else if (data && data.address) {
        // Fallback to specific address components if display_name is somehow missing
        placeName = data.address.amenity || 
                    data.address.building || 
                    data.address.shop || 
                    data.address.office || 
                    data.address.leisure ||
                    data.address.tourism ||
                    data.address.highway ||
                    data.address.road || 
                    data.address.neighbourhood || 
                    data.address.suburb || 
                    data.address.city || 
                    data.address.town || 
                    data.address.village || 
                    data.name || 
                    `Location ${nodes.length + 1}`;
      }

      setNodes(prev => prev.map(n => n.id === tempId ? { ...n, name: placeName } : n));
    } catch (e) {
      console.error("Failed to reverse geocode", e);
      setNodes(prev => prev.map(n => n.id === tempId ? { ...n, name: `Location ${nodes.length + 1}` } : n));
    }
  }, [nodes.length]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodes(prev => {
      if (prev.includes(nodeId)) {
        return prev.filter(id => id !== nodeId);
      }
      if (prev.length >= 2) {
        return [prev[1], nodeId];
      }
      return [...prev, nodeId];
    });
  }, []);

  const handleAutoLink = async () => {
    if (nodes.length < 2) return;
    setIsLinking(true);
    
    const heuristicEdges = autoLinkNetwork(nodes, 3);
    const existingEdgeIds = new Set(edges.map(e => e.id));
    const edgesToFetch = heuristicEdges.filter(he => !existingEdgeIds.has(he.id));
    
    const newEdges: Edge[] = [];
    const concurrency = 10; // Process 10 routes concurrently to minimize time without overwhelming the browser
    
    for (let i = 0; i < edgesToFetch.length; i += concurrency) {
      const batch = edgesToFetch.slice(i, i + concurrency);
      
      const batchResults = await Promise.all(batch.map(async (he) => {
        const n1 = nodes.find(n => n.id === he.sourceId)!;
        const n2 = nodes.find(n => n.id === he.targetId)!;
        const { distance, coords } = await fetchRoadRoute(n1.lat, n1.lng, n2.lat, n2.lng);
        
        return {
          ...he,
          distance,
          pathCoords: coords,
          trafficMultiplier: 1 + Math.random() * 2 // Random traffic between 1x and 3x
        };
      }));
      
      newEdges.push(...batchResults);
    }
    
    setEdges(prev => [...prev, ...newEdges]);
    setIsLinking(false);
  };

  const handleOptimize = () => {
    if (!startNodeId || !endNodeId) {
      alert("Please select a start and end node first.");
      return;
    }
    
    const graph = { nodes, edges };
    let result: SearchResult | null = null;

    switch(algorithm) {
        case 'A*':
            result = astar(graph, startNodeId, endNodeId);
            break;
        case 'Dijkstra':
            result = dijkstra(graph, startNodeId, endNodeId);
            break;
        case 'BFS':
            result = bfs(graph, startNodeId, endNodeId);
            break;
        case 'DFS':
            result = dfs(graph, startNodeId, endNodeId);
            break;
        case 'Ordered (A*)':
            const otherNodeIds = nodes.map(n => n.id).filter(id => id !== startNodeId && id !== endNodeId);
            const waypoints = [startNodeId, ...otherNodeIds, endNodeId];
            result = findOrderedWaypointPath(graph, waypoints);
            if (result && result.path.length === 0) {
              alert("Could not find a valid path connecting all waypoints in the specified order.");
            }
            break;
        case 'TSP':
            result = solveTSP(graph, startNodeId, endNodeId);
            break;
        default:
            result = astar(graph, startNodeId, endNodeId);
    }

    if (result && result.path.length === 0 && algorithm !== 'Ordered (A*)') {
      alert("No path found between the selected start and end nodes.");
    }

    setSearchResult(result);
  };

  const handleReset = () => {
    setSearchResult(null);
  };

  const handleClearAll = () => {
    setNodes([]);
    setEdges([]);
    setStartNodeId(null);
    setEndNodeId(null);
    setSelectedNodes([]);
    setSearchResult(null);
  };

  const handleRemoveNode = (nodeId: string) => {
    const newNodes = nodes.filter(n => n.id !== nodeId);
    
    let targetNode = null;
    const remainingSelected = selectedNodes.filter(id => id !== nodeId);
    if (remainingSelected.length > 0) {
      const lastSelectedId = remainingSelected[remainingSelected.length - 1];
      targetNode = newNodes.find(n => n.id === lastSelectedId);
    }
    
    if (!targetNode && newNodes.length > 0) {
      targetNode = newNodes[newNodes.length - 1];
    }

    if (targetNode) {
      setFocusedLocation([targetNode.lat, targetNode.lng]);
    }

    setNodes(newNodes);
    setEdges(prev => prev.filter(e => e.sourceId !== nodeId && e.targetId !== nodeId));
    if (startNodeId === nodeId) setStartNodeId(null);
    if (endNodeId === nodeId) setEndNodeId(null);
    setSelectedNodes(remainingSelected);
    setSearchResult(null);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full bg-[#0a0a0a] text-white font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-full md:w-80 bg-[#121212] border-b md:border-b-0 md:border-r border-white/10 flex flex-col z-10 shadow-2xl h-[45vh] md:h-full shrink-0">
        <div className="p-4 md:p-6 border-b border-white/10">
          <div className="flex items-center gap-3 mb-4 md:mb-6">
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
              <Activity size={20} className="md:w-6 md:h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold tracking-tight">GeoTour</h1>
              <p className="text-[9px] md:text-[10px] text-gray-400 uppercase tracking-widest font-mono">Vector Path</p>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text" 
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              placeholder="Search location, building, area..." 
              className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-emerald-500/50 transition-colors"
            />
            {isSearching && (
              <Activity className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 animate-spin" size={14} />
            )}
            
            {/* Suggestions Dropdown */}
            {showSuggestions && searchQuery.trim() !== '' && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl overflow-hidden z-50">
                {suggestions.length > 0 ? suggestions.map((suggestion) => (
                  <button
                    key={suggestion.place_id}
                    onClick={() => handleAddCityFromSearch(suggestion)}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 flex items-start gap-3"
                  >
                    <MapPin size={16} className="text-emerald-500 mt-0.5 shrink-0" />
                    <span className="text-sm text-gray-300 line-clamp-2">{suggestion.display_name}</span>
                  </button>
                )) : !isSearching && (
                  <div className="px-4 py-3 text-sm text-gray-400 text-center">
                    No results found. It might be misspelled or an unpopular place.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2" onClick={() => setShowSuggestions(false)}>
          {nodes.map(node => (
            <div key={node.id} className="bg-white/5 border border-white/10 rounded-lg p-3 flex items-center justify-between group hover:bg-white/10 transition-colors">
              <span className="text-sm font-medium truncate max-w-[140px] md:max-w-[180px]">{node.name}</span>
              <div className="flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => setStartNodeId(node.id)}
                  className={cn("px-2 py-1 text-xs rounded", startNodeId === node.id ? "bg-emerald-500/20 text-emerald-500" : "bg-white/10 hover:bg-white/20")}
                >
                  Start
                </button>
                <button 
                  onClick={() => setEndNodeId(node.id)}
                  className={cn("px-2 py-1 text-xs rounded", endNodeId === node.id ? "bg-red-500/20 text-red-500" : "bg-white/10 hover:bg-white/20")}
                >
                  End
                </button>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveNode(node.id);
                  }}
                  className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-red-500/20 hover:text-red-500 transition-colors flex items-center justify-center"
                  title="Remove Node"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
          {nodes.length === 0 && (
            <div className="text-center text-gray-500 text-sm py-8">
              Click on the map or search to add locations
            </div>
          )}
        </div>

        <div className="p-4 border-t border-white/10 space-y-3" onClick={() => setShowSuggestions(false)}>
          <button 
            onClick={handleAutoLink}
            disabled={nodes.length < 2 || isLinking}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-lg py-2.5 text-sm font-medium border border-indigo-500/30"
          >
            {isLinking ? <Activity className="animate-spin" size={16} /> : <LinkIcon size={16} />} Auto-Link Network
          </button>

          <button 
            onClick={handleOptimize}
            disabled={!startNodeId || !endNodeId || nodes.length < 2 || isLinking}
            className="w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-lg py-3 text-sm font-bold shadow-[0_0_20px_rgba(16,185,129,0.3)]"
          >
            <Zap size={18} /> Optimize Tour
          </button>

          <div className="flex gap-2 pt-2">
            <button onClick={handleReset} className="flex-1 flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 transition-colors rounded-lg py-2 text-xs font-medium border border-white/10 text-gray-400">
              <RotateCcw size={14} /> Reset
            </button>
            <button onClick={handleClearAll} className="flex-1 flex items-center justify-center gap-2 bg-red-500/10 hover:bg-red-500/20 transition-colors rounded-lg py-2 text-xs font-medium border border-red-500/20 text-red-400">
              <Trash2 size={14} /> Clear All
            </button>
          </div>

          {searchResult && (
            <div className="mt-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4">
              <div className="flex justify-between items-end mb-2">
                <span className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">Route Found</span>
                <span className="text-xl font-bold font-mono text-white">{Math.round(searchResult.distance)} km</span>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-gray-400 leading-relaxed">
                  Visited <span className="text-white font-medium">{searchResult.path.length}</span> locations.
                </p>
                <p className="text-xs text-gray-400 leading-relaxed">
                  Explored <span className="text-white font-medium">{searchResult.exp}</span> nodes during search.
                </p>
                {searchResult.path.length > 0 && (
                  <p className="text-[10px] text-emerald-500/80 mt-2 truncate">
                    {searchResult.path.map(id => nodes.find(n => n.id === id)?.name).join(' → ')}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Map Area */}
      <div className="flex-1 relative h-[55vh] md:h-full" onClick={() => {setShowSuggestions(false); setIsAlgorithmDropdownOpen(false);}}>
        <MapArea 
          nodes={nodes}
          edges={edges}
          startNodeId={startNodeId}
          endNodeId={endNodeId}
          optimalPath={searchResult?.path || []}
          exploredEdges={searchResult?.exploredEdges || []}
          onMapClick={handleMapClick}
          onNodeClick={handleNodeClick}
          selectedNodes={selectedNodes}
          focusedLocation={focusedLocation}
        />

        {/* Top Right Overlay */}
        <div className="absolute top-4 right-4 md:top-6 md:right-6 z-[400] flex flex-col items-end gap-2 md:gap-4 pointer-events-none">
          
          {/* Instructions */}
          <div className="bg-[#121212]/90 backdrop-blur-md border border-white/10 rounded-full py-1.5 px-3 md:py-2 md:px-4 flex items-center gap-2 md:gap-4 shadow-2xl pointer-events-auto">
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-white/10 flex items-center justify-center text-[8px] md:text-[9px] font-mono text-gray-400 shrink-0">1</div>
              <span className="text-[9px] md:text-[10px] text-gray-300 whitespace-nowrap">Add</span>
            </div>
            <div className="w-px h-2.5 md:h-3 bg-white/10"></div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-white/10 flex items-center justify-center text-[8px] md:text-[9px] font-mono text-gray-400 shrink-0">2</div>
              <span className="text-[9px] md:text-[10px] text-gray-300 whitespace-nowrap">Link</span>
            </div>
            <div className="w-px h-2.5 md:h-3 bg-white/10"></div>
            <div className="flex items-center gap-1.5 md:gap-2">
              <div className="w-3.5 h-3.5 md:w-4 md:h-4 rounded-full bg-white/10 flex items-center justify-center text-[8px] md:text-[9px] font-mono text-gray-400 shrink-0">3</div>
              <span className="text-[9px] md:text-[10px] text-gray-300 whitespace-nowrap">Optimize</span>
            </div>
          </div>

          {/* Stats */}
          <div className="bg-[#121212]/90 backdrop-blur-md border border-white/10 rounded-xl md:rounded-2xl p-3 md:p-4 shadow-2xl w-auto md:min-w-[240px] pointer-events-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 pb-3 border-b border-white/10 gap-4">
              <span className="text-[9px] md:text-[10px] text-gray-400 uppercase tracking-widest font-mono">Algorithm</span>
              <div className="relative w-48" ref={algorithmDropdownRef}>
                <button
                  onClick={() => setIsAlgorithmDropdownOpen(!isAlgorithmDropdownOpen)}
                  className="w-full flex justify-between items-center bg-white/5 border border-white/10 rounded-md px-3 py-1.5 text-xs md:text-sm text-emerald-500 font-bold focus:outline-none focus:border-emerald-500/50 transition-colors hover:bg-white/10"
                >
                  <span className="truncate">{ALGORITHM_DISPLAY_NAMES[algorithm]}</span>
                  <ChevronDown size={16} className={cn("text-gray-400 transition-transform shrink-0 ml-2", isAlgorithmDropdownOpen && 'rotate-180')} />
                </button>
                {isAlgorithmDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 w-full bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95">
                    <div className="text-gray-400 px-3 py-2 text-xs font-bold border-b border-white/10">A to B Pathfinding</div>
                    <button onClick={() => { setAlgorithm('A*'); setIsAlgorithmDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors">A* Search (Recommended)</button>
                    <button onClick={() => { setAlgorithm('Dijkstra'); setIsAlgorithmDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors">Dijkstra's</button>
                    <button onClick={() => { setAlgorithm('BFS'); setIsAlgorithmDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors">Breadth-First Search</button>
                    <button onClick={() => { setAlgorithm('DFS'); setIsAlgorithmDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors">Depth-First Search</button>

                    <div className="text-gray-400 px-3 py-2 text-xs font-bold border-t border-white/10">Multi-Point Tour</div>
                    <button onClick={() => { setAlgorithm('Ordered (A*)'); setIsAlgorithmDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors">Visit in Order</button>
                    <button onClick={() => { setAlgorithm('TSP'); setIsAlgorithmDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/5 transition-colors">Optimize Order (TSP)</button>
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-[9px] md:text-[10px] text-gray-400 uppercase tracking-widest font-mono">Exp</span>
                <span className="text-sm md:text-base font-mono font-medium text-emerald-500">{searchResult?.exp || '-'}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] md:text-[10px] text-gray-400 uppercase tracking-widest font-mono">Dist</span>
                <span className="text-sm md:text-base font-mono font-medium text-white">{searchResult ? `${Math.round(searchResult.distance)} km` : '-'}</span>
              </div>
            </div>

            {/* Traffic Legend */}
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-[8px] md:text-[9px] text-gray-400 uppercase tracking-widest font-mono mb-1.5">Map Legend</div>
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-1 bg-[#1e3a8a] rounded-full"></div>
                  <span className="text-[9px] md:text-[10px] text-gray-300">Normal Traffic (1x)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-1 bg-[#f59e0b] rounded-full"></div>
                  <span className="text-[9px] md:text-[10px] text-gray-300">Medium Traffic (1.5x - 2x)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-1 bg-[#ef4444] rounded-full"></div>
                  <span className="text-[9px] md:text-[10px] text-gray-300">Heavy Traffic (&gt;2x)</span>
                </div>
                <div className="flex items-center gap-1.5 mt-1">
                  <div className="w-2.5 h-2.5 rounded-full border-2 border-[#a855f7] bg-[#f3e8ff] flex items-center justify-center relative">
                    <div className="absolute w-5 h-5 bg-[#a855f7]/20 rounded-full"></div>
                  </div>
                  <span className="text-[10px] text-gray-300">Explored Node</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
