import type { ReactNode } from 'react'
import { formatCaseNumber } from '../services/api'
import type { CaseFile } from '../services/api'

export default function CaseRow({ file, onOpen, children }: { file: CaseFile; onOpen: (file: CaseFile) => void; children: ReactNode }) {
  return <tr className="case-row" tabIndex={0} aria-label={`Ver expediente ${formatCaseNumber(file.number)}`} onClick={() => onOpen(file)} onKeyDown={event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(file) }
  }}>{children}</tr>
}
