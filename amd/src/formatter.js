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

/**
 * Subatomic particle symbols recognised in nuclear symbol notation
 * (mass/atomic-number/symbol), e.g. "0/-1e" (beta particle), "1/0n"
 * (neutron), "1/1p" (proton). Unlike element symbols these are lowercase
 * and have no entry in ELEMENTS_1 / ELEMENTS_2, so they are checked
 * separately.
 */
const PARTICLE_SYMBOLS = new Set(['e', 'n', 'p']);

const ARROW_PATTERN = /<=>|<->|-->|->/g;

const CANDIDATE_PATTERN = /[A-Za-z0-9()[\]+\-^/?]+/g;

// Text wrapped in a pair of backticks on one line is an author-marked
// literal that filter_chemformula leaves as typed (see its LITERAL_PATTERN).
const LITERAL_PATTERN = /`[^`\r\n]+`/g;

/**
 * Scientific notation, matching the three shapes filter_chemformula
 * accepts: an "E" exponent ("6.02E23", "1.6e-19"), an explicit power of
 * ten ("6.02x10^23", with x / X / * / U+00B7 / U+00D7 / U+22C5 and
 * optional spaces around the sign and the caret), and a bare power of
 * ten ("10^23"). A digit is required immediately before the "e"/"E" so
 * element symbols that contain one (Fe, Ne, Se, Te, ...) can never
 * match, and the \w / "." lookarounds keep every shape from firing
 * inside a longer word or a glued formula token. The bare "10^n"
 * pattern is listed last so it does not pre-empt the tail of a full
 * "mantissa x 10^n" span (see {@link detectSciNotation}).
 */
const SCINOTATION_PATTERNS = [
    /(?<![\w.])(\d+(?:\.\d+)?)[eE]([+-]?\d+)(?![\w.])/g,
    /(?<![\w.])(\d+(?:\.\d+)?)\s*[xX*·×⋅]\s*10\s*\^\s*([+-]?\d+)(?![\w.])/gu,
    /(?<![\w.])10\s*\^\s*([+-]?\d+)(?![\w.])/g,
];

const SUB_DIGITS = {
    '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉',
    '-': '₋',
};

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
    // any character with no map entry through unchanged. "-" is included
    // for a particle's negative atomic number (e.g. the beta particle,
    // "0/-1e").
    .replace(/<sub>([\d\-?]+)<\/sub>/g, (unused, chars) => [...chars].map((c) => SUB_DIGITS[c] ?? c).join(''))
    .replace(/<sup>([\d+\-?]+)<\/sup>/g, (unused, chars) => [...chars].map((c) => SUP_CHARS[c] ?? c).join(''));

/**
 * Detect every scientific-notation span in the text and report it as a
 * token whose preview matches how filter_chemformula renders it, e.g.
 * "6.02x10^23" -> "6.02 × 10²³" and a bare "10^23" -> "10²³". As with
 * every other detector in this module the editor text is never touched:
 * only the [start, end) offsets of the span as typed and a unicode
 * preview are returned.
 *
 * @param {string} text
 * @returns {Array<{start: number, end: number, text: string, preview: string}>}
 */
const detectSciNotation = (text) => {
    const tokens = [];
    const claimed = [];
    for (const pattern of SCINOTATION_PATTERNS) {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;
            // Skip a bare "10^n" hit that falls inside a "mantissa x 10^n"
            // span already claimed by an earlier pattern.
            if (claimed.some(([claimedStart, claimedEnd]) => start < claimedEnd && end > claimedStart)) {
                continue;
            }
            claimed.push([start, end]);
            const hasMantissa = match[2] !== undefined;
            const exponent = (hasMantissa ? match[2] : match[1]).replace(/^\+/, '');
            const superscript = [...exponent].map((c) => SUP_CHARS[c] ?? c).join('');
            tokens.push({
                start,
                end,
                text: match[0],
                preview: `${hasMantissa ? `${match[1]} × ` : ''}10${superscript}`,
            });
        }
    }
    return tokens;
};

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
 * element symbol. Also covers subatomic particles, whose atomic number
 * may be negative (e.g. "0/-1e", the beta particle) and whose symbol is
 * a bare lowercase letter (see PARTICLE_SYMBOLS). The whole candidate
 * span must match exactly.
 *
 * @param {string} span
 * @returns {?string}
 */
const tryFormatNuclearSymbol = (span) => {
    const match = span.match(/^(\d+|\?)\/(-?\d+|\?)([A-Z][a-z]?|[enp])$/);
    if (match && (isRecognisedElement(match[3]) || PARTICLE_SYMBOLS.has(match[3]))) {
        return `<sup>${match[1]}</sup><sub>${match[2]}</sub>${match[3]}`;
    }
    return null;
};

/**
 * Re-split a caretless "digits+sign" charge on a polyatomic ion, where the
 * subscript and the charge magnitude run together (e.g. "SO42-"). Mirrors
 * filter_chemformula's split_caretless_polyatomic_charge(): one digit other
 * than 1 is the subscript and the charge is 1 ("NO3-"); with two or more the
 * last digit is the charge ("SO42-"). A lone "1" stays the charge ("H3O1+").
 * Single elements ("Mg2+") and a "]" ending ("[Cu(NH3)4]2+") are left alone.
 *
 * @param {string} base the formula before the charge.
 * @param {string} charge the charge as first split off.
 * @returns {Array<string>} the (possibly re-split) base and charge.
 */
const splitCaretlessPolyatomicCharge = (base, charge) => {
    const m = charge.match(/^(\d+)([+-])$/);
    if (!m || m[1] === '1' || !/[A-Za-z)]$/.test(base)) {
        return [base, charge];
    }
    const parsed = parseFormulaBody(base);
    if (parsed === null || (parsed.elementCount < 2 && !parsed.hasGroup)) {
        return [base, charge];
    }
    const digits = m[1];
    const magnitude = digits.length >= 2 ? digits.slice(-1) : '';
    return [base + digits.slice(0, digits.length - magnitude.length), magnitude + m[2]];
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
    const isNuclearSymbol = /^(?:\d+|\?)\/(?:-?\d+|\?)(?:[A-Z][a-z]?|[enp])$/.test(bareForIsotopeCheck);
    const isRecognisedPlaceholderShape = isNumberFirstIsotope || isElementFirstIsotope || isNuclearSymbol;

    const coefficientMatch = rawSpan.match(/^(?:\d+|x(?=[A-Z]))/);
    if (!isRecognisedPlaceholderShape && coefficientMatch) {
        // A leading stoichiometric coefficient is real chemistry (unlike a
        // stray trailing "?"), so format the rest and put the coefficient
        // back in front - same as filter_chemformula renders "2H2O".
        // A variable "x" counts too, as in the hydrate "Na2CO3·xH2O".
        const coefficient = coefficientMatch[0];
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
        // underneath, the same way a leading coefficient is above - and,
        // like the coefficient, put it back around the result, as
        // filter_chemformula does.
        const leading = rawSpan.match(/^\?*/)[0];
        const trailing = rawSpan.match(/\?*$/)[0];
        const core = rawSpan.slice(leading.length, rawSpan.length - trailing.length);
        const coreHtml = core === '' ? null : processCandidateSpan(core);
        return coreHtml === null ? null : leading + coreHtml + trailing;
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
            [base, charge] = splitCaretlessPolyatomicCharge(base, charge);
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
 * Find the hydrate salt written just before a water token, e.g. "CuSO4" in
 * "CuSO4.5H2O" or "LiCl" in "LiCl . H2O" - mirroring filter_chemformula's
 * convert_hydrate_dots(): the word before the separator must parse as a
 * real formula (so "The end. H2O" doesn't qualify), and a full stop glued
 * to it and followed by a space ends a sentence rather than being a
 * hydrate dot ("... is CO2. H2O is ...").
 *
 * @param {string} text
 * @param {number} waterStart offset of the water token
 * @returns {?{start: number, end: number, text: string}}
 */
const findHydrateSalt = (text, waterStart) => {
    const match = text.slice(0, waterStart).match(/(?<![A-Za-z0-9()[\]])([A-Za-z0-9()[\]]+)(\s*[.·]\s*)$/);
    if (!match || /^\.\s+$/.test(match[2])) {
        return null;
    }
    const salt = match[1];
    const body = salt.replace(/^\d+/, '');
    if (!/[A-Za-z)\]]\d{0,3}$/.test(salt) || body === '' || parseFormulaBody(body) === null) {
        return null;
    }
    return {start: match.index, end: match.index + salt.length, text: salt};
};

/**
 * Merge a hydrate's salt and water into one token, so "CuSO4.5H2O"
 * highlights as a single unit instead of two with an unhighlighted gap at
 * the separator. The editor text is never changed - only the highlighted
 * range and the preview, which uses a proper middle dot to match how
 * filter_chemformula renders it. The salt needn't be a token itself: one
 * with nothing to subscript (e.g. "LiCl" in "LiCl.H2O") is still merged.
 *
 * @param {object[]} tokens tokens already sorted by start offset
 * @param {string} text the text the tokens were found in
 * @returns {object[]}
 */
const mergeHydratePairs = (tokens, text) => {
    const hydrateWater = /^(?:\d{1,2}|x)?H2O$/;
    const merged = [];
    for (const token of tokens) {
        const salt = hydrateWater.test(token.text) ? findHydrateSalt(text, token.start) : null;
        const previous = merged[merged.length - 1];
        const previousIsSalt = Boolean(salt && previous && previous.start === salt.start && previous.end === salt.end);
        if (salt === null || (previous && previous.end > salt.start && !previousIsSalt)) {
            merged.push(token);
            continue;
        }
        if (previousIsSalt) {
            merged.pop();
        }
        merged.push({
            start: salt.start,
            end: token.end,
            text: text.slice(salt.start, token.end),
            preview: `${previousIsSalt ? previous.preview : salt.text}·${token.preview}`,
        });
    }
    return merged;
};

/**
 * Strip brackets from the edges of a span while its brackets are unbalanced
 * and the excess one sits at the leading (or trailing) edge - e.g.
 * "(C6H12O6" -> "C6H12O6", "C6H12O6)" -> "C6H12O6".
 *
 * @param {string} span
 * @returns {{peeled: string, lead: number, trail: number}} The remaining span
 *     and how many characters were removed from each edge.
 */
/**
 * Classify every character of text as ordinary text ("t"), the interior of
 * a backtick literal ("l") or one of its backticks ("d") - the same mask
 * filter_chemformula's formatter::literal_mask() builds.
 *
 * Exposed so the highlighter can pair backticks over text split across
 * several nodes (e.g. "`<em>2.5x10^-3`</em>") and hand each node its slice.
 *
 * @param {string} text
 * @returns {string} one mask character per character of text.
 */
export const getLiteralMask = (text) => {
    let mask = 't'.repeat(text.length);
    for (const match of text.matchAll(LITERAL_PATTERN)) {
        const length = match[0].length;
        mask = mask.slice(0, match.index) + 'd' + 'l'.repeat(length - 2) + 'd' + mask.slice(match.index + length);
    }
    return mask;
};

const peelUnbalancedBrackets = (span) => {
    let peeled = span;
    let lead = 0;
    let trail = 0;
    for (;;) {
        const opens = (peeled.match(/[([]/g) || []).length;
        const closes = (peeled.match(/[)\]]/g) || []).length;
        if (opens > closes && /^[([]/.test(peeled)) {
            peeled = peeled.slice(1);
            lead++;
        } else if (closes > opens && /[)\]]$/.test(peeled)) {
            peeled = peeled.slice(0, -1);
            trail++;
        } else {
            return {peeled, lead, trail};
        }
    }
};

/**
 * @param {string} text
 * @param {?string} literalMask this text's slice of a {@link getLiteralMask}
 *     computed over a wider context; computed from text alone if omitted.
 * @returns {Array<{start: number, end: number, text: string, preview: string}>}
 */
export const detectTokens = (text, literalMask = null) => {
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
        // The uppercase check alone would miss subatomic-particle nuclear
        // symbols (e.g. "0/-1e"), whose symbol is a bare lowercase letter.
        if (!/[A-Z]/.test(span) && !/^(?:\d+|\?)\/(?:-?\d+|\?)[enp]$/.test(span)) {
            continue;
        }
        let html = processCandidateSpan(span);
        let start = match.index;
        let end = match.index + span.length;
        if ((html === null || !/<su[bp]>/.test(html)) && span.length >= 2) {
            // A span wrapped in its own outer "(...)"/"[...]" with nothing
            // trailing the closing bracket - e.g. "(SO4^2-)", used to
            // parenthesise an entire ion in prose - is not a formula group
            // (a real group like "Ca(OH)2" is followed by a subscript and
            // already resolves above via processCandidateSpan(span)); only
            // the interior is chemistry, so retry on it alone and, if that
            // resolves, highlight just the interior - leaving the brackets
            // outside the range, matching how filter_chemformula renders
            // the same text (brackets kept as plain literal text).
            const openChar = span[0];
            const closeChar = span[span.length - 1];
            const matchingClose = openChar === '(' ? ')' : (openChar === '[' ? ']' : null);
            if (matchingClose !== null && closeChar === matchingClose) {
                const inner = span.slice(1, -1);
                if (inner !== '' && !inner.includes(openChar) && !inner.includes(closeChar)) {
                    const innerHtml = processCandidateSpan(inner);
                    if (innerHtml !== null && /<su[bp]>/.test(innerHtml)) {
                        html = innerHtml;
                        start = match.index + 1;
                        end = match.index + span.length - 1;
                    }
                }
            }
        }
        if ((html === null || !/<su[bp]>/.test(html)) && span.length >= 2) {
            // A bracket belonging to the surrounding prose rather than the
            // formula - e.g. the "(" in "glucose (C6H12O6, molar mass ...)",
            // where the comma ends the span before the matching ")"
            // arrives. Peel unbalanced edge brackets and retry, highlighting
            // only the remainder - matching filter_chemformula.
            const {peeled, lead, trail} = peelUnbalancedBrackets(span);
            if (peeled !== span && peeled !== '') {
                const peeledHtml = processCandidateSpan(peeled);
                if (peeledHtml !== null && /<su[bp]>/.test(peeledHtml)) {
                    html = peeledHtml;
                    start = match.index + lead;
                    end = match.index + span.length - trail;
                }
            }
        }
        // Only surface tokens whose rendering would actually differ from
        // the plain text as typed (i.e. it would gain a subscript or
        // superscript) - a fully-resolved formula like "NaCl" renders
        // identically to its own plain text, so there is nothing useful
        // to show the author for it.
        if (html === null || !/<su[bp]>/.test(html)) {
            continue;
        }
        tokens.push({
            start,
            end,
            text: text.slice(start, end),
            preview: toUnicodePreview(html),
        });
    }

    tokens.push(...detectSciNotation(text));

    // Drop anything touching an author-marked backtick literal, e.g.
    // "`PS5`" - filter_chemformula renders its interior exactly as typed.
    const mask = literalMask === null ? getLiteralMask(text) : literalMask;
    const outsideLiterals = tokens.filter((token) => !/[^t]/.test(mask.slice(token.start, token.end)));

    return mergeHydratePairs(outsideLiterals.sort((a, b) => a.start - b.start), text);
};
