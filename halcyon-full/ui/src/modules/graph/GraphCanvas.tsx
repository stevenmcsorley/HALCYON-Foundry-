import React, { useEffect, useRef } from 'react'
// @ts-ignore - cytoscape doesn't have proper default export types
import cytoscape from 'cytoscape'
import type { Core } from 'cytoscape'
import { onFocus } from '@/store/bus'
import { useSelectionStore } from '@/store/selectionStore'

type Elem = { nodes:any[]; edges:any[] }

export default function GraphCanvas({ elements }:{ elements:Elem }) {
  const ref = useRef<HTMLDivElement|null>(null)
  const cyRef = useRef<Core|null>(null)
  const setSel = useSelectionStore(s=>s.set)

  // Initialize graph once
  useEffect(() => {
    if (!ref.current || cyRef.current) return
    
    const init = () => {
      if (!ref.current || cyRef.current) return
      
      // Force minimum dimensions
      const container = ref.current
      if (!container.parentElement) return
      
      const parentRect = container.parentElement.getBoundingClientRect()
      if (parentRect.width < 100 || parentRect.height < 100) {
        setTimeout(init, 100)
        return
      }
      
      try {
        const cy = cytoscape({ 
          container: container,
          elements: [],
          style: [
            { selector: 'node', style: { 'background-color':'#22d3ee', 'label':'data(label)', 'color':'#cbd5e1', 'font-size':12 } },
            { selector: 'edge', style: { 'line-color':'#64748b', 'target-arrow-color':'#64748b', 'target-arrow-shape':'triangle', 'curve-style':'bezier', 'label':'data(label)', 'font-size':10, 'text-rotation':'autorotate' } },
            { selector: '.selected', style: { 'border-width': 4, 'border-color':'#fff' } }
          ]
        })
        
        cyRef.current = cy
        
        cy.on('tap', 'node', (evt: any) => {
          const id = evt.target.id()
          const type = evt.target.data('type')
          setSel({ id, type })
          cy.elements().removeClass('selected')
          evt.target.addClass('selected')
        })
      } catch (e) {
        console.error('Graph init error:', e)
      }
    }
    
    // Try immediately, then retry
    setTimeout(init, 0)
    setTimeout(init, 100)
    setTimeout(init, 500)
  }, [setSel])

  // Update elements when data changes
  useEffect(() => {
    if (!cyRef.current) return
    
    try {
      cyRef.current.elements().remove()
      if (elements.nodes.length > 0 || elements.edges.length > 0) {
        cyRef.current.add([...elements.nodes, ...elements.edges])
        cyRef.current.resize()
        cyRef.current.layout({ name:'breadthfirst', animate:false, animationDuration:0 }).run()
      }
    } catch (e) {
      console.error('Graph update error:', e)
    }
  }, [elements])

  // Handle resize
  useEffect(() => {
    if (!cyRef.current || !ref.current) return
    
    const resizeObserver = new ResizeObserver(() => {
      if (cyRef.current) {
        try {
          cyRef.current.resize()
        } catch (e) {
          console.error('Graph resize error:', e)
        }
      }
    })
    
    resizeObserver.observe(ref.current)
    return () => resizeObserver.disconnect()
  }, [])

  // Handle focus
  useEffect(() => {
    const unsubscribe = onFocus(({ id }) => {
      if (!cyRef.current) return
      const n = cyRef.current.getElementById(id)
      if (n && n.nonempty()) {
        cyRef.current.elements().removeClass('selected')
        n.addClass('selected')
        cyRef.current.animate({ fit: { eles: n, padding: 50 }, duration: 250 })
      }
    })
    return unsubscribe
  }, [])

  return <div ref={ref} className="w-full h-full rounded-lg bg-black/20" />
}