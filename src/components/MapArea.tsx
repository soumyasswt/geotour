import React, { useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-polylinedecorator';
import { Node, Edge } from '../lib/graph';

interface MapAreaProps {
  nodes: Node[];
  edges: Edge[];
  startNodeId: string | null;
  endNodeId: string | null;
  optimalPath: string[]; // Node IDs in order
  exploredEdges: string[]; // Edge IDs
  onMapClick: (lat: number, lng: number) => void;
  onNodeClick: (nodeId: string) => void;
  selectedNodes: string[];
  focusedLocation?: [number, number] | null;
}

function MapController({ focusedLocation }: { focusedLocation?: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (focusedLocation) {
      map.flyTo(focusedLocation, 13, { duration: 1.5 });
    }
  }, [focusedLocation, map]);
  return null;
}

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

const MemoizedEdge = React.memo(({ edge, source, target, isExplored }: { edge: Edge, source: Node, target: Node, isExplored: boolean }) => {
  let baseColor = "#1e3a8a"; // Default dark blue
  if (edge.trafficMultiplier && edge.trafficMultiplier > 2) {
    baseColor = "#ef4444"; // Red for heavy traffic
  } else if (edge.trafficMultiplier && edge.trafficMultiplier > 1.5) {
    baseColor = "#f59e0b"; // Orange for medium traffic
  }

  return (
    <Polyline
      positions={[[source.lat, source.lng], [target.lat, target.lng]]}
      color={isExplored ? "#3b82f6" : baseColor}
      weight={isExplored ? 3 : 2}
      opacity={isExplored ? 0.8 : 0.4}
      dashArray={isExplored ? undefined : "4"}
      className={isExplored ? "glowing-blue-path" : ""}
    >
      <Tooltip direction="top" opacity={0.8}>
        Traffic: {edge.trafficMultiplier ? edge.trafficMultiplier.toFixed(1) + 'x' : 'Normal'}
      </Tooltip>
    </Polyline>
  );
});

const MemoizedNode = React.memo(({ node, isStart, isEnd, isSelected, isExplored, onNodeClick }: { node: Node, isStart: boolean, isEnd: boolean, isSelected: boolean, isExplored: boolean, onNodeClick: (id: string) => void }) => {
  let color = "#ffffff";
  if (isStart) color = "#10b981"; // Green
  else if (isEnd) color = "#ef4444"; // Red
  else if (isSelected) color = "#3b82f6"; // Blue
  else if (isExplored) color = "#a855f7"; // Purple for explored

  const fillColor = isStart || isEnd ? color : (isExplored && !isSelected ? "#f3e8ff" : "#ffffff");
  const weight = isSelected ? 4 : 2;

  const nodeIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-node-icon',
      html: `<div style="
        width: 16px; 
        height: 16px; 
        background-color: ${fillColor}; 
        border: ${weight}px solid ${color}; 
        border-radius: 50%;
        box-sizing: border-box;
        box-shadow: 0 0 4px rgba(0,0,0,0.5);
      "></div>`,
      iconSize: [16, 16],
      iconAnchor: [8, 8]
    });
  }, [color, fillColor, weight]);

  const exploredBgIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-explored-bg-icon',
      html: `<div style="
        width: 24px; 
        height: 24px; 
        background-color: #a855f7; 
        opacity: 0.2;
        border-radius: 50%;
        box-sizing: border-box;
      "></div>`,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
  }, []);

  return (
    <React.Fragment>
      {isExplored && !isStart && !isEnd && !isSelected && (
        <Marker
          position={[node.lat, node.lng]}
          icon={exploredBgIcon}
          interactive={false}
        />
      )}
      <Marker
        position={[node.lat, node.lng]}
        icon={nodeIcon}
        eventHandlers={{
          click: (e) => {
            L.DomEvent.stopPropagation(e.originalEvent);
            onNodeClick(node.id);
          }
        }}
      >
        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
          {node.name}
        </Tooltip>
      </Marker>
    </React.Fragment>
  );
});

const OptimalPathLayer = ({ pathCoords, color, weight, opacity, dashArray, className }) => {
  const map = useMap();

  useEffect(() => {
    if (pathCoords.length < 2) return;

    const polyline = L.polyline(pathCoords, { 
      color, 
      weight, 
      opacity, 
      dashArray, 
      className 
    });

    const decorator = (L as any).polylineDecorator(polyline, {
      patterns: [
        {
          offset: '5%', 
          repeat: '80px', 
          symbol: (L as any).Symbol.arrowHead({ 
            pixelSize: 12, 
            pathOptions: { 
              fillOpacity: 1, 
              weight: 0, 
              color 
            } 
          })
        }
      ]
    });

    map.addLayer(polyline);
    map.addLayer(decorator);

    return () => {
      map.removeLayer(polyline);
      map.removeLayer(decorator);
    };
  }, [pathCoords, color, weight, opacity, dashArray, className, map]);

  return null;
};

export function MapArea({ nodes, edges, startNodeId, endNodeId, optimalPath, exploredEdges, onMapClick, onNodeClick, selectedNodes, focusedLocation }: MapAreaProps) {
  
  // Create a map of nodes for easy lookup
  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  // Compute explored nodes based on explored edges
  const exploredEdgesSet = useMemo(() => new Set(exploredEdges), [exploredEdges]);
  const exploredNodeIds = useMemo(() => {
    const ids = new Set<string>();
    for (const edgeId of exploredEdges) {
      const edge = edges.find(e => e.id === edgeId);
      if (edge) {
        ids.add(edge.sourceId);
        ids.add(edge.targetId);
      }
    }
    return ids;
  }, [exploredEdges, edges]);

  // Build optimal path coordinates
  const optimalPathCoords: [number, number][] = [];
  if (optimalPath.length > 1) {
    for (let i = 0; i < optimalPath.length - 1; i++) {
      const id1 = optimalPath[i];
      const id2 = optimalPath[i+1];
      const edge = edges.find(e => 
        (e.sourceId === id1 && e.targetId === id2) || 
        (e.sourceId === id2 && e.targetId === id1)
      );
      
      if (edge && edge.pathCoords) {
        // Check direction
        const isForward = edge.sourceId === id1;
        const coords = isForward ? edge.pathCoords : [...edge.pathCoords].reverse();
        
        if (i === 0) {
          optimalPathCoords.push(...coords);
        } else {
          optimalPathCoords.push(...coords.slice(1));
        }
      } else {
        const n1 = nodeMap.get(id1);
        const n2 = nodeMap.get(id2);
        if (n1 && n2) {
          if (i === 0) optimalPathCoords.push([n1.lat, n1.lng]);
          optimalPathCoords.push([n2.lat, n2.lng]);
        }
      }
    }
  }

  return (
    <MapContainer 
      center={[20.5937, 78.9629]} // Center of India as in the screenshot
      zoom={5} 
      className="w-full h-full bg-[#0a0a0a]"
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        maxZoom={19}
      />
      
      <MapController focusedLocation={focusedLocation} />
      <MapEvents onMapClick={onMapClick} />

      {/* Draw all edges (Network) */}
      {edges.map(edge => {
        const source = nodeMap.get(edge.sourceId);
        const target = nodeMap.get(edge.targetId);
        if (!source || !target) return null;
        
        const isExplored = exploredEdgesSet.has(edge.id);
        
        return (
          <MemoizedEdge 
            key={edge.id} 
            edge={edge} 
            source={source} 
            target={target} 
            isExplored={isExplored} 
          />
        );
      })}

      {/* Draw optimal path (Glowing Green) */}
      {optimalPathCoords.length > 1 && (
        <OptimalPathLayer
          pathCoords={optimalPathCoords}
          color="#10b981" // Emerald green
          weight={4}
          opacity={1}
          dashArray="10, 10"
          className="glowing-path"
        />
      )}

      {/* Draw nodes */}
      {nodes.map(node => {
        const isStart = node.id === startNodeId;
        const isEnd = node.id === endNodeId;
        const isSelected = selectedNodes.includes(node.id);
        const isExplored = exploredNodeIds.has(node.id);

        return (
          <MemoizedNode 
            key={node.id} 
            node={node} 
            isStart={isStart} 
            isEnd={isEnd} 
            isSelected={isSelected} 
            isExplored={isExplored} 
            onNodeClick={onNodeClick} 
          />
        );
      })}
    </MapContainer>
  );
}
