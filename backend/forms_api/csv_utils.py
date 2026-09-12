import re
import unicodedata


NUMBER = re.compile(r'^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$', re.ASCII)


def safe_csv_cell(value, numeric=False):
    """Neutralize spreadsheet formulas in quoted CSV text cells.

    Preserve validated numeric cells (including negatives). Prefix dangerous
    text with a tab inside the quoted field so Excel treats it as text.
    """
    text = str(value if value is not None else '')
    if numeric and NUMBER.fullmatch(text):
        return text
    normalized = unicodedata.normalize('NFKC', text)
    if normalized.startswith(('\t', '\r', '\n')) or normalized.lstrip().startswith(('=', '+', '-', '@')):
        return '\t' + text
    return text
