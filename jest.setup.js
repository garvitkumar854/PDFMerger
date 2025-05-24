import '@testing-library/jest-dom';

// Mock FormData
global.FormData = class FormData {
  constructor() {
    this.data = new Map();
  }
  append(key, value) {
    this.data.set(key, value);
  }
  getAll(key) {
    return Array.from(this.data.values()).filter(item => item.name === key);
  }
};

// Mock Blob and File
global.Blob = class Blob {
  constructor(parts, options = {}) {
    this._parts = parts;
    this._type = options.type || '';
    this._size = parts.reduce((size, part) => {
      return size + (part instanceof Uint8Array ? part.length : part.size || 0);
    }, 0);
  }
  get type() {
    return this._type;
  }
  get size() {
    return this._size;
  }
  async arrayBuffer() {
    return new ArrayBuffer(this._size);
  }
  slice(start, end, type) {
    return new Blob([], { type: type || this._type });
  }
  stream() {
    return {
      getReader() {
        return {
          read() {
            return Promise.resolve({ done: true });
          }
        };
      }
    };
  }
};

global.File = class File extends Blob {
  constructor(parts, filename, options = {}) {
    super(parts, options);
    this.name = filename;
    this.lastModified = options.lastModified || Date.now();
  }
};

// Mock URL
global.URL = {
  createObjectURL: jest.fn(() => 'blob:mock-url'),
  revokeObjectURL: jest.fn()
};

// Mock AbortController
global.AbortController = class AbortController {
  constructor() {
    this.signal = { aborted: false };
  }
  abort() {
    this.signal.aborted = true;
  }
};

// Mock crypto
global.crypto = {
  getRandomValues: function(arr) {
    for (let i = 0; i < arr.length; i++) {
      arr[i] = Math.floor(Math.random() * 256);
    }
    return arr;
  },
  subtle: {
    digest: async function(algorithm, data) {
      return new ArrayBuffer(32);
    }
  }
}; 