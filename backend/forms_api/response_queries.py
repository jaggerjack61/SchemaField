"""Filtering, sorting and bounded summaries shared by response views and CSV."""
import json
import re
from collections import Counter, defaultdict
from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db.models import Aggregate, Count, Exists, F, Func, IntegerField, OuterRef, Q, Subquery, Value, TextField, Window
from django.db.models.functions import Collate, Coalesce, Lower, RowNumber, TruncDate
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
    combined = Q()
    group = Q()
    for criterion in filters:
        if not isinstance(criterion, dict):
            raise ValidationError({'filters': 'Each filter must be an object.'})
        conjunction = criterion.get('conjunction', 'and')
        if conjunction not in ('and', 'or'):
            raise ValidationError({'filters': 'Use AND or OR to connect filters.'})
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
        condition = Q(~condition if negate else condition)
        if conjunction == 'or':
            combined |= group
            group = condition
        else:
            group &= condition
    return responses.filter(combined | group)


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


TEXT_TYPES = ('short_text', 'long_text')
CHOICE_TYPES = ('multiple_choice', 'multiple_select')


def parse_timezone(params):
    try:
        return ZoneInfo(params.get('timezone') or 'UTC')
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        raise ValidationError({'timezone': 'Invalid timezone.'})


def response_analytics(form, responses, params):
    tz = parse_timezone(params)
    mode = params.get('trend', 'daily')
    if mode not in ('daily', 'weekly'):
        raise ValidationError({'trend': 'Use daily or weekly.'})
    include_keywords = params.get('keywords') in ('1', 'true')
    trend = Counter()
    daily = responses.order_by().annotate(day=TruncDate('created_at', tzinfo=tz)).values('day').annotate(count=Count('pk'))
    for row in daily.iterator(chunk_size=500):
        day = row['day']
        if mode == 'weekly':
            day -= timedelta(days=(day.weekday() + 1) % 7)
        trend[day.isoformat()] += row['count']

    # Each statistic is one grouped query across all questions, so the cost
    # does not grow with the number of questions on the form.
    answers = Answer.objects.filter(response__in=responses.order_by()).order_by()
    through = Answer.selected_choices.through
    choices = dict(through.objects.filter(answer__in=answers).order_by().values('choice_id').annotate(count=Count('pk')).values_list('choice_id', 'count'))

    def counts_by_question(queryset, **aggregate):
        return dict(queryset.values('question_id').annotate(**aggregate).values_list('question_id', *aggregate))

    answered = counts_by_question(answers, n=Count('pk'))
    answered_with_choice = counts_by_question(
        answers.filter(selected_choices__isnull=False), n=Count('pk', distinct=True))
    uploaded = answers.exclude(file_answer='').exclude(file_answer__isnull=True)
    file_counts = counts_by_question(uploaded, n=Count('pk'))
    latest_files = defaultdict(list)
    ranked_files = uploaded.annotate(rank=Window(
        RowNumber(), partition_by=[F('question_id')],
        order_by=[F('response__created_at').desc(), F('pk').desc()],
    )).filter(rank__lte=5).order_by('question_id', 'rank')
    for answer in ranked_files:
        latest_files[answer.question_id].append({'id': answer.pk, 'url': answer.file_answer.url})

    questions = list(Question.objects.filter(section__form=form).prefetch_related('choices'))
    text_question_ids = [q.pk for q in questions if q.question_type not in CHOICE_TYPES and q.question_type != 'media']
    text_stats = {pk: {'unique_count': 0, 'top_answers': [], 'keywords': Counter()} for pk in text_question_ids}
    grouped = (
        answers.filter(question_id__in=text_question_ids)
        .exclude(text_answer__isnull=True).exclude(text_answer='')
        .values('question_id', 'text_answer').annotate(count=Count('pk'))
        .order_by('question_id', '-count', 'text_answer')
    )
    keyword_questions = {q.pk for q in questions if q.question_type in TEXT_TYPES} if include_keywords else set()
    # Stream grouped values rather than materializing the answer graph.
    for row in grouped.iterator(chunk_size=500):
        stats = text_stats[row['question_id']]
        stats['unique_count'] += 1
        if len(stats['top_answers']) < 5:
            stats['top_answers'].append({'text_answer': row['text_answer'], 'count': row['count']})
        if row['question_id'] in keyword_questions:
            for token in re.split('[^a-z0-9]+', row['text_answer'].lower()):
                if len(token) >= 4 and token not in STOPWORDS:
                    stats['keywords'][token] += row['count']

    summaries = {}
    for question in questions:
        if question.question_type in CHOICE_TYPES:
            summary = {
                'answered_count': answered_with_choice.get(question.pk, 0),
                'choice_counts': {str(c.pk): choices.get(c.pk, 0) for c in question.choices.all()},
            }
        elif question.question_type == 'media':
            summary = {
                'answered_count': answered.get(question.pk, 0),
                'file_count': file_counts.get(question.pk, 0),
                'files': latest_files[question.pk],
            }
        else:
            stats = text_stats[question.pk]
            summary = {
                'answered_count': answered.get(question.pk, 0),
                'unique_count': stats['unique_count'],
                'top_answers': stats['top_answers'],
            }
            if question.question_type in TEXT_TYPES and include_keywords:
                summary['keywords'] = [{'text': word, 'count': count} for word, count in stats['keywords'].most_common(8)]
        summaries[str(question.pk)] = summary
    return {
        'total_count': form.responses.count(),
        'count': responses.count(),
        'questions': summaries,
        'trend': [{'key': day, 'count': count} for day, count in sorted(trend.items())],
    }
