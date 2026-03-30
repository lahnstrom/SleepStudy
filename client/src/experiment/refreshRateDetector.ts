export function detectRefreshRate(samples = 120): Promise<{ refreshRate: number; frameInterval: number }> {
  return new Promise((resolve) => {
    const timestamps: number[] = []
    let count = 0

    function tick(ts: number) {
      timestamps.push(ts)
      count++
      if (count < samples) {
        requestAnimationFrame(tick)
      } else {
        const deltas: number[] = []
        for (let i = 1; i < timestamps.length; i++) {
          deltas.push(timestamps[i] - timestamps[i - 1])
        }
        deltas.sort((a, b) => a - b)
        const median = deltas[Math.floor(deltas.length / 2)]
        resolve({
          refreshRate: Math.round(1000 / median),
          frameInterval: median,
        })
      }
    }

    requestAnimationFrame(tick)
  })
}
