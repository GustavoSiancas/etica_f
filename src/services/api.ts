export type Role = 'denunciantes' | 'denunciados'
export type DocumentType = 'DNI' | 'RUC' | 'CE'
export interface Person { id: number; name: string; document_type?: DocumentType; document_number?: string; registration_number?: number }
export interface PersonInput { name: string; document_type: DocumentType; document_number: string; registration_number?: number }
export interface PeoplePage { data: Person[]; total: number; limit: number; offset: number }
export interface PeopleFilters { q?: string; name?: string; document_type?: DocumentType | ''; document_number?: string; registration_number?: string }
export interface CaseFile { id: number; number: string; status?: string; location?: string; init_type: string; description?: string; created_at?: string; opening_date?: string }
export interface CaseFilesPage { data: CaseFile[]; total: number; limit: number; offset: number }
export type CaseStatus = 'ABIERTO' | 'CERRADO'
export interface CaseFilters { status?: CaseStatus | ''; location?: string; from?: string; to?: string }
export interface Option { value: string; label: string }
export const caseStatuses: Option[] = [{ value: 'ABIERTO', label: 'Abierto' }, { value: 'CERRADO', label: 'Cerrado' }]
const locationLabels: Record<string, string> = { 'DIRECCION DE ETICA': 'Dirección de Ética', 'CONSEJO DE ETICA': 'Consejo de Ética', 'TRIBUNAL DE HONOR': 'Tribunal de Honor' }
export const defaultLocations: Option[] = Object.entries(locationLabels).map(([value, label]) => ({ value, label }))
export const statusLabel = (value?: string) => caseStatuses.find(option => option.value === value)?.label || value || 'Sin estado'
export const locationLabel = (value?: string) => (value && locationLabels[value]) || value || 'Sin ubicación'
// Muestra el CAL con 6 dígitos: 21 → "000021".
export const formatCal = (value?: number | string | null) => value == null || value === '' ? '' : String(value).padStart(6, '0')
// Muestra el correlativo con 5 dígitos: "1-2026" → "00001-2026".
export const formatCaseNumber = (value?: string) => {
  const match = /^(\d+)-(\d+)$/.exec((value || '').trim())
  return match ? `${match[1].padStart(5, '0')}-${match[2]}` : value || ''
}
export interface ExpedienteSection {
  id: number
  expediente_id: number
  expediente_section_parent_id: number | null
  name: string
  type: string
  document_date?: string | null
  sort_order: number
  color_hex: string
  created_at?: string
  updated_at?: string
}
export interface SectionInput {
  name?: string
  type?: string
  document_date?: string | null
  sort_order?: number
  color_hex?: string
  expediente_section_parent_id?: number | null
}
export interface DocumentRecord { id: number; name: string; file_url?: string | null; created_at?: string; updated_at?: string }
export interface DocumentsPage { data: DocumentRecord[]; total: number; limit: number; offset: number }
export interface DocumentTypeOption { id: number; name: string; sort_order?: number }
export interface ExpedienteStatus { value: string; label: string }
export interface Association { id: number; is_active?: boolean }
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
// Share only concurrent GETs; completed responses are never cached.
const pendingGets = new Map<string, Promise<unknown>>()
function request<T>(path: string, body?: unknown, method?: string): Promise<T> {
  if (body !== undefined || (method && method !== 'GET')) return performRequest<T>(path, body, method)
  const pending = pendingGets.get(path)
  if (pending) return pending as Promise<T>
  const result = performRequest<T>(path, body, method).finally(() => { pendingGets.delete(path) })
  pendingGets.set(path, result)
  return result
}
async function performRequest<T>(path: string, body?: unknown, method?: string): Promise<T> {
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
// Consulta paginada de expedientes con filtros de estado, ubicación y rango de apertura.
async function casesPage(path: string, limit: number, offset: number, filters: CaseFilters): Promise<CaseFilesPage> {
  const from = filters.from?.trim(), to = filters.to?.trim()
  for (const date of [from, to]) if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Las fechas deben tener formato YYYY-MM-DD.')
  if (from && to && from > to) throw new Error('La fecha "desde" no puede ser posterior a la fecha "hasta".')
  const query = new URLSearchParams()
  if (filters.status) query.set('status', filters.status)
  if (filters.location?.trim()) query.set('location', filters.location.trim())
  if (from) query.set('from', from)
  if (to) query.set('to', to)
  const result = await request<unknown>(`${path}?${query.toString() ? query + '&' : ''}${pagination(limit, offset)}`)
  // Compatibilidad: si el backend devuelve un array plano, se arma la página localmente.
  if (Array.isArray(result)) return { data: result as CaseFile[], total: offset + result.length, limit, offset }
  const page = result as Partial<CaseFilesPage>
  if (!page || !Array.isArray(page.data) || typeof page.total !== 'number') throw new Error('El formato del listado de expedientes no es válido.')
  return { data: page.data, total: page.total, limit: page.limit ?? limit, offset: page.offset ?? offset }
}

export const expedientesService = {
  page(limit = 20, offset = 0, filters: CaseFilters = {}) { return casesPage('/expedientes', limit, offset, filters) },
  // Expedientes de un participante. Usa el ID interno del rol, nunca DNI, RUC, CE ni CAL.
  async byParticipant(role: Role, participantId: number, limit = 20, offset = 0, filters: CaseFilters = {}) {
    if (!Number.isSafeInteger(participantId) || participantId < 1) throw new Error('El participante no es válido.')
    try { return await casesPage(`/${role}/${participantId}/expedientes`, limit, offset, filters) }
    catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new ApiError(`No existe este ${role === 'denunciantes' ? 'denunciante' : 'denunciado'}.`, 404)
      throw error
    }
  },
  async list(limit = 20, offset = 0, filters: CaseFilters = {}) { return (await expedientesService.page(limit, offset, filters)).data },
  async locations(): Promise<Option[]> {
    const rows = list<unknown>(await request('/expediente-locations'), 'locations')
    const options = rows.map(row => {
      if (typeof row === 'string') return { value: row, label: locationLabel(row) }
      const item = (row || {}) as Record<string, unknown>
      const value = String(item.value ?? item.code ?? item.name ?? item.location ?? '').trim()
      return { value, label: locationLabels[value] || String(item.label ?? '').trim() || value }
    }).filter(option => option.value)
    return options.length ? options : defaultLocations
  },
  async updateLocation(id: number, location: string) {
    const value = location.trim()
    if (!value) throw new Error('Selecciona una ubicación.')
    return request<CaseFile>(`/expedientes/${id}/location`, { location: value }, 'PATCH')
  },
  create(input: { opening_date: string; init_type: InitiationType; description?: string; denunciante_ids: number[]; denunciado_ids: number[] }) {
    const date = new Date(input.opening_date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.opening_date) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input.opening_date) throw new Error('Ingresa una fecha de apertura v\u00e1lida (YYYY-MM-DD).')
    if (!Object.hasOwn(initiationTypes, input.init_type)) throw new Error('Selecciona un tipo de inicio permitido.')
    for (const ids of [input.denunciante_ids, input.denunciado_ids]) {
      if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error('Los participantes deben tener IDs enteros positivos.')
      if (new Set(ids).size !== ids.length) throw new Error('No se permiten participantes repetidos en una misma lista.')
    }
    return request<CaseFile>('/expedientes', {
      opening_date: input.opening_date,
      init_type: input.init_type,
      denunciante_ids: input.denunciante_ids,
      denunciado_ids: input.denunciado_ids,
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    })
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
  async page(role: Role, limit = 20, offset = 0, filters: PeopleFilters = {}): Promise<PeoplePage> {
    const query = new URLSearchParams(pagination(limit, offset))
    for (const key of ['q', 'name', 'document_type', 'document_number', ...(role === 'denunciados' ? ['registration_number'] : [])] as (keyof PeopleFilters)[]) {
      let value = filters[key]?.trim()
      // El CAL se puede escribir con ceros a la izquierda (000021); el backend espera el entero.
      if (value && key === 'registration_number') value = value.replace(/^0+(?=\d)/, '')
      if (value) query.set(key, value)
    }
    const result = await request<PeoplePage>(`/${role}?${query}`)
    if (!Array.isArray(result.data) || !Number.isInteger(result.total) || result.total < 0) throw new Error('El formato del listado de personas no es válido.')
    return result
  },
  async list(role: Role, limit = 20, offset = 0) { return (await personasService.page(role, limit, offset)).data },
  async all(role: Role) {
    const people: Person[] = []
    let offset = 0
    while (true) {
      const page = await personasService.page(role, 100, offset)
      people.push(...page.data)
      offset += page.data.length
      if (offset >= page.total) return people
      if (!page.data.length) throw new Error('El listado de personas está incompleto. Vuelve a intentarlo.')
    }
  },
  async create(role: Role, input: PersonInput) {
    const name = input.name.trim()
    if (!name || name.length > 255) throw new Error('El nombre es obligatorio y admite hasta 255 caracteres.')
    if (!(role === 'denunciantes' ? ['DNI', 'RUC', 'CE'] : ['DNI', 'CE']).includes(input.document_type)) throw new Error('Tipo de documento no permitido.')
    if (!/^\d{1,20}$/.test(input.document_number)) throw new Error('El número de documento debe contener entre 1 y 20 dígitos.')
    if (role === 'denunciados' && (!Number.isSafeInteger(input.registration_number) || input.registration_number! <= 0)) throw new Error('La colegiatura debe ser un entero positivo.')
    try {
      return await request<Person>(`/${role}`, { name, document_type: input.document_type, document_number: input.document_number, ...(role === 'denunciados' ? { registration_number: input.registration_number } : {}) })
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw new ApiError('La carga inicial está deshabilitada. Habilita ENABLE_INITIAL_PARTICIPANT_LOAD=true en el backend y reinicia la aplicación.', 404)
      throw error
    }
  },
}
export interface UploadSignature { upload_url: string; file_url: string; method: 'PUT'; headers: Record<string, string>; expires_in: number; max_size_bytes: number }

// ---------- Secciones del expediente ----------
const isoDate = /^\d{4}-\d{2}-\d{2}$/
const hexColor = /^#[0-9a-f]{6}$/i
function positiveId(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} no es válido.`)
  return value
}
function cleanSection(input: SectionInput, creating: boolean) {
  const body: SectionInput = {}
  if (input.name !== undefined || creating) {
    const name = (input.name || '').trim()
    if (!name || name.length > 255) throw new Error('El nombre es obligatorio y admite hasta 255 caracteres.')
    body.name = name
  }
  if (input.type !== undefined || creating) {
    const type = (input.type || '').trim()
    if (!type || type.length > 255) throw new Error('El tipo es obligatorio y admite hasta 255 caracteres.')
    body.type = type
  }
  if (input.document_date !== undefined) {
    if (input.document_date !== null && input.document_date !== '' && !isoDate.test(input.document_date)) throw new Error('La fecha debe tener formato YYYY-MM-DD.')
    if (input.document_date || !creating) body.document_date = input.document_date || null
  }
  if (input.sort_order !== undefined) {
    if (!Number.isSafeInteger(input.sort_order) || input.sort_order < 0) throw new Error('El orden debe ser un entero desde 0.')
    body.sort_order = input.sort_order
  }
  if (input.color_hex !== undefined) {
    if (!hexColor.test(input.color_hex)) throw new Error('El color debe tener formato #RRGGBB.')
    body.color_hex = input.color_hex.toUpperCase()
  }
  if (input.expediente_section_parent_id !== undefined) {
    if (input.expediente_section_parent_id !== null) positiveId(input.expediente_section_parent_id, 'La sección padre')
    if (input.expediente_section_parent_id !== null || !creating) body.expediente_section_parent_id = input.expediente_section_parent_id
  }
  return body
}
function cleanDocument(input: { name?: string; file_url?: string | null }, creating: boolean) {
  const body: { name?: string; file_url?: string | null } = {}
  if (input.name !== undefined || creating) {
    const name = (input.name || '').trim()
    if (!name || name.length > 255) throw new Error('El nombre del documento es obligatorio y admite hasta 255 caracteres.')
    body.name = name
  }
  if (input.file_url !== undefined) {
    if (input.file_url !== null && input.file_url !== '' && (!input.file_url.startsWith('https://') || !URL.canParse(input.file_url))) throw new Error('El enlace debe ser una URL HTTPS válida.')
    if (input.file_url || !creating) body.file_url = input.file_url || null
  }
  return body
}

export const sectionsService = {
  async list(expedienteId: number) { return list<ExpedienteSection>(await request(`/expedientes/${positiveId(expedienteId, 'El expediente')}/sections`), 'sections') },
  get(expedienteId: number, sectionId: number) { return request<ExpedienteSection>(`/expedientes/${expedienteId}/sections/${sectionId}`) },
  create(expedienteId: number, input: SectionInput) { return request<ExpedienteSection>(`/expedientes/${expedienteId}/sections`, cleanSection(input, true)) },
  update(expedienteId: number, sectionId: number, input: SectionInput) {
    const body = cleanSection(input, false)
    if (!Object.keys(body).length) throw new Error('No hay cambios para guardar.')
    return request<ExpedienteSection>(`/expedientes/${expedienteId}/sections/${sectionId}`, body, 'PATCH')
  },
  async remove(expedienteId: number, sectionId: number) {
    try { await request<void>(`/expedientes/${expedienteId}/sections/${sectionId}`, undefined, 'DELETE') }
    catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new ApiError('No se puede eliminar: primero mueve o elimina sus subsecciones.', 409)
      throw error
    }
  },
  async documents(expedienteId: number, sectionId: number) { return list<DocumentRecord>(await request(`/expedientes/${expedienteId}/sections/${sectionId}/documents`), 'documents') },
  createDocument(expedienteId: number, sectionId: number, input: { name: string; file_url?: string | null }) {
    return request<DocumentRecord>(`/expedientes/${expedienteId}/sections/${sectionId}/documents`, cleanDocument(input, true))
  },
  link(expedienteId: number, sectionId: number, documentId: number) { return request<void>(`/expedientes/${expedienteId}/sections/${sectionId}/documents/${positiveId(documentId, 'El documento')}`, undefined, 'POST') },
  unlink(expedienteId: number, sectionId: number, documentId: number) { return request<void>(`/expedientes/${expedienteId}/sections/${sectionId}/documents/${documentId}`, undefined, 'DELETE') },
}

// ---------- Documentos ----------
const uploadTypes: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
}
export const acceptedUploads = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif'
export const maxUploadBytes = 10 * 1024 * 1024
function contentTypeOf(file: File) {
  const allowed = new Set(Object.values(uploadTypes))
  if (allowed.has(file.type)) return file.type
  // Algunos navegadores no informan el tipo de .doc/.docx: se deduce por la extensión.
  const byExtension = uploadTypes[file.name.split('.').pop()?.toLowerCase() || '']
  if (byExtension) return byExtension
  throw new Error('Formato no admitido. Usa PDF, DOC, DOCX, PNG, JPEG, WebP o GIF.')
}

export const documentsService = {
  async page(limit = 20, offset = 0): Promise<DocumentsPage> {
    const result = await request<DocumentsPage>(`/documents?${pagination(limit, offset)}`)
    if (!result || !Array.isArray(result.data) || typeof result.total !== 'number') throw new Error('El formato de la lista de documentos no es válido.')
    return result
  },
  get(id: number) { return request<DocumentRecord>(`/documents/${id}`) },
  create(input: { name: string; file_url?: string | null }) { return request<DocumentRecord>('/documents', cleanDocument(input, true)) },
  update(id: number, input: { name?: string; file_url?: string | null }) {
    const body = cleanDocument(input, false)
    if (!Object.keys(body).length) throw new Error('No hay cambios para guardar.')
    return request<DocumentRecord>(`/documents/${id}`, body, 'PATCH')
  },
  async remove(id: number) {
    try { await request<void>(`/documents/${id}`, undefined, 'DELETE') }
    catch (error) {
      if (error instanceof ApiError && error.status === 409) throw new ApiError('El documento sigue vinculado a alguna sección.', 409)
      throw error
    }
  },
  async byExpediente(expedienteId: number) { return list<DocumentRecord>(await request(`/expedientes/${expedienteId}/documents`), 'documents') },
  async types(): Promise<DocumentTypeOption[]> {
    const rows = list<Record<string, unknown>>(await request('/document-types'), 'document_types')
    return rows
      .filter(row => row.is_active !== false)
      .map(row => ({ id: Number(row.id), name: String(row.name ?? row.label ?? row.value ?? '').trim(), sort_order: Number(row.sort_order ?? 0) }))
      .filter(row => row.name)
  },
  async uploadFile(id: number, file: File): Promise<DocumentRecord> {
    const contentType = contentTypeOf(file)
    if (file.size > maxUploadBytes) throw new Error('El archivo supera el máximo permitido de 10 MiB.')
    const signature = await request<UploadSignature>(`/documents/${id}/upload-url`, { content_type: contentType })
    if (file.size > signature.max_size_bytes) throw new Error('El archivo supera el máximo permitido de 10 MiB.')
    if (signature.method !== 'PUT') throw new Error('El servidor devolvió un método de carga no compatible.')
    const expiresAt = Date.now() + signature.expires_in * 1000
    let upload: Response
    try { upload = await fetch(signature.upload_url, { method: signature.method, headers: signature.headers, body: file }) }
    catch { throw new Error('No se pudo subir el archivo a R2. Revisa la conexión y los permisos CORS del bucket.') }
    if (!upload.ok) throw new Error(`R2 rechazó la carga (${upload.status}).`)
    if (Date.now() >= expiresAt) throw new Error('La carga tardó más de lo permitido por la firma. Vuelve a intentarlo.')
    return request<DocumentRecord>(`/documents/${id}/file-url`, { file_url: signature.file_url }, 'PATCH')
  },
}
