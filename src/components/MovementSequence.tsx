import { MOVEMENTS, type MovementId } from '../movements';
import { Icon } from './Icon';
import './MovementSequence.css';

export type SequenceStatus = 'upcoming' | 'current' | 'done' | 'correct' | 'wrong';

interface Props {
  items: MovementId[];
  /** Status per item; defaults to "upcoming". */
  status?: SequenceStatus[];
  size?: 'sm' | 'md';
}

/** Compact combination strip: ✓ done · → current · ○ upcoming. */
export function MovementSequence({ items, status = [], size = 'md' }: Props) {
  return (
    <ol className={`seq seq-${size}`}>
      {items.map((id, i) => {
        const st = status[i] ?? 'upcoming';
        return (
          <li key={i} className={`seq-item is-${st}`}>
            <span className="seq-mark">
              {st === 'done' || st === 'correct' ? (
                <Icon name="check" />
              ) : st === 'wrong' ? (
                <Icon name="close" />
              ) : (
                <Icon name={MOVEMENTS[id].icon} />
              )}
            </span>
            <span className="seq-label">{MOVEMENTS[id].short}</span>
          </li>
        );
      })}
    </ol>
  );
}
