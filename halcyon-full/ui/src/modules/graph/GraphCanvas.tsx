import React, { useEffect, useRef } from 'react'
import cytoscape, { Core } from 'cytoscape'
import { onFocus } from '@/store/bus'
import { useSelectionStore } from '@/store/selectionStore'

type Elem = { nodes:any[]; edges:any[] }

export default function GraphCanvas({ elements }:{ elements:Elem }) {
  const ref = useRef<HTMLDivElement|null>(null)
  const cyRef = useRef<Core|null>(null)
  const setSel = useSelectionStore(s=>s.set)

  useEffect(() => {
    if (!ref.current) return
    
    if (cyRef.current) {
      // Graph already exists, just resize it
      setTimeout(() => cyRef.current?.resize(), 100)
      return
    }
    
    // Wait a bit for container to have dimensions
    const initGraph = () => {
      if (!ref.current || cyRef.current) return
      
      // Check if container has dimensions
      if (ref.current.offsetWidth === 0 || ref.current.offsetHeight === 0) {
        setTimeout(initGraph, 50)
        return
      }
      
      cyRef.current = cytoscape({ 
        container: ref.current,
        elements: [],
        style: [
          { selector: 'node', style: { 'background-color':'#22d3ee', 'label':'data(label)', 'color':'#cbd5e1', 'font-size':12 } },
          { selector: 'edge', style: { 'line-color':'#64748b', 'target-arrow-color':'#64748b', 'target-arrow-shape':'triangle', 'curve-style':'bezier', 'label':'data(label)', 'font-size':10, 'text-rotation':'autorotate' } },
          { selector: '.selected', style: { 'border-width': 4, 'border-color':'#fff' } }
        ]
      })
      cyRef.current.on('tap', 'node', (ev) => {
        const id = ev.target.id(); const type = ev.target.data('type')
        setSel({ id, type })
        if (cyRef.current) {
          cyRef.current.elements().removeClass('selected')
          ev.target.addClass('selected')
        }
      })
    }
    
    // Try immediate init, fallback to timeout
    setTimeout(initGraph, 50)
  }, [setSel])

  useEffect(() => {
    if (!cyRef.current || !ref.current) return
    // Ensure container has dimensions before updating
    if (ref.current.offsetWidth === 0 || ref.current.offsetHeight === 0) {
      // Retry after a short delay if container isn't ready
      setTimeout(() => {
        if (cyRef.current && ref.current && ref.current.offsetWidth > 0 && ref.current.offsetHeight > 0) {
          cyRef.current.elements().remove()
          cyRef.current.add([...elements.nodes, ...elements.edges])
          cyRef.current.resize()
          cyRef.current.layout({ name:'breadthfirst', animate:true, animationDuration:300 }).run()
        }
      }, 100)
      return
    }
    
    cyRef.current.elements().remove()
    cyRef.current.add([...elements.nodes, ...elements.edges])
    // Resize before running layout to ensure proper dimensions
    cyRef.current.resize()
    cyRef.current.layout({ name:'breadthfirst', animate:true, animationDuration:300 }).run()
  }, [elements])
  
  // Handle container resize
  useEffect(() => {
    if (!cyRef.current || !ref.current) return
    const resizeObserver = new ResizeObserver(() => {
      if (cyRef.current && ref.current) {
        // Only resize if container has dimensions
        if (ref.current.offsetWidth > 0 && ref.current.offsetHeight > 0) {
          cyRef.current.resize()
          // Re-run layout if elements exist
          if (cyRef.current.elements().length > 0) {
            cyRef.current.layout({ name:'breadthfirst', animate:false }).run()
          }
        }
      }
    })
    resizeObserver.observe(ref.current)
    return () => resizeObserver.disconnect()
  }, [])

  useEffect(() => onFocus(({ id }) => {
    const n = cyRef.current?.getElementById(id)
    if (n && n.nonempty()) {
      cyRef.current!.elements().removeClass('selected'); n.addClass('selected')
      cyRef.current!.animate({ fit: { eles: n, padding: 50 }, duration: 250 })
    }
  }), [])

  return <div ref={ref} className="w-full h-full rounded-lg bg-black/20" style={{ minHeight: 0, position: 'relative' }} />
}
