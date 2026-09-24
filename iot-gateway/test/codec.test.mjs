import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, encode, planReads, address } from '../src/codec.mjs';

test('every datatype round-trips in both word orders', () => {
  const cases = { int16: -1234, uint16: 65000, int32: -123456789, uint32: 4000000000, float32: 230.5, int64: 1234567890123, uint64: 9007199254740991, float64: 3.14159265358979, bool: 1 };
  for (const [type, v] of Object.entries(cases)) {
    for (const order of ['big', 'little']) {
      assert.equal(decode(encode(v, type, order), type, order), v, `${type}/${order}`);
    }
  }
});

test('float32 230.5 V is 0x4366 0x8000 in Modbus (big-endian) order', () => {
  assert.deepEqual(encode(230.5, 'float32'), [0x4366, 0x8000]);
  assert.deepEqual(encode(230.5, 'float32', 'little'), [0x8000, 0x4366]);
});

test('register-table addresses are converted from 1-based', () => {
  assert.equal(address({ address: 3000, one_based: true }), 2999);
  assert.equal(address({ address: 3000 }), 3000);
  assert.throws(() => address({ address: 70000 }));
});

test('nearby registers are read together; distant ones separately; types never mixed', () => {
  const p = (key, register_type, a, datatype = 'float32') => ({ key, source: { register_type, address: a, datatype } });
  const plans = planReads([p('a', 'holding', 3000), p('b', 'holding', 3002), p('c', 'holding', 3028), p('d', 'holding', 3204, 'int64'), p('e', 'input', 10, 'uint16')]);
  const holding = plans.filter((x) => x.type === 'holding').map((x) => [x.start, x.length]);
  assert.deepEqual(holding, [[3000, 4], [3028, 2], [3204, 4]]);
  assert.deepEqual(plans.filter((x) => x.type === 'input').map((x) => [x.start, x.length]), [[10, 1]]);
});
