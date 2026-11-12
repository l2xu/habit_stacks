import type { BlockColor } from '@/domain/types'
import { BlockThumb } from '@/features/world/BlockThumb'
import { BLOCK_COLORS, COLOR_NAMES } from './blockDraft'

/** Neun Blockfarben als Mini-Würfel; die gewählte liegt auf goldenem Grund. */
export function ColorPicker({ value, onChange }: { value: BlockColor; onChange: (color: BlockColor) => void }) {
  return (
    <div role="radiogroup" aria-label="Farbe" className="mt-1.5 grid grid-cols-9 gap-0.5">
      {BLOCK_COLORS.map((color) => {
        const active = color === value
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={COLOR_NAMES[color]}
            onClick={() => onChange(color)}
            className={`flex h-12 cursor-pointer items-center justify-center ${active ? 'px-frame px-gold' : 'focus-visible:outline-2 focus-visible:outline-focus'}`}
          >
            <BlockThumb color={color} size={34} />
          </button>
        )
      })}
    </div>
  )
}
