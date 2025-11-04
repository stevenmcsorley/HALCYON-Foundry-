import React from 'react'
import { useSelectionStore } from '@/store/selectionStore'
import { focus } from '@/store/bus'
import { gql } from '@/services/api'

export default function EntityInspector() {
  const { id, type, clear } = useSelectionStore()
  const [data, setData] = React.useState<any>(null)

  React.useEffect(() => {
    if (!id) return setData(null)

    gql<{ entityById: any }>(`query($id:ID!){ entityById(id:$id){ id type attrs } }`, { id })
      .then(d => setData(d.entityById)).catch(()=>setData(null))
  }, [id])

  if (!id) return null

  return (
    <aside className="fixed right-0 top-0 h-full w-[380px] bg-panel/95 border-l border-white/10 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">{type} • {id}</h3>
        <button className="text-sm opacity-70 hover:opacity-100" onClick={clear}>Close</button>
      </div>
      <pre className="text-xs opacity-80 overflow-auto max-h-[70vh]">{JSON.stringify(data?.attrs ?? {}, null, 2)}</pre>
      <div className="mt-3 flex gap-2">
        <button className="px-2 py-1 rounded bg-white/10" onClick={()=>focus({id, type: type!})}>
          Focus on Map/Graph
        </button>
      </div>
    </aside>
  )
}
