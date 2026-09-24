// Modbus register codec. Registers are 16-bit words; multi-word values are
// big-endian within each word, with word order "big" (high word first, the
// Modbus convention and the default) or "little" (low word first, used by
// some meters).

export const WORDS = {
  bool: 1, int16: 1, uint16: 1,
  int32: 2, uint32: 2, float32: 2,
  int64: 4, uint64: 4, float64: 4,
};

export function wordCount(datatype = 'uint16') {
  const n = WORDS[datatype];
  if (!n) throw new Error(`unknown datatype ${datatype}`);
  return n;
}

function toBuffer(words, wordOrder) {
  const ordered = wordOrder === 'little' ? [...words].reverse() : words;
  const buf = Buffer.alloc(ordered.length * 2);
  ordered.forEach((w, i) => buf.writeUInt16BE(w & 0xffff, i * 2));
  return buf;
}

/** @param {number[]} words  @returns {number} */
export function decode(words, datatype = 'uint16', wordOrder = 'big') {
  const n = wordCount(datatype);
  if (words.length < n) throw new Error(`need ${n} registers for ${datatype}, got ${words.length}`);
  const buf = toBuffer(words.slice(0, n), wordOrder);
  switch (datatype) {
    case 'bool': return buf.readUInt16BE(0) ? 1 : 0;
    case 'int16': return buf.readInt16BE(0);
    case 'uint16': return buf.readUInt16BE(0);
    case 'int32': return buf.readInt32BE(0);
    case 'uint32': return buf.readUInt32BE(0);
    case 'float32': return buf.readFloatBE(0);
    case 'int64': return Number(buf.readBigInt64BE(0));
    case 'uint64': return Number(buf.readBigUInt64BE(0));
    case 'float64': return buf.readDoubleBE(0);
  }
  throw new Error(`unknown datatype ${datatype}`);
}

/** @returns {number[]} words */
export function encode(value, datatype = 'uint16', wordOrder = 'big') {
  const n = wordCount(datatype);
  const buf = Buffer.alloc(n * 2);
  switch (datatype) {
    case 'bool': buf.writeUInt16BE(value ? 1 : 0, 0); break;
    case 'int16': buf.writeInt16BE(Math.round(value), 0); break;
    case 'uint16': buf.writeUInt16BE(Math.round(value), 0); break;
    case 'int32': buf.writeInt32BE(Math.round(value), 0); break;
    case 'uint32': buf.writeUInt32BE(Math.round(value), 0); break;
    case 'float32': buf.writeFloatBE(value, 0); break;
    case 'int64': buf.writeBigInt64BE(BigInt(Math.round(value)), 0); break;
    case 'uint64': buf.writeBigUInt64BE(BigInt(Math.round(value)), 0); break;
    case 'float64': buf.writeDoubleBE(value, 0); break;
    default: throw new Error(`unknown datatype ${datatype}`);
  }
  const words = [];
  for (let i = 0; i < n; i++) words.push(buf.readUInt16BE(i * 2));
  return wordOrder === 'little' ? words.reverse() : words;
}

// Protocol address (0-based) from a register-table address.
export function address(source) {
  const a = Number(source.address);
  if (!Number.isInteger(a) || a < 0 || a > 65535) throw new Error(`invalid register address ${source.address}`);
  return source.one_based ? a - 1 : a;
}

// Groups data points of one register type into as few reads as possible
// (contiguous or nearly so, at most 120 registers per request).
export function planReads(points, { maxGap = 10, maxLen = 120 } = {}) {
  const byType = new Map();
  for (const p of points) {
    const type = p.source.register_type ?? 'holding';
    const start = address(p.source);
    const len = type === 'coil' || type === 'discrete' ? 1 : wordCount(p.source.datatype ?? 'uint16');
    if (!byType.has(type)) byType.set(type, []);
    byType.get(type).push({ p, start, len });
  }
  const plans = [];
  for (const [type, items] of byType) {
    items.sort((a, b) => a.start - b.start);
    let cur = null;
    for (const it of items) {
      const end = it.start + it.len;
      if (cur && it.start - cur.end <= maxGap && end - cur.start <= maxLen) {
        cur.end = Math.max(cur.end, end);
        cur.items.push(it);
      } else {
        cur = { type, start: it.start, end, items: [it] };
        plans.push(cur);
      }
    }
  }
  return plans.map((pl) => ({ type: pl.type, start: pl.start, length: pl.end - pl.start, items: pl.items }));
}
