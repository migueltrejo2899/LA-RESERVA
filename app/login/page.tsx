import { login } from './actions'

export default function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="brand-mark w-14 h-14 rounded-md text-2xl mb-3" style={{ transform: 'rotate(-3deg)' }}>R</div>
          <h1 className="font-display text-3xl tracking-wide text-cratedark">LA RESERVA</h1>
          <div className="font-subtitle text-xs uppercase tracking-[0.2em] text-inksoft mt-1">Portal de trazabilidad</div>
        </div>
        <div className="card">
          <form action={login} className="field">
            <label>Usuario</label>
            <input type="text" name="username" placeholder="tu usuario" className="mb-4" autoFocus />
            <label>Contraseña</label>
            <input type="password" name="password" placeholder="••••••••" className="mb-4" />
            {searchParams.error && (
              <div className="text-stamp text-sm font-mono mb-4">{searchParams.error}</div>
            )}
            <button type="submit" className="btn w-full">Entrar</button>
          </form>
        </div>
      </div>
    </div>
  )
}
