export type Role = 'denunciantes' | 'denunciados'
export interface Person { id: number; name: string }
export interface CaseFile { id: number; code?: string; status?: string; init_type: string; name?: string; created_at?: string; opening_date?: string }
export interface DocumentStageSummary { id?: number; name?: string; sort_order?: number }
export interface CaseDocument { id: number; title: string; status?: string; document_date?: string; file_url?: string; stage?: DocumentStageSummary; substage?: { id?: number; name?: string; sort_order?: number; stage?: DocumentStageSummary }; denunciantes?: Person[]; denunciados?: Person[] }
export interface DocumentSubstage { id: number; name: string; sort_order?: number; is_active?: boolean }
export interface DocumentStage { id: number; name: string; sort_order?: number; is_active?: boolean; substages: DocumentSubstage[] }
export interface ExpedienteStatus { value: string; label: string }
export interface Association { id: number; is_active: boolean }
export interface ActiveParticipant extends Association { expediente_id: number; participant: Person }
export const initiationTypes = {
  DENUNCIA_DE_OFICIO: 'Denuncia de oficio',
  DENUNCIA_DE_PARTE: 'Denuncia de parte',
  COMUNICACIONES_DE_ENTIDADES_PUBLICAS: 'Comunicación de entidad pública',
  COMUNICACIONES_DE_SANCION_IMPUESTA_POR_PJ_O_MP: 'Sanción impuesta por PJ o MP',
  APROBADO_POR_ASAMBLEA_GENERAL: 'Aprobado por Asamblea General',
}
export type InitiationType = keyof typeof initiationTypes
const baseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}
async function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  if (!baseUrl) throw new ApiError('Configura VITE_API_BASE_URL en .env.local con la URL base del backend.', 0)
  let response: Response
  try {
    response = await fetch(`${baseUrl}${path}`, { method: method || (body === undefined ? 'GET' : 'POST'), headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  } catch { throw new ApiError('No se pudo conectar con el servidor. Comprueba que el backend esté disponible.', 0) }
  if (response.status === 204 && response.ok) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String(data.error) : `Error del servidor (${response.status})`
    throw new ApiError(message, response.status)
  }
  if (data === null) throw new ApiError('El servidor devolvió una respuesta vacía o inválida.', response.status)
  return data as T
}
function list<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[]
  if (data && typeof data === 'object') {
    const value = data as Record<string, unknown>
    for (const field of [key, 'items', 'data', 'results']) if (Array.isArray(value[field])) return value[field] as T[]
  }
  throw new Error('El formato del listado recibido no es válido.')
}
function pagination(limit: number, offset: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0) throw new Error('Paginación inválida.')
  return `limit=${limit}&offset=${offset}`
}
export const expedientesService = {
  async list(limit = 20, offset = 0) { return list<CaseFile>(await request(`/expedientes?${pagination(limit, offset)}`), 'expedientes') },
  create(input: { name: string; opening_date: string; init_type: InitiationType }) {
    const name = input.name.trim()
    if (!name || name.length > 255) throw new Error('El nombre es obligatorio y admite hasta 255 caracteres.')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.opening_date) || Number.isNaN(Date.parse(input.opening_date))) throw new Error('Ingresa una fecha de apertura válida (YYYY-MM-DD).')
    return request<CaseFile>('/expedientes', { name, opening_date: input.opening_date, init_type: input.init_type })
  },
  async documents(id: number) { return list<CaseDocument>(await request(`/expedientes/${id}/documents`), 'documents') },
  async documentStages() {
    const rows = list<Record<string, unknown>>(await request('/document-stages'), 'stages')
    return rows.map(stage => {
      const nested = stage.substages ?? stage.sub_stages ?? stage.subStages
      return { ...stage, substages: Array.isArray(nested) ? nested : [] } as unknown as DocumentStage
    })
  },
  createDocument(id: number, input: { title: string; substage_id: number; document_date?: string; file_url?: string }) {
    const title = input.title.trim()
    if (!title || title.length > 255) throw new Error('El título es obligatorio y admite hasta 255 caracteres.')
    if (!Number.isInteger(input.substage_id) || input.substage_id < 1) throw new Error('Selecciona una subetapa válida.')
    if (input.file_url && (!input.file_url.startsWith('https://') || !URL.canParse(input.file_url))) throw new Error('El archivo debe tener una URL HTTPS válida.')
    return request<CaseDocument>(`/expedientes/${id}/documents`, { ...input, title })
  },
  async uploadDocumentFile(id: number, file: File): Promise<CaseDocument> {
    const contentTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    if (!contentTypes.has(file.type)) throw new Error('Formato no admitido. Usa PNG, JPEG, WebP o GIF.')
    const signature = await request<UploadSignature>(`/documents/${id}/upload-url`, { content_type: file.type })
    if (file.size > signature.max_size_bytes) throw new Error('El archivo supera el máximo permitido de 10 MiB.')
    if (signature.method !== 'PUT') throw new Error('El servidor devolvió un método de carga no compatible.')
    const expiresAt = Date.now() + signature.expires_in * 1000
    if (Date.now() >= expiresAt) throw new Error('La URL temporal venció. Solicita una nueva.')
    let upload: Response
    try { upload = await fetch(signature.upload_url, { method: signature.method, headers: signature.headers, body: file }) }
    catch { throw new Error('No se pudo subir el archivo a R2. Revisa la conexión y los permisos CORS del bucket.') }
    if (!upload.ok) throw new Error(`R2 rechazó la carga (${upload.status}).`)
    if (Date.now() >= expiresAt) throw new Error('La carga tardó más de lo permitido por la firma.')
    return request<CaseDocument>(`/documents/${id}/file-url`, { file_url: signature.file_url }, 'PATCH')
  },
  async statusOptions() { return list<ExpedienteStatus>(await request('/expediente-statuses'), 'statuses') },
  updateStatus(id: number, status: string) {
    const value = status.trim()
    if (!value || value.length > 30) throw new Error('El estado es obligatorio y admite hasta 30 caracteres.')
    return request<CaseFile>(`/expedientes/${id}/status`, { status: value }, 'PATCH')
  },
  async participants(id: number, role: Role) { return list<ActiveParticipant>(await request(`/expedientes/${id}/${role}`), role) },
  associate(id: number, role: Role, personId: number) { return request<Association>(`/expedientes/${id}/${role}`, { [role === 'denunciantes' ? 'denunciante_id' : 'denunciado_id']: personId }) },
  remove(id: number, role: Role, personId: number) { return request<void>(`/expedientes/${id}/${role}/${personId}`, undefined, 'DELETE') },
  getInitiationTypes() { return request<unknown>('/tipos-inicio') },
}
export const personasService = {
  async list(role: Role, limit = 20, offset = 0) { return list<Person>(await request(`/${role}?${pagination(limit, offset)}`), role) },
  create(role: Role, name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 255) throw new Error('El nombre es obligatorio y admite hasta 255 caracteres.')
    return request<Person>(`/${role}`, { name: trimmed })
  },
}
export type EscritoStatus = 'NUEVA' | 'ATENDIDA'
export interface Escrito { id: number; title: string; type: string; expediente_number: string; denunciante_ids?: number[]; denunciado_ids?: number[]; document_date?: string | null; file_url?: string | null; status: EscritoStatus; created_at?: string }
export interface EscritosPage { data: Escrito[]; total: number; limit: number; offset: number }
export interface UploadSignature { upload_url: string; file_url: string; method: 'PUT'; headers: Record<string, string>; expires_in: number; max_size_bytes: number }
export const escritosService = {
  async list(limit = 20, offset = 0, status?: EscritoStatus): Promise<EscritosPage> {
    const query = status ? `status=${status}&${pagination(limit, offset)}` : pagination(limit, offset)
    const result = await request<EscritosPage>(`/escritos?${query}`)
    if (!result || !Array.isArray(result.data) || typeof result.total !== 'number') throw new Error('El formato de la lista de escritos no es válido.')
    return result
  },
  create(input: { title: string; type: string; expediente_number: string; document_date?: string; denunciante_ids: number[]; denunciado_ids: number[] }) {
    const title = input.title.trim(), type = input.type.trim(), expediente_number = input.expediente_number.trim()
    if (!title || !type || !expediente_number) throw new Error('Título, tipo y número de expediente son obligatorios.')
    return request<Escrito>('/escritos', { title, type, expediente_number, denunciante_ids: input.denunciante_ids, denunciado_ids: input.denunciado_ids, ...(input.document_date ? { document_date: input.document_date } : {}) })
  },
  setStatus(id: number, status: 'ATENDIDA') { return request<Escrito>(`/escritos/${id}/status`, { status }, 'PATCH') },
  async uploadFile(id: number, file: File): Promise<Escrito> {
    const allowed = new Set(['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'])
    if (!allowed.has(file.type)) throw new Error('Formato no admitido. Usa PDF, DOC, DOCX, PNG, JPEG, WebP o GIF.')
    const signature = await request<UploadSignature>(`/escritos/${id}/upload-url`, { content_type: file.type })
    if (file.size > signature.max_size_bytes) throw new Error('El archivo supera el máximo de 10 MiB.')
    if (signature.method !== 'PUT') throw new Error('El backend devolvió un método de carga no compatible.')
    const expiresAt = Date.now() + signature.expires_in * 1000
    if (Date.now() >= expiresAt) throw new Error('La URL temporal venció. Solicita una nueva.')
    let upload: Response
    try { upload = await fetch(signature.upload_url, { method: signature.method, headers: signature.headers, body: file }) }
    catch { throw new Error('No se pudo subir el archivo a R2. Revisa la conexión y los permisos CORS del bucket.') }
    if (!upload.ok) throw new Error(`R2 rechazó la carga (${upload.status}).`)
    if (Date.now() >= expiresAt) throw new Error('La carga tardó más de lo permitido por la firma. Solicita una nueva.')
    return request<Escrito>(`/escritos/${id}/file-url`, { file_url: signature.file_url }, 'PATCH')
  },
}
