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
      setTimeout(() => {
        if (cyRef.current && ref.current && ref.current.offsetWidth > 0 && ref.current.offsetHeight > 0) {
          cyRef.current.resize()
        }
      }, 100)
      return
    }
    
    // Wait for container to have dimensions before initializing
    let retries = 0
    const maxRetries = 20 // 20 * 50ms = 1 second max wait
    
    const initGraph = () => {
      if (!ref.current || cyRef.current) return
      
      // Check if container has dimensions
      if (ref.current.offsetWidth === 0 || ref.current.offsetHeight === 0) {
        retries++
        if (retries < maxRetries) {
          setTimeout(initGraph, 50)
        }
        return
      }
      
      // Container is ready, initialize
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
    
    // Start initialization
    setTimeout(initGraph, 100)
  }, [setSel])

  useEffect(() => {
    if (!cyRef.current || !ref.current) return
    
    // Don't update if container has no dimensions - wait for it
    if (ref.current.offsetWidth === 0 || ref.current.offsetHeight === 0) {
      // Retry after a short delay
      const timeoutId = setTimeout(() => {
        if (cyRef.current && ref.current && ref.current.offsetWidth > 0 && ref.current.offsetHeight > 0) {
          try {
            cyRef.current.elements().remove()
            cyRef.current.add([...elements.nodes, ...elements.edges])
            cyRef.current.resize()
            cyRef.current.layout({ name:'breadthfirst', animate:false, animationDuration:0 }).run()
          } catch (e) {
            console.error('Graph update error:', e)
          }
        }
      }, 150)
      return () => clearTimeout(timeoutId)
    }
    
    // Container has dimensions, update immediately
    try {
      cyRef.current.elements().remove()
      cyRef.current.add([...elements.nodes, ...elements.edges])
      cyRef.current.resize()
      cyRef.current.layout({ name:'breadthfirst', animate:false, animationDuration:0 }).run()
    } catch (e) {
      console.error('Graph update error:', e)
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
    const n = cyRef.current?.getElementById(id)
    if (n && n.nonempty()) {
      cyRef.current!.elements().removeClass('selected'); n.addClass('selected')
      cyRef.current!.animate({ fit: { eles: n, padding: 50 }, duration: 250 })
    }
  }), [])

  return <div ref={ref} className="w-full h-full rounded-lg bg-black/20" style={{ minHeight: '200px', position: 'relative' }} />
}
