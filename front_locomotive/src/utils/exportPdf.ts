export interface PrintReportMetaItem {
  label: string
  value: string
}

export interface PrintReportSection {
  title: string
  html: string
}

interface PrintReportOptions {
  title: string
  subtitle?: string
  meta?: PrintReportMetaItem[]
  sections: PrintReportSection[]
}

export function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function buildReportHtml({
  title,
  subtitle,
  meta = [],
  sections,
}: PrintReportOptions) {
  const metaMarkup =
    meta.length === 0
      ? ''
      : `
        <dl class="meta-grid">
          ${meta
            .map(
              (item) => `
                <div class="meta-card">
                  <dt>${escapeHtml(item.label)}</dt>
                  <dd>${escapeHtml(item.value)}</dd>
                </div>
              `
            )
            .join('')}
        </dl>
      `

  const sectionsMarkup = sections
    .map(
      (section) => `
        <section class="section">
          <h2>${escapeHtml(section.title)}</h2>
          ${section.html}
        </section>
      `
    )
    .join('')

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --text: #0f172a;
        --muted: #475569;
        --line: #cbd5e1;
        --line-strong: #94a3b8;
        --panel: #f8fafc;
        --critical: #b91c1c;
        --warning: #b45309;
        --info: #1d4ed8;
      }

      * {
        box-sizing: border-box;
      }

      @page {
        margin: 14mm;
      }

      body {
        margin: 0;
        color: var(--text);
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        background: white;
      }

      main {
        display: flex;
        flex-direction: column;
        gap: 18px;
      }

      header {
        border-bottom: 2px solid var(--line-strong);
        padding-bottom: 14px;
      }

      h1,
      h2,
      h3,
      p {
        margin: 0;
      }

      h1 {
        font-size: 26px;
        font-weight: 700;
      }

      .subtitle {
        margin-top: 6px;
        color: var(--muted);
        font-size: 14px;
      }

      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 10px;
        margin-top: 16px;
      }

      .meta-card {
        padding: 12px;
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 10px;
      }

      .meta-card dt {
        color: var(--muted);
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .meta-card dd {
        margin: 6px 0 0;
        font-size: 15px;
        font-weight: 600;
      }

      .section {
        break-inside: avoid;
      }

      .section h2 {
        margin-bottom: 10px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th,
      td {
        padding: 8px 10px;
        border: 1px solid var(--line);
        vertical-align: top;
        text-align: left;
        font-size: 12px;
      }

      th {
        background: var(--panel);
        font-weight: 700;
      }

      .empty-state {
        padding: 14px;
        border: 1px dashed var(--line-strong);
        border-radius: 10px;
        color: var(--muted);
        font-size: 13px;
      }

      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
        gap: 10px;
        margin-bottom: 12px;
      }

      .summary-pill {
        padding: 10px 12px;
        border-radius: 999px;
        border: 1px solid var(--line);
        background: var(--panel);
        font-size: 12px;
        font-weight: 600;
      }

      .severity-critical {
        color: var(--critical);
      }

      .severity-warning {
        color: var(--warning);
      }

      .severity-info {
        color: var(--info);
      }

      .muted {
        color: var(--muted);
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(title)}</h1>
        ${subtitle ? `<p class="subtitle">${escapeHtml(subtitle)}</p>` : ''}
        ${metaMarkup}
      </header>
      ${sectionsMarkup}
    </main>
  </body>
</html>`
}

export async function printReport(options: PrintReportOptions) {
  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.style.opacity = '0'
  iframe.style.pointerEvents = 'none'

  document.body.append(iframe)

  const cleanup = () => {
    window.clearTimeout(fallbackCleanupId)
    iframe.remove()
  }

  const fallbackCleanupId = window.setTimeout(cleanup, 60_000)
  const printWindow = iframe.contentWindow

  if (!printWindow) {
    cleanup()
    throw new Error('Unable to prepare the print report.')
  }

  printWindow.document.open()
  printWindow.document.write(buildReportHtml(options))
  printWindow.document.close()

  await new Promise<void>((resolve) => {
    iframe.onload = () => resolve()
    window.setTimeout(resolve, 250)
  })

  printWindow.addEventListener(
    'afterprint',
    () => {
      cleanup()
    },
    { once: true }
  )

  printWindow.focus()
  printWindow.print()
}
