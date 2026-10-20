const SEARCH_FOLD_SOURCE =
  "àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ";
const SEARCH_FOLD_TARGET =
  "a".repeat(17) +
  "e".repeat(11) +
  "i".repeat(5) +
  "o".repeat(17) +
  "u".repeat(11) +
  "y".repeat(5) +
  "d";

/** SQL-side equivalent of foldSearchText for trusted expressions only. */
export function foldedSearchSql(expression: string) {
  return `regexp_replace(translate(lower(normalize(${expression}, NFC)), '${SEARCH_FOLD_SOURCE}', '${SEARCH_FOLD_TARGET}'), '[^a-z0-9]+', ' ', 'g')`;
}

/** Vietnamese-friendly literal search: punctuation separates words. */
export function foldSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
