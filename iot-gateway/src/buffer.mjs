// Store-and-forward buffer: readings wait here until the platform accepts
// them, so a network outage loses nothing (up to `max` readings; the oldest
// are dropped first). With a file path the buffer survives restarts.
// Readings keep their original timestamps, and the platform stores a
// (device, metric, ts) reading once, so re-sending after a crash is safe.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';

export class ReadingBuffer {
  constructor({ max = 50000, file = null, log = () => {} } = {}) {
    this.max = max;
    this.file = file;
    this.log = log;
    this.items = [];
    this.dropped = 0;
    this.dirty = false;
    if (file) {
      try {
        this.items = JSON.parse(readFileSync(file, 'utf8'));
        if (this.items.length) log(`buffer: restored ${this.items.length} reading(s) from ${file}`);
      } catch {
        this.items = [];
      }
    }
  }

  get size() {
    return this.items.length;
  }

  push(readings) {
    this.items.push(...readings);
    const over = this.items.length - this.max;
    if (over > 0) {
      this.items.splice(0, over);
      this.dropped += over;
      this.log(`buffer full: dropped ${over} oldest reading(s)`);
    }
    this.dirty = true;
  }

  peek(n) {
    return this.items.slice(0, n);
  }

  shift(n) {
    this.items.splice(0, n);
    this.dirty = true;
  }

  persist() {
    if (!this.file || !this.dirty) return;
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.items));
    renameSync(tmp, this.file);
    this.dirty = false;
  }
}
