import * as XLSX from 'xlsx'

export interface ParsedOS {
  numero_os: string
  numero_operacao: string
  disciplina: string
  area: string
  area_linha: string
  supervisor: string
  descricao: string
  sub_operacao: string
  matricula_tecnico: string
  tecnico_nome: string
  data_programada: string
  dia_semana: string
  tempo_estimado: number
  tipo_semana: 'PASSADA' | 'VIGENTE' | 'PROXIMA'
  numero_semana: number
  status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROGRAMADA'
  comentarios: string
}

export interface ResultadoParse {
  ordens: ParsedOS[]
  meta: {
    area_linha: string
    supervisor: string
    senha_supervisor: string
    numero_semana: number
    data_inicio_semana: string
    tipo_semana: 'PASSADA' | 'VIGENTE' | 'PROXIMA'
  }
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

// Cálculo oficial do número da semana no ano (Domingo como início)
export function getWeekNumber(d: Date): number {
  const date = new Date(d.getTime())
  date.setHours(0, 0, 0, 0)
  const startOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - startOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + startOfYear.getDay() + 1) / 7)
}

export function processarExcel(binaryData: any): ResultadoParse {
  const wb = XLSX.read(binaryData, { type: 'binary' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  if (!rows || rows.length === 0) {
    return {
      ordens: [],
      meta: { area_linha: 'Primário', supervisor: 'Johnathan', senha_supervisor: 'johnathan', numero_semana: 40, data_inicio_semana: '', tipo_semana: 'VIGENTE' }
    }
  }

  // 1. Extrair Área, Supervisor e Data das linhas iniciais
  let area_linha = 'Primário'
  let supervisor = 'Johnathan'
  let dataInicioPlanilha: Date | null = null

  for (let i = 0; i < Math.min(rows.length, 6); i++) {
    const linhaTexto = (rows[i] || []).join(' ')
    
    if (linhaTexto.toLowerCase().includes('week of')) {
      const match = linhaTexto.match(/week of\s+([A-Za-z]+\s+\d+,\s+\d{4})/i) || linhaTexto.match(/week of\s+([^\r\n]+)/i)
      if (match && match[1]) {
        const parsed = new Date(match[1].trim())
        if (!isNaN(parsed.getTime())) {
          dataInicioPlanilha = parsed
        }
      }
    }

    if (linhaTexto.toLowerCase().includes('supervisor')) {
      const partes = linhaTexto.split(/supervisor/i)
      if (partes[0] && partes[0].trim()) {
        area_linha = partes[0].replace(/[^a-zA-Z0-9áàâãéèêíïóôõöúçÑñ\s-]/g, '').trim()
      }
      if (partes[1] && partes[1].trim()) {
        supervisor = partes[1].replace(/[^a-zA-Z0-9áàâãéèêíïóôõöúçÑñ\s-]/g, '').trim()
      }
    }
  }

  if (!dataInicioPlanilha) {
    dataInicioPlanilha = new Date()
  }

  const domingoBase = new Date(dataInicioPlanilha)
  domingoBase.setDate(domingoBase.getDate() - domingoBase.getDay())

  const hojeReal = new Date()
  const domingoHojeReal = new Date(hojeReal)
  domingoHojeReal.setDate(hojeReal.getDate() - hojeReal.getDay())

  const numSemanaPlanilha = getWeekNumber(domingoBase)

  let tipo_semana: 'PASSADA' | 'VIGENTE' | 'PROXIMA' = 'VIGENTE'
  if (domingoBase.getTime() < domingoHojeReal.getTime() - 86400000) {
    tipo_semana = 'PASSADA'
  } else if (domingoBase.getTime() > domingoHojeReal.getTime() + 86400000) {
    tipo_semana = 'PROXIMA'
  }

  const primeiroNomeSupervisor = supervisor.split(' ')[0].trim().toLowerCase() || 'johnathan'

  // 2. Encontrar Linha de Cabeçalho das Colunas
  let headerIndex = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowStr = (rows[i] || []).map(c => String(c || '').toLowerCase()).join(' ')
    if (rowStr.includes('wo #') || (rowStr.includes('craft') && rowStr.includes('assigned'))) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) headerIndex = 4
  const headers = (rows[headerIndex] || []).map(h => String(h || '').trim().toLowerCase())

  const colIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)))

  const idxWO = colIndex(['wo #', 'wo', 'os'])
  const idxOp = colIndex(['op #', 'op'])
  const idxDesc = colIndex(['wo description', 'description'])
  const idxOpDesc = colIndex(['op description', 'op desc'])
  const idxPersonnel = colIndex(['personnel n', 'matricula'])
  const idxAssigned = colIndex(['assigned to', 'tecnico'])
  const idxCraft = colIndex(['craft', 'especialidade'])
  const idxEstHrs = colIndex(['est hrs', 'tempo', 'horas'])

  const idxDias: Record<string, number> = {}
  DIAS_CHAVE.forEach(d => {
    idxDias[d.chave] = headers.findIndex(h => h === d.chave)
  })

  const ordens: ParsedOS[] = []

  // 3. Processar Linhas
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || idxWO === -1) continue

    const valWO = String(row[idxWO] || '').trim()
    if (!valWO || valWO.toLowerCase().includes('total') || valWO.toLowerCase().includes('weekly')) continue

    const numero_os = valWO
    const numero_operacao = idxOp !== -1 && row[idxOp] ? String(row[idxOp]).trim() : '0010'
    const rawCraft = idxCraft !== -1 ? String(row[idxCraft] || '').trim().toUpperCase() : 'MECPRM'
    const disciplina = MAPA_CRAFT[rawCraft] || rawCraft || 'MECANICA'
    const descricao = idxDesc !== -1 ? String(row[idxDesc] || 'Sem descrição').trim() : 'Sem descrição'
    const sub_operacao = idxOpDesc !== -1 ? String(row[idxOpDesc] || '').trim() : ''
    const matricula_tecnico = idxPersonnel !== -1 ? String(row[idxPersonnel] || '').trim() : ''
    const tecnico_nome = idxAssigned !== -1 ? String(row[idxAssigned] || 'Não Atribuído').trim() : 'Não Atribuído'
    const estHrsTotal = idxEstHrs !== -1 ? parseFloat(String(row[idxEstHrs] || '1').replace(',', '.')) || 1.0 : 1.0

    let encontrouDiaAlocado = false

    DIAS_CHAVE.forEach(d => {
      const col = idxDias[d.chave]
      if (col !== -1 && col !== undefined && row[col] !== undefined && row[col] !== null && String(row[col]).trim() !== '') {
        const horasNoDia = parseFloat(String(row[col]).replace(',', '.'))
        if (!isNaN(horasNoDia) && horasNoDia > 0) {
          encontrouDiaAlocado = true

          const dataDia = new Date(domingoBase)
          dataDia.setDate(domingoBase.getDate() + d.offset)
          const dataIso = dataDia.toISOString().split('T')[0]

          ordens.push({
            numero_os,
            numero_operacao,
            disciplina,
            area: 'Geral',
            area_linha: area_linha || 'Primário',
            supervisor: supervisor || 'Johnathan',
            descricao,
            sub_operacao,
            matricula_tecnico,
            tecnico_nome,
            data_programada: dataIso,
            dia_semana: d.dia,
            tempo_estimado: horasNoDia,
            tipo_semana,
            numero_semana: numSemanaPlanilha,
            status: 'EM_ANDAMENTO',
            comentarios: ''
          })
        }
      }
    })

    if (!encontrouDiaAlocado) {
      const dataIso = domingoBase.toISOString().split('T')[0]
      ordens.push({
        numero_os,
        numero_operacao,
        disciplina,
        area: 'Geral',
        area_linha: area_linha || 'Primário',
        supervisor: supervisor || 'Johnathan',
        descricao,
        sub_operacao,
        matricula_tecnico,
        tecnico_nome,
        data_programada: dataIso,
        dia_semana: 'DOM',
        tempo_estimado: estHrsTotal,
        tipo_semana,
        numero_semana: numSemanaPlanilha,
        status: 'EM_ANDAMENTO',
        comentarios: ''
      })
    }
  }

  return {
    ordens,
    meta: {
      area_linha: area_linha || 'Primário',
      supervisor: supervisor || 'Johnathan',
      senha_supervisor: primeiroNomeSupervisor,
      numero_semana: numSemanaPlanilha,
      data_inicio_semana: domingoBase.toISOString().split('T')[0],
      tipo_semana
    }
  }
}
