type Props = {
  tipo: 'erro' | 'sucesso' | 'info'
  children: React.ReactNode
}

export function Aviso({ tipo, children }: Props) {
  return (
    <div className={`aviso ${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}>
      {children}
    </div>
  )
}
