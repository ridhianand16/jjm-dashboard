import { memo, useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw, Info } from 'lucide-react'
import { BASELINE_YEAR, PRESENT_YEAR, SPAN, yearToT, isInterpolated, LAST_REAL_T, LAST_REAL_YEAR } from '../lib/timeseries'

interface TimelinePlaybackProps {
  t: number // 0..1
  onChange: (t: number) => void
  playing: boolean
  onPlayingChange: (p: boolean) => void
}

const PLAYBACK_MS = 6000 // full 2019→present sweep duration
const REAL_TICKS = [2019, 2020, 2021] as const

/** Convert timeline position to a human label (interpolated month/year). */
function labelFor(t: number): string {
  const monthsTotal = SPAN * 12
  const m = Math.round(t * monthsTotal)
  const year = BASELINE_YEAR + Math.floor(m / 12)
  const month = m % 12
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${MONTHS[month]} ${year}`
}

export const TimelinePlayback = memo(function TimelinePlayback({
  t,
  onChange,
  playing,
  onPlayingChange,
}: TimelinePlaybackProps) {
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const originRef = useRef<number>(t)
  const [showInfo, setShowInfo] = useState(false)

  // Animation loop
  useEffect(() => {
    if (!playing) return
    startRef.current = performance.now()
    originRef.current = t >= 1 ? 0 : t

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const next = Math.min(1, originRef.current + elapsed / PLAYBACK_MS)
      onChange(next)
      if (next >= 1) {
        onPlayingChange(false)
        return
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing])

  const pct = t * 100
  const modeled = isInterpolated(t)

  /** Pause and snap the playhead to a real reported snapshot. */
  const snapTo = (year: number) => {
    onPlayingChange(false)
    onChange(yearToT(year))
  }

  return (
    <div className="glass flex items-center gap-4 rounded-xl px-4 py-3">
      {/* Play / pause */}
      <button
        onClick={() => onPlayingChange(!playing)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/90 text-white glow-indigo transition-transform hover:scale-105"
        title={playing ? 'Pause' : 'Play rollout'}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>

      <button
        onClick={() => {
          onPlayingChange(false)
          onChange(0)
        }}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-800/60 text-zinc-400 transition-colors hover:text-zinc-200"
        title="Reset to 2019"
      >
        <RotateCcw className="h-4 w-4" />
      </button>

      {/* Endpoints + slider */}
      <button onClick={() => snapTo(BASELINE_YEAR)} className="nums w-10 shrink-0 text-left text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-300" title="Jump to 2019 baseline">
        {BASELINE_YEAR}
      </button>
      <div className="relative flex-1 py-3">
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={t}
          aria-label="Rollout timeline position"
          onChange={(e) => {
            onPlayingChange(false)
            onChange(parseFloat(e.target.value))
          }}
          className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
        />
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800/70">
          <div
            className="h-full rounded-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-500 transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
          {/* Modeled tail (2021 → present): hatch overlaid on top of the fill to
              keep the interpolated span visually de-emphasised / clearly "not reported". */}
          <div
            className="pointer-events-none absolute inset-y-0 opacity-60"
            style={{
              left: `${LAST_REAL_T * 100}%`,
              right: 0,
              backgroundImage:
                'repeating-linear-gradient(45deg, rgba(9,9,11,0.55) 0, rgba(9,9,11,0.55) 3px, transparent 3px, transparent 6px)',
            }}
          />
        </div>

        {/* Real snapshot ticks — clickable to snap to reported data */}
        {REAL_TICKS.map((yr) => (
          <button
            key={yr}
            onClick={() => snapTo(yr)}
            aria-label={`Jump to reported ${yr} snapshot`}
            className="group absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${yearToT(yr) * 100}%` }}
            title={`Reported ${yr}`}
          >
            <div className="h-2.5 w-0.5 rounded-full bg-emerald-300/70 transition-all group-hover:h-3.5 group-hover:bg-emerald-300" />
            <span className="nums absolute left-1/2 top-3 -translate-x-1/2 text-[9px] text-zinc-500 group-hover:text-emerald-300">{yr}</span>
          </button>
        ))}

        {/* Modeled-region label under the hatched tail */}
        <span
          className="pointer-events-none absolute top-3 text-[8px] font-medium uppercase tracking-wider text-amber-500/70"
          style={{ left: `${((LAST_REAL_T + 1) / 2) * 100}%`, transform: 'translateX(-50%)' }}
        >
          interpolated
        </span>

        {/* Thumb */}
        <div
          className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-zinc-950 transition-[left] duration-75 ${modeled ? 'border-amber-300 glow-indigo' : 'border-indigo-300 glow-indigo'}`}
          style={{ left: `${pct}%` }}
        />
      </div>
      <button onClick={() => snapTo(PRESENT_YEAR)} className="nums w-10 shrink-0 text-right text-xs font-semibold text-zinc-500 transition-colors hover:text-emerald-300" title="Jump to latest reported total">
        {PRESENT_YEAR}
      </button>

      {/* Current position label + honesty affordance */}
      <div className="relative w-28 shrink-0 text-right">
        <div className={`nums text-sm font-bold tracking-tight ${modeled ? 'text-amber-300' : 'text-indigo-300'}`}>{labelFor(t)}</div>
        {modeled ? (
          <button
            onClick={() => setShowInfo((s) => !s)}
            className="flex w-full items-center justify-end gap-1 text-[10px] font-medium uppercase tracking-widest text-amber-500/90 hover:text-amber-300"
            title="What does modeled mean?"
          >
            <Info className="h-2.5 w-2.5" /> modeled
          </button>
        ) : (
          <div className="text-[10px] uppercase tracking-widest text-emerald-500/70">reported</div>
        )}

        {showInfo && (
          <div className="animate-fade-slide absolute bottom-full right-0 z-50 mb-2 w-64 rounded-lg border border-amber-500/30 bg-zinc-950/95 p-3 text-left shadow-2xl backdrop-blur-xl">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-amber-300">
              <Info className="h-3 w-3" /> Modeled, not reported
            </div>
            <p className="text-[10px] leading-snug text-zinc-400">
              Only <span className="font-semibold text-emerald-300">2019, 2020, {LAST_REAL_YEAR}</span> and the latest total are officially reported.
              Any position in the {LAST_REAL_YEAR}→present span is a straight-line interpolation between those two knots — an estimate, not an observed figure.
            </p>
            <button onClick={() => snapTo(LAST_REAL_YEAR)} className="mt-2 w-full rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-500/20">
              Snap to last reported ({LAST_REAL_YEAR})
            </button>
          </div>
        )}
      </div>
    </div>
  )
})
