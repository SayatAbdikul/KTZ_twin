import { APP_CONFIG } from '@/config/app.config'

interface DownloadCsvOptions {
  path: string
  baseUrl?: string
  params?: Record<string, string | number | boolean>
  fallbackFilename?: string
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, string | number | boolean>
) {
  const url = new URL(path, baseUrl)
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }
  }
  return url.toString()
}

function getDownloadFilename(contentDisposition: string | null, fallbackFilename: string) {
  if (!contentDisposition) {
    return fallbackFilename
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const simpleMatch = contentDisposition.match(/filename="?([^";]+)"?/i)
  return simpleMatch?.[1] ?? fallbackFilename
}

export async function downloadCsv({
  path,
  baseUrl = APP_CONFIG.API_BASE_URL,
  params,
  fallbackFilename = 'export.csv',
}: DownloadCsvOptions) {
  const headers = new Headers()
  headers.set('Accept', 'text/csv')

  if (APP_CONFIG.API_KEY) {
    headers.set('X-API-Key', APP_CONFIG.API_KEY)
  }

  const response = await fetch(buildUrl(baseUrl, path, params), {
    method: 'GET',
    headers,
  })

  if (!response.ok) {
    const errorPayload = await response
      .json()
      .catch(() => ({ error: { message: 'Failed to export CSV.' } }))
    throw new Error(
      errorPayload?.error?.message ?? errorPayload?.message ?? 'Failed to export CSV.'
    )
  }

  const blob = await response.blob()
  const filename = getDownloadFilename(
    response.headers.get('Content-Disposition'),
    fallbackFilename
  )
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')

  link.href = objectUrl
  link.download = filename
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl)
  }, 0)

  return filename
}
