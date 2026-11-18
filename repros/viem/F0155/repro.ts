// F0155: viem 2.58.0. DecodeAbiParameters moves the cursor to the head of each
// parameter only when that head is inside the data
// (utils/abi/decodeAbiParameters.ts:82). After a top-level dynamic parameter,
// the cursor is left at staticPosition + 32 = 32 (line 517 for strings), not
// after that parameter's own head. So when the data ends before the head of a
// later static parameter, that parameter is read from byte 32 (the head of the
// second parameter) instead of failing with a bounds error.
import { decodeAbiParameters } from 'viem'

const word = (n: number) => n.toString(16).padStart(64, '0')

// Four heads are needed (128 bytes). The data has only three (96 bytes).
// head 0: 3 (also used as the string length), head 1: 0x77, head 2: string
// offset 0 (the string's length word is head 0). Head 3 is missing.
const data = `0x${word(3)}${word(0x77)}${word(0)}` as const
const params = [
  { type: 'uint256' },
  { type: 'uint256' },
  { type: 'string' },
  { type: 'uint256' },
] as const

let result: string
try {
  const values = decodeAbiParameters(params, data)
  result = `decoded ${JSON.stringify(values, (_, v) => (typeof v === 'bigint' ? `${v}n` : v))}`
} catch (e) {
  result = `threw ${(e as Error).name}`
}
console.log('data size: 96 bytes, heads needed: 128 bytes')
console.log(result)

// Correct: a bounds error, because the head of the 4th parameter is missing.
const bug = result.startsWith('decoded')
console.log(bug ? 'BUG PRESENT' : 'BUG ABSENT')
process.exit(bug ? 1 : 0)
