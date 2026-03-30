export default function FixationCross({ visible }: { visible: boolean }) {
  if (!visible) return <div className="experiment-blank" />
  return <div className="fixation-cross">+</div>
}
