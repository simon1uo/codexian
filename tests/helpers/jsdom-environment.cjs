const { TestEnvironment } = require('jest-environment-node');

class MiniElement {
  constructor(tagName) {
    this.tagName = String(tagName || 'div').toUpperCase();
    this.children = [];
    this.parentElement = null;
    this.className = '';
    this.textContent = '';
    this.hidden = false;
    this.dataset = {};
    this.listeners = {};
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  addEventListener(event, callback) {
    const current = this.listeners[event] || [];
    current.push(callback);
    this.listeners[event] = current;
  }

  click() {
    const callbacks = this.listeners.click || [];
    for (const callback of callbacks) {
      callback();
    }
  }

  querySelector(selector) {
    if (!selector) return null;
    const matcher = selector.startsWith('.')
      ? (el) => el.className.split(/\s+/).includes(selector.slice(1))
      : (el) => el.tagName.toLowerCase() === selector.toLowerCase();

    for (const child of this.children) {
      if (matcher(child)) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }
}

class MiniDocument {
  createElement(tagName) {
    return new MiniElement(tagName);
  }
}

class LocalJSDOMEnvironment extends TestEnvironment {
  async setup() {
    await super.setup();
    this.global.document = new MiniDocument();
    this.global.window = { document: this.global.document };
    this.global.HTMLElement = MiniElement;
    this.global.HTMLButtonElement = MiniElement;
  }
}

module.exports = LocalJSDOMEnvironment;
