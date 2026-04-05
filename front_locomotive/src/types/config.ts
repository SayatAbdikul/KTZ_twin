export interface ThresholdConfig {
    metrics: Record<string, Record<string, number | null>>
    penalties: {
        warning: number
        critical: number
    }
    healthStatus: {
        normal: number
        degraded: number
        warning: number
    }
    edges: Record<string, number>
}
