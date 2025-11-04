import React, { useState, useMemo } from 'react'

interface TablePanelProps {
  data: any
  config?: {
    columns?: string[]
    pageSize?: number
  }
}

export const TablePanel: React.FC<TablePanelProps> = ({ data, config }) => {
  const [sortColumn, setSortColumn] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [filterText, setFilterText] = useState('')
  const [currentPage, setCurrentPage] = useState(1)

  const pageSize = config?.pageSize || 20

  // Extract rows from data
  const rows = useMemo(() => {
    if (!data) return []

    // If data is an array, use it directly
    if (Array.isArray(data)) {
      return data
    }

    // If data has entities/relationships arrays, use those
    if (Array.isArray(data.entities)) {
      return data.entities
    }
    if (Array.isArray(data.relationships)) {
      return data.relationships
    }

    // Try to find first array value
    const firstArray = Object.values(data).find(v => Array.isArray(v)) as any[]
    if (firstArray) {
      return firstArray
    }

    // Fallback: wrap data in array
    return [data]
  }, [data])

  // Infer columns from first row or use config
  const columns = useMemo(() => {
    if (config?.columns) {
      return config.columns
    }

    if (rows.length === 0) return []

    const firstRow = rows[0]
    const keys = Object.keys(firstRow).filter(key => {
      const val = firstRow[key]
      // Exclude huge nested objects
      return val !== null && val !== undefined && (typeof val !== 'object' || Array.isArray(val))
    })

    return keys
  }, [rows, config?.columns])

  // Filter and sort rows
  const processedRows = useMemo(() => {
    let filtered = rows

    // Apply text filter
    if (filterText) {
      const lower = filterText.toLowerCase()
      filtered = filtered.filter(row => {
        return Object.values(row).some(val => {
          const str = String(val).toLowerCase()
          return str.includes(lower)
        })
      })
    }

    // Apply sorting
    if (sortColumn) {
      filtered = [...filtered].sort((a, b) => {
        const aVal = a[sortColumn]
        const bVal = b[sortColumn]
        const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return sortDirection === 'asc' ? cmp : -cmp
      })
    }

    return filtered
  }, [rows, filterText, sortColumn, sortDirection])

  // Paginate
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return processedRows.slice(start, start + pageSize)
  }, [processedRows, currentPage, pageSize])

  const totalPages = Math.ceil(processedRows.length / pageSize)

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(col)
      setSortDirection('asc')
    }
    setCurrentPage(1)
  }

  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return '—'
    if (typeof val === 'object') {
      return JSON.stringify(val)
    }
    return String(val)
  }

  if (rows.length === 0) {
    return <div className="text-sm text-white/70 p-4">No data to display</div>
  }

  return (
    <div className="flex flex-col h-full">
      {/* Filter */}
      <div className="p-2 border-b border-white/10">
        <input
          type="text"
          placeholder="Filter rows..."
          value={filterText}
          onChange={(e) => {
            setFilterText(e.target.value)
            setCurrentPage(1)
          }}
          className="w-full bg-black/30 rounded px-2 py-1 text-white text-xs"
        />
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-black/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2 py-1 text-left border-b border-white/10 cursor-pointer hover:bg-white/10 text-white/80"
                  onClick={() => handleSort(col)}
                >
                  <div className="flex items-center gap-1">
                    {col}
                    {sortColumn === col && (
                      <span className="text-xs">{sortDirection === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, idx) => (
              <tr key={idx} className="border-b border-white/5 hover:bg-white/5">
                {columns.map((col) => (
                  <td key={col} className="px-2 py-1 text-white/80">
                    {formatValue(row[col])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between p-2 border-t border-white/10 text-xs text-white/70">
          <div>
            Showing {((currentPage - 1) * pageSize) + 1}-{Math.min(currentPage * pageSize, processedRows.length)} of {processedRows.length}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <span className="px-2 py-1">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
