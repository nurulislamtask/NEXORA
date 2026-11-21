import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILT_IN_THEMES, contrast, isValidTokens, toCssVars } from '../src/core/theme/themes.ts';
import { evaluateUpdate, compareSemver } from '../src/core/update/policy.ts';

test('at least 14 uniquely-named themes', () => {
  assert.ok(BUILT_IN_THEMES.length >= 14);
  assert.equal(new Set(BUILT_IN_THEMES.map((t) => t.id)).size, BUILT_IN_THEMES.length);
});
test('every theme has valid tokens and accessible contrast', () => {
  for (const t of BUILT_IN_THEMES) {
    assert.ok(isValidTokens(t.tokens), t.id);
    for (const bg of ['background', 'card', 'sidebar'] as const) {
      assert.ok(contrast(t.tokens.text, t.tokens[bg]) >= 4.5, `${t.id} text on ${bg}`);
      assert.ok(contrast(t.tokens.textMuted, t.tokens[bg]) >= 4.5, `${t.id} muted on ${bg}`);
    }
    assert.ok(contrast(t.tokens.primary, t.tokens.background) >= 3, `${t.id} primary`);
  }
});
test('css vars', () => assert.equal(toCssVars(BUILT_IN_THEMES[0]!)['--nx-text-muted'], BUILT_IN_THEMES[0]!.tokens.textMuted));
test('semver + mandatory rule', () => {
  assert.equal(compareSemver('1.10.0', '1.9.9'), 1);
  const p = { latest: '1.2.0', minimumSupported: '1.1.0', notes: '' };
  assert.equal(evaluateUpdate('1.0.9', p), 'mandatory');
  assert.equal(evaluateUpdate('1.1.0', p), 'optional');
  assert.equal(evaluateUpdate('1.2.0', p), 'up-to-date');
  assert.throws(() => compareSemver('x', '1.0.0'));
});
