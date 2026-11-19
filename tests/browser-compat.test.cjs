'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'browser-compat.js'), 'utf8');

test('compatibility script executes without any DOM or ES2022 runtime', () => {
  const context = vm.createContext({});
  vm.runInContext(
    "Object.hasOwn=undefined; Array.prototype.at=undefined;" +
    "String.prototype.at=undefined; Array.prototype.findLast=undefined;" +
    "Array.prototype.findLastIndex=undefined;",
    context
  );
  vm.runInContext(code, context, {filename: 'browser-compat.js'});
  assert.equal(vm.runInContext("Object.hasOwn({a:1},'a')", context), true);
  assert.equal(vm.runInContext("Object.hasOwn(Object.create({a:1}),'a')", context), false);
  assert.equal(vm.runInContext("[1,2,3].at(-1)", context), 3);
  assert.equal(vm.runInContext("[1,2,3].at(-4)", context), undefined);
  assert.equal(vm.runInContext("'ABC'.at(-2)", context), 'B');
  assert.equal(vm.runInContext("[1,2,3,2].findLast(x=>x===2)", context), 2);
  assert.equal(vm.runInContext("[1,2,3,2].findLastIndex(x=>x===2)", context), 3);
});

test('compatibility file must be loaded synchronously before chart library', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const compatibility = html.indexOf('<script src="./browser-compat.js?v=');
  const chart = html.indexOf('<script defer src="https://cdn.jsdelivr.net/npm/lightweight-charts');
  const app = html.indexOf('<script defer src="./app.js?');
  assert.ok(compatibility > 0, 'compatibility loader is missing');
  assert.ok(chart > compatibility, 'chart library loaded before polyfill');
  assert.ok(app > chart, 'app loaded before chart library');
  assert.ok(!html.includes('</script>\\n'), 'do not put literal backslash-n outside scripts');
});

test('native built-ins are not replaced', () => {
  const context = vm.createContext({});
  vm.runInContext('this.previous=Object.hasOwn;', context);
  vm.runInContext(code, context);
  assert.equal(vm.runInContext('previous === Object.hasOwn', context), true);
});
