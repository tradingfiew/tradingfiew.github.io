/* Browser compatibility for Android Trusted Web Activity / older Chrome.
 * Must run synchronously BEFORE the chart library and deferred app modules.
 * Non-invasive: never replace native implementations.
 */
(function () {
  'use strict';
  function define(target, name, value) {
    if (typeof target[name] !== 'function') {
      Object.defineProperty(target, name, {
        configurable: true, writable: true, enumerable: false, value: value
      });
    }
  }
  define(Object, 'hasOwn', function hasOwn(object, property) {
    if (object === null || object === undefined) {
      throw new TypeError('Object.hasOwn called on null or undefined');
    }
    return Object.prototype.hasOwnProperty.call(Object(object), property);
  });
  define(Array.prototype, 'at', function at(index) {
    var array = Object(this);
    var length = Math.max(0, Math.min(Number(array.length) || 0, 4294967295));
    var number = Number(index) || 0;
    var integer = number < 0 ? Math.ceil(number) : Math.floor(number);
    var position = integer < 0 ? length + integer : integer;
    return position < 0 || position >= length ? undefined : array[position];
  });
  define(String.prototype, 'at', function at(index) {
    var string = String(this);
    var length = string.length;
    var number = Number(index) || 0;
    var integer = number < 0 ? Math.ceil(number) : Math.floor(number);
    var position = integer < 0 ? length + integer : integer;
    return position < 0 || position >= length ? undefined : string.charAt(position);
  });
  define(Array.prototype, 'findLast', function findLast(predicate, thisArg) {
    if (typeof predicate !== 'function') {
      throw new TypeError('Array.findLast expects a callback');
    }
    var array = Object(this);
    for (var i = (Number(array.length) >>> 0) - 1; i >= 0; i--) {
      var value = array[i];
      if (predicate.call(thisArg, value, i, array)) return value;
    }
    return undefined;
  });
  define(Array.prototype, 'findLastIndex', function findLastIndex(predicate, thisArg) {
    if (typeof predicate !== 'function') {
      throw new TypeError('Array.findLastIndex expects a callback');
    }
    var array = Object(this);
    for (var i = (Number(array.length) >>> 0) - 1; i >= 0; i--) {
      if (predicate.call(thisArg, array[i], i, array)) return i;
    }
    return -1;
  });
  // ParentNode.replaceChildren arrived after older Android Chrome versions.
  // The chart UI uses it when rebuilding price levels, indicators and toolbars.
  // Support DOM Nodes and strings without requiring any external polyfill CDN.
  function replaceChildren() {
    var args = arguments;
    while (this.firstChild) this.removeChild(this.firstChild);
    for (var i = 0; i < args.length; i++) {
      var item = args[i];
      this.appendChild(item && typeof item === 'object' &&
        typeof item.nodeType === 'number'
          ? item
          : this.ownerDocument
            ? this.ownerDocument.createTextNode(String(item))
            : document.createTextNode(String(item)));
    }
  }
  if (typeof Element !== 'undefined') {
    define(Element.prototype, 'replaceChildren', replaceChildren);
  }
  if (typeof DocumentFragment !== 'undefined') {
    define(DocumentFragment.prototype, 'replaceChildren', replaceChildren);
  }
  if (typeof Document !== 'undefined') {
    define(Document.prototype, 'replaceChildren', replaceChildren);
  }
})();
