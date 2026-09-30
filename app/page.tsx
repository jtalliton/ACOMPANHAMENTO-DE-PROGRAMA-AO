'use client'

import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { processarExcel, ParsedOS, ResultadoParse } from '@/lib/excel-parser'
import { 
  Wrench, Clock, Filter, MessageSquare, 
  FileSpreadsheet, RefreshCw, Calendar, CheckCircle2,
  Clock3, AlertCircle, Users, LayoutGrid, CalendarDays,
  Sun, Moon, Trash2, Lock, Bell, Send, Check, X,
  Radio
} from 'lucide-react'

interface OS {
  id: string
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

interface PendenciaFutura {
  id: string
  criado_por: string
  tecnico_responsavel: string
  area_linha: string
  supervisor: string
  descricao: string
  tag_equipamento: string
  tempo_estimado: number
  qtd_tecnicos: number
  tipo_pendencia: 'ATIVIDADE' | 'FOLGA' | 'AVISO'
  data_proposta: string
  numero_semana: number
  status: 'PENDENTE_APROVACAO' | 'APROVADA' | 'REPROGRAMADA' | 'REJEITADA' | 'ATRASADA'
  numero_os: string
  justificativa_rejeicao: string
  created_at: string
}

interface Mensagem {
  id: string
  remetente: string
  destinatario: string
  area_linha: string
  assunto: string
  conteudo: string
  tipo: 'AVISO' | 'RETORNO_PENDENCIA' | 'DIRETO'
  lida: boolean
  created_at: string
}

const DIAS_ORDEM = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB']
const DIAS_NOMES: Record<string, string> = {
  DOM: 'Domingo', SEG: 'Segunda', TER: 'Terça', QUA: 'Quarta',
  QUI: 'Quinta', SEX: 'Sexta', SAB: 'Sábado'
}

const SENHA_MESTRA = 'tomate'

export default function AppPCM() {
  const supabase = createClient()
  
  const [ordens, setOrdens] = useState<OS[]>([])
  const [pendencias, setPendencias] = useState<PendenciaFutura[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [isLive, setIsLive] = useState(true)

  const [tema, setTema] = useState<'dark' | 'light'>('dark')

  const [semanaAtiva, setSemanaAtiva] = useState<'PASSADA' | 'VIGENTE' | 'PROXIMA'>('VIGENTE')
  const [areaFiltro, setAreaFiltro] = useState<string>('TODAS')
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>('TODOS')
  const [disciplinaFiltro, setDisciplinaFiltro] = useState<string>('TODAS')
  
  const [modoVisao, setModoVisao] = useState<'SEMANA' | 'DIA'>('SEMANA')
  const [diaAtivo, setDiaAtivo] = useState<string>('DOM')

  const [osModal, setOsModal] = useState<OS | null>(null)
  const [textoComentario, setTextoComentario] = useState('')
  
  const [modalSenha, setModalSenha] = useState<{
    aberto: boolean
    titulo: string
    senhaEsperada: string
    acao: () => Promise<void>
  }>({ aberto: false, titulo: '', senhaEsperada: '', acao: async () => {} })
  const [senhaInput, setSenhaInput] = useState('')

  const [modalNovaPendencia, setModalNovaPendencia] = useState(false)
  const [formPendencia, setFormPendencia] = useState({
    tecnico_responsavel: '',
    tipo_pendencia: 'ATIVIDADE' as 'ATIVIDADE' | 'FOLGA' | 'AVISO',
    descricao: '',
    tag_equipamento: '',
    tempo_estimado: 1,
    qtd_tecnicos: 1,
    data_proposta: new Date().toISOString().split('T')[0]
  })

  const [modalGerenciarPendencias, setModalGerenciarPendencias] = useState(false)
  const [pendenciaAvaliando, setPendenciaAvaliando] = useState<PendenciaFutura | null>(null)
  const [osAprovacao, setOsAprovacao] = useState('')
  const [justificativaRejeicao, setJustificativaRejeicao] = useState('')

  const carregarDados = useCallback(async () => {
    setLoading(true)
    
    const { data: dataOS } = await supabase
      .from('ordens_servico')
      .select('*')
      .order('data_programada', { ascending: true })

    if (dataOS) setOrdens(dataOS)

    const { data: dataPend } = await supabase
      .from('pendencias_futuras')
      .select('*')
      .order('data_proposta', { ascending: true })

    if (dataPend) setPendencias(dataPend)

    const { data: dataMsg } = await supabase
      .from('mensagens')
      .select('*')
      .order('created_at', { ascending: false })

    if (dataMsg) setMensagens(dataMsg)

    setLoading(false)
  }, [supabase])

  useEffect(() => {
    carregarDados()

    const channel = supabase
      .channel('realtime_pcm')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ordens_servico' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pendencias_futuras' }, () => carregarDados())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens' }, () => carregarDados())
      .subscribe((status) => {
        setIsLive(status === 'SUBSCRIBED')
      })

    const interval = setInterval(() => { carregarDados() }, 60000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [carregarDados, supabase])

  const areasLista = useMemo(() => Array.from(new Set(ordens.map(o => o.area_linha || 'Primário'))).filter(Boolean).sort(), [ordens])
  const tecnicosLista = useMemo(() => Array.from(new Set(ordens.map(o => o.tecnico_nome))).filter(Boolean).sort(), [ordens])

  const numeroSemanaExibida = useMemo(() => {
    const ordenadas = ordens.filter(o => o.tipo_semana === semanaAtiva)
    if (ordenadas.length > 0 && ordenadas[0].numero_semana) {
      return ordenadas[0].numero_semana
    }
    return 40
  }, [ordens, semanaAtiva])

  const ordensFiltradas = useMemo(() => {
    return ordens.filter(os => {
      const matchSemana = os.tipo_semana === semanaAtiva
      const matchArea = areaFiltro === 'TODAS' || os.area_linha === areaFiltro
      const matchTecnico = tecnicoFiltro === 'TODOS' || os.tecnico_nome === tecnicoFiltro
      
      let matchDisciplina = true
      if (disciplinaFiltro !== 'TODAS') {
        if (disciplinaFiltro === 'MECANICA') matchDisciplina = os.disciplina === 'MECANICA'
        else if (disciplinaFiltro === 'ELETRICA_AUTOMACAO') matchDisciplina = os.disciplina === 'ELETRICA_AUTOMACAO'
        else if (disciplinaFiltro === 'TERCEIROS') matchDisciplina = os.disciplina === 'TERCEIROS'
      }

      return matchSemana && matchArea && matchTecnico && matchDisciplina
    })
  }, [ordens, semanaAtiva, areaFiltro, tecnicoFiltro, disciplinaFiltro])

  const kpiOrdens = ordensFiltradas.length
  const kpiHoras = ordensFiltradas.reduce((acc, os) => acc + (Number(os.tempo_estimado) || 0), 0)
  const kpiDiasAtivos = new Set(ordensFiltradas.map(os => os.dia_semana)).size

  const pendenciasAguardando = useMemo(() => {
    return pendencias.filter(p => p.status === 'PENDENTE_APROVACAO' && (areaFiltro === 'TODAS' || p.area_linha === areaFiltro))
  }, [pendencias, areaFiltro])

  const mensagensDoTecnico = useMemo(() => {
    if (tecnicoFiltro === 'TODOS') return []
    return mensagens.filter(m => m.destinatario === tecnicoFiltro && !m.lida)
  }, [mensagens, tecnicoFiltro])

  const mapaDatasDias = useMemo(() => {
    const mapa: Record<string, string> = {}
    const dasSemanas = ordens.filter(o => o.tipo_semana === semanaAtiva)
    
    DIAS_ORDEM.forEach(dia => {
      const achou = dasSemanas.find(o => o.dia_semana === dia)
      if (achou && achou.data_programada) {
        const partes = achou.data_programada.split('-')
        if (partes.length === 3) mapa[dia] = `${partes[2]}/${partes[1]}`
      }
    })
    return mapa
  }, [ordens, semanaAtiva])

  const alternarStatus = async (os: OS) => {
    const proximos: Record<OS['status'], OS['status']> = {
      EM_ANDAMENTO: 'CONCLUIDO',
      CONCLUIDO: 'REPROGRAMADA',
      REPROGRAMADA: 'EM_ANDAMENTO'
    }
    const novoStatus = proximos[os.status]

    setOrdens(prev => prev.map(o => o.id === os.id ? { ...o, status: novoStatus } : o))

    const { error } = await supabase
      .from('ordens_servico')
      .update({ status: novoStatus, updated_at: new Date().toISOString() })
      .eq('id', os.id)

    if (error) {
      alert('Erro ao salvar status no banco: ' + error.message)
      carregarDados()
    }
  }

  const salvarComentario = async () => {
    if (!osModal) return

    setOrdens(prev => prev.map(o => o.id === osModal.id ? { ...o, comentarios: textoComentario } : o))
    
    const { error } = await supabase
      .from('ordens_servico')
      .update({ comentarios: textoComentario, updated_at: new Date().toISOString() })
      .eq('id', osModal.id)

    if (!error) setOsModal(null)
    else alert('Erro ao salvar comentário: ' + error.message)
  }

  const handleArquivoExcel = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const binaryStr = evt.target?.result
      const parse = processarExcel(binaryStr)

      if (parse.ordens.length === 0) {
        alert('Nenhuma Ordem de Serviço encontrada na planilha.')
        return
      }

      setModalSenha({
        aberto: true,
        titulo: `Importar ${parse.ordens.length} Ordens (${parse.meta.tipo_semana})`,
        senhaEsperada: parse.meta.senha_supervisor,
        acao: async () => {
          await executarImportacao(parse)
        }
      })
    }
    reader.readAsBinaryString(file)
    e.target.value = ''
  }

  // IMPORTAÇÃO EM LOTES DE 100 PARA 500+ ORDENS NÃO TRAVAREMA
  const executarImportacao = async (parse: ResultadoParse) => {
    setLoading(true)

    await supabase
      .from('ordens_servico')
      .delete()
      .eq('area_linha', parse.meta.area_linha)
      .eq('tipo_semana', parse.meta.tipo_semana)

    const TAMANHO_LOTE = 100
    let erroOcorreu = false

    for (let i = 0; i < parse.ordens.length; i += TAMANHO_LOTE) {
      const lote = parse.ordens.slice(i, i + TAMANHO_LOTE)
      const { error } = await supabase.from('ordens_servico').insert(lote)
      if (error) {
        erroOcorreu = true
        alert('Erro ao enviar lote de ordens: ' + error.message)
        break
      }
    }

    if (!erroOcorreu) {
      alert(`Sucesso! ${parse.ordens.length} ordens salvas na área ${parse.meta.area_linha} [Aba: ${parse.meta.tipo_semana}].`)
      setAreaFiltro(parse.meta.area_linha)
      setSemanaAtiva(parse.meta.tipo_semana)
      setModalSenha({ aberto: false, titulo: '', senhaEsperada: '', acao: async () => {} })
      carregarDados()
    }
    setLoading(false)
  }

  const solicitarLimparSemana = () => {
    const areaLimpar = areaFiltro !== 'TODAS' ? areaFiltro : 'Primário'

    setModalSenha({
      aberto: true,
      titulo: `Limpar Semana ${semanaAtiva} da Área ${areaLimpar}`,
      senhaEsperada: 'johnathan',
      acao: async () => {
        await supabase
          .from('ordens_servico')
          .delete()
          .eq('area_linha', areaLimpar)
          .eq('tipo_semana', semanaAtiva)

        alert(`Semana ${semanaAtiva} limpa para a área ${areaLimpar}.`)
        setModalSenha({ aberto: false, titulo: '', senhaEsperada: '', acao: async () => {} })
        carregarDados()
      }
    })
  }

  const confirmarSenhaModal = async () => {
    const digitada = senhaInput.trim().toLowerCase()
    const esperada = modalSenha.senhaEsperada.toLowerCase()

    if (digitada === esperada || digitada === SENHA_MESTRA) {
      setSenhaInput('')
      await modalSenha.acao()
    } else {
      alert('Senha incorreta!')
      setSenhaInput('')
    }
  }

  const salvarNovaPendencia = async () => {
    if (!formPendencia.descricao || !formPendencia.tecnico_responsavel) {
      alert('Preencha a descrição e o técnico responsável.')
      return
    }

    const areaUsada = areaFiltro !== 'TODAS' ? areaFiltro : 'Primário'

    const { error } = await supabase.from('pendencias_futuras').insert([{
      criado_por: tecnicoFiltro !== 'TODOS' ? tecnicoFiltro : 'Técnico',
      tecnico_responsavel: formPendencia.tecnico_responsavel,
      area_linha: areaUsada,
      supervisor: 'Johnathan',
      descricao: formPendencia.descricao,
      tag_equipamento: formPendencia.tag_equipamento,
      tempo_estimado: formPendencia.tempo_estimado,
      qtd_tecnicos: formPendencia.qtd_tecnicos,
      tipo_pendencia: formPendencia.tipo_pendencia,
      data_proposta: formPendencia.data_proposta,
      numero_semana: 40,
      status: 'PENDENTE_APROVACAO'
    }])

    if (!error) {
      alert('Solicitação enviada ao supervisor!')
      setModalNovaPendencia(false)
      setFormPendencia({
        tecnico_responsavel: '',
        tipo_pendencia: 'ATIVIDADE',
        descricao: '',
        tag_equipamento: '',
        tempo_estimado: 1,
        qtd_tecnicos: 1,
        data_proposta: new Date().toISOString().split('T')[0]
      })
      carregarDados()
    } else {
      alert('Erro ao enviar solicitação: ' + error.message)
    }
  }

  const processarPendencia = async (acao: 'APROVAR' | 'REPROGRAMAR' | 'REJEITAR') => {
    if (!pendenciaAvaliando) return

    setModalSenha({
      aberto: true,
      titulo: `${acao} Pendência de ${pendenciaAvaliando.tecnico_responsavel}`,
      senhaEsperada: 'johnathan',
      acao: async () => {
        let novoStatus: PendenciaFutura['status'] = 'APROVADA'
        if (acao === 'REPROGRAMAR') novoStatus = 'REPROGRAMADA'
        if (acao === 'REJEITAR') novoStatus = 'REJEITADA'

        const { error } = await supabase
          .from('pendencias_futuras')
          .update({ 
            status: novoStatus, 
            numero_os: osAprovacao, 
            justificativa_rejeicao: justificativaRejeicao,
            updated_at: new Date().toISOString()
          })
          .eq('id', pendenciaAvaliando.id)

        if (!error) {
          let msgTexto = `Sua solicitação (${pendenciaAvaliando.descricao}) foi ${novoStatus}.`
          if (osAprovacao) msgTexto += ` OS: ${osAprovacao}.`
          if (justificativaRejeicao) msgTexto += ` Obs: ${justificativaRejeicao}.`

          await supabase.from('mensagens').insert([{
            remetente: 'Supervisor',
            destinatario: pendenciaAvaliando.tecnico_responsavel,
            area_linha: pendenciaAvaliando.area_linha,
            assunto: `Retorno de Solicitação`,
            conteudo: msgTexto,
            tipo: 'RETORNO_PENDENCIA',
            pendencia_id: pendenciaAvaliando.id
          }])

          alert(`Solicitação ${novoStatus} com sucesso!`)
          setPendenciaAvaliando(null)
          setOsAprovacao('')
          setJustificativaRejeicao('')
          setModalSenha({ aberto: false, titulo: '', senhaEsperada: '', acao: async () => {} })
          carregarDados()
        } else {
          alert('Erro ao processar: ' + error.message)
        }
      }
    })
  }

  const marcarMensagemLida = async (id: string) => {
    setMensagens(prev => prev.map(m => m.id === id ? { ...m, lida: true } : m))
    await supabase.from('mensagens').update({ lida: true }).eq('id', id)
  }

  const bgMain = tema === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-200 text-slate-900'
  const bgHeader = tema === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300 shadow-sm'
  const bgCard = tema === 'dark' ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900 shadow-sm'
  const bgInput = tema === 'dark' ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-900'

  return (
    <div className={`min-h-screen ${bgMain} flex flex-col font-sans pb-12 transition-colors duration-200`}>
      
      {/* HEADER PRINCIPAL */}
      <header className={`${bgHeader} border-b sticky top-0 z-30 px-4 py-2.5`}>
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          
          <div className="flex items-center gap-3">
            <div className="bg-blue-600/20 text-blue-500 p-2 rounded-xl border border-blue-500/30">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black tracking-wide uppercase">PROGRAMAÇÃO SEMANAL PCM</h1>
                <span className={`flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  isLive ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/60' : 'bg-rose-950/80 text-rose-400 border border-rose-800/60'
                }`}>
                  <Radio className={`h-2.5 w-2.5 ${isLive ? 'animate-pulse text-emerald-400' : ''}`} />
                  {isLive ? 'AO VIVO' : 'OFFLINE'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Gestão de Manutenção • Chão de Fábrica</p>
            </div>
          </div>

          <div className={`flex p-1 rounded-lg border ${tema === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
            {(['PASSADA', 'VIGENTE', 'PROXIMA'] as const).map((sem) => (
              <button
                key={sem}
                onClick={() => setSemanaAtiva(sem)}
                className={`px-3 py-1 text-[11px] font-bold rounded-md transition ${
                  semanaAtiva === sem 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                {sem === 'PASSADA' ? '◄ Passada' : sem === 'VIGENTE' ? `● Vigente (W${numeroSemanaExibida})` : 'Próxima ►'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setTema(prev => prev === 'dark' ? 'light' : 'dark')}
              className={`p-1.5 rounded-lg border ${tema === 'dark' ? 'bg-slate-800 border-slate-700 text-amber-400' : 'bg-slate-100 border-slate-300 text-slate-700'}`}
              title="Alternar Tema Claro/Escuro"
            >
              {tema === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            <label className="cursor-pointer flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white px-2.5 py-1.5 rounded-lg text-xs font-bold transition shadow-sm">
              <FileSpreadsheet className="h-4 w-4" />
              <span>Importar</span>
              <input type="file" accept=".xlsx, .xls, .csv" onChange={handleArquivoExcel} className="hidden" />
            </label>

            <button
              onClick={solicitarLimparSemana}
              className="p-1.5 bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-800/60 rounded-lg"
              title="Limpar Programação da Semana"
            >
              <Trash2 className="h-4 w-4" />
            </button>

            <button onClick={carregarDados} className={`p-1.5 rounded-lg border ${tema === 'dark' ? 'bg-slate-800 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 text-slate-700'}`}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

        </div>
      </header>

      {/* FILTROS */}
      <div className={`${bgHeader} border-b px-4 py-2 backdrop-blur`}>
        <div className="max-w-7xl mx-auto flex flex-wrap gap-2.5 items-center justify-between">
          
          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${bgInput}`}>
              <span className="text-[10px] font-bold text-slate-400">ÁREA:</span>
              <select 
                value={areaFiltro}
                onChange={(e) => setAreaFiltro(e.target.value)}
                className="bg-transparent text-xs font-bold text-blue-600 dark:text-blue-400 focus:outline-none"
              >
                <option value="TODAS">Todas as Áreas</option>
                {areasLista.map(a => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${bgInput}`}>
              <Users className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <select 
                value={tecnicoFiltro}
                onChange={(e) => setTecnicoFiltro(e.target.value)}
                className="bg-transparent text-xs text-blue-600 dark:text-blue-400 font-bold focus:outline-none"
              >
                <option value="TODOS">👤 Todos os Técnicos</option>
                {tecnicosLista.map(t => (
                  <option key={t} value={t}>👤 {t}</option>
                ))}
              </select>
            </div>

            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border ${bgInput}`}>
              <Filter className="h-3.5 w-3.5 text-slate-400" />
              <select 
                value={disciplinaFiltro}
                onChange={(e) => setDisciplinaFiltro(e.target.value)}
                className="bg-transparent text-xs font-semibold focus:outline-none"
              >
                <option value="TODAS">Todas Disciplinas</option>
                <option value="MECANICA">Mecânica</option>
                <option value="ELETRICA_AUTOMACAO">Elétrica & Automação</option>
                <option value="TERCEIROS">Terceiros Fixos</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pendenciasAguardando.length > 0 && (
              <button
                onClick={() => setModalGerenciarPendencias(true)}
                className="flex items-center gap-1.5 bg-amber-500 text-slate-950 font-black px-3 py-1 rounded-lg text-xs animate-bounce shadow-md"
              >
                <Bell className="h-4 w-4" />
                <span>{pendenciasAguardando.length} Pendências para Aprovar</span>
              </button>
            )}

            <button
              onClick={() => setModalNovaPendencia(true)}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded-lg text-xs font-bold shadow-sm"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>+ Solicitação Futura</span>
            </button>

            <div className={`flex p-1 rounded-lg border ${tema === 'dark' ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'}`}>
              <button
                onClick={() => setModoVisao('SEMANA')}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded ${
                  modoVisao === 'SEMANA' ? 'bg-blue-600 text-white' : 'text-slate-500'
                }`}
              >
                <LayoutGrid className="h-3 w-3" />
                Semana
              </button>
              <button
                onClick={() => setModoVisao('DIA')}
                className={`flex items-center gap-1 px-2 py-0.5 text-xs font-bold rounded ${
                  modoVisao === 'DIA' ? 'bg-blue-600 text-white' : 'text-slate-500'
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                Por Dia
              </button>
            </div>
          </div>

        </div>
      </div>

      {mensagensDoTecnico.length > 0 && (
        <div className="max-w-7xl w-full mx-auto px-4 mt-3">
          <div className="bg-blue-900 border border-blue-500/50 rounded-xl p-3 flex items-center justify-between gap-3 shadow-lg text-white">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-300 animate-pulse" />
              <div>
                <p className="text-xs font-bold">Você tem {mensagensDoTecnico.length} avisos do supervisor:</p>
                <p className="text-xs text-blue-100 mt-0.5">{mensagensDoTecnico[0].conteudo}</p>
              </div>
            </div>
            <button
              onClick={() => marcarMensagemLida(mensagensDoTecnico[0].id)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-lg whitespace-nowrap"
            >
              OK, Entendi
            </button>
          </div>
        </div>
      )}

      {/* KPIS */}
      <section className="max-w-7xl w-full mx-auto px-4 mt-3">
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          
          <div className={`${bgCard} border-l-4 border-blue-500 rounded-xl p-3 flex items-center justify-between`}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Ordens Totais</p>
              <p className="text-xl sm:text-2xl font-black mt-0.5">{kpiOrdens}</p>
            </div>
            <div className="bg-blue-500/10 p-2 rounded-lg text-blue-500 border border-blue-500/20">
              <Wrench className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <div className={`${bgCard} border-l-4 border-amber-500 rounded-xl p-3 flex items-center justify-between`}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Horas Programadas</p>
              <p className="text-xl sm:text-2xl font-black text-amber-500 mt-0.5">{kpiHoras.toFixed(1)} <span className="text-xs font-normal text-slate-400">hrs</span></p>
            </div>
            <div className="bg-amber-500/10 p-2 rounded-lg text-amber-500 border border-amber-500/20">
              <Clock className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
          </div>

          <div className={`${bgCard} border-l-4 border-emerald-500 rounded-xl p-3 flex items-center justify-between`}>
            <div>
              <p className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400">Dias Ativos</p>
              <p className="text-xl sm:text-2xl font-black text-emerald-500 mt-0.5">{kpiDiasAtivos} <span className="text-xs font-normal text-slate-400">dias</span></p>
            </div>
            <button 
              onClick={() => setModalNovaPendencia(true)}
              className="bg-emerald-500/10 hover:bg-emerald-500/20 p-2 rounded-lg text-emerald-500 border border-emerald-500/20 transition cursor-pointer"
              title="Abrir Agenda Colaborativa"
            >
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>

        </div>
      </section>

      {modoVisao === 'DIA' && (
        <nav className="max-w-7xl w-full mx-auto px-4 mt-3">
          <div className={`${bgCard} p-1.5 rounded-xl justify-between overflow-x-auto gap-1 flex`}>
            {DIAS_ORDEM.map(dia => {
              const count = ordensFiltradas.filter(o => o.dia_semana === dia).length
              const dataFormatada = mapaDatasDias[dia] || ''
              return (
                <button
                  key={dia}
                  onClick={() => setDiaAtivo(dia)}
                  className={`flex-1 min-w-[65px] py-2 px-1 rounded-lg flex flex-col items-center justify-center transition ${
                    diaAtivo === dia 
                      ? 'bg-blue-600 text-white font-bold shadow-md' 
                      : 'text-slate-400 hover:bg-slate-500/10'
                  }`}
                >
                  <span className="text-xs font-black">{dia}</span>
                  {dataFormatada && <span className="text-[9px] font-semibold opacity-80">{dataFormatada}</span>}
                  <span className={`text-[9px] px-1.5 py-0.2 mt-1 rounded-full ${
                    diaAtivo === dia ? 'bg-blue-900 text-blue-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                  }`}>
                    {count} OS
                  </span>
                </button>
              )
            })}
          </div>
        </nav>
      )}

      {/* CARDS */}
      <main className="max-w-7xl w-full mx-auto px-4 mt-3">
        {modoVisao === 'SEMANA' ? (
          <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
            {DIAS_ORDEM.map(dia => {
              const ordensDia = ordensFiltradas.filter(o => o.dia_semana === dia)
              const dataFormatada = mapaDatasDias[dia] || ''

              return (
                <div key={dia} className={`${bgCard} rounded-xl flex flex-col min-h-[500px]`}>
                  <div className={`p-2 border-b flex justify-between items-center rounded-t-xl ${tema === 'dark' ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-100'}`}>
                    <div>
                      <span className="text-xs font-black uppercase tracking-wider">{DIAS_NOMES[dia]}</span>
                      {dataFormatada && <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold ml-1">({dataFormatada})</span>}
                    </div>
                    <span className="text-[10px] bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold px-1.5 py-0.5 rounded-full">
                      {ordensDia.length}
                    </span>
                  </div>

                  <div className="p-2 space-y-2.5 flex-1 overflow-y-auto custom-scrollbar">
                    {ordensDia.map(os => (
                      <CartaoOS key={os.id} os={os} tema={tema} onToggle={alternarStatus} onComment={(o) => { setOsModal(o); setTextoComentario(o.comentarios || ''); }} />
                    ))}
                    {ordensDia.length === 0 && (
                      <div className="h-full flex items-center justify-center py-8">
                        <p className="text-[10px] text-slate-400 font-bold uppercase">Sem ordens</p>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="max-w-2xl mx-auto space-y-3">
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-wider mb-2">
              Ordens Programadas para {DIAS_NOMES[diaAtivo]} {mapaDatasDias[diaAtivo] ? `(${mapaDatasDias[diaAtivo]})` : ''} — Total: {ordensFiltradas.filter(o => o.dia_semana === diaAtivo).length}
            </h2>

            {ordensFiltradas.filter(o => o.dia_semana === diaAtivo).map(os => (
              <CartaoOS key={os.id} os={os} tema={tema} onToggle={alternarStatus} onComment={(o) => { setOsModal(o); setTextoComentario(o.comentarios || ''); }} />
            ))}

            {ordensFiltradas.filter(o => o.dia_semana === diaAtivo).length === 0 && (
              <div className={`${bgCard} p-8 text-center rounded-xl text-slate-500 text-xs font-bold`}>
                Nenhuma ordem de serviço programada para este dia.
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL COMENTÁRIOS */}
      {osModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${bgCard} rounded-xl max-w-md w-full p-5 shadow-2xl border`}>
            <div className="flex justify-between items-start mb-2">
              <div>
                <span className="text-xs font-black text-blue-600 dark:text-blue-400">WO {osModal.numero_os} {osModal.numero_operacao ? `• Op ${osModal.numero_operacao}` : ''}</span>
                <h3 className="text-sm font-bold leading-snug">{osModal.descricao}</h3>
              </div>
              <button onClick={() => setOsModal(null)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>
            
            <textarea
              rows={4}
              value={textoComentario}
              onChange={(e) => setTextoComentario(e.target.value)}
              placeholder="Digite o apontamento de campo, peças utilizadas ou pendências..."
              className={`w-full ${bgInput} rounded-lg p-3 text-xs focus:outline-none focus:border-blue-500 mb-4 resize-none`}
            />

            <div className="flex justify-end gap-2">
              <button onClick={() => setOsModal(null)} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
              <button onClick={salvarComentario} className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-lg shadow">Salvar Apontamento</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL SENHA */}
      {modalSenha.aberto && (
        <div className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className={`${bgCard} rounded-xl max-w-sm w-full p-5 border shadow-2xl`}>
            <div className="flex items-center gap-2 mb-3">
              <div className="bg-amber-500/20 text-amber-500 p-2 rounded-lg border border-amber-500/30">
                <Lock className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold leading-none">{modalSenha.titulo}</h3>
                <p className="text-[10px] text-slate-400 mt-1">Autorização de Segurança</p>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block mb-1">Senha de Autorização:</label>
              <input
                type="password"
                value={senhaInput}
                onChange={(e) => setSenhaInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && confirmarSenhaModal()}
                placeholder="Digite a senha..."
                className={`w-full ${bgInput} rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500`}
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2">
              <button 
                onClick={() => { setModalSenha({ aberto: false, titulo: '', senhaEsperada: '', acao: async () => {} }); setSenhaInput(''); }} 
                className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600"
              >
                Cancelar
              </button>
              <button 
                onClick={confirmarSenhaModal} 
                className="px-4 py-1.5 text-xs bg-amber-500 hover:bg-amber-400 font-black text-slate-950 rounded-lg shadow"
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL PENDÊNCIA */}
      {modalNovaPendencia && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${bgCard} rounded-xl max-w-md w-full p-5 border shadow-2xl`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-blue-500" />
                Nova Solicitação Futura
              </h3>
              <button onClick={() => setModalNovaPendencia(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Técnico Responsável:</label>
                <select
                  value={formPendencia.tecnico_responsavel}
                  onChange={(e) => setFormPendencia({ ...formPendencia, tecnico_responsavel: e.target.value })}
                  className={`w-full ${bgInput} rounded-lg p-2 font-bold text-blue-600 dark:text-blue-400`}
                >
                  <option value="">-- Selecione o Técnico --</option>
                  {tecnicosLista.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Tipo de Solicitação:</label>
                <select
                  value={formPendencia.tipo_pendencia}
                  onChange={(e) => setFormPendencia({ ...formPendencia, tipo_pendencia: e.target.value as any })}
                  className={`w-full ${bgInput} rounded-lg p-2 font-bold`}
                >
                  <option value="ATIVIDADE">🛠️ Atividade Preventiva / Corretiva</option>
                  <option value="FOLGA">🎂 Folga / Aniversário / Banco de Horas / Exame</option>
                  <option value="AVISO">📢 Aviso / Compromisso</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Data Proposta:</label>
                  <input
                    type="date"
                    value={formPendencia.data_proposta}
                    onChange={(e) => setFormPendencia({ ...formPendencia, data_proposta: e.target.value })}
                    className={`w-full ${bgInput} rounded-lg p-2 font-bold`}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Tempo Est. (Horas):</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formPendencia.tempo_estimado}
                    onChange={(e) => setFormPendencia({ ...formPendencia, tempo_estimado: parseFloat(e.target.value) || 1 })}
                    className={`w-full ${bgInput} rounded-lg p-2 font-bold`}
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">TAG do Equipamento (Opcional):</label>
                <input
                  type="text"
                  placeholder="Ex: BB-1101G"
                  value={formPendencia.tag_equipamento}
                  onChange={(e) => setFormPendencia({ ...formPendencia, tag_equipamento: e.target.value })}
                  className={`w-full ${bgInput} rounded-lg p-2 font-bold`}
                />
              </div>

              <div>
                <label className="text-[10px] font-extrabold text-slate-400 uppercase block mb-1">Descrição Detalhada:</label>
                <textarea
                  rows={3}
                  placeholder="Descreva a atividade, motivo da folga ou observação..."
                  value={formPendencia.descricao}
                  onChange={(e) => setFormPendencia({ ...formPendencia, descricao: e.target.value })}
                  className={`w-full ${bgInput} rounded-lg p-2 resize-none`}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setModalNovaPendencia(false)} className="px-3 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">Cancelar</button>
              <button onClick={salvarNovaPendencia} className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 font-black text-white rounded-lg shadow">Enviar Solicitação</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL GERENCIAR */}
      {modalGerenciarPendencias && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${bgCard} rounded-xl max-w-xl w-full p-5 border shadow-2xl max-h-[90vh] flex flex-col`}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-black flex items-center gap-1.5">
                <Bell className="h-4 w-4 text-amber-500" />
                Pendências Aguardando Aprovação ({pendenciasAguardando.length})
              </h3>
              <button onClick={() => setModalGerenciarPendencias(false)} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {pendenciasAguardando.map(p => (
                <div key={p.id} className={`p-3 border rounded-xl space-y-2 ${tema === 'dark' ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-400 px-2 py-0.5 rounded border border-blue-300 dark:border-blue-800/40">
                        {p.tipo_pendencia}
                      </span>
                      <p className="text-xs font-black mt-1">👤 {p.tecnico_responsavel} • Área: {p.area_linha}</p>
                      <p className="text-xs opacity-90 mt-0.5">{p.descricao}</p>
                      {p.tag_equipamento && <p className="text-[10px] text-amber-500 font-bold">TAG: {p.tag_equipamento}</p>}
                    </div>
                    <span className="text-[10px] font-bold text-slate-400">{p.data_proposta} ({p.tempo_estimado}h)</span>
                  </div>

                  {pendenciaAvaliando?.id === p.id ? (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          placeholder="Nº da OS Gerada (Opcional)"
                          value={osAprovacao}
                          onChange={(e) => setOsAprovacao(e.target.value)}
                          className={`w-full ${bgInput} rounded p-1.5 text-xs`}
                        />
                        <input
                          type="text"
                          placeholder="Justificativa (rejeição)"
                          value={justificativaRejeicao}
                          onChange={(e) => setJustificativaRejeicao(e.target.value)}
                          className={`w-full ${bgInput} rounded p-1.5 text-xs`}
                        />
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => processarPendencia('APROVAR')} className="bg-emerald-600 text-white text-[10px] font-black px-3 py-1 rounded">✅ Aprovar</button>
                        <button onClick={() => processarPendencia('REPROGRAMAR')} className="bg-amber-600 text-white text-[10px] font-black px-3 py-1 rounded">🔄 Reprogramar</button>
                        <button onClick={() => processarPendencia('REJEITAR')} className="bg-rose-600 text-white text-[10px] font-black px-3 py-1 rounded">❌ Rejeitar</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end pt-1">
                      <button 
                        onClick={() => setPendenciaAvaliando(p)}
                        className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold px-3 py-1 rounded"
                      >
                        Avaliar esta Pendência
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-slate-800 mt-2">
              <button onClick={() => setModalGerenciarPendencias(false)} className="px-4 py-1.5 text-xs font-bold text-slate-400 hover:text-slate-600">Fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function CartaoOS({ os, tema, onToggle, onComment }: { os: OS, tema: 'dark' | 'light', onToggle: (os: OS) => void, onComment: (os: OS) => void }) {
  const statusColor = 
    os.status === 'CONCLUIDO' 
      ? (tema === 'dark' ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400' : 'border-emerald-500 bg-emerald-50 text-emerald-800') :
    os.status === 'REPROGRAMADA' 
      ? (tema === 'dark' ? 'border-rose-500/50 bg-rose-950/20 text-rose-400' : 'border-rose-500 bg-rose-50 text-rose-800') :
      (tema === 'dark' ? 'border-amber-500/50 bg-amber-950/20 text-amber-400' : 'border-amber-500 bg-amber-50 text-amber-800')

  const discResumo = 
    os.disciplina === 'ELETRICA_AUTOMACAO' ? 'ELÉTRICA/AUT.' :
    os.disciplina === 'MECANICA' ? 'MECÂNICA' : 'TERCEIROS'

  return (
    <div className={`border rounded-xl p-3 shadow-sm flex flex-col justify-between gap-2 transition-all ${statusColor}`}>
      <div>
        <div className="flex items-center justify-between gap-1 mb-1.5 overflow-hidden">
          <span className="text-xs sm:text-sm font-black text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-950/90 px-2 py-0.5 rounded border border-blue-300 dark:border-blue-800/60 tracking-wider whitespace-nowrap overflow-hidden text-ellipsis">
            WO {os.numero_os} {os.numero_operacao ? `• Op ${os.numero_operacao}` : ''}
          </span>
          <span className="text-[9px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
            {discResumo}
          </span>
        </div>

        <p className="text-xs font-extrabold text-slate-800 dark:text-slate-100 truncate">{os.area_linha || os.area}</p>
        <p className="text-xs text-slate-700 dark:text-slate-300 leading-snug line-clamp-2 mt-0.5">{os.descricao}</p>
        {os.sub_operacao && <p className="text-[10px] text-slate-500 italic truncate mt-0.5">Op: {os.sub_operacao}</p>}
      </div>

      <div className="pt-2 border-t border-slate-300 dark:border-slate-800/80 flex flex-col gap-1.5">
        <div className="flex justify-between items-center text-[10px] text-slate-500 dark:text-slate-400">
          <span className="font-bold text-slate-800 dark:text-slate-300 truncate max-w-[130px]">👤 {os.tecnico_nome}</span>
          <span className="flex items-center gap-1 font-black text-amber-600 dark:text-amber-400"><Clock className="h-3 w-3" />{os.tempo_estimado}h</span>
        </div>

        <div className="flex items-center justify-between gap-1.5">
          <button
            onClick={() => onToggle(os)}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-black py-1.5 px-2 rounded-lg transition shadow-sm ${
              os.status === 'CONCLUIDO' ? 'bg-emerald-600 text-white' :
              os.status === 'REPROGRAMADA' ? 'bg-rose-600 text-white' :
              'bg-amber-600 text-white'
            }`}
          >
            {os.status === 'CONCLUIDO' && <CheckCircle2 className="h-3.5 w-3.5" />}
            {os.status === 'REPROGRAMADA' && <AlertCircle className="h-3.5 w-3.5" />}
            {os.status === 'EM_ANDAMENTO' && <Clock3 className="h-3.5 w-3.5" />}
            <span>{os.status.replace('_', ' ')}</span>
          </button>

          <button
            onClick={() => onComment(os)}
            className="p-1.5 rounded-lg text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700"
            title="Adicionar Apontamento / Comentário"
          >
            <MessageSquare className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
