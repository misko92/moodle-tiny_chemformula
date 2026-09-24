// This file is part of Moodle - http://moodle.org/
//
// Moodle is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Moodle is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Moodle.  If not, see <http://www.gnu.org/licenses/>.

/**
 * Unit tests for the pure tiny_chemformula token detector.
 *
 * Run with `npm ci && npm test` in the plugin directory (a local jest +
 * jsdom harness lives in package.json); the files also follow Moodle's
 * documented `tests/jest/*.test.js` convention.
 *
 * @module      tiny_chemformula/tests/jest/formatter_test
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

import {detectTokens} from '../../amd/src/formatter';

describe('tiny_chemformula formatter', () => {

    describe('simple formulas', () => {
        it('detects a subscript after an element for a simple molecule', () => {
            expect(detectTokens('H2O')).toEqual([
                {start: 0, end: 3, text: 'H2O', preview: 'H₂O'},
            ]);
        });

        it('detects subscripts for a two-element compound', () => {
            expect(detectTokens('CO2')).toEqual([
                {start: 0, end: 3, text: 'CO2', preview: 'CO₂'},
            ]);
        });

        it('includes a leading stoichiometric coefficient in the token span', () => {
            // The coefficient itself never renders differently, but it is
            // part of what the author typed as a single word, so the
            // highlighted span covers the whole thing.
            const tokens = detectTokens('2H2O');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('2H2O');
            expect(tokens[0].preview).toBe('2H₂O');
        });

        it('merges a hydrate written with a period into one highlighted unit', () => {
            const tokens = detectTokens('CuSO4.5H2O');
            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toEqual({start: 0, end: 10, text: 'CuSO4.5H2O', preview: 'CuSO₄·5H₂O'});
        });

        it('merges a hydrate written with spaces around the period', () => {
            const tokens = detectTokens('MgSO4 . 7H2O');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('MgSO4 . 7H2O');
            expect(tokens[0].preview).toBe('MgSO₄·7H₂O');
        });

        it('does not merge a formula followed by a sentence-ending period', () => {
            const tokens = detectTokens('The salt is CaCl2. Next.');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('CaCl2');
        });
    });

    describe('complex formulas with groups', () => {
        it('detects a bracketed group with a trailing count', () => {
            expect(detectTokens('Fe2(SO4)3')).toEqual([
                {start: 0, end: 9, text: 'Fe2(SO4)3', preview: 'Fe₂(SO₄)₃'},
            ]);
        });

        it('detects square-bracket groups', () => {
            const tokens = detectTokens('K4[Fe(CN)6]');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].preview).toBe('K₄[Fe(CN)₆]');
        });
    });

    describe('ionic charges', () => {
        it('detects a digit+sign charge', () => {
            expect(detectTokens('Ca2+')).toEqual([
                {start: 0, end: 4, text: 'Ca2+', preview: 'Ca²⁺'},
            ]);
        });

        it('detects a bare sign charge with no digit', () => {
            expect(detectTokens('Na+')[0].preview).toBe('Na⁺');
            expect(detectTokens('Cl-')[0].preview).toBe('Cl⁻');
        });

        it('uses the caret hint to separate a subscript from a charge', () => {
            const tokens = detectTokens('SO4^2-');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('SO4^2-');
            expect(tokens[0].preview).toBe('SO₄²⁻');
        });

        it('recognises a sign-first charge and normalises the preview to magnitude-then-sign', () => {
            // "Mg+2" must be recognised the same as "Mg2+", and both must
            // preview in the conventional magnitude-then-sign order.
            expect(detectTokens('Mg+2')[0].preview).toBe('Mg²⁺');
            expect(detectTokens('Mg2+')[0].preview).toBe('Mg²⁺');
            expect(detectTokens('H3O+1')[0].preview).toBe('H₃O¹⁺');
            expect(detectTokens('SO4^+2')[0].preview).toBe('SO₄²⁺');
        });
    });

    describe('parenthesised ion notation', () => {
        // An entire ion (formula + charge) wrapped in its own outer
        // "(...)"/"[...]" - e.g. to parenthesise it in prose - is one
        // candidate span including the brackets. Unlike a formula group
        // such as "Ca(OH)2" (followed by a subscript), nothing follows the
        // closing bracket here, so only the interior is highlighted -
        // matching how filter_chemformula renders the brackets as plain
        // literal text.
        it('highlights only the interior, excluding the brackets', () => {
            const tokens = detectTokens('(SO4^2-)');
            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toEqual({start: 1, end: 7, text: 'SO4^2-', preview: 'SO₄²⁻'});
        });

        it('works the same for a square-bracketed ion', () => {
            const tokens = detectTokens('[Cr2O7^2-]');
            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toEqual({start: 1, end: 9, text: 'Cr2O7^2-', preview: 'Cr₂O₇²⁻'});
        });

        it('reports the highlighted range at its real offset inside a sentence', () => {
            const tokens = detectTokens('The sulfate ion is (SO4^2-) here.');
            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toEqual({start: 20, end: 26, text: 'SO4^2-', preview: 'SO₄²⁻'});
        });

        it('still resolves a genuine formula group followed by a subscript directly', () => {
            expect(detectTokens('Ca(OH)2')[0].preview).toBe('Ca(OH)₂');
        });

        it('does not surface a standalone group with nothing to format inside', () => {
            expect(detectTokens('(OH)')).toEqual([]);
        });
    });

    describe('backtick literals', () => {
        // filter_chemformula renders "`...`" exactly as typed, so nothing
        // inside (or straddling) one is highlighted.
        it('skips tokens inside a backtick pair', () => {
            expect(detectTokens('Model `PS5` and H2O')).toEqual([
                {start: 16, end: 19, text: 'H2O', preview: 'H₂O'},
            ]);
            expect(detectTokens('`6.02x10^23` and `A -> B`')).toEqual([]);
        });

        it('does not merge a hydrate across a literal edge', () => {
            expect(detectTokens('`CuSO4`.5H2O')).toEqual([
                {start: 8, end: 12, text: '5H2O', preview: '5H₂O'},
            ]);
        });

        it('treats unpaired, empty or multi-line backticks as ordinary text', () => {
            expect(detectTokens('one ` tick H2O')).toHaveLength(1);
            expect(detectTokens('`` H2O')).toHaveLength(1);
            expect(detectTokens('`H2O\nCO2`')).toHaveLength(2);
        });
    });

    describe('formula next to an unbalanced prose bracket', () => {
        // A comma ends the span before the prose bracket's partner arrives,
        // so the span carries a lone leading "(" or trailing ")" - only the
        // formula itself is highlighted.
        it('peels a lone leading bracket', () => {
            expect(detectTokens('glucose (C6H12O6, molar mass = 180.16 g/mol).')).toEqual([
                {start: 9, end: 16, text: 'C6H12O6', preview: 'C₆H₁₂O₆'},
            ]);
            expect(detectTokens('(Mg(OH)2, a base)')).toEqual([
                {start: 1, end: 8, text: 'Mg(OH)2', preview: 'Mg(OH)₂'},
            ]);
            expect(detectTokens('((H2O, x')).toEqual([
                {start: 2, end: 5, text: 'H2O', preview: 'H₂O'},
            ]);
        });

        it('peels a lone trailing bracket', () => {
            expect(detectTokens('(glucose, C6H12O6)')).toEqual([
                {start: 10, end: 17, text: 'C6H12O6', preview: 'C₆H₁₂O₆'},
            ]);
        });

        it('does not surface a span with nothing chemical underneath', () => {
            expect(detectTokens('(OH, x)')).toEqual([]);
            expect(detectTokens('Ca(OH')).toEqual([]);
        });
    });

    describe('isotopes', () => {
        it('formats Element-Number isotope notation', () => {
            expect(detectTokens('U-238')).toEqual([
                {start: 0, end: 5, text: 'U-238', preview: '²³⁸U'},
            ]);
        });

        it('formats Number-Element isotope notation identically', () => {
            expect(detectTokens('238-U')[0].preview).toBe('²³⁸U');
        });

        it('formats a two-letter element isotope', () => {
            expect(detectTokens('C-14')[0].preview).toBe('¹⁴C');
        });
    });

    describe('full nuclear symbol notation', () => {
        it('detects mass number and atomic number together', () => {
            expect(detectTokens('238/92U')).toEqual([
                {start: 0, end: 7, text: '238/92U', preview: '²³⁸₉₂U'},
            ]);
        });

        it('detects a two-letter element with nuclear symbol notation', () => {
            expect(detectTokens('14/6C')[0].preview).toBe('¹⁴₆C');
        });

        it('does not affect ordinary slash-separated text with no uppercase', () => {
            expect(detectTokens('10/25/2024')).toEqual([]);
            expect(detectTokens('and/or')).toEqual([]);
        });
    });

    describe('nuclear symbol notation for subatomic particles', () => {
        it('formats a beta particle (negative atomic number, lowercase symbol)', () => {
            expect(detectTokens('0/-1e')).toEqual([
                {start: 0, end: 5, text: '0/-1e', preview: '⁰₋₁e'},
            ]);
        });

        it('formats a positron', () => {
            expect(detectTokens('0/1e')[0].preview).toBe('⁰₁e');
        });

        it('formats a neutron', () => {
            expect(detectTokens('1/0n')[0].preview).toBe('¹₀n');
        });

        it('formats a proton', () => {
            expect(detectTokens('1/1p')[0].preview).toBe('¹₁p');
        });
    });

    describe('unknown-element placeholder ("X")', () => {
        it('accepts X in full nuclear symbol notation', () => {
            expect(detectTokens('235/92X')).toEqual([
                {start: 0, end: 7, text: '235/92X', preview: '²³⁵₉₂X'},
            ]);
        });

        it('accepts X in isotope notation, either order', () => {
            expect(detectTokens('X-235')[0].preview).toBe('²³⁵X');
            expect(detectTokens('235-X')[0].preview).toBe('²³⁵X');
        });
    });

    describe('unknown-number placeholder ("?")', () => {
        it('accepts ? for either or both numbers in nuclear symbol notation', () => {
            expect(detectTokens('?/92U')[0].preview).toBe('?₉₂U');
            expect(detectTokens('235/?U')[0].preview).toBe('²³⁵?U');
            expect(detectTokens('?/?U')[0].preview).toBe('??U');
        });

        it('combines with the X unknown-element placeholder', () => {
            expect(detectTokens('?/?X')[0].preview).toBe('??X');
        });

        it('accepts ? as an unknown mass number in isotope notation, either order', () => {
            expect(detectTokens('U-?')[0].preview).toBe('?U');
            expect(detectTokens('?-U')[0].preview).toBe('?U');
        });

        it('does not let a stray ? glued onto a formula block detection', () => {
            // "?" only means something inside isotope/nuclear-symbol
            // notation - elsewhere (e.g. ending a sentence with no space)
            // it is just punctuation, and the chemistry underneath must
            // still be detected.
            const tokens = detectTokens('H2O?');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('H2O?');
            expect(tokens[0].preview).toBe('H₂O?');
        });
    });

    describe('state labels and fully-resolved-but-unstyled formulas', () => {
        it('does not surface a formula that would render identically to its own text', () => {
            // "NaCl(aq)" is recognised chemistry, but the filter would
            // render it completely unstyled, so there is nothing useful
            // to highlight for the author.
            expect(detectTokens('NaCl(aq)')).toEqual([]);
        });

        it('still surfaces the subscript inside a state-labelled formula', () => {
            const tokens = detectTokens('H2O(l)');
            expect(tokens).toHaveLength(1);
            expect(tokens[0].text).toBe('H2O(l)');
            expect(tokens[0].preview).toBe('H₂O(l)');
        });
    });

    describe('reaction arrows', () => {
        it('detects a simple arrow', () => {
            expect(detectTokens('H2 -> H2O')).toContainEqual(
                {start: 3, end: 5, text: '->', preview: '→'}
            );
        });

        it('detects a long-form arrow the same way as a short one', () => {
            expect(detectTokens('H2 --> H2O').find((t) => t.text === '-->').preview).toBe('→');
        });

        it('detects equilibrium arrows', () => {
            expect(detectTokens('A <=> B').find((t) => t.text === '<=>').preview).toBe('⇌');
            expect(detectTokens('A <-> B').find((t) => t.text === '<->').preview).toBe('⇌');
        });

        it('detects every recognised token in a full equation, in order', () => {
            const tokens = detectTokens('H2 + O2 -> H2O');
            expect(tokens.map((t) => t.text)).toEqual(['H2', 'O2', '->', 'H2O']);
            expect(tokens.map((t) => t.preview)).toEqual(['H₂', 'O₂', '→', 'H₂O']);
        });
    });

    describe('scientific notation', () => {
        it('detects an "E" exponent and previews it with a unicode superscript', () => {
            expect(detectTokens('6.02E23')).toEqual([
                {start: 0, end: 7, text: '6.02E23', preview: '6.02 × 10²³'},
            ]);
        });

        it('detects a lowercase "e" exponent with a negative power', () => {
            expect(detectTokens('1.6e-19')).toEqual([
                {start: 0, end: 7, text: '1.6e-19', preview: '1.6 × 10⁻¹⁹'},
            ]);
        });

        it('detects an explicit "x 10^n" power, with any multiplication sign and spacing', () => {
            expect(detectTokens('6.02x10^23')[0].preview).toBe('6.02 × 10²³');
            expect(detectTokens('6.02 * 10 ^ 23')[0].preview).toBe('6.02 × 10²³');
            expect(detectTokens('3 × 10^8')[0].preview).toBe('3 × 10⁸');
            expect(detectTokens('9.11·10^-31')[0].preview).toBe('9.11 × 10⁻³¹');
        });

        it('detects a bare power of ten with no mantissa', () => {
            expect(detectTokens('10^23')).toEqual([
                {start: 0, end: 5, text: '10^23', preview: '10²³'},
            ]);
        });

        it('reports the span at its real offset inside a sentence', () => {
            const tokens = detectTokens('Avogadro is about 6.02E23 per mole.');
            expect(tokens).toEqual([
                {start: 18, end: 25, text: '6.02E23', preview: '6.02 × 10²³'},
            ]);
        });

        it('does not emit a second overlapping token for the "10^n" tail of an "x 10^n" span', () => {
            const tokens = detectTokens('6.02x10^23');
            expect(tokens).toHaveLength(1);
            expect(tokens[0]).toEqual({start: 0, end: 10, text: '6.02x10^23', preview: '6.02 × 10²³'});
        });

        it('does not read an element symbol containing "e" as a mantissa/exponent split', () => {
            // The "E"/"e" shape needs a digit immediately before it, so Fe,
            // Ne, Se and Te (subscripted or not) stay ordinary chemistry.
            expect(detectTokens('Fe2O3')[0].preview).toBe('Fe₂O₃');
            expect(detectTokens('Ne3')[0].preview).toBe('Ne₃');
            expect(detectTokens('Fe2O3').every((token) => !token.preview.includes('10'))).toBe(true);
        });

        it('leaves a decimal or version-like number alone', () => {
            // The "." before "10" blocks the bare-power lookbehind.
            expect(detectTokens('version 2.10^3 notes')).toEqual([]);
            expect(detectTokens('the value 6.022 is close')).toEqual([]);
        });

        it('detects scientific notation and real chemistry side by side', () => {
            const tokens = detectTokens('N2 forms at 6.02E23 molecules');
            expect(tokens.map((t) => t.text)).toEqual(['N2', '6.02E23']);
            expect(tokens.map((t) => t.preview)).toEqual(['N₂', '6.02 × 10²³']);
        });
    });

    describe('false positives are left undetected', () => {
        it('does not flag a capitalised word followed by an unrelated number', () => {
            expect(detectTokens('In 2024')).toEqual([]);
        });

        it('does not treat a bare single element symbol as a formula', () => {
            expect(detectTokens('In')).toEqual([]);
            expect(detectTokens('As')).toEqual([]);
            expect(detectTokens('At')).toEqual([]);
        });

        it('does not match an ordinary acronym that happens to be two element symbols', () => {
            expect(detectTokens('US')).toEqual([]);
        });

        it('does not partially match a word containing non-element letters', () => {
            expect(detectTokens('COVID19')).toEqual([]);
            expect(detectTokens('NASA')).toEqual([]);
        });

        it('finds only the real formulas in a sentence of ordinary prose', () => {
            const tokens = detectTokens('A quick note about H2O and CO2 levels.');
            expect(tokens.map((t) => t.text)).toEqual(['H2O', 'CO2']);
        });

        it('returns an empty array for empty input', () => {
            expect(detectTokens('')).toEqual([]);
        });
    });
});
