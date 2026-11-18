// F0156: viem 2.58.0. Trim(hex, { dir: 'right' }) removes trailing zero nibbles, not
// trailing zero bytes (utils/data/trim.ts). When the last byte has a zero low
// nibble (0x20, 0x30, ...), the result has odd length and is then padded on
// the left, which shifts every byte: a different value. The byte path is right.
import { bytesToHex, hexToBytes, trim } from 'viem'

const cases = ['0x1020', '0x1230', '0x12345600'] as const
let bug = false
for (const hex of cases) {
  const fromHex = trim(hex, { dir: 'right' })
  const fromBytes = bytesToHex(trim(hexToBytes(hex), { dir: 'right' }))
  console.log(`trim(${hex}, right): hex path ${fromHex}, byte path ${fromBytes}`)
  if (fromHex !== fromBytes) bug = true
}
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
