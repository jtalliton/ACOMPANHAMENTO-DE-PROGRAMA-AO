'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { processarExcel } from '@/lib/excel-parser'
import { 
  Wrench, Clock, Filter, MessageSquare, 
  FileSpreadsheet, RefreshCw, Calendar, CheckCircle2,
  Clock3, AlertCircle, Users, LayoutGrid, CalendarDays
} from 'lucide-react'

interface OS {
  id: string
  numero_os: string
  disciplina: string
  area: string
  descricao: string
  sub_operacao: string
  tecnico_nome: string
  data_programada: string
  dia_semana: string
  tempo_estimado: number
  tipo_semana: 'PASSADA' | 'VIGENTE' | 'PROXIMA'
  status: 'EM_ANDAMENTO' | 'CONCLUIDO' | 'REPROGRAMADA'
  comentarios: string
}

const DIAS_ORDEM = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM']
const DIAS_NOMES: Record<string, string> = {
  SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta',
  QUI: 'Quinta', SEX: 'Sexta', SAB: 'Sábado', DOM: 'Domingo'
}

export default function AppManutencao() {
  const supabase = createClient()
  const [ordens, setOrdens] = useState<OS[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros Globais
  const [semanaAtiva, setSemanaAtiva] = useState<'PASSADA' | 'VIGENTE' | 'PROXIMA'>('VIGENTE')
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>('TODOS')
  const [disciplinaFiltro, setDisciplinaFiltro] = useState<string>('TODAS')
  
  // Modo de Exibição
  const [modoVisao, setModoVisao] = useState<'SEMANA' | 'DIA'>('SEMANA')
  const [diaAtivo, setDiaAtivo] = useState<string>('SEG')

  // Modal de Comentários
  const [osModal, setOsModal] = useState<OS | null>(null)
  const [textoComentario, setTextoComentario] = useState('')

  const carregarOrdens = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('ordens_servico')
      .select('*')
      .order('data_programada', { ascending: true })

    if (!error && data) setOrdens(data)
    setLoading(false)
  }

  useEffect(() => { carregarOrdens() }, [])

  // Alternar Status da OS (1-click)
  const alternarStatus = async (os: OS) => {
    const proximos: Record<OS['status'], OS['status']> = {
      EM_ANDAMENTO: 'CONCLUIDO',
      CONCLUIDO: 'REPROGRAMADA',
      REPROGRAMADA: 'EM_ANDAMENTO'
    }
    const novoStatus = proximos[os.status]

    const { error } = await supabase
      .from('ordens_servico')
      .update({ status: novoStatus })
      .eq('id', os.id)

    if (!error) {
      setOrdens(prev => prev.map(o => o.id === os.id ? { ...o, status: novoStatus } : o))
    }
  }

  // Salvar Comentário
  const salvarComentario = async () => {
    if (!osModal) return
    const { error } = await supabase
      .from('ordens_servico')
      .update({ comentarios: textoComentario })
      .eq('id', osModal.id)

    if (!error) {
      setOrdens(prev => prev.map(o => o.id === osModal.id ? { ...o, comentarios: textoComentario } : o))
      setOsModal(null)
    }
  }

  // Importar Excel (Visão ADM)
  const importarExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const binaryStr = evt.target?.result
      const dadosFormatados = processarExcel(binaryStr)

      if (dadosFormatados.length === 0) {
        alert('Nenhuma Ordem de Serviço identificada na planilha.')
        return
      }

      // Converte semana vigente atual para semana passada
      await supabase
        .from('ordens_servico')
        .update({ tipo_semana: 'PASSADA' })
        .eq('tipo_semana', 'VIGENTE')

      // Insere novas ordens como semana vigente
      const { error } = await supabase.from('ordens_servico').insert(dadosFormatados)

      if (!error) {
        alert(`${dadosFormatados.length} ordens de serviço importadas com sucesso!`)
        carregarOrdens()
      } else {
        alert('Erro ao salvar no banco: ' + error.message)
      }
    }
    reader.readAsBinaryString(file)
  }

  // Listas Únicas
  const tecnicosLista = useMemo(() => Array.from(new Set(ordens.map(o => o.tecnico_nome))).sort(), [ordens])

  // Filtragem
  const ordensFiltradas = useMemo(() => {
    return ordens.filter(os => {
      const matchSemana = os.tipo_semana === semanaAtiva
      const matchTecnico = tecnicoFiltro === 'TODOS' || os.tecnico_nome === tecnicoFiltro
      const matchDisciplina = disciplinaFiltro === 'TODAS' || os.disciplina === disciplinaFiltro
      return matchSemana && matchTecnico && matchDisciplina
    })
  }, [ordens, semanaAtiva, tecnicoFiltro, disciplinaFiltro])

  // KPIs Calculados Dinamicamente
  const kpiOrdens = ordensFiltradas.length
  const kpiHoras = ordensFiltradas.reduce((acc, os) => acc + (os.tempo_estimado || 0), 0)
  const kpiDiasAtivos = new Set(ordensFiltradas.map(os => os.dia_semana)).size

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans pb-12">
      
      {/* HEADER PRINCIPAL */}
      <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-30 px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          
          {/* Logo & Título */}
          <div className="flex items-center gap-2.5">
            <div className="bg-blue-600/20 text-blue-400 p-2 rounded-xl border border-blue-500/30">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-none">AUTOMAÇÃO BRYAN</h1>
              <p className="text-[10px] text-slate-400 mt-0.5">PCM • Programação de Manutenção</p>
            </div>
          </div>

          {/* Seletor de Semanas */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800/80">
            {(['PASSADA', 'VIGENTE', 'PROXIMA'] as const).map((sem) => (
              <button
                key={sem}
                onClick={() => setSemanaAtiva(sem)}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition ${
                  semanaAtiva === sem 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {sem === 'PASSADA' ? '◄ Passada' : sem === 'VIGENTE' ? '● Vigente' : 'Próxima ►'}
              </button>
            ))}
          </div>

          {/* Ações (Importar Excel / Refresh) */}
          <div className="flex items-center gap-2">
            <label className="cursor-pointer flex items-center gap-1.5 bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition">
              <FileSpreadsheet className="h-4 w-4" />
              <span>Importar</span>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={importarExcel} className="hidden" />
            </label>
            <button onClick={carregarOrdens} className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700/60">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </div>
      </header>

      {/* BARRA DE FILTROS */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-4 py-2 backdrop-blur">
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2.5 items-center justify-between">
          
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Seletor do Técnico */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg w-full sm:w-auto">
              <Users className="h-3.5 w-3.5 text-blue-400" />
              <select 
                value={tecnicoFiltro}
                onChange={(e) => setTecnicoFiltro(e.target.value)}
                className="bg-transparent text-xs text-blue-300 font-semibold focus:outline-none w-full"
              >
                <option value="TODOS" className="bg-slate-900 text-slate-200">👤 Todos os Técnicos</option>
                {tecnicosLista.map(t => (
                  <option key={t} value={t} className="bg-slate-900 text-slate-200">👤 {t}</option>
                ))}
              </select>
            </div>

            {/* Seletor de Disciplina */}
            <div className="flex items-center gap-1.5 bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-lg">
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select 
                value={disciplinaFiltro}
                onChange={(e) => setDisciplinaFiltro(e.target.value)}
                className="bg-transparent text-xs text-slate-300 focus:outline-none"
              >
                <option value="TODAS" className="bg-slate-900">Todas Disciplinas</option>
                <option value="MECANICA" className="bg-slate-900">Mecânica</option>
                <option value="ELETRICA_AUTOMACAO" className="bg-slate-900">Elétrica & Automação</option>
                <option value="TERCEIROS" className="bg-slate-900">Terceiros Fixos</option>
              </select>
            </div>
          </div>

          {/* Alternador de Modo (Toda a Semana vs Por Dia) */}
          <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setModoVisao('SEMANA')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded ${
                modoVisao === 'SEMANA' ? 'bg-slate-800 text-blue-400' : 'text-slate-400'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Toda a Semana
            </button>
            <button
              onClick={() => setModoVisao('DIA')}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded ${
                modoVisao === 'DIA' ? 'bg-slate-800 text-blue-400' : 'text-slate-400'
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Por Dia
            </button>
          </div>

        </div>
      </div>

      {/* BANNERS DE INDICADORES (KPIs) - DESIGN INDUSTRIAL ORIGINAL */}
      <section className="max-w-7xl w-full mx-auto px-4 mt-4">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          
          <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border-l-4 border-blue-500 rounded-xl p-3 border-y border-r border-slate-800/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Ordens Totais</p>
              <p className="text-xl sm:text-2xl font-black text-white mt-0.5">{kpiOrdens}</p>
            </div>
            <div className="bg-blue-950/60 p-2 rounded-lg text-blue-400 border border-blue-900/40">
              <Wrench className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border-l-4 border-amber-500 rounded-xl p-3 border-y border-r border-slate-800/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Horas Programadas</p>
              <p className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5">{kpiHoras.toFixed(1)} <span className="text-xs font-normal text-slate-400">hrs</span></p>
            </div>
            <div className="bg-amber-950/60 p-2 rounded-lg text-amber-400 border border-amber-900/40">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <div className="bg-gradient-to-br from-slate-900 to-slate-900/80 border-l-4 border-emerald-500 rounded-xl p-3 border-y border-r border-slate-800/80 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Dias Ativos</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-0.5">{kpiDiasAtivos} <span className="text-xs font-normal text-slate-400">dias</span></p>
            </div>
            <div className="bg-emerald-950/60 p-2 rounded-lg text-emerald-400 border border-emerald-900/40">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

        </div>
      </section>

      {/* SELETOR DE DIAS DA SEMANA (MODO "POR DIA") */}
      {modoVisao === 'DIA' && (
        <nav className="max-w-7xl w-full mx-auto px-4 mt-4">
          <div className="flex bg-slate-900 p-1.5 rounded-xl border border-slate-800 justify-between overflow-x-auto gap-1">
            {DIAS_ORDEM.map(dia => {
              const count = ordensFiltradas.filter(o => o.dia_semana === dia).length
              return (
                <button
                  key={dia}
                  onClick={() => setDiaAtivo(dia)}
                  className={`flex-1 min-w-[60px] py-2 px-1 rounded-lg flex flex-col items-center justify-center transition ${
                    diaAtivo === dia 
                      ? 'bg-blue-600 text-white shadow-md font-bold' 
                      : 'text-slate-400 hover:bg-slate-800/60'
                  }`}
                >
                  <span className="text-xs">{dia}</span>
                  <span className={`text-[9px] px-1.5 py-0.2 mt-1 rounded-full ${
                    diaAtivo === dia ? 'bg-blue-800 text-blue-100' : 'bg-slate-800 text-slate-400'
                  }`}>
                    {count} OS
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* CORPO DE EXIBIÇÃO DAS ORDENS */}
      <main className="max-w-7xl w-full mx-auto px-4 mt-4">
        {modoVisao === 'SEMANA' ? (
          /* MODO TODA A SEMANA: Grade / Lista contínua por dias */
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {DIAS_ORDEM.map(dia => {
              const ordensDia = ordensFiltradas.filter(o => o.dia_semana === dia)
              return (
                <div key={dia} className="bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col">
                  <div className="p-2.5 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center rounded-t-xl">
                    <span className="text-xs font-bold text-slate-300">{DIAS_NOMES[dia]}</span>
                    <span className="text-[10px] bg-slate-800 text-slate-400 font-bold px-1.5 py-0.5 rounded-full">
                      {ordensDia.length}
                    </span>
                  </div>
                  <div className="p-2 space-y-2">
                    {ordensDia.map(os => <CartaoOS key={os.id} os={os} onToggle={alternarStatus} onComment={(os) => { setOsModal(os); setTextoComentario(os.comentarios || ''); }} />)}
                    {ordensDia.length === 0 && <p className="text-[10px] text-slate-600 text-center py-4">Sem OS</p>}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          /* MODO POR DIA: Lista Focada */
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-sm font-bold text-slate-300 mb-2">
              Ordens Programadas para {DIAS_NOMES[diaAtivo]} ({ordensFiltradas.filter(o => o.dia_semana === diaAtivo).length})
            </h2>
            {ordensFiltradas.filter(o => o.dia_semana === diaAtivo).map(os => (
              <CartaoOS key={os.id} os={os} onToggle={alternarStatus} onComment={(os) => { setOsModal(os); setTextoComentario(os.comentarios || ''); }} />
            ))}
            {ordensFiltradas.filter(o => o.dia_semana === diaAtivo).length === 0 && (
              <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-8 text-center text-slate-500 text-xs">
                Nenhuma ordem de serviço programada para este dia.
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL DE APONTAMENTO / COMENTÁRIO */}
      {osModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white mb-1">Apontamento • OS {osModal.numero_os}</h3>
            <p className="text-xs text-slate-400 mb-3">{osModal.descricao}</p>
            
            <textarea
              rows={4}
              value={textoComentario}
              onChange={(e) => setTextoComentario(e.target.value)}
              placeholder="Digite apontamentos, observações de campo, peças utilizadas ou pendências..."
              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-blue-500 mb-4 resize-none"
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setOsModal(null)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-white">Cancelar</button>
              <button onClick={salvarComentario} className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-lg shadow">Salvar Apontamento</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// COMPONENTE CARD DE ORDEM DE SERVIÇO
function CartaoOS({ os, onToggle, onComment }: { os: OS, onToggle: (os: OS) => void, onComment: (os: OS) => void }) {
  const statusColor = 
    os.status === 'CONCLUIDO' ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400' :
    os.status === 'REPROGRAMADA' ? 'border-rose-500/50 bg-rose-950/20 text-rose-400' :
    'border-amber-500/50 bg-amber-950/20 text-amber-400'

  return (
    <div className={`border rounded-lg p-3 bg-slate-900/90 shadow-sm flex flex-col justify-between gap-2.5 ${statusColor}`}>
      <div>
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-[10px] font-bold text-blue-400 bg-blue-950/80 px-1.5 py-0.5 rounded border border-blue-800/40">
            {os.numero_os}
          </span>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            {os.disciplina}
          </span>
        </div>
        <p className="text-xs font-bold text-slate-100">{os.area}</p>
        <p className="text-[11px] text-slate-300 leading-snug mt-0.5">{os.descricao}</p>
        {os.sub_operacao && <p className="text-[10px] text-slate-400 italic mt-1">Op: {os.sub_operacao}</p>}
      </div>

      <div className="pt-2 border-t border-slate-800/80 flex flex-col gap-2">
        <div className="flex justify-between items-center text-[10px] text-slate-400">
          <span className="font-semibold text-slate-300">👤 {os.tecnico_nome}</span>
          <span className="flex items-center gap-1 font-bold text-amber-400"><Clock className="h-3 w-3" />{os.tempo_estimado}h</span>
        </div>

        <div className="flex items-center justify-between gap-1.5">
          <button
            onClick={() => onToggle(os)}
            className={`flex-1 flex items-center justify-center gap-1 text-[10px] font-bold py-1.5 px-2 rounded transition shadow-sm ${
              os.status === 'CONCLUIDO' ? 'bg-emerald-600 text-white' :
              os.status === 'REPROGRAMADA' ? 'bg-rose-600 text-white' :
              'bg-amber-600 text-white'
            }`}
          >
            {os.status === 'CONCLUIDO' && <CheckCircle2 className="h-3 w-3" />}
            {os.status === 'REPROGRAMADA' && <AlertCircle className="h-3 w-3" />}
            {os.status === 'EM_ANDAMENTO' && <Clock3 className="h-3 w-3" />}
            {os.status.replace('_', ' ')}
          </button>

          <button
            onClick={() => onComment(os)}
            className={`p-1.5 rounded text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700/60 ${os.comentarios ? 'text-blue-400 border-blue-500/50' : ''}`}
            title="Adicionar Apontamento"
          >
            <MessageSquare className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
