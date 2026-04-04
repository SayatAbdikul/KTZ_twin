import { cn } from '@/utils/cn'

interface PageContainerProps {
  children: React.ReactNode
  className?: string
}

export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn('h-full p-4', className)}>
      {children}
    </div>
  )
}
