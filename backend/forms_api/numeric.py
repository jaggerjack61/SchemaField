from decimal import Decimal, InvalidOperation


def decimal_value(value):
    if value is None or len(str(value)) > 8192:
        return None
    try:
        result = Decimal(str(value))
        return result if result.is_finite() else None
    except InvalidOperation:
        return None


def compare_numbers(left, right):
    """Compare numeric text without losing large integer/decimal precision."""
    a, b = decimal_value(left), decimal_value(right)
    if a is None or b is None:
        return (a is not None) - (b is not None)
    return (a > b) - (a < b)


class OrderedChoiceLabels:
    """SQLite aggregate matching the labels displayed in a spreadsheet cell."""
    def __init__(self):
        self.labels = []

    def step(self, text, order, pk):
        self.labels.append((order, pk, text))

    def finalize(self):
        return ', '.join(text for _, _, text in sorted(self.labels))


def register_numeric_functions(sender, connection, **kwargs):
    # SQLite stores our numeric answers as text. A collation lets the database
    # sort all responses before pagination without casting to a lossy float.
    if connection.vendor == 'sqlite':
        connection.connection.create_collation('schemafield_numeric', compare_numbers)
        connection.connection.create_aggregate('schemafield_choice_labels', 3, OrderedChoiceLabels)
        connection.connection.create_function(
            'schemafield_number_compare', 2,
            lambda a, b: None if decimal_value(a) is None or decimal_value(b) is None else compare_numbers(a, b),
            deterministic=True,
        )
