export class StrokeStore {
  constructor(strokes = []) {
    this._done = Array.isArray(strokes) ? strokes : [];
    this._undone = [];
    this._revision = 0;
  }

  get revision() {
    return this._revision;
  }

  get doneCount() {
    return this._done.length;
  }

  get undoneCount() {
    return this._undone.length;
  }

  getCompletedStrokes() {
    return this._done;
  }

  commitStroke(stroke) {
    this._done.push(stroke);
    this._undone = [];
    this._revision += 1;
  }

  removeStrokes(predicate) {
    if (typeof predicate !== "function") {
      return 0;
    }

    const kept = [];
    let removed = 0;
    for (const stroke of this._done) {
      if (predicate(stroke)) {
        removed += 1;
      } else {
        kept.push(stroke);
      }
    }

    if (removed > 0) {
      this._done = kept;
      this._undone = [];
      this._revision += 1;
    }

    return removed;
  }

  undo() {
    if (!this._done.length) {
      return false;
    }

    this._undone.push(this._done.pop());
    this._revision += 1;
    return true;
  }

  redo() {
    if (!this._undone.length) {
      return false;
    }

    this._done.push(this._undone.pop());
    this._revision += 1;
    return true;
  }

  transformStrokes(predicate, transformer) {
    if (typeof predicate !== "function" || typeof transformer !== "function") {
      return 0;
    }

    let transformed = 0;
    for (let index = 0; index < this._done.length; index += 1) {
      const stroke = this._done[index];
      if (!predicate(stroke)) {
        continue;
      }
      const nextStroke = transformer(stroke);
      if (nextStroke && nextStroke !== stroke) {
        this._done[index] = nextStroke;
      }
      transformed += 1;
    }

    if (transformed > 0) {
      this._undone = [];
      this._revision += 1;
    }

    return transformed;
  }

  serialize() {
    return {
      version: 2,
      strokes: this._done,
    };
  }
}
