'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const format = require('../../src/ui/format');

describe('format', () => {
  it('exports all required functions', () => {
    const expected = ['success', 'error', 'warn', 'dim', 'header', 'info', 'bold'];
    for (const name of expected) {
      assert.strictEqual(typeof format[name], 'function', `format.${name} should be a function`);
    }
  });

  it('success returns a string containing the input', () => {
    const result = format.success('installed');
    assert.ok(typeof result === 'string');
    assert.ok(result.includes('installed'));
  });

  it('error returns a string containing the input', () => {
    assert.ok(format.error('failed').includes('failed'));
  });

  it('warn returns a string containing the input', () => {
    assert.ok(format.warn('skipped').includes('skipped'));
  });

  it('dim returns a string containing the input', () => {
    assert.ok(format.dim('path/to/file').includes('path/to/file'));
  });

  it('header returns a string containing the input', () => {
    assert.ok(format.header('my-source').includes('my-source'));
  });

  it('info returns a string containing the input', () => {
    assert.ok(format.info('Cloning...').includes('Cloning...'));
  });

  it('bold returns a string containing the input', () => {
    assert.ok(format.bold('Important').includes('Important'));
  });
});
