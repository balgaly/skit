'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { pickSkills, pickAction } = require('../../src/ui/picker');

describe('picker exports', () => {
  it('exports pickSkills as an async function', () => {
    assert.strictEqual(typeof pickSkills, 'function');
    // Returns a promise (async)
    const skills = [{ name: 'a', description: 'A skill', path: 'a' }];
    const result = pickSkills(skills, { _inquirer: { prompt: async () => ({ skills: [skills[0]] }) } });
    assert.ok(result instanceof Promise);
    return result.then((selected) => {
      assert.deepStrictEqual(selected, [skills[0]]);
    });
  });

  it('exports pickAction as an async function', () => {
    assert.strictEqual(typeof pickAction, 'function');
    const result = pickAction('Choose:', [{ name: 'Go', value: 'go' }], {
      _inquirer: { prompt: async () => ({ action: 'go' }) },
    });
    assert.ok(result instanceof Promise);
    return result.then((val) => {
      assert.strictEqual(val, 'go');
    });
  });
});
