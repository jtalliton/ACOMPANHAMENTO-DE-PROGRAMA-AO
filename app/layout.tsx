import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'PROGRAMAÇÃO SEMANAL PCM',
  description: 'Sistema de Acompanhamento e Gestão de Ordens de Serviço Semanal',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  )
}
