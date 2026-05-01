interface RatingScaleProps {
  type: 'valence' | 'arousal'
  selected?: number | null
}

const PROMPTS = {
  valence: 'How unpleasant/pleasant?',
  arousal: 'How calm/excited?',
}

const ANCHORS = {
  valence: { low: 'Unpleasant', high: 'Pleasant' },
  arousal: { low: 'Calm', high: 'Excited' },
}

export default function RatingScale({ type, selected }: RatingScaleProps) {
  const anchors = ANCHORS[type]

  return (
    <div className="rating-container">
      <div className="rating-prompt">{PROMPTS[type]}</div>
      <div className="rating-scale">
        <span className="rating-anchor">{anchors.low}</span>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
          <span key={n} className={`rating-key${selected === n ? ' rating-key--selected' : ''}`}>{n}</span>
        ))}
        <span className="rating-anchor">{anchors.high}</span>
      </div>
    </div>
  )
}
