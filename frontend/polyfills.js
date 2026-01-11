// React Native polyfills to prevent FormData and other web API errors

// Window object polyfill for React Native
if (typeof global.window === 'undefined') {
  global.window = {
    location: {
      href: 'react-native://',
      protocol: 'react-native:',
      host: 'localhost',
      hostname: 'localhost',
      port: '',
      pathname: '/',
      search: '',
      hash: '',
      origin: 'react-native://localhost',
      reload: () => {},
      assign: () => {},
      replace: () => {}
    },
    navigator: {
      userAgent: 'ReactNative',
      platform: 'ReactNative',
      language: 'en-US',
      languages: ['en-US', 'en'],
      cookieEnabled: false,
      onLine: true
    },
    document: {
      createElement: (tagName) => ({
        tagName: tagName.toUpperCase(),
        style: {},
        addEventListener: () => {},
        removeEventListener: () => {},
        setAttribute: () => {},
        getAttribute: () => null
      }),
      createTextNode: (text) => ({ textContent: text }),
      getElementById: () => null,
      getElementsByClassName: () => [],
      getElementsByTagName: () => [],
      querySelector: () => null,
      querySelectorAll: () => [],
      body: {
        appendChild: () => {},
        removeChild: () => {},
        style: {}
      },
      documentElement: {
        style: {}
      },
      head: {
        appendChild: () => {},
        removeChild: () => {}
      },
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => {}
    },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    },
    sessionStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      length: 0,
      key: () => null
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
    open: () => ({ close: () => {}, focus: () => {} }),
    close: () => {},
    focus: () => {},
    blur: () => {},
    alert: (message) => console.log('Alert:', message),
    confirm: (message) => {
      console.log('Confirm:', message);
      return true;
    },
    prompt: (message, defaultValue) => {
      console.log('Prompt:', message, defaultValue);
      return defaultValue || '';
    },
    setTimeout: global.setTimeout,
    clearTimeout: global.clearTimeout,
    setInterval: global.setInterval,
    clearInterval: global.clearInterval,
    requestAnimationFrame: global.requestAnimationFrame || ((callback) => setTimeout(callback, 16)),
    cancelAnimationFrame: global.cancelAnimationFrame || ((id) => clearTimeout(id)),
    innerWidth: 375,
    innerHeight: 667,
    outerWidth: 375,
    outerHeight: 667,
    screen: {
      width: 375,
      height: 667,
      availWidth: 375,
      availHeight: 667
    },
    performance: global.performance
  };
}

// Document object polyfill for React Native
if (typeof global.document === 'undefined') {
  global.document = global.window.document;
}

// Navigator object polyfill for React Native
if (typeof global.navigator === 'undefined') {
  global.navigator = global.window.navigator;
}

// Location object polyfill for React Native
if (typeof global.location === 'undefined') {
  global.location = global.window.location;
}

// Performance polyfill for React Native
if (typeof global.performance === 'undefined') {
  const startTime = Date.now();
  global.performance = {
    now: () => Date.now() - startTime,
    mark: () => {},
    measure: () => {},
    getEntriesByType: () => [],
    getEntriesByName: () => [],
    clearMarks: () => {},
    clearMeasures: () => {},
    timing: {},
    navigation: {
      type: 0,
      redirectCount: 0
    }
  };
}

// setImmediate polyfill for React Native
if (typeof global.setImmediate === 'undefined') {
  global.setImmediate = function(callback, ...args) {
    return setTimeout(() => callback(...args), 0);
  };
}

// clearImmediate polyfill for React Native
if (typeof global.clearImmediate === 'undefined') {
  global.clearImmediate = function(id) {
    clearTimeout(id);
  };
}

// FormData polyfill for React Native
if (typeof global.FormData === 'undefined') {
  global.FormData = class FormData {
    constructor() {
      this._parts = [];
    }
    
    append(name, value) {
      this._parts.push([name, value]);
    }
    
    toString() {
      return this._parts.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&');
    }
  };
}

// URL polyfill for React Native
if (typeof global.URL === 'undefined') {
  global.URL = class URL {
    constructor(url, base) {
      this.href = base ? new URL(url, base).href : url;
    }
  };
}

// Headers polyfill for React Native
if (typeof global.Headers === 'undefined') {
  global.Headers = class Headers {
    constructor(init) {
      this._headers = {};
      if (init) {
        if (Array.isArray(init)) {
          init.forEach(([key, value]) => {
            this._headers[key.toLowerCase()] = value;
          });
        } else if (typeof init === 'object') {
          Object.keys(init).forEach(key => {
            this._headers[key.toLowerCase()] = init[key];
          });
        }
      }
    }
    
    get(name) {
      return this._headers[name.toLowerCase()];
    }
    
    set(name, value) {
      this._headers[name.toLowerCase()] = value;
    }
    
    has(name) {
      return name.toLowerCase() in this._headers;
    }
    
    delete(name) {
      delete this._headers[name.toLowerCase()];
    }
  };
}

// Request polyfill for React Native
if (typeof global.Request === 'undefined') {
  global.Request = class Request {
    constructor(input, init = {}) {
      this.url = typeof input === 'string' ? input : input.url;
      this.method = init.method || 'GET';
      this.headers = new Headers(init.headers);
      this.body = init.body;
    }
  };
}

// Response polyfill for React Native
if (typeof global.Response === 'undefined') {
  global.Response = class Response {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || 'OK';
      this.headers = new Headers(init.headers);
    }
    
    json() {
      return Promise.resolve(JSON.parse(this.body));
    }
    
    text() {
      return Promise.resolve(this.body);
    }
  };
}

// Fetch polyfill for React Native
if (typeof global.fetch === 'undefined') {
  global.fetch = function(url, options = {}) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      xhr.open(options.method || 'GET', url);
      
      if (options.headers) {
        Object.keys(options.headers).forEach(key => {
          xhr.setRequestHeader(key, options.headers[key]);
        });
      }
      
      xhr.onload = () => {
        const response = new Response(xhr.responseText, {
          status: xhr.status,
          statusText: xhr.statusText,
          headers: new Headers()
        });
        resolve(response);
      };
      
      xhr.onerror = () => {
        reject(new Error('Network error'));
      };
      
      xhr.send(options.body);
    });
  };
}

// WebSocket polyfill for React Native
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = class WebSocket {
    constructor(url, protocols) {
      this.url = url;
      this.protocols = protocols;
      this.readyState = WebSocket.CONNECTING;
      this.CONNECTING = 0;
      this.OPEN = 1;
      this.CLOSING = 2;
      this.CLOSED = 3;
      
      // Simulate connection
      setTimeout(() => {
        this.readyState = WebSocket.OPEN;
        if (this.onopen) this.onopen();
      }, 100);
    }
    
    send(data) {
      console.log('WebSocket send:', data);
    }
    
    close(code, reason) {
      this.readyState = WebSocket.CLOSED;
      if (this.onclose) this.onclose({ code, reason });
    }
    
    addEventListener(type, listener) {
      if (type === 'open') this.onopen = listener;
      if (type === 'message') this.onmessage = listener;
      if (type === 'close') this.onclose = listener;
      if (type === 'error') this.onerror = listener;
    }
    
    removeEventListener(type, listener) {
      // Simple implementation
    }
  };
}

// XMLHttpRequest polyfill for React Native (if needed)
if (typeof global.XMLHttpRequest === 'undefined') {
  global.XMLHttpRequest = class XMLHttpRequest {
    constructor() {
      this.readyState = 0;
      this.status = 0;
      this.responseText = '';
      this.onload = null;
      this.onerror = null;
    }
    
    open(method, url, async) {
      this.method = method;
      this.url = url;
      this.readyState = 1;
    }
    
    setRequestHeader(name, value) {
      if (!this.headers) this.headers = {};
      this.headers[name] = value;
    }
    
    send(data) {
      this.readyState = 4;
      this.status = 200;
      this.responseText = '{}';
      if (this.onload) this.onload();
    }
  };
}

// Event polyfills
if (typeof global.Event === 'undefined') {
  global.Event = class Event {
    constructor(type, options = {}) {
      this.type = type;
      this.bubbles = options.bubbles || false;
      this.cancelable = options.cancelable || false;
    }
  };
}

// EventTarget polyfill
if (typeof global.EventTarget === 'undefined') {
  global.EventTarget = class EventTarget {
    constructor() {
      this._listeners = {};
    }
    
    addEventListener(type, listener) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(listener);
    }
    
    removeEventListener(type, listener) {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter(l => l !== listener);
      }
    }
    
    dispatchEvent(event) {
      if (this._listeners[event.type]) {
        this._listeners[event.type].forEach(listener => listener(event));
      }
    }
  };
}

// Buffer polyfill for React Native
if (typeof global.Buffer === 'undefined') {
  global.Buffer = require('buffer').Buffer;
}

// Process polyfill for React Native
if (typeof global.process === 'undefined') {
  global.process = require('process');
}

// URLSearchParams polyfill for React Native
if (typeof global.URLSearchParams === 'undefined') {
  global.URLSearchParams = class URLSearchParams {
    constructor(init) {
      this._params = new Map();
      if (init) {
        if (typeof init === 'string') {
          init.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key) this._params.set(decodeURIComponent(key), decodeURIComponent(value || ''));
          });
        } else if (Array.isArray(init)) {
          init.forEach(([key, value]) => this._params.set(key, value));
        } else if (typeof init === 'object') {
          Object.keys(init).forEach(key => this._params.set(key, init[key]));
        }
      }
    }
    
    get(name) {
      return this._params.get(name);
    }
    
    set(name, value) {
      this._params.set(name, value);
    }
    
    has(name) {
      return this._params.has(name);
    }
    
    delete(name) {
      this._params.delete(name);
    }
    
    toString() {
      return Array.from(this._params.entries())
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&');
    }
  };
}

// console polyfills for better debugging
if (__DEV__) {
  const originalConsole = console;
  global.console = {
    ...originalConsole,
    log: (...args) => {
      originalConsole.log('[RN]', ...args);
    },
    warn: (...args) => {
      originalConsole.warn('[RN]', ...args);
    },
    error: (...args) => {
      originalConsole.error('[RN]', ...args);
    }
  };
}

console.log('React Native polyfills loaded successfully');
