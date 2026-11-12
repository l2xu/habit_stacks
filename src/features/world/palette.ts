import type { BlockColor } from '@/domain/types'

export interface FacePalette {
  top: string
  left: string
  right: string
  edge: string
  text: string
}

/** Gedeckte Pastell-Töne; Licht kommt von oben links (top > left > right). */
export const BLOCK_PALETTE: Record<BlockColor, FacePalette> = {
  slate: { top: '#7f8b90', left: '#606c72', right: '#4e585e', edge: '#3a4247', text: '#e8ede4' },
  sky: { top: '#b6c9d2', left: '#94adba', right: '#7b95a3', edge: '#5d7584', text: '#26343c' },
  mustard: { top: '#ecd08a', left: '#d9b263', right: '#bf974c', edge: '#94743a', text: '#3a2d1c' },
  terracotta: { top: '#d48a6c', left: '#ba664a', right: '#9e533b', edge: '#7a3e2c', text: '#f7ebe2' },
  cream: { top: '#f8f6ef', left: '#e9e6da', right: '#d4d0c2', edge: '#aaa595', text: '#36362f' },
  sage: { top: '#bccda8', left: '#9cb18a', right: '#839973', edge: '#64775a', text: '#26331f' },
  lavender: { top: '#c8c1db', left: '#a9a1c3', right: '#9088ab', edge: '#6f6888', text: '#2a2638' },
  rose: { top: '#e7bab3', left: '#d39c94', right: '#ba827b', edge: '#93655f', text: '#3b2623' },
  teal: { top: '#a6c9c1', left: '#82aca3', right: '#6b938b', edge: '#51756e', text: '#1c312e' },
}

export const WORLD = {
  grassTop: '#adc082',
  grassTopAlt: '#a6b97b',
  grassLeft: '#8fa468',
  grassRight: '#7c9058',
  dirtLeft: '#9a7d5c',
  dirtRight: '#83684b',
  tuft: { top: '#91a867', left: '#7b9257', right: '#687c4a', edge: '#55663c', text: '#000' },
  stone: { top: '#bdbdb3', left: '#a2a298', right: '#8c8c83', edge: '#76766e', text: '#000' },
  cloud: { top: '#fbfcf8', left: '#e7ebe4', right: '#d4dad3', edge: '#c3cac2', text: '#000' },
  frog: { top: '#8eab68', left: '#769355', right: '#647d47', edge: '#4c6136', text: '#000' },
  leaf: { top: '#a3bb78', left: '#89a262', right: '#748b52', edge: '#5d7042', text: '#000' },
  leafDark: { top: '#87a265', left: '#718a53', right: '#5f7546', edge: '#4b5c37', text: '#000' },
  bush: { top: '#98b16f', left: '#7f9a5c', right: '#6c844e', edge: '#566a3e', text: '#000' },
  trunk: { top: '#9a7d5c', left: '#83684b', right: '#6f573e', edge: '#5a4632', text: '#000' },
  reed: { top: '#a9b26f', left: '#8f985b', right: '#7a824c', edge: '#626a3c', text: '#000' },
  cattail: { top: '#9a6f4c', left: '#835c3d', right: '#6f4d33', edge: '#5a3e28', text: '#000' },
  /** Meer und Teich */
  sea: '#a3c6c2',
  seaDeep: '#8fb7b4',
  seaHaze: '#dbe5d9',
  pond: '#9cc3bb',
  foam: '#f1f5ee',
  wave: '#cfe3dc',
  lily: '#88a65f',
  mustardDot: '#d9b263',
  eye: { top: '#f7f6ef', left: '#e4e2d8', right: '#cfccc0', edge: '#9d9a8e', text: '#000' },
  ink: '#2f3833',
  inkSoft: '#6b7568',
  /** Warnfarbe am wackelnden Geist (wie „Heute retten!“). */
  danger: '#b5532f',
} as const satisfies Record<string, string | FacePalette>
