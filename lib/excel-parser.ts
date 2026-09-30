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

// A semana começa no DOMINGO (index 0) e termina no SÁBADO (index 6)
const DIAS_CHAVE = [
  { chave: 'su', dia: 'DOM', offset: 0 },
  { chave: 'mo', dia: 'SEG', offset: 1 },
  { chave: 'tu', dia: 'TER', offset: 2 },
  { chave: 'we', dia: 'QUA', offset: 3 },
  { chave: 'th', dia: 'QUI', offset: 4 },
  { chave: 'fr', dia: 'SEX', offset: 5 },
  { chave: 'sa', dia: 'SAB', offset: 6 },
]

// Função para obter número da semana no ano
function getWeekNumber(d: Date): number {
  const target = new Date(d.valueOf())
  const dayNr = (d.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7))
  }
  return 1 + Math.round((firstThursday - target.valueOf()) / 604800000)
}

export function processarExcel(binaryData: any): ResultadoParse {
  const wb = XLSX.read(binaryData, { type: 'binary' })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

  if (!rows || rows.length === 0) {
    return {
      ordens: [],
      meta: { area_linha: 'Geral', supervisor: 'Geral', senha_supervisor: '', numero_semana: 0, data_inicio_semana: '', tipo_semana: 'VIGENTE' }
    }
  }

  // 1. Extrair Metadados do Cabeçalho (Linhas 1 a 4)
  let area_linha = 'Geral'
  let supervisor = 'Desconhecido'
  let dataInicioSemana: Date | null = null

  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const linhaTexto = (rows[i] || []).join(' ')
    
    // Detectar data da semana (ex: Weekly Schedule for week of Sep 27, 2026)
    if (linhaTexto.toLowerCase().includes('week of')) {
      const match = linhaTexto.match(/week of\s+([A-Za-z]+\s+\d+,\s+\d{4})/i) || linhaTexto.match(/week of\s+([^\n\r]+)/i)
      if (match && match[1]) {
        const parsed = new Date(match[1].trim())
        if (!isNaN(parsed.getTime())) {
          dataInicioSemana = parsed
        }
      }
    }

    // Detectar Área e Supervisor (ex: Primário   Supervisor Johnathan)
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

  // Se não achou a data no texto, usa a data atual
  if (!dataInicioSemana) {
    dataInicioSemana = new Date()
    // Ajusta para o domingo mais recente
    dataInicioSemana.setDate(dataInicioSemana.getDate() - dataInicioSemana.getDay())
  }

  // Garantir que a data inicial seja exatamente o DOMINGO da semana
  const domingoBase = new Date(dataInicioSemana)
  domingoBase.setDate(domingoBase.getDate() - domingoBase.getDay())

  // Calcular Número da Semana da Planilha vs Semana Atual Real
  const numSemanaPlanilha = getWeekNumber(domingoBase)
  const numSemanaAtualReal = getWeekNumber(new Date())

  let tipo_semana: 'PASSADA' | 'VIGENTE' | 'PROXIMA' = 'VIGENTE'
  if (numSemanaPlanilha < numSemanaAtualReal) {
    tipo_semana = 'PASSADA'
  } else if (numSemanaPlanilha > numSemanaAtualReal) {
    tipo_semana = 'PROXIMA'
  }

  // Extrair o primeiro nome do supervisor para usar como senha
  const primeiroNomeSupervisor = supervisor.split(' ')[0].trim().toLowerCase()

  // 2. Localizar Linha do Cabeçalho das Colunas
  let headerIndex = -1
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const rowStr = (rows[i] || []).join(' ').toLowerCase()
    if (rowStr.includes('wo') || rowStr.includes('assigned') || rowStr.includes('craft')) {
      headerIndex = i
      break
    }
  }

  if (headerIndex === -1) headerIndex = 4
  const headers = (rows[headerIndex] || []).map(h => String(h || '').trim().toLowerCase())

  // Mapear Índices das Colunas por Palavra-Chave
  const colIndex = (keys: string[]) => headers.findIndex(h => keys.some(k => h.includes(k)))

  const idxWO = colIndex(['wo #', 'wo', 'os', 'numero'])
  const idxOp = colIndex(['op #', 'op', 'operacao'])
  const idxDesc = colIndex(['wo description', 'description', 'descriç'])
  const idxOpDesc = colIndex(['op description', 'op desc'])
  const idxPersonnel = colIndex(['personnel n', 'matricula'])
  const idxAssigned = colIndex(['assigned to', 'tecnico', 'responsavel'])
  const idxCraft = colIndex(['craft', 'especialidade'])
  const idxStartDate = colIndex(['start date', 'data'])
  const idxEstHrs = colIndex(['est hrs', 'tempo', 'horas'])

  // Mapear colunas dos dias (Su, Mo, Tu, We, Th, Fr, Sa)
  const idxDias: Record<string, number> = {}
  DIAS_CHAVE.forEach(d => {
    idxDias[d.chave] = headers.findIndex(h => h === d.chave)
  })

  const ordens: ParsedOS[] = []

  // 3. Processar Linhas de Dados
  for (let i = headerIndex + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || idxWO === -1 || !row[idxWO]) continue

    const numero_os = String(row[idxWO] || '').trim()
    if (!numero_os || numero_os.toLowerCase().includes('total')) continue

    const numero_operacao = idxOp !== -1 ? String(row[idxOp] || '0010').trim() : '0010'
    const rawCraft = idxCraft !== -1 ? String(row[idxCraft] || '').trim().toUpperCase() : 'MECPRM'
    const disciplina = MAPA_CRAFT[rawCraft] || rawCraft || 'MECANICA'
    const descricao = idxDesc !== -1 ? String(row[idxDesc] || 'Sem descrição').trim() : 'Sem descrição'
    const sub_operacao = idxOpDesc !== -1 ? String(row[idxOpDesc] || '').trim() : ''
    const matricula_tecnico = idxPersonnel !== -1 ? String(row[idxPersonnel] || '').trim() : ''
    const tecnico_nome = idxAssigned !== -1 ? String(row[idxAssigned] || 'Não Atribuído').trim() : 'Não Atribuído'
    const estHrsTotal = idxEstHrs !== -1 ? parseFloat(String(row[idxEstHrs] || '1').replace(',', '.')) || 1.0 : 1.0

    let encontrouDiaAlocado = false

    // Verificar em quais dias da semana há horas alocadas
    DIAS_CHAVE.forEach(d => {
      const col = idxDias[d.chave]
      if (col !== -1 && col !== undefined && row[col] !== undefined && row[col] !== null && row[col] !== '') {
        const horasNoDia = parseFloat(String(row[col]).replace(',', '.'))
        if (!isNaN(horasNoDia) && horasNoDia > 0) {
          encontrouDiaAlocado = true

          // Data exata do dia (domingoBase + offset de 0 a 6)
          const dataDia = new Date(domingoBase)
          dataDia.setDate(domingoBase.getDate() + d.offset)
          const dataIso = dataDia.toISOString().split('T')[0]

          ordens.push({
            numero_os,
            numero_operacao,
            disciplina,
            area: 'Geral',
            area_linha: area_linha || 'Geral',
            supervisor: supervisor || 'Supervisão',
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

    // Caso não tenha horas nos dias de Su a Sa, gera um card padrão no primeiro dia
    if (!encontrouDiaAlocado) {
      const dataIso = domingoBase.toISOString().split('T')[0]
      ordens.push({
        numero_os,
        numero_operacao,
        disciplina,
        area: 'Geral',
        area_linha: area_linha || 'Geral',
        supervisor: supervisor || 'Supervisão',
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
      area_linha: area_linha || 'Geral',
      supervisor: supervisor || 'Supervisão',
      senha_supervisor: primeiroNomeSupervisor,
      numero_semana: numSemanaPlanilha,
      data_inicio_semana: domingoBase.toISOString().split('T')[0],
      tipo_semana
    }
  }
}
