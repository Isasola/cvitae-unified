import { Link } from 'wouter'
import { SiteShell } from '@/components/cv/SiteShell'

export default function NotFound() {
  return (
    <SiteShell>
      <main className="mx-auto flex min-h-[55vh] max-w-3xl items-center justify-center px-6 py-16">
        <section className="w-full border border-white/8 bg-white/[0.02] p-8 text-center sm:p-12" aria-labelledby="not-found-title">
          <p className="text-[10px] uppercase tracking-[0.2em] text-[#c9a84c]">Error 404</p>
          <h1 id="not-found-title" className="mt-3 font-display text-3xl text-cream sm:text-4xl">Página no encontrada</h1>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-white/50">La página que buscás no existe o ya no está disponible.</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className="inline-flex min-h-11 items-center justify-center rounded-full bg-[#c9a84c] px-5 text-sm font-medium text-black">Volver al inicio</Link>
            <Link href="/empleos" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 text-sm text-white/70 hover:border-white/25 hover:text-white">Ver empleos</Link>
            <Link href="/oportunidades" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/10 px-5 text-sm text-white/70 hover:border-white/25 hover:text-white">Ver oportunidades</Link>
          </div>
        </section>
      </main>
    </SiteShell>
  )
}
