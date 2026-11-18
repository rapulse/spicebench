/**
 * Engineering notation parser and formatter for electronics values.
 * Handles prefixes from femto (10^-15) to tera (10^12).
 * Converts cleanly to standard floats and SPICE-compliant strings.
 */

export interface ParsedEngineeringValue {
  value: number; // Numeric value in standard SI base units (e.g. 10000 for 10k)
  prefix: string; // Engineering prefix, e.g. "k", "u", "meg", or ""
  unit: string; // Unit suffix if present (e.g. "V", "A", "Hz", "F", "H", "Ohm", "Ω")
  raw: string; // The original input string
  spiceValue: string; // Safe representation for SPICE netlists (e.g. "1meg" instead of "1M")
}

// Map of multiplier values to standard engineering prefix
const PREFIX_MULTIPLIERS: Record<string, number> = {
  f: 1e-15,
  p: 1e-12,
  n: 1e-9,
  u: 1e-6,
  µ: 1e-6,
  m: 1e-3,
  k: 1e3,
  K: 1e3,
  meg: 1e6,
  Meg: 1e6,
  MEG: 1e6,
  M: 1e6, // Capital 'M' in user input represents Mega (10^6)
  g: 1e9,
  G: 1e9,
  t: 1e12,
  T: 1e12,
};

const KNOWN_UNITS = new Set([
  "ohm",
  "ohms",
  "ω",
  "Ω",
  "v",
  "volts",
  "volt",
  "a",
  "amp",
  "amps",
  "amperes",
  "hz",
  "f",
  "farad",
  "farads",
  "h",
  "henry",
  "s",
  "sec",
  "second",
  "seconds",
  "w",
  "watt",
  "watts",
  "deg",
  "%",
]);

/**
 * Checks if a string (case-insensitive) represents a known engineering unit.
 */
function isKnownUnit(str: string): boolean {
  return KNOWN_UNITS.has(str.toLowerCase());
}

/**
 * Parses an engineering string (e.g. "10k", "4.7uF", "1M", "100mV", "100") or number into
 * an exact floating-point value and its SPICE-safe representation.
 */
export function parseEngineeringValue(input: string | number): ParsedEngineeringValue {
  if (typeof input === "number") {
    if (!Number.isFinite(input)) {
      throw new Error(`Invalid numeric value: ${input}`);
    }
    const spiceStr = formatForSpice(input);
    return {
      value: input,
      prefix: "",
      unit: "",
      raw: String(input),
      spiceValue: spiceStr,
    };
  }

  const trimmed = input.trim();
  if (trimmed === "") {
    throw new Error(`Empty input value`);
  }

  // Match base number at the beginning: [sign] digits[.digits][e[+-]digits]
  const numMatch = trimmed.match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)\s*(.*)$/);
  if (!numMatch || numMatch[1] === undefined) {
    throw new Error(`Invalid engineering notation: "${input}"`);
  }

  const baseNumber = parseFloat(numMatch[1]);
  if (!Number.isFinite(baseNumber)) {
    throw new Error(`Could not parse base number from: "${input}"`);
  }

  const remainder = (numMatch[2] || "").trim();

  let prefix = "";
  let unit = "";

  if (remainder === "") {
    prefix = "";
    unit = "";
  } else if (/^meg/i.test(remainder)) {
    prefix = remainder.slice(0, 3);
    const unitPart = remainder.slice(3).trim();
    if (unitPart !== "" && !isKnownUnit(unitPart)) {
      throw new Error(`Unknown unit "${unitPart}" in: "${input}"`);
    }
    unit = unitPart;
  } else {
    const firstChar = remainder[0]!;
    const rest = remainder.slice(1).trim();

    // Special check for Farad unit 'F' / 'f'
    if (firstChar === "F" || firstChar === "f") {
      if (rest === "" || isKnownUnit(remainder)) {
        // e.g. "10F" or "10farad" -> unit is Farad
        prefix = "";
        unit = remainder;
      } else if (isKnownUnit(rest)) {
        // e.g. "10fF" -> prefix femto, unit Farad
        prefix = "f";
        unit = rest;
      } else {
        throw new Error(`Invalid engineering suffix "${remainder}" in: "${input}"`);
      }
    } else if (/^[pnuµmkKgGtTM]$/.test(firstChar)) {
      if (rest === "") {
        prefix = firstChar;
        unit = "";
      } else if (isKnownUnit(rest)) {
        prefix = firstChar;
        unit = rest;
      } else if (isKnownUnit(remainder)) {
        prefix = "";
        unit = remainder;
      } else {
        throw new Error(`Unknown unit/suffix "${remainder}" in: "${input}"`);
      }
    } else if (isKnownUnit(remainder)) {
      prefix = "";
      unit = remainder;
    } else {
      throw new Error(`Invalid engineering suffix: "${remainder}"`);
    }
  }

  let multiplier = 1;
  if (prefix) {
    const mult = PREFIX_MULTIPLIERS[prefix];
    if (mult !== undefined) {
      multiplier = mult;
    }
  }

  const finalValue = baseNumber * multiplier;
  const spiceVal = formatForSpice(finalValue);

  return {
    value: finalValue,
    prefix,
    unit,
    raw: input,
    spiceValue: spiceVal,
  };
}

/**
 * Formats a numeric value into a SPICE-compliant value string.
 * CRITICAL RULE: In SPICE (including ngspice), 'm' or 'M' means milli (10^-3).
 * Mega (10^6) MUST be written as 'meg' / 'MEG'.
 */
export function formatForSpice(value: number): string {
  if (value === 0) return "0";
  if (!Number.isFinite(value)) return "0";

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  // Check engineering scales from largest to smallest
  if (abs >= 1e12) return `${sign}${+(abs / 1e12).toPrecision(6)}t`;
  if (abs >= 1e9) return `${sign}${+(abs / 1e9).toPrecision(6)}g`;
  if (abs >= 1e6) return `${sign}${+(abs / 1e6).toPrecision(6)}meg`;
  if (abs >= 1e3) return `${sign}${+(abs / 1e3).toPrecision(6)}k`;
  if (abs >= 1) return `${sign}${+abs.toPrecision(6)}`;
  if (abs >= 1e-3) return `${sign}${+(abs / 1e-3).toPrecision(6)}m`;
  if (abs >= 1e-6) return `${sign}${+(abs / 1e-6).toPrecision(6)}u`;
  if (abs >= 1e-9) return `${sign}${+(abs / 1e-9).toPrecision(6)}n`;
  if (abs >= 1e-12) return `${sign}${+(abs / 1e-12).toPrecision(6)}p`;
  if (abs >= 1e-15) return `${sign}${+(abs / 1e-15).toPrecision(6)}f`;

  return value.toExponential(4);
}

/**
 * Formats a numeric value into human-readable engineering notation with an optional unit symbol.
 * Example: formatEngineeringValue(10000, "Ω") -> "10 kΩ"
 * Example: formatEngineeringValue(0.00001, "F") -> "10 µF"
 */
export function formatEngineeringValue(
  value: number,
  unit: string = "",
  space: boolean = true,
): string {
  if (value === 0) return `0${unit ? (space ? ` ${unit}` : unit) : ""}`;
  if (!Number.isFinite(value)) return `NaN`;

  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const sep = space && unit ? " " : "";

  const formatWith = (scaled: number, pref: string) => {
    const formatted = +scaled.toPrecision(4);
    return `${sign}${formatted}${pref ? (space ? ` ${pref}` : pref) : ""}${pref ? unit : sep + unit}`;
  };

  if (abs >= 1e12) return formatWith(abs / 1e12, "T");
  if (abs >= 1e9) return formatWith(abs / 1e9, "G");
  if (abs >= 1e6) return formatWith(abs / 1e6, "M");
  if (abs >= 1e3) return formatWith(abs / 1e3, "k");
  if (abs >= 1) return formatWith(abs, "");
  if (abs >= 1e-3) return formatWith(abs / 1e-3, "m");
  if (abs >= 1e-6) return formatWith(abs / 1e-6, "µ");
  if (abs >= 1e-9) return formatWith(abs / 1e-9, "n");
  if (abs >= 1e-12) return formatWith(abs / 1e-12, "p");
  if (abs >= 1e-15) return formatWith(abs / 1e-15, "f");

  return `${value.toExponential(3)}${sep}${unit}`;
}
