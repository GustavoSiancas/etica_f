import { useEffect, useState } from 'react'
import { defaultLocations, foldersService } from '../services/api'
import type { Option } from '../services/api'

// Ubicaciones permitidas (catálogo de carpetas); si el backend falla se usan las conocidas.
export default function useLocations() {
  const [locations, setLocations] = useState<Option[]>(defaultLocations)
  useEffect(() => {
    let current = true
    foldersService.locations().then(rows => { if (current) setLocations(rows) }).catch(() => { /* Se usan las ubicaciones conocidas. */ })
    return () => { current = false }
  }, [])
  return locations
}
