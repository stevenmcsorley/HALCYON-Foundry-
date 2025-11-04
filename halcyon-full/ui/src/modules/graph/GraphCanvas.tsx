import React, { useEffect, useRef } from 'react'
import cytoscape, { Core, ElementsDefinition } from 'cytoscape'
import { useSelectionStore } from '@/store/selectionStore'

type GraphCanvasProps = {
  elements: ElementsDefinition
}

export const GraphCanvas: React.FC<GraphCanvasProps> = ({ elements }) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const { setSelectedEntity } = useSelectionStore()

  useEffect(() => {
    if (!containerRef.current || cyRef.current) return

    cyRef.current = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'width': 40,
            'height': 40,
            'background-color': '#0ea5a5',
            'color': '#ffffff',
            'font-size': '10px',
            'text-valign': 'center',
            'text-halign': 'center',
            'text-wrap': 'wrap',
            'text-max-width': '60px',
            'border-width': 2,
            'border-color': '#ffffff',
            'shape': 'ellipse'
          }
        },
        {
          selector: 'node[type = "Location"]',
          style: {
            'background-color': '#8b5cf6'
          }
        },
        {
          selector: 'node[type = "Event"]',
          style: {
            'background-color': '#ef4444'
          }
        },
        {
          selector: 'node[type = "Asset"]',
          style: {
            'background-color': '#10b981'
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#a2a8b0',
            'target-arrow-color': '#a2a8b0',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'label': 'data(label)',
            'font-size': '8px',
            'color': '#a2a8b0',
            'text-rotation': 'autorotate',
            'text-margin-y': -10
          }
        }
      ],
      layout: {
        name: 'breadthfirst',
        animate: true,
        animationDuration: 1000,
        fit: true,
        padding: 30
      }
    })

    // Handle node click
    cyRef.current.on('tap', 'node', (evt) => {
      const node = evt.target
      const data = node.data()
      setSelectedEntity({ id: data.id, type: data.type })
    })

    return () => {
      if (cyRef.current) {
        cyRef.current.destroy()
        cyRef.current = null
      }
    }
  }, [setSelectedEntity])

  useEffect(() => {
    if (!cyRef.current) return
    cyRef.current.elements().remove()
    cyRef.current.add(elements)
    cyRef.current.layout({ name: 'breadthfirst', animate: true, animationDuration: 500 }).run()
  }, [elements])

  return <div ref={containerRef} className="w-full h-full rounded-lg" style={{ minHeight: '300px' }} />
}
