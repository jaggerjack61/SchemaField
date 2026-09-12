"""Filtering, sorting and bounded summaries shared by response views and CSV."""
import json
import re
from collections import Counter
from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db.models import Aggregate, Count, Exists, Func, IntegerField, OuterRef, Subquery, Value, TextField
from django.db.models.functions import Collate, Coalesce, Lower, TruncDate
from rest_framework.exceptions import ValidationError

from .models import Answer, Question
from .numeric import decimal_value


STOPWORDS = set('about after again against also among because before being below between could does doing during from have having just more most other over same some such than that their there these they this those through very what when where which while with would your you the and for are not was were can'.split())


def filter_responses(form, params):
    responses = form.responses.all()
    try:
        filters = json.loads(params.get('filters', '[]'))
    except (ValueError, TypeError):
        raise ValidationError({'filters': 'Expected a JSON list of answer filters.'})
    if not isinstance(filters, list) or len(filters) > 20:
        raise ValidationError({'filters': 'Provide at most 20 answer filters.'})
    if not filters:
        return responses
    questions = {str(q.pk): q for q in Question.objects.filter(section__form=form).prefetch_related('choices')}
    for criterion in filters:
        if not isinstance(criterion, dict):
            raise ValidationError({'filters': 'Each filter must be an object.'})
        question = questions.get(str(criterion.get('questionId', '')))
        if question is None:
            raise ValidationError({'filters': 'The filter question does not belong to this form.'})
        answers = Answer.objects.filter(response_id=OuterRef('pk'), question=question)
        negate = False
        if question.question_type in ('multiple_choice', 'multiple_select'):
            choice = str(criterion.get('choiceId', ''))
            if choice not in {str(c.pk) for c in question.choices.all()}:
                raise ValidationError({'filters': 'Invalid choice for this question.'})
            answers = answers.filter(selected_choices__pk=choice)
        elif question.question_type == 'media':
            mode = criterion.get('mediaMode')
            if mode not in ('with_file', 'without_file'):
                raise ValidationError({'filters': 'Invalid upload filter.'})
            answers = answers.exclude(file_answer='').exclude(file_answer__isnull=True)
            negate = mode == 'without_file'
        elif question.question_type in ('number', 'float'):
            value = criterion.get('numericValue')
            operator = criterion.get('numericOperator', '=')
            operators = {'=': 'exact', '!=': None, '>': 'gt', '>=': 'gte', '<': 'lt', '<=': 'lte'}
            if decimal_value(value) is None or not isinstance(operator, str) or operator not in operators:
                raise ValidationError({'filters': 'Enter a finite numeric value and valid operator.'})
            answers = answers.annotate(comparison=Func(
                'text_answer', Value(str(value)), function='schemafield_number_compare', output_field=IntegerField(),
            )).filter(comparison__isnull=False)
            answers = answers.exclude(comparison=0) if operator == '!=' else answers.filter(**{f'comparison__{operators[operator]}': 0})
        else:
            text = criterion.get('textQuery')
            if not isinstance(text, str) or not text.strip():
                raise ValidationError({'filters': 'Enter text to match.'})
            answers = answers.filter(text_answer__icontains=text.strip())
        condition = Exists(answers)
        responses = responses.filter(~condition if negate else condition)
    return responses


def order_responses(responses, form, params):
    key = params.get('sort') or 'submittedAt'
    direction = params.get('direction', 'desc')
    if direction not in ('asc', 'desc'):
        raise ValidationError({'direction': 'Use asc or desc.'})
    descending = direction == 'desc'
    if key in ('submittedAt', 'id'):
        field = 'created_at' if key == 'submittedAt' else 'id'
        return responses.order_by(('-' if descending else '') + field, '-id')
    try:
        question = Question.objects.get(pk=int(key), section__form=form)
    except (ValueError, TypeError, OverflowError, Question.DoesNotExist):
        raise ValidationError({'sort': 'Invalid sort column.'})
    answers = Answer.objects.filter(response_id=OuterRef('pk'), question=question).order_by('pk')
    if question.question_type in ('multiple_choice', 'multiple_select'):
        # The display labels, not choice IDs, determine alphabetical ordering.
        through = Answer.selected_choices.through
        labels = through.objects.filter(answer__response_id=OuterRef('pk'), answer__question=question).order_by()
        labels = labels.values('answer__response_id').annotate(label=Aggregate(
            'choice__text', 'choice__order', 'choice__pk', function='schemafield_choice_labels', output_field=TextField(),
        ))
        value = Subquery(labels.values('label')[:1])
    else:
        field = 'file_answer' if question.question_type == 'media' else 'text_answer'
        value = Subquery(answers.values(field)[:1])
    value = Coalesce(value, Value(''), output_field=TextField())
    value = Collate(value, 'schemafield_numeric') if question.question_type in ('number', 'float') else Lower(value)
    return responses.annotate(sort_value=value).order_by(('-' if descending else '') + 'sort_value', '-id')


def response_analytics(form, responses, params):
    try:
        tz = ZoneInfo(params.get('timezone') or 'UTC')
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise ValidationError({'timezone': 'Invalid timezone.'})
    mode = params.get('trend', 'daily')
    if mode not in ('daily', 'weekly'):
        raise ValidationError({'trend': 'Use daily or weekly.'})
    trend = Counter()
    daily = responses.order_by().annotate(day=TruncDate('created_at', tzinfo=tz)).values('day').annotate(count=Count('pk'))
    for row in daily.iterator(chunk_size=500):
        day = row['day']
        if mode == 'weekly':
            day -= timedelta(days=(day.weekday() + 1) % 7)
        trend[day.isoformat()] += row['count']

    answers = Answer.objects.filter(response__in=responses.order_by())
    through = Answer.selected_choices.through
    choices = dict(through.objects.filter(answer__in=answers).order_by().values('choice_id').annotate(count=Count('pk')).values_list('choice_id', 'count'))
    summaries = {}
    for question in Question.objects.filter(section__form=form).prefetch_related('choices'):
        selected = answers.filter(question=question)
        summary = {'answered_count': selected.count()}
        if question.question_type in ('multiple_choice', 'multiple_select'):
            summary['answered_count'] = selected.filter(selected_choices__isnull=False).distinct().count()
            summary['choice_counts'] = {str(c.pk): choices.get(c.pk, 0) for c in question.choices.all()}
        elif question.question_type == 'media':
            uploaded = selected.exclude(file_answer='').exclude(file_answer__isnull=True)
            summary['file_count'] = uploaded.count()
            summary['files'] = [{'id': a.pk, 'url': a.file_answer.url} for a in uploaded.order_by('-response__created_at', '-pk')[:5]]
        else:
            texts = selected.exclude(text_answer__isnull=True).exclude(text_answer='')
            grouped = texts.order_by().values('text_answer').annotate(count=Count('pk'))
            summary['unique_count'] = grouped.count()
            summary['top_answers'] = list(grouped.order_by('-count', 'text_answer')[:5])
            tokens = Counter()
            # Stream grouped values rather than materializing the answer graph.
            for row in grouped.iterator(chunk_size=500):
                for token in re.split('[^a-z0-9]+', row['text_answer'].lower()):
                    if len(token) >= 4 and token not in STOPWORDS:
                        tokens[token] += row['count']
            summary['keywords'] = [{'text': word, 'count': count} for word, count in tokens.most_common(8)]
        summaries[str(question.pk)] = summary
    return {
        'total_count': form.responses.count(),
        'count': responses.count(),
        'questions': summaries,
        'trend': [{'key': day, 'count': count} for day, count in sorted(trend.items())],
    }
