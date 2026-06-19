import { Navbar } from '@/components/cvitae/Navbar'
import { Footer } from '@/components/cvitae/Footer'

interface SiteShellProps {
  children: React.ReactNode
  /** Pass true on pages where the hero extends to the very top (Navbar is transparent).
   *  Defaults to true — most public pages use a full-bleed hero under the fixed nav. */
  fullBleed?: boolean
}

export function SiteShell({ children, fullBleed = true }: SiteShellProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className={`flex-1 ${fullBleed ? '' : 'pt-24'}`}>
        {children}
      </main>
      <Footer />
    </div>
  )
}
