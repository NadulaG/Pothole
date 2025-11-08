export default function Legend({ gradient }) {
  const stops = Object.entries(gradient || {}).sort((a, b) => Number(a[0]) - Number(b[0]))
  const gradientCss = `linear-gradient(to right, ${stops
    .map(([k, color]) => `${color} ${(Number(k) * 100).toFixed(0)}%`)
    .join(', ')})`

  return (
    <div className="absolute left-4 bottom-4 w-56 rounded-lg border border-stone-700 bg-black/50 backdrop-blur p-2 z-[1000] pointer-events-none">
      <div className="text-sm text-stone-200 mb-1">Intensity</div>
      <div className="h-2 rounded-full" style={{ backgroundImage: gradientCss }} />
      <div className="flex justify-between text-xs text-stone-400 mt-1">
        <span>Low</span>
        <span>High</span>
      </div>
    </div>
  )
}