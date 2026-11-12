/** Pixel-Art-Sprites als Zeichen-Raster. '.' = transparent, jedes andere Zeichen wird über `colors` eingefärbt. */
export interface PixelSprite {
  grid: readonly string[]
  colors: Record<string, string>
}

export const GEAR: PixelSprite = {
  grid: [
    '.....XXX.....',
    '..X..XXX..X..',
    '.XXXXXXXXXXX.',
    '..XXXXXXXXX..',
    '..XXX...XXX..',
    'XXXX.....XXXX',
    'XXXX.....XXXX',
    'XXXX.....XXXX',
    '..XXX...XXX..',
    '..XXXXXXXXX..',
    '.XXXXXXXXXXX.',
    '..X..XXX..X..',
    '.....XXX.....',
  ],
  colors: { X: '#2f3833' },
}

export const PLUS: PixelSprite = {
  grid: [
    '...XXX...',
    '...XXX...',
    '...XXX...',
    'XXXXXXXXX',
    'XXXXXXXXX',
    'XXXXXXXXX',
    '...XXX...',
    '...XXX...',
    '...XXX...',
  ],
  colors: { X: '#2f3833' },
}

export const FLAME: PixelSprite = {
  grid: [
    '....o....',
    '...oo....',
    '...ooo...',
    '..oooo.o.',
    '..ooooooo',
    '.oooyoooo',
    '.ooyyyooo',
    'oooyyyyoo',
    'ooyyyyyoo',
    '.oyyyyyo.',
    '..ooooo..',
  ],
  colors: { o: '#d0663a', y: '#efc35c' },
}

export const PLAY: PixelSprite = {
  grid: ['X......', 'XXX....', 'XXXXX..', 'XXXXXXX', 'XXXXX..', 'XXX....', 'X......'],
  colors: { X: '#f4f2e8' },
}

export const HOURGLASS: PixelSprite = {
  grid: ['XXXXXXX', '.X...X.', '.XoooX.', '..XoX..', '...X...', '..X.X..', '.X.o.X.', '.XoooX.', 'XXXXXXX'],
  colors: { X: '#2f3833', o: '#c9a25a' },
}

export const CHECK: PixelSprite = {
  grid: ['........X', '.......XX', 'X.....XX.', 'XX...XX..', '.XX.XX...', '..XXX....', '...X.....'],
  colors: { X: '#2f3833' },
}

export const PAUSE: PixelSprite = {
  grid: ['XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX', 'XX.XX'],
  colors: { X: '#2f3833' },
}

export const CLOSE: PixelSprite = {
  grid: ['XX...XX', 'XXX.XXX', '.XXXXX.', '..XXX..', '.XXXXX.', 'XXX.XXX', 'XX...XX'],
  colors: { X: '#2f3833' },
}

export const SKIP: PixelSprite = {
  grid: ['X...X..X', 'XX..XX.X', 'XXX.XXXX', 'XXXXXXXX', 'XXX.XXXX', 'XX..XX.X', 'X...X..X'],
  colors: { X: '#2f3833' },
}

/** Großer Haken für die Fokus-Checkbox. */
export const CHECK_BIG: PixelSprite = {
  grid: [
    '..........XX',
    '.........XXX',
    '........XXX.',
    'XX.....XXX..',
    'XXX...XXX...',
    '.XXX.XXX....',
    '..XXXXX.....',
    '...XXX......',
    '....X.......',
  ],
  colors: { X: '#3f5a33' },
}

export const TROPHY: PixelSprite = {
  grid: [
    '.ooooooooo.',
    'oyyyyyyyyyo',
    'oyhyyyyyyyo',
    'yoyhyyyyyoy',
    'y.oyyyyyo.y',
    '.y.oyyyo.y.',
    '....oyo....',
    '.....y.....',
    '....oyo....',
    '...ooooo...',
    '..ddddddd..',
  ],
  colors: { o: '#b48c3c', y: '#ddb457', h: '#f3d98f', d: '#5f695d' },
}

/** Warndreieck; für "schlecht" mit Ziegel-Farben überschreiben. */
export const WARN: PixelSprite = {
  grid: ['....o....', '...oyo...', '..oyoyo..', '..oyoyo..', '.oyyoyyo.', '.oyyyyyo.', 'oyyyoyyyo', 'ooooooooo'],
  colors: { o: '#7a3e2c', y: '#ecc35c' },
}

/** Bleistift für "Bearbeiten"; Radiergummi in Ziegelrot. */
export const PENCIL: PixelSprite = {
  grid: [
    '.......oo',
    '......ooo',
    '.....Xoo.',
    '....XXX..',
    '...XXX...',
    '..XXX....',
    '.XXX.....',
    '.XX......',
    'X........',
  ],
  colors: { X: '#2f3833', o: '#c9633a' },
}

/** Pfeil nach oben; andere Richtungen per CSS-Rotation. */
export const ARROW: PixelSprite = {
  grid: ['...X...', '..XXX..', '.XXXXX.', 'XXXXXXX', '..XXX..', '..XXX..', '..XXX..'],
  colors: { X: '#2f3833' },
}

/** Vorhängeschloss: Turm pausiert. */
export const LOCK: PixelSprite = {
  grid: ['..ooooo..', '.oo...oo.', '.o.....o.', '.o.....o.', 'ooooooooo', 'oyyyyyyyo', 'oyyyoyyyo', 'oyyyoyyyo', 'oyyyyyyyo', 'ooooooooo'],
  colors: { o: '#2f3833', y: '#ddb457' },
}

/** Kleiner Schutthaufen für Listen und Hinweise. */
export const RUBBLE: PixelSprite = {
  grid: ['....oo.....', '...oyyo....', '...oyyo.oo.', '.oo.oo.oyyo', 'oyyo..o.oo.', 'oyyooyyo...', '.oo.oyyooo.', 'ooooooooooo'],
  colors: { o: '#5f695d', y: '#a2a298' },
}

export const GLOBE: PixelSprite = {
  grid: [
    '...XXXXX...',
    '.XX..X..XX.',
    '.X..X.X..X.',
    'X...X.X...X',
    'XXXXXXXXXXX',
    'X..X...X..X',
    'XXXXXXXXXXX',
    'X...X.X...X',
    '.X..X.X..X.',
    '.XX..X..XX.',
    '...XXXXX...',
  ],
  colors: { X: '#2f3833' },
}

export const OCTOCAT: PixelSprite = {
  grid: [
    '..X.....X..',
    '..XX...XX..',
    '..XXXXXXX..',
    '.XXXXXXXXX.',
    '.XX.XXX.XX.',
    '.XX.XXX.XX.',
    '.XXXXXXXXX.',
    '..XXXXXXX..',
    'X...XXX....',
    '.XX.XXX....',
    '...XXXX....',
  ],
  colors: { X: '#2f3833' },
}

export const GAMEPAD: PixelSprite = {
  grid: [
    '.XX.....XX.',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    'XX..XXX..XX',
    'XX..XXX..XX',
    'XXXXXXXXXXX',
    'XXXXXXXXXXX',
    '.XX.....XX.',
  ],
  colors: { X: '#2f3833' },
}

export const COFFEE: PixelSprite = {
  grid: [
    'XXXXXXXXX..',
    'XWWWWWWWXXX',
    'XWRRWRRWX.X',
    'XWRRRRRWX.X',
    'XWWRRRWWXXX',
    'XWWWRWWWX..',
    '.XWWWWWX...',
    '..XXXXX....',
  ],
  colors: { X: '#2f3833', W: '#f4f2e8', R: '#d0663a' },
}
