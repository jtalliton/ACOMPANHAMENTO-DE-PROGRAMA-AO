import * as XLSX from 'xlsx'

export interface ParsedOS {
  numero_os: string
  disciplina: string
  area: string
  descricao: string
  sub_operacao: string
  matricula_tecnico: string
  tecnico_nome: string
  data_programada: string
  dia_semana: string
  tempo_estimado: number
  tipo_semana: 'VIGENTE' | 'PASSADA' | 'PROXIMA'
  status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROGRAMADA'
  comentarios: string
}

const MAPA_CRAFT: Record<string, string> = {
  MECPRM: 'MECANICA',
  AEIPRM: 'ELETRICA_AUTOMACAO',
  TERCFIX: 'TERCEIROS',
}

const DIAS_CHAVE = [
  { chave: 'su', dia: 'DOM', offset: 0 },
  { chave: 'mo', dia: 'SEG', offset: 1 },
  { chave: 'tu', dia: 'TER', offset: 2 },
  { chave: 'we', dia: 'QUA', offset: 3 },
  { chave: 'th', dia: 'QUI', offset: 4 },
  { chave: 'fr', dia: 'SEX', offset: 5 },
  { chave: 'sa', dia: 'SAB', offset: 6 },
]

export function processarExcel(binaryData: any): ParsedOS[] {
  const wb = XLSX.read(binaryData, { type: 'binary' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  if (!rows || rows.length === 0) return []

  // Localizar linha de cabeçalho
  let headerIndex = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowStr = rows[i].join(' ').toLowerCase()
    if (rowStr.includes('wo') || rowStr.includes('assigned') || rowStr.includes('craft')) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) headerIndex = 0
  const headers = rows[headerIndex].map(h => String(h || '').trim().toLowerCase())

  // Mapear índices de colunas
  const colIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)))

  const idxWO = colIndex(['wo #', 'wo', 'os', 'numero'])
  const idxDesc = colIndex(['wo description', 'description', 'descriç'])
  const idxOpDesc = colIndex(['op description', 'op desc'])
  const idxPersonnel = colIndex(['personnel n', 'matricula'])
  const idxAssigned = colIndex(['assigned to', 'tecnico', 'responsavel'])
  const idxCraft = colIndex(['craft', 'especialidade'])
  const idxStartDate = colIndex(['start date', 'data'])
  const idxEstHrs = colIndex(['est hrs', 'tempo', 'horas'])

  // Mapear colunas dos dias
  const idxDias: Record<string, number> = {}
  DIAS_CHAVE.forEach(d => {
    idxDias[d.chave] = headers.findIndex(h => h === d.chave)
  })

  const resultado: ParsedOS[] = []

  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || !row[idxWO]) continue

    const numero_os = String(row[idxWO] || '').trim()
    if (!numero_os) continue

    const rawCraft = String(row[idxCraft] || '').trim().toUpperCase()
    const disciplina = MAPA_CRAFT[rawCraft] || 'MECANICA'
    const descricao = String(row[idxDesc] || 'Sem descrição').trim()
    const sub_operacao = String(row[idxOpDesc] || '').trim()
    const matricula_tecnico = String(row[idxPersonnel] || '').trim()
    const tecnico_nome = String(row[idxAssigned] || 'Não Atribuído').trim()
    const startDateRaw = row[idxStartDate]
    const estHrsTotal = parseFloat(String(row[idxEstHrs] || '1').replace(',', '.')) || 1.0

    // Data base inicial
    let baseDate = new Date()
    if (startDateRaw) {
      if (typeof startDateRaw === 'number') {
        baseDate = new Date((startDateRaw - (25567 + 2)) * 86400 * 1000)
      } else {
        const parsed = new Date(startDateRaw)
        if (!isNaN(parsed.getTime())) baseDate = parsed
      }
    }

    // Verificar alocação por dias (Su, Mo, Tu, We, Th, Fr, Sa)
    let encontrouDiaAlocado = false

    DIAS_CHAVE.forEach(d => {
      const col = idxDias[d.chave]
      if (col !== -1 && row[col] !== undefined && row[col] !== '') {
        const horasNoDia = parseFloat(String(row[col]).replace(',', '.'))
        if (!isNaN(horasNoDia) && horasNoDia > 0) {
          encontrouDiaAlocado = true

          // Calcular data exata do dia da semana
          const dataDia = new Date(baseDate)
          const diffDays = d.offset - baseDate.getDay()
          dataDia.setDate(baseDate.getDate() + (diffDays >= 0 ? diffDays : diffDays + 7))

          resultado.push({
            numero_os,
            disciplina,
            area: 'Geral',
            descricao,
            sub_operacao,
            matricula_tecnico,
            tecnico_nome,
            data_programada: dataDia.toISOString().split('T')[0],
            dia_semana: d.dia,
            tempo_estimado: horasNoDia,
            tipo_semana: 'VIGENTE',
            status: 'EM_ANDAMENTO',
            comentarios: ''
          })
        }
      }
    })

    // Caso não tenha alocação explícita nos dias, salva registro único
    if (!encontrouDiaAlocado) {
      const diasTexto = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']
      resultado.push({
        numero_os,
        disciplina,
        area: 'Geral',
        descricao,
        sub_operacao,
        matricula_tecnico,
        tecnico_nome,
        data_programada: baseDate.toISOString().split('T')[0],
        dia_semana: diasTexto[baseDate.getDay()] || 'SEG',
        tempo_estimado: estHrsTotal,
        tipo_semana: 'VIGENTE',
        status: 'EM_ANDAMENTO',
        comentarios: ''
      })
    }
  }

  return resultado
}
