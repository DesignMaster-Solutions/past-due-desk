// The desk's own look for AG Studio: same ink, lines and brand blue as the approval grid (public/index.html), so the
// board reads as part of Past Due Desk, not an embedded tool. Money that came back is green, money still out is blue,
// money the owner chose to forgive is amber, everywhere.
import { studioTheme } from 'ag-studio';

export const C = { ink: '#1d2433', muted: '#5b6475', line: '#dfe3ea', bg: '#f6f7f9', brand: '#0b5cad', ok: '#1d7a46', warn: '#a15c00', soft: '#e8f0fa' };
const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const SERIES = [C.ok, C.brand, C.warn, '#6b4fbb', '#0e8a8a', '#b8325e', '#7a869a', '#2f6f3e', '#4a7fc1', '#c98a2b'];

export const deskTheme = studioTheme.withParams({
  fontFamily: FONT,
  fontSize: 14,
  textColor: C.ink,
  foregroundColor: C.ink,
  subtleTextColor: C.muted,
  backgroundColor: '#fff',
  borderColor: C.line,
  accentColor: C.brand,
  iconColor: C.ink,
  rowHoverColor: C.soft,

  studioWrapperBorder: false,
  studioWrapperBorderRadius: 0,
  studioWrapperBackgroundColor: C.bg,
  studioCanvasBorder: false,
  studioCanvasShadow: false,
  studioCanvasBackgroundColor: C.bg,
  studioCanvasPadding: 16,
  studioCanvasRowHeight: 18,
  studioCanvasFontFamily: FONT,

  studioWidgetBackgroundColor: '#fff',
  studioWidgetBorder: { width: 1, color: C.line },
  studioWidgetBorderRadius: 10,
  studioWidgetPadding: 12,
  studioWidgetTitleFontFamily: FONT,
  studioWidgetTitleFontSize: 15,
  studioWidgetTitleFontWeight: 650,
  studioWidgetTitleTextColor: C.ink,
  studioWidgetSubtitleTextColor: C.muted,
  studioWidgetCaptionTextColor: C.muted,
  studioWidgetResizeBorderColor: C.brand,

  gridFontFamily: FONT,
  gridFontSize: 14,
  gridHeaderTextColor: C.muted,
  gridHeaderFontWeight: 600,
  gridRowHeight: 38,
  gridRowBorder: { width: 1, color: '#eef0f4' },
  gridWrapperBorder: false,

  chartFontFamily: FONT,
  chartTextColor: C.ink,
  chartSubtleTextColor: C.muted,
  chartAxisLineColor: C.line,
  chartGridLineColor: '#eef0f4',
  ...Object.fromEntries(SERIES.flatMap((c, i) => [[`chartPaletteFills${i + 1}Color`, c], [`chartPaletteStrokes${i + 1}Color`, c]])),
});
