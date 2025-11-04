import React, { useEffect, useRef, useState } from 'react'
// @ts-ignore
import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import { onFocus } from '@/store/bus'
import { useSelectionStore } from '@/store/selectionStore'

type Elem = { nodes:any[]; edges:any[] }

export default function GraphCanvas({ elements }:{ elements:Elem }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [initialized, setInitialized] = useState(false)
  const setSel = useSelectionStore(s => s.set)

  // Initialize Cytoscape ONCE when container is ready
  useEffect(() => {
    if (!containerRef.current || cyRef.current || initialized) return

    const checkAndInit = () => {
      if (!containerRef.current) return
      
      const width = containerRef.current.offsetWidth
      const height = containerRef.current.offsetHeight
      
      if (width === 0 || height === 0) {
        // Not ready yet, try again
        setTimeout(checkAndInit, 100)
        return
      }

      try {
        const cy = cytoscape({
          container: containerRef.current,
          elements: [],
          style: [
            { selector: 'node', style: { 'background-color': '#22d3ee', 'label': 'data(label)', 'color': '#cbd5e1', 'font-size': 12 } },
            { selector: 'edge', style: { 'line-color': '#64748b', 'target-arrow-color': '#64748b', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'label': 'data(label)', 'font-size': 10 } },
            { selector: '.selected', style: { 'border-width': 4, 'border-color': '#fff' } }
          ]
        })

        cy.on('tap', 'node', (evt: any) => {
          const id = evt.target.id()
          const type = evt.target.data('type')
          setSel({ id, type })
          cy.elements().removeClass('selected')
          evt.target.addClass('selected')
        })

        cyRef.current = cy
        setInitialized(true)
      } catch (err) {
        console.error('Failed to initialize graph:', err)
      }
    }

    // Start checking after a brief delay
    setTimeout(checkAndInit, 50)
  }, [initialized, setSel])

  // Update elements when they change
  useEffect(() => {
    if (!cyRef.current || !initialized) return

    try {
      cyRef.current.elements().remove()
      if (elements.nodes.length > 0 || elements.edges.length > 0) {
        cyRef.current.add([...elements.nodes, ...elements.edges])
        cyRef.current.layout({ name: 'breadthfirst', animate: false }).run()
      }
    } catch (err) {
      console.error('Failed to update graph:', err)
    }
  }, [elements, initialized])

  // Handle resize
  useEffect(() => {
    if (!cyRef.current || !initialized) return

    const resizeObserver = new ResizeObserver(() => {
      if (cyRef.current) {
        cyRef.current.resize()
      }
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [initialized])

  // Handle focus events
  useEffect(() => {
    if (!initialized) return

    const unsubscribe = onFocus(({ id }) => {
      if (!cyRef.current) return
      const node = cyRef.current.getElementById(id)
      if (node && node.nonempty()) {
        cyRef.current.elements().removeClass('selected')
        node.addClass('selected')
        cyRef.current.animate({ fit: { eles: node, padding: 50 }, duration: 250 })
      }
    })

    return unsubscribe
  }, [initialized])

  return (
    <div 
      ref={containerRef} 
      className="w-full h-full rounded-lg bg-black/20"
      style={{ minHeight: '300px' }}
    />
  )
}
