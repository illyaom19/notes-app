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

  serialize() {
    return {
      version: 2,
      strokes: this._done,
    };
  }
}
