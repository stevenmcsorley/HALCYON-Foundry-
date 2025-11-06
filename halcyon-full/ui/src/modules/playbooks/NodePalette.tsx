import React from 'react';

const NODE_TYPES = [
  { type: 'geoip', label: 'GeoIP', color: 'bg-blue-500' },
  { type: 'whois', label: 'WHOIS', color: 'bg-green-500' },
  { type: 'virustotal', label: 'VirusTotal', color: 'bg-red-500' },
  { type: 'reverse_geocode', label: 'Reverse Geocode', color: 'bg-purple-500' },
  { type: 'keyword_match', label: 'Keyword Match', color: 'bg-yellow-500' },
  { type: 'http_get', label: 'HTTP GET', color: 'bg-teal-500' },
  { type: 'http_post', label: 'HTTP POST', color: 'bg-orange-500' },
  { type: 'branch', label: 'Branch', color: 'bg-pink-500' },
  { type: 'wait', label: 'Wait', color: 'bg-gray-500' },
  { type: 'output', label: 'Output', color: 'bg-indigo-500' },
] as const;

interface NodePaletteProps {
  onAddNode: (type: string) => void;
}

export const NodePalette: React.FC<NodePaletteProps> = ({ onAddNode }) => {
  return (
    <div className="p-4 bg-surface-dark border-r border-white/10">
      <h3 className="text-sm font-semibold mb-3 text-white/80">Node Palette</h3>
      <div className="space-y-2">
        {NODE_TYPES.map((node) => (
          <button
            key={node.type}
            onClick={() => onAddNode(node.type)}
            className={`w-full px-3 py-2 rounded text-sm text-white ${node.color} hover:opacity-80 transition-opacity text-left`}
          >
            {node.label}
          </button>
        ))}
      </div>
    </div>
  );
};

