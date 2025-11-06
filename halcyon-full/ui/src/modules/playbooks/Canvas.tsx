import React, { useCallback, useMemo } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Connection,
  useNodesState,
  useEdgesState,
  NodeTypes,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { PlaybookStep } from './types';
import usePlaybooksStore from '@/store/playbooksStore';

const nodeTypes: NodeTypes = {
  default: ({ data }: any) => (
    <div className="px-4 py-2 bg-surface border border-white/20 rounded shadow-lg text-white min-w-[120px]">
      <Handle type="target" position={Position.Top} className="w-3 h-3" />
      <div className="font-semibold text-sm">{data.label}</div>
      {data.type && <div className="text-xs text-white/60 mt-1">{data.type}</div>}
      <Handle type="source" position={Position.Bottom} className="w-3 h-3" />
    </div>
  ),
};

interface CanvasProps {
  onNodeClick?: (nodeId: string) => void;
}

export const Canvas: React.FC<CanvasProps> = ({ onNodeClick }) => {
  const { current, setCurrentJson, setSelection } = usePlaybooksStore();
  
  const steps = current?.jsonBody?.steps || [];

  // Convert steps to ReactFlow nodes
  const initialNodes: Node[] = useMemo(() => {
    return steps.map((step, index) => ({
      id: step.id,
      type: 'default',
      position: { x: 200 + (index % 3) * 200, y: 100 + Math.floor(index / 3) * 150 },
      data: {
        label: step.name || step.type,
        type: step.type,
      },
    }));
  }, [steps]);

  // Convert steps to ReactFlow edges
  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    steps.forEach((step) => {
      if (step.next) {
        step.next.forEach((targetId) => {
          edges.push({
            id: `${step.id}-${targetId}`,
            source: step.id,
            target: targetId,
          });
        });
      }
    });
    return edges;
  }, [steps]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync nodes/edges when steps change
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      
      setCurrentJson((json) => {
        const steps = [...json.steps];
        const sourceStep = steps.find((s) => s.id === params.source);
        if (sourceStep) {
          const next = sourceStep.next || [];
          if (!next.includes(params.target!)) {
            sourceStep.next = [...next, params.target!];
          }
        }
        return { ...json, steps };
      });
      
      setEdges((eds) => {
        // Check if edge already exists
        const exists = eds.some(e => e.source === params.source && e.target === params.target);
        if (exists) return eds;
        return addEdge(params, eds);
      });
    },
    [setCurrentJson, setEdges]
  );

  const onNodeClickHandler = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelection([node.id]);
      onNodeClick?.(node.id);
    },
    [onNodeClick, setSelection]
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      setCurrentJson((json) => {
        const deletedIds = new Set(deleted.map((n) => n.id));
        const steps = json.steps
          .filter((s) => !deletedIds.has(s.id))
          .map((s) => ({
            ...s,
            next: s.next?.filter((id) => !deletedIds.has(id)),
          }));
        return { ...json, steps };
      });
    },
    [setCurrentJson]
  );

  return (
    <div className="w-full h-full" style={{ width: '100%', height: '100%', minHeight: '400px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClickHandler}
        onNodesDelete={onNodesDelete}
        nodeTypes={nodeTypes}
        fitView
        className="bg-surface"
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
};

