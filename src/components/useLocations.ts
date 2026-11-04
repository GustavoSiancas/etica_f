import { useEffect, useState } from 'react'
import { defaultLocations, foldersService } from '../services/api'
import type { Option } from '../services/api'

// Se pide una sola vez por sesión: cambiar de carpeta no vuelve a consultarlo ni redibuja la ubicación.
let cached: Option[] | null = null
let pending: Promise<Option[]> | null = null

// Ubicaciones permitidas (catálogo de carpetas); si el backend falla se usan las conocidas.
export default function useLocations() {
  const [locations, setLocations] = useState<Option[]>(cached ?? defaultLocations)
  useEffect(() => {
    if (cached) return
    let current = true
    pending ??= foldersService.locations().then(rows => (cached = rows))
    pending
      .then(rows => {
        if (current) setLocations(rows)
      })
      .catch(() => {
        pending = null // Se usan las ubicaciones conocidas y se reintenta en otra pantalla.
      })
    return () => {
      current = false
    }
  }, [])
  return locations
}
