import type { ThemeMode } from '@/features/settings/useSettingsStore'

export interface ChartThemePalette {
  axis: string
  axisLabel: string
  critical: string
  currentMarker: string
  gaugeTrack: string
  info: string
  sliderBorder: string
  sliderFiller: string
  sliderHandle: string
  splitLine: string
  text: string
  tooltipBackground: string
  tooltipBorder: string
  warning: string
}

const DARK_PALETTE: ChartThemePalette = {
  axis: '#334155',
  axisLabel: '#64748b',
  critical: '#f87171',
  currentMarker: '#e2e8f0',
  gaugeTrack: '#1e2130',
  info: '#60a5fa',
  sliderBorder: '#334155',
  sliderFiller: 'rgba(96,165,250,0.15)',
  sliderHandle: '#60a5fa',
  splitLine: '#1e2130',
  text: '#e2e8f0',
  tooltipBackground: '#1e2130',
  tooltipBorder: '#334155',
  warning: '#fbbf24',
}

const LIGHT_PALETTE: ChartThemePalette = {
  axis: '#cfd8e3',
  axisLabel: '#647487',
  critical: '#c24135',
  currentMarker: '#162033',
  gaugeTrack: '#d9e4ee',
  info: '#2b67a3',
  sliderBorder: '#c8d4e0',
  sliderFiller: 'rgba(43,103,163,0.18)',
  sliderHandle: '#2b67a3',
  splitLine: '#dee6ef',
  text: '#162033',
  tooltipBackground: '#fdfefe',
  tooltipBorder: '#d4deea',
  warning: '#a86a10',
}

export function getChartTheme(theme: ThemeMode): ChartThemePalette {
  return theme === 'light' ? LIGHT_PALETTE : DARK_PALETTE
}
