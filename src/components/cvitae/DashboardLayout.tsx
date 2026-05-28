import { ReactNode } from 'react'
import { CareerLayout } from '@/layouts/CareerLayout'

interface DashboardLayoutProps {
  children: ReactNode
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return <CareerLayout>{children}</CareerLayout>
}
