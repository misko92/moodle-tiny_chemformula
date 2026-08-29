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
 * Pure chemistry formula/equation *detector*.
 *
 * This is the same periodic-table tokenizer and validation rules used by
 * filter_chemformula (which is what actually converts stored content to
 * <sub>/<sup> HTML at display time). Unlike the filter, this module never
 * produces HTML to insert into the editor - it only reports where
 * recognisable tokens are, and a small preview of how they would render,
 * so the caller can decorate them for the author without ever touching
 * the underlying text.
 *
 * @module      tiny_chemformula/formatter
 * @copyright   2026 Moodle
 * @license     http://www.gnu.org/copyleft/gpl.html GNU GPL v3 or later
 */

const ELEMENTS_1 = new Set([
    'H', 'B', 'C', 'N', 'O', 'F', 'P', 'S', 'K', 'V', 'Y', 'I', 'W', 'U',
]);

const ELEMENTS_2 = new Set([
    'He', 'Li', 'Be', 'Ne', 'Na', 'Mg', 'Al', 'Si', 'Cl', 'Ar', 'Ca',
    'Sc', 'Ti', 'Cr', 'Mn', 'Fe', 'Co', 'Ni', 'Cu', 'Zn', 'Ga', 'Ge',
    'As', 'Se', 'Br', 'Kr', 'Rb', 'Sr', 'Zr', 'Nb', 'Mo', 'Tc', 'Ru',
    'Rh', 'Pd', 'Ag', 'Cd', 'In', 'Sn', 'Sb', 'Te', 'Xe', 'Cs', 'Ba',
    'La', 'Ce', 'Pr', 'Nd', 'Pm', 'Sm', 'Eu', 'Gd', 'Tb', 'Dy', 'Ho',
    'Er', 'Tm', 'Yb', 'Lu', 'Hf', 'Ta', 'Re', 'Os', 'Ir', 'Pt', 'Au',
    'Hg', 'Tl', 'Pb', 'Bi', 'Po', 'At', 'Rn', 'Fr', 'Ra', 'Ac', 'Th',
    'Pa', 'Np', 'Pu', 'Am', 'Cm', 'Bk', 'Cf', 'Es', 'Fm', 'Md', 'No',
    'Lr', 'Rf', 'Db', 'Sg', 'Bh', 'Hs', 'Mt', 'Ds', 'Rg', 'Cn', 'Nh',
    'Fl', 'Mc', 'Lv', 'Ts', 'Og',
]);

const STATE_LABELS = ['(aq)', '(s)', '(l)', '(g)'];

/**
 * Placeholder symbol for an unknown element in isotope and nuclear symbol
 * notation, e.g. "235/92X" or "X-235", as used in "identify element X"
 * problems. Not a real element symbol, so it is only ever recognised in
 * these two notations, never as part of an ordinary formula.
 */
const UNKNOWN_ELEMENT_PLACEHOLDER = 'X';

const ARROW_PATTERN = /<=>|<->|-->|->/g;

const CANDIDATE_PATTERN = /[A-Za-z0-9()[\]+\-^/?]+/g;

const SUB_DIGITS = {'0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉'};

const SUP_CHARS = {
    '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
    '+': '⁺', '-': '⁻',
};

/**
 * Convert a formatted span's <sub>/<sup> HTML into a plain-text-safe
 * unicode preview (e.g. "SO<sub>4</sub><sup>2-</sup>" -> "SO₄²⁻"), for
 * use only in a non-editable decoration (tooltip), never inserted into
 * editor content.
 *
 * @param {string} html
 * @returns {string}
 */
const toUnicodePreview = (html) => html
    // "?" (the unknown-number placeholder) has no unicode sub/superscript
    // glyph, so it is left as a literal "?" - the `?? c` fallback passes
    // any character with no map entry through unchanged.
    .replace(/<sub>([\d?]+)<\/sub>/g, (unused, chars) => [...chars].map((c) => SUB_DIGITS[c] ?? c).join(''))
    .replace(/<sup>([\d+\-?]+)<\/sup>/g, (unused, chars) => [...chars].map((c) => SUP_CHARS[c] ?? c).join(''));

/**
 * @param {string} str
 * @param {number} pos
 * @returns {?string}
 */
const matchElement = (str, pos) => {
    const two = str.slice(pos, pos + 2);
    if (/^[A-Z][a-z]$/.test(two) && ELEMENTS_2.has(two)) {
        return two;
    }
    const one = str[pos];
    if (/^[A-Z]$/.test(one) && ELEMENTS_1.has(one)) {
        return one;
    }
    return null;
};

/**
 * @param {string} str
 * @returns {?{segments: Array, elementCount: number, hasDigit: boolean, hasGroup: boolean}}
 */
const parseFormulaBody = (str) => {
    let pos = 0;
    let elementCount = 0;
    let hasDigit = false;
    let hasGroup = false;
    const segments = [];

    const consumeDigits = () => {
        const start = pos;
        while (pos < str.length && /\d/.test(str[pos])) {
            pos++;
        }
        if (pos > start) {
            hasDigit = true;
            segments.push({type: 'sub', value: str.slice(start, pos)});
        }
    };

    const parseUnits = (closing) => {
        let matchedAny = false;
        while (pos < str.length && str[pos] !== closing) {
            const ch = str[pos];
            if (ch === '(' || ch === '[') {
                const close = ch === '(' ? ')' : ']';
                segments.push({type: 'text', value: ch});
                pos++;
                hasGroup = true;
                if (!parseUnits(close) || str[pos] !== close) {
                    return false;
                }
                segments.push({type: 'text', value: close});
                pos++;
                consumeDigits();
                matchedAny = true;
                continue;
            }
            const element = matchElement(str, pos);
            if (!element) {
                break;
            }
            segments.push({type: 'text', value: element});
            pos += element.length;
            elementCount++;
            consumeDigits();
            matchedAny = true;
        }
        return matchedAny;
    };

    if (!parseUnits(undefined) || pos !== str.length) {
        return null;
    }
    return {segments, elementCount, hasDigit, hasGroup};
};

/**
 * Whether a symbol is either a real recognised element or the "X"
 * unknown-element placeholder.
 *
 * @param {string} symbol
 * @returns {boolean}
 */
const isRecognisedElement = (symbol) =>
    symbol === UNKNOWN_ELEMENT_PLACEHOLDER || ELEMENTS_1.has(symbol) || ELEMENTS_2.has(symbol);

/**
 * @param {string} span
 * @returns {?string}
 */
const tryFormatIsotope = (span) => {
    let match = span.match(/^([A-Z][a-z]?)-(\d+|\?)$/);
    if (match && isRecognisedElement(match[1])) {
        return `<sup>${match[2]}</sup>${match[1]}`;
    }
    match = span.match(/^(\d+|\?)-([A-Z][a-z]?)$/);
    if (match && isRecognisedElement(match[2])) {
        return `<sup>${match[1]}</sup>${match[2]}`;
    }
    return null;
};

/**
 * Check for full nuclear symbol notation, e.g. "238/92U": mass number
 * (superscript) then atomic number (subscript), both to the left of the
 * element symbol. The whole candidate span must match exactly.
 *
 * @param {string} span
 * @returns {?string}
 */
const tryFormatNuclearSymbol = (span) => {
    const match = span.match(/^(\d+|\?)\/(\d+|\?)([A-Z][a-z]?)$/);
    if (match && isRecognisedElement(match[3])) {
        return `<sup>${match[1]}</sup><sub>${match[2]}</sub>${match[3]}`;
    }
    return null;
};

/**
 * @param {{segments: Array}} parsed
 * @param {string} charge
 * @returns {string}
 */
const renderFormula = (parsed, charge) => {
    let html = parsed.segments
        .map((segment) => (segment.type === 'sub' ? `<sub>${segment.value}</sub>` : segment.value))
        .join('');
    if (charge !== '') {
        html += `<sup>${charge}</sup>`;
    }
    return html;
};

/**
 * Try to fully validate and format a single candidate span as chemistry.
 * Returns null (rather than the escaped original, since this module
 * never emits HTML for insertion) when the span does not resolve
 * completely and unambiguously.
 *
 * @param {string} rawSpan
 * @returns {?string}
 */
const processCandidateSpan = (rawSpan) => {
    if (rawSpan === '') {
        return null;
    }

    const bareForIsotopeCheck = rawSpan.replace(/\^/g, '');
    const isNumberFirstIsotope = /^(?:\d+|\?)-[A-Z][a-z]?$/.test(bareForIsotopeCheck);
    const isElementFirstIsotope = /^[A-Z][a-z]?-(?:\d+|\?)$/.test(bareForIsotopeCheck);
    const isNuclearSymbol = /^(?:\d+|\?)\/(?:\d+|\?)[A-Z][a-z]?$/.test(bareForIsotopeCheck);
    const isRecognisedPlaceholderShape = isNumberFirstIsotope || isElementFirstIsotope || isNuclearSymbol;

    if (!isRecognisedPlaceholderShape && /^\d/.test(rawSpan)) {
        // A leading stoichiometric coefficient is real chemistry (unlike a
        // stray trailing "?"), so format the rest and put the coefficient
        // back in front - same as filter_chemformula renders "2H2O".
        const coefficient = rawSpan.match(/^\d+/)[0];
        const rest = rawSpan.slice(coefficient.length);
        if (rest === '') {
            return null;
        }
        const restHtml = processCandidateSpan(rest);
        return restHtml === null ? null : coefficient + restHtml;
    }

    if (!isRecognisedPlaceholderShape && (rawSpan.startsWith('?') || rawSpan.endsWith('?'))) {
        // A "?" is only meaningful as the unknown-number placeholder inside
        // isotope/nuclear-symbol notation (e.g. "?-235", "235/?U").
        // Anywhere else it's just punctuation glued onto a formula with no
        // space (e.g. "H2O?") - peel it and recurse on the chemistry
        // underneath, the same way a leading coefficient is above. As with
        // the coefficient case, the caller uses the original regex match's
        // own offsets for the highlighted range, not this return value.
        const core = rawSpan.replace(/^\?+/, '').replace(/\?+$/, '');
        return core === '' ? null : processCandidateSpan(core);
    }

    const nuclearSymbol = tryFormatNuclearSymbol(bareForIsotopeCheck);
    if (nuclearSymbol !== null) {
        return nuclearSymbol;
    }

    const isotope = tryFormatIsotope(bareForIsotopeCheck);
    if (isotope !== null) {
        return isotope;
    }

    let working = rawSpan;
    const workingBare = working.replace(/\^/g, '');
    let stateLabel = '';
    for (const label of STATE_LABELS) {
        if (workingBare.length > label.length && workingBare.endsWith(label)) {
            stateLabel = label;
            working = working.slice(0, working.length - label.length);
            break;
        }
    }

    let base = working;
    let charge = '';
    const caretIndex = working.indexOf('^');
    if (caretIndex !== -1) {
        const beforeCaret = working.slice(0, caretIndex);
        const afterCaret = working.slice(caretIndex + 1);
        if (/^(?:\d+[+-]|[+-]\d*)$/.test(afterCaret)) {
            base = beforeCaret;
            charge = afterCaret;
        } else {
            return null;
        }
    } else {
        // Charges may be written magnitude-then-sign ("2+") or
        // sign-then-magnitude ("+2"); both are accepted here.
        const chargeMatch = working.match(/^([\s\S]*?)(\d+[+-]|[+-]\d*)$/);
        if (chargeMatch && chargeMatch[1].length > 0) {
            base = chargeMatch[1];
            charge = chargeMatch[2];
        }
    }

    // Normalise a sign-first charge ("+2") to the conventional
    // magnitude-then-sign form ("2+") used in real chemical notation, so
    // the preview always looks the same regardless of which order the
    // author typed it in.
    const signFirst = charge.match(/^([+-])(\d+)$/);
    if (signFirst) {
        charge = signFirst[2] + signFirst[1];
    }

    const parsed = parseFormulaBody(base);
    if (!parsed) {
        return null;
    }

    const isUnambiguousChemistry = parsed.elementCount >= 2 || parsed.hasDigit || parsed.hasGroup || charge !== '';
    if (!isUnambiguousChemistry) {
        return null;
    }

    return renderFormula(parsed, charge) + stateLabel;
};

/**
 * Scan plain text and report every recognised chemistry token: reaction
 * arrows and fully-validated formulas/isotopes/charges. Each entry gives
 * the [start, end) offsets of the token within `text` exactly as typed,
 * plus a unicode preview of how filter_chemformula would render it.
 *
 * This function is pure and read-only: it never mutates `text` and the
 * offsets it returns always refer to the original, unconverted string.
 *
 * @param {string} text plain text, e.g. the content of a single text node.
 * @returns {Array<{start: number, end: number, text: string, preview: string}>}
 */
/**
 * Merge an adjacent "<formula> . <nH2O>" pair of tokens into one, so a
 * hydrate written like "CuSO4.5H2O" highlights as a single unit instead of
 * two with an unhighlighted gap at the separator. The editor text is never
 * changed - only the highlighted range and the preview, which uses a proper
 * middle dot to match how filter_chemformula renders it.
 *
 * @param {object[]} tokens tokens already sorted by start offset
 * @param {string} text the text the tokens were found in
 * @returns {object[]}
 */
const mergeHydratePairs = (tokens, text) => {
    const saltTail = /[A-Za-z)\]]\d{0,3}$/;
    const hydrateWater = /^(?:\d{1,2}|x)?H2O$/;
    const separator = /^\s*[.·]\s*$/;
    const merged = [];
    for (let i = 0; i < tokens.length; i++) {
        const a = tokens[i];
        const b = tokens[i + 1];
        if (b && saltTail.test(a.text) && hydrateWater.test(b.text)
                && separator.test(text.slice(a.end, b.start))) {
            merged.push({
                start: a.start,
                end: b.end,
                text: text.slice(a.start, b.end),
                preview: `${a.preview}·${b.preview}`,
            });
            i++;
        } else {
            merged.push(a);
        }
    }
    return merged;
};

export const detectTokens = (text) => {
    if (!text) {
        return [];
    }

    const tokens = [];

    ARROW_PATTERN.lastIndex = 0;
    let arrowMatch;
    while ((arrowMatch = ARROW_PATTERN.exec(text)) !== null) {
        const preview = (arrowMatch[0] === '<=>' || arrowMatch[0] === '<->') ? '⇌' : '→';
        tokens.push({
            start: arrowMatch.index,
            end: arrowMatch.index + arrowMatch[0].length,
            text: arrowMatch[0],
            preview,
        });
    }

    CANDIDATE_PATTERN.lastIndex = 0;
    let match;
    while ((match = CANDIDATE_PATTERN.exec(text)) !== null) {
        const span = match[0];
        if (!/[A-Z]/.test(span)) {
            continue;
        }
        const html = processCandidateSpan(span);
        // Only surface tokens whose rendering would actually differ from
        // the plain text as typed (i.e. it would gain a subscript or
        // superscript) - a fully-resolved formula like "NaCl" renders
        // identically to its own plain text, so there is nothing useful
        // to show the author for it.
        if (html === null || !/<su[bp]>/.test(html)) {
            continue;
        }
        tokens.push({
            start: match.index,
            end: match.index + span.length,
            text: span,
            preview: toUnicodePreview(html),
        });
    }

    return mergeHydratePairs(tokens.sort((a, b) => a.start - b.start), text);
};
