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
  const initAttempted = useRef(false)
  const setSel = useSelectionStore(s=>s.set)

  useEffect(() => {
    if (!ref.current) return
    
    // Only initialize once
    if (cyRef.current) {
      return
    }
    
    // Mark that we've attempted initialization
    if (initAttempted.current) {
      return
    }
    initAttempted.current = true
    
    const initGraph = () => {
      if (!ref.current || cyRef.current) return
      
      // Get container dimensions
      const rect = ref.current.getBoundingClientRect()
      const width = rect.width || ref.current.offsetWidth || 400
      const height = rect.height || ref.current.offsetHeight || 300
      
      // Ensure minimum dimensions
      if (width < 50 || height < 50) {
        // Retry after a delay
        setTimeout(initGraph, 100)
        return
      }
      
                    try {
         const cy = cytoscape({ 
           container: ref.current,
           elements: [],
           style: [
             { selector: 'node', style: { 'background-color':'#22d3ee', 'label':'data(label)', 'color':'#cbd5e1', 'font-size':12 } },
             { selector: 'edge', style: { 'line-color':'#64748b', 'target-arrow-color':'#64748b', 'target-arrow-shape':'triangle', 'curve-style':'bezier', 'label':'data(label)', 'font-size':10, 'text-rotation':'autorotate' } },
             { selector: '.selected', style: { 'border-width': 4, 'border-color':'#fff' } }
           ]
         })
         
         cyRef.current = cy
         
         cy.on('tap', 'node', (ev) => {
           const id = ev.target.id(); const type = ev.target.data('type')
           setSel({ id, type })
           if (cyRef.current) {
             cyRef.current.elements().removeClass('selected')
             ev.target.addClass('selected')
           }
         })
      } catch (e) {
        console.error('Failed to initialize graph:', e)
        initAttempted.current = false
      }
    }
    
    // Try immediate init, then retry if needed
    setTimeout(initGraph, 50)
    setTimeout(() => {
      if (!cyRef.current && ref.current) {
        initGraph()
      }
    }, 200)
  }, [setSel])

  useEffect(() => {
    if (!cyRef.current || !ref.current) return
    
    const updateElements = () => {
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
    }
    
    // Check dimensions
    const rect = ref.current.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) {
      updateElements()
    } else {
      // Wait for dimensions
      setTimeout(() => {
        if (cyRef.current && ref.current) {
          const newRect = ref.current.getBoundingClientRect()
          if (newRect.width > 0 && newRect.height > 0) {
            updateElements()
          }
        }
      }, 100)
    }
  }, [elements])
  
  // Handle container resize
  useEffect(() => {
    if (!cyRef.current || !ref.current) return
    
    let resizeTimeout: number
    const resizeObserver = new ResizeObserver(() => {
      if (cyRef.current && ref.current) {
        // Debounce resize operations
        clearTimeout(resizeTimeout)
        resizeTimeout = window.setTimeout(() => {
          if (cyRef.current && ref.current && ref.current.offsetWidth > 0 && ref.current.offsetHeight > 0) {
            try {
              cyRef.current.resize()
            } catch (e) {
              console.error('Graph resize error:', e)
            }
          }
        }, 100)
      }
    })
    resizeObserver.observe(ref.current)
    return () => {
      clearTimeout(resizeTimeout)
      resizeObserver.disconnect()
    }
  }, [])

  useEffect(() => onFocus(({ id }) => {
    if (!cyRef.current) return
    const n = cyRef.current.getElementById(id)
    if (n && n.nonempty()) {
      cyRef.current.elements().removeClass('selected'); n.addClass('selected')
      cyRef.current.animate({ fit: { eles: n, padding: 50 }, duration: 250 })
    }
  }), [])

  return <div ref={ref} className="w-full h-full rounded-lg bg-black/20" style={{ minHeight: 0, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
}
