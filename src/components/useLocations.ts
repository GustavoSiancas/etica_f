import { useEffect, useState } from 'react'
import { defaultLocations, expedientesService } from '../services/api'
import type { Option } from '../services/api'

// Ubicaciones permitidas; si el backend falla se usan las conocidas.
export default function useLocations() {
  const [locations, setLocations] = useState<Option[]>(defaultLocations)
  useEffect(() => {
    let current = true
    expedientesService.locations().then(rows => { if (current) setLocations(rows) }).catch(() => { /* Se usan las ubicaciones conocidas. */ })
    return () => { current = false }
  }, [])
  return locations
}
