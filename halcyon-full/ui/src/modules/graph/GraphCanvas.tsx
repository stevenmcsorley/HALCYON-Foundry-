import React, { useEffect, useRef, useState } from 'react'
// @ts-ignore
import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import { onFocus } from '@/store/bus'
import { useSelectionStore } from '@/store/selectionStore'
import { showToast } from '@/components/Toast'

type Elem = { nodes:any[]; edges:any[] }

export default function GraphCanvas({ 
  elements,
  followLive = false,
  latestEntity = null,
  layout = 'breadthfirst',
  showEdgeLabels = true
}: { 
  elements: Elem & { totalFiltered?: number; hasMore?: boolean }
  followLive?: boolean
  latestEntity?: any
  layout?: 'breadthfirst' | 'cose'
  showEdgeLabels?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<Core | null>(null)
  const [initialized, setInitialized] = useState(false)
  const selectedNodeId = useRef<string | null>(null)
  const setSel = useSelectionStore(s => s.set)
  const layoutTimeoutRef = useRef<number | null>(null)

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
        
        // Update edge label visibility based on showEdgeLabels prop
        cy.style()
          .selector('edge')
          .style('label', showEdgeLabels ? 'data(label)' : '')
          .update()

        cy.on('tap', 'node', (evt: any) => {
          const id = evt.target.id()
          const type = evt.target.data('type')
          selectedNodeId.current = id
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

  // Update edge label visibility
  useEffect(() => {
    if (!cyRef.current || !initialized) return
    try {
      cyRef.current.style()
        .selector('edge')
        .style('label', showEdgeLabels ? 'data(label)' : '')
        .update()
    } catch (err) {
      console.error('Failed to update edge labels:', err)
    }
  }, [showEdgeLabels, initialized])

  // Update elements when they change (debounced)
  useEffect(() => {
    if (!cyRef.current || !initialized) return

    // Debounce updates (500ms)
    if (layoutTimeoutRef.current) {
      clearTimeout(layoutTimeoutRef.current)
    }

    layoutTimeoutRef.current = window.setTimeout(() => {
      if (!cyRef.current) return
      
      try {
        // Remember selected node
        const selectedId = selectedNodeId.current
        
        cyRef.current.elements().remove()
        if (elements.nodes.length > 0 || elements.edges.length > 0) {
          cyRef.current.add([...elements.nodes, ...elements.edges])
          
          // Restore selection
          if (selectedId) {
            const node = cyRef.current.getElementById(selectedId)
            if (node && node.nonempty()) {
              node.addClass('selected')
            }
          }
          
          // Apply layout
          cyRef.current.layout({ name: layout, animate: true, animationDuration: 500 }).run()
        }
      } catch (err) {
        console.error('Failed to update graph:', err)
      }
    }, 500)

    return () => {
      if (layoutTimeoutRef.current) {
        clearTimeout(layoutTimeoutRef.current)
      }
    }
  }, [elements, layout, initialized])

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

  // Follow Live mode: throttle auto-center to latest entity (max 1 every 2s)
  const lastCenterTime = useRef<number>(0)
  useEffect(() => {
    if (!followLive || !latestEntity || !cyRef.current || !initialized) return
    
    const node = cyRef.current.getElementById(latestEntity.id)
    if (!node || node.empty()) return
    
    const now = Date.now()
    if (now - lastCenterTime.current < 2000) {
      // Too soon, show toast instead
      showToast(`New event: ${latestEntity.type || latestEntity.id}`)
      return
    }
    
    lastCenterTime.current = now
    cyRef.current.elements().removeClass('selected')
    node.addClass('selected')
    cyRef.current.animate({ fit: { eles: node, padding: 50 }, duration: 250 })
  }, [followLive, latestEntity, initialized])

  return (
    <div 
      ref={containerRef} 
      className="rounded-lg bg-black/20"
      style={{ 
        width: '100%', 
        height: '100%', 
        minHeight: '300px',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
    />
  )
}
