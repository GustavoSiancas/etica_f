import { useEffect, useState } from 'react'

const themes = [{ id: 'light', label: 'Claro' }, { id: 'dark', label: 'Oscuro' }, { id: 'normal', label: 'Normal' }] as const
const palettes = [{ color: '#2563eb', label: 'Azul' }, { color: '#9d345e', label: 'Rosa' }, { color: '#087f72', label: 'Verde' }, { color: '#7540c8', label: 'Violeta' }]
type Theme = typeof themes[number]['id']
function readPreferences(): { theme: Theme; color: string } {
  try {
    const saved = JSON.parse(localStorage.getItem('etica-appearance') || '{}')
    return { theme: themes.some(theme => theme.id === saved.theme) ? saved.theme : 'light', color: /^#[0-9a-f]{6}$/i.test(saved.color) ? saved.color : '#2563eb' }
  } catch { return { theme: 'light', color: '#2563eb' } }
}

export default function AppearancePicker() {
  const [preferences, setPreferences] = useState(readPreferences)
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = preferences.theme
    root.style.setProperty('--chosen-accent', preferences.color)
    try { localStorage.setItem('etica-appearance', JSON.stringify(preferences)) } catch { /* Appearance still works without storage. */ }
  }, [preferences])
  return <details className="appearance-picker">
    <summary>Apariencia <span aria-hidden="true">◐</span></summary>
    <div className="appearance-popover">
      <h2>Personaliza tu espacio</h2>
      <p>La apariencia se guarda en este navegador.</p>
      <fieldset><legend>Tema</legend><div className="theme-options">{themes.map(theme => <button type="button" key={theme.id} aria-pressed={preferences.theme === theme.id} onClick={() => setPreferences(current => ({ ...current, theme: theme.id }))}><span className={`theme-preview preview-${theme.id}`} aria-hidden="true"/>{theme.label}</button>)}</div></fieldset>
      <fieldset><legend>Paleta de colores</legend><div className="palette-options">{palettes.map(palette => <button type="button" key={palette.color} aria-label={palette.label} title={palette.label} aria-pressed={preferences.color === palette.color} style={{ backgroundColor: palette.color }} onClick={() => setPreferences(current => ({ ...current, color: palette.color }))}>{preferences.color === palette.color ? '✓' : ''}</button>)}</div></fieldset>
      <label className="custom-palette">Color personalizado<input type="color" aria-label="Color personalizado" value={preferences.color} onChange={event => setPreferences(current => ({ ...current, color: event.target.value }))}/></label>
    </div>
  </details>
}
