export interface ApiMeta {
  page?: number
  pageSize?: number
  total?: number
}

export interface ApiResponse<T> {
  data: T
  meta?: ApiMeta
  timestamp: number
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, unknown>
}
