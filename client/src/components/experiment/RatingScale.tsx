interface RatingScaleProps {
  type: 'valence' | 'arousal'
}

const PROMPTS = {
  valence: 'How pleasant/unpleasant?',
  arousal: 'How calm/excited?',
}

const ANCHORS = {
  valence: { low: 'Unpleasant', high: 'Pleasant' },
  arousal: { low: 'Calm', high: 'Excited' },
}

export default function RatingScale({ type }: RatingScaleProps) {
  const anchors = ANCHORS[type]

  return (
    <div className="rating-container">
      <div className="rating-prompt">{PROMPTS[type]}</div>
      <div className="rating-scale">
        <span className="rating-anchor">{anchors.low}</span>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className="rating-key">{n}</span>
        ))}
        <span className="rating-anchor">{anchors.high}</span>
      </div>
    </div>
  )
}
