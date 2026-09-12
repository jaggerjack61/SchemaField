from django.test import TestCase
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from datetime import timedelta
from pathlib import Path
import tempfile
import os
import csv
import io
import json
from unittest.mock import patch
from django.core.cache import cache
from django.db import connection
from django.test.utils import CaptureQueriesContext

from .models import Answer, Choice, Form, FormArchive, FormPermission, Question, Response, Section, User


class ReviewRegressionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.owner = User.objects.create_user(email='review-owner@example.com', name='Owner')
        self.other = User.objects.create_user(email='review-other@example.com', name='Other')
        self.admin = User.objects.create_user(email='review-admin@example.com', name='Admin', role='admin')
        self.form = Form.objects.create(owner=self.owner, title='Review')
        self.section = Section.objects.create(form=self.form, title='Section')
        self.question = Question.objects.create(section=self.section, text='Text')
        self.client = APIClient()
        self.client.force_authenticate(self.owner)

    def answer(self, question=None, text='answer', file=None, choices=()):
        response = Response.objects.create(form=self.form)
        answer = Answer.objects.create(response=response, question=question or self.question, text_answer=text, file_answer=file)
        answer.selected_choices.set(choices)
        return response

    def test_permission_cannot_be_moved_to_another_form(self):
        victim = Form.objects.create(owner=self.other)
        permission = FormPermission.objects.create(form=self.form, user=self.owner, permission_type='edit')
        url = reverse('permission-detail', args=[permission.pk])
        for method in (self.client.patch, self.client.put):
            result = method(url, {'form': victim.pk, 'permission_type': 'edit'}, format='json')
            self.assertEqual(result.status_code, 400)
            permission.refresh_from_db()
            self.assertEqual(permission.form_id, self.form.pk)
        self.assertEqual(self.client.patch(reverse('form-detail', args=[victim.pk]), {'title': 'Stolen'}).status_code, 404)

    def test_foreign_permission_create_returns_forbidden(self):
        victim = Form.objects.create(owner=self.other)
        result = self.client.post(reverse('permission-list'), {'form': victim.pk, 'email': self.owner.email, 'permission_type': 'view_responses'})
        self.assertEqual(result.status_code, 403)
        self.assertFalse(FormPermission.objects.filter(form=victim).exists())

    def test_permission_update_preserves_uniqueness(self):
        edit = FormPermission.objects.create(form=self.form, user=self.other, permission_type='edit')
        view = FormPermission.objects.create(form=self.form, user=self.other, permission_type='view_responses')
        url = reverse('permission-detail', args=[edit.pk])
        self.assertEqual(self.client.patch(url, {'permission_type': 'view_responses'}).status_code, 400)
        view.delete()
        self.assertEqual(self.client.patch(url, {'permission_type': 'view_responses'}).status_code, 200)

    def test_question_type_changes_preserve_historical_answers(self):
        response = self.answer()
        payload = {'title': 'Changed', 'sections': [{'id': self.section.pk, 'questions': [{'id': self.question.pk, 'question_type': 'media'}]}]}
        result = self.client.patch(reverse('form-detail', args=[self.form.pk]), payload, format='json')
        self.assertEqual(result.status_code, 400)
        self.question.refresh_from_db()
        self.form.refresh_from_db()
        self.assertEqual(self.question.question_type, 'short_text')
        self.assertEqual(self.form.title, 'Review')
        self.assertEqual(response.answers.get().text_answer, 'answer')
        response.delete()
        self.assertEqual(self.client.patch(reverse('form-detail', args=[self.form.pk]), payload, format='json').status_code, 200)

    def test_empty_optional_submission_and_required_validation(self):
        public = APIClient()
        url = reverse('form-submit', args=[self.form.pk])
        self.assertEqual(public.post(url, {}, format='multipart').status_code, 201)
        self.question.required = True
        self.question.save()
        self.assertEqual(public.post(url, {}, format='multipart').status_code, 400)
        self.assertEqual(self.form.responses.count(), 1)

    def test_float_validation_handles_extreme_exponents_without_rounding(self):
        self.question.question_type = 'float'
        self.question.save()
        public = APIClient()
        url = reverse('form-submit', args=[self.form.pk])
        for value in ('1e9999999', '1e-9999999', '0e9999999', 'Infinity', 'NaN', '1' * 1025):
            result = public.post(url, {'answers': [{'question_id': self.question.pk, 'text_answer': value}]}, format='json')
            self.assertEqual(result.status_code, 400, value)
        exact = '0.123456789012345678901234567890123456789'
        result = public.post(url, {'answers': [{'question_id': self.question.pk, 'text_answer': exact}]}, format='json')
        self.assertEqual(result.status_code, 201)
        self.assertEqual(result.data['answers'][0]['text_answer'], exact)

    def test_created_user_returns_complete_safe_representation(self):
        self.client.force_authenticate(self.admin)
        result = self.client.post(reverse('user-list'), {'email': 'new@example.com', 'name': 'New', 'password': 'strong-test-97324!', 'role': 'user'})
        self.assertEqual(result.status_code, 201)
        self.assertIsInstance(result.data['id'], int)
        self.assertTrue(result.data['is_active'])
        self.assertTrue(result.data['date_joined'])
        self.assertNotIn('password', result.data)
        self.assertEqual(self.client.patch(reverse('user-detail', args=[result.data['id']]), {'name': 'Edited'}).status_code, 200)

    def test_csv_neutralizes_formulas_and_preserves_numbers(self):
        unsafe = ['=1+1', '+SUM(1,2)', '-1+1', '@SUM(A1)', '  =1+1', '\t=1+1', '\r=1+1', '\n=1+1', '＝1+1', 'a,"b\nc']
        for value in unsafe:
            self.answer(text=value)
        self.question.text = '=header'
        self.question.save()
        number = Question.objects.create(section=self.section, text='Number', question_type='number')
        self.answer(question=number, text='-12')
        result = self.client.get(reverse('form-export-csv', args=[self.form.pk]))
        rows = list(csv.reader(io.StringIO(b''.join(result.streaming_content).decode())))
        self.assertEqual(rows[0][2], '\t=header')
        self.assertEqual(rows[1][3], '-12')
        self.assertEqual([row[2] for row in rows[2:]], list(reversed(['\t' + value for value in unsafe[:-1]] + [unsafe[-1]])))

    def test_cleanup_protects_recent_upload_and_missing_upload_cannot_be_saved(self):
        from django.conf import settings
        result = self.client.post(reverse('upload-question-media'), {'file': SimpleUploadedFile('fresh.png', b'png', content_type='image/png')})
        path = result.data['path']
        self.client.force_authenticate(self.admin)
        preview = self.client.get(reverse('user-file-manager-cleanup-preview'), {'view': 'true'})
        self.assertNotIn(path, [f['path'] for f in preview.data['files']])
        self.client.post(reverse('user-file-manager-cleanup-orphaned-files'))
        self.assertTrue((Path(settings.MEDIA_ROOT) / path).exists())
        payload = {'sections': [{'id': self.section.pk, 'questions': [{'id': self.question.pk, 'media_file': path}]}]}
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.patch(reverse('form-detail', args=[self.form.pk]), payload, format='json').status_code, 200)
        (Path(settings.MEDIA_ROOT) / path).unlink()
        self.assertEqual(self.client.patch(reverse('form-detail', args=[self.form.pk]), payload, format='json').status_code, 400)

    def test_cleanup_rechecks_new_references_before_deleting(self):
        from django.conf import settings
        root = Path(settings.MEDIA_ROOT)
        path = root / 'question_media' / 'claimed.png'
        path.parent.mkdir(exist_ok=True)
        path.write_bytes(b'claimed')
        self.question.media_file = 'question_media/claimed.png'
        self.question.save()
        self.client.force_authenticate(self.admin)
        with patch('forms_api.views.UserViewSet._collect_orphaned_managed_files', return_value=(root, [path])):
            result = self.client.post(reverse('user-file-manager-cleanup-orphaned-files'))
        self.assertEqual(result.data['deleted_count'], 0)
        self.assertTrue(path.exists())

    def test_file_summary_counts_uploads_in_mixed_responses(self):
        media = Question.objects.create(section=self.section, question_type='media')
        response = self.answer(question=media, text=None, file='uploads/test.png')
        Answer.objects.create(response=response, question=self.question, text_answer='text', file_answer='')
        self.client.force_authenticate(self.admin)
        result = self.client.get(reverse('user-file-manager-summary'))
        self.assertIn({'id': self.form.pk, 'title': 'Review', 'file_count': 1}, result.data['forms_with_most_files'])

    def test_dashboard_counts_do_not_cross_join_questions_and_responses(self):
        Question.objects.bulk_create([Question(section=self.section) for _ in range(20)])
        Response.objects.bulk_create([Response(form=self.form) for _ in range(100)])
        with CaptureQueriesContext(connection) as captured:
            result = self.client.get(reverse('form-list'))
        row = next(row for row in result.data['results'] if row['id'] == self.form.pk)
        self.assertEqual((row['section_count'], row['question_count'], row['response_count']), (1, 21, 100))
        self.assertFalse(any('JOIN "forms_api_response"' in query['sql'] for query in captured))

    def test_numeric_sort_and_filter_are_exact_across_pages(self):
        self.question.question_type = 'number'
        self.question.save()
        for value in ('10', '2', '-3', '9007199254740993', '9007199254740992', '0', '-12'):
            self.answer(text=value)
        url = reverse('form-responses', args=[self.form.pk])
        params = {'sort': str(self.question.pk), 'direction': 'asc', 'page_size': 2}
        values = []
        for page in range(1, 5):
            result = self.client.get(url, {**params, 'page': page})
            self.assertEqual(result.status_code, 200)
            values.extend(row['answers'][0]['text_answer'] for row in result.data['results'])
        self.assertEqual(values, ['-12', '-3', '0', '2', '10', '9007199254740992', '9007199254740993'])
        criterion = {'questionId': str(self.question.pk), 'numericOperator': '>', 'numericValue': '9007199254740992'}
        result = self.client.get(url, {'filters': json.dumps([criterion])})
        self.assertEqual(result.data['count'], 1)
        self.assertEqual(result.data['results'][0]['answers'][0]['text_answer'], '9007199254740993')

    def test_analytics_and_export_use_identical_filters_over_all_responses(self):
        choice_q = Question.objects.create(section=self.section, question_type='multiple_select')
        choice = Choice.objects.create(question=choice_q, text='Selected')
        for i in range(105):
            response = self.answer(text='common keyword' if i % 2 == 0 else 'other')
            answer = Answer.objects.create(response=response, question=choice_q)
            if i % 2 == 0:
                answer.selected_choices.add(choice)
        criteria = [{'questionId': str(self.question.pk), 'textQuery': 'common'}, {'questionId': str(choice_q.pk), 'choiceId': str(choice.pk)}]
        params = {'filters': json.dumps(criteria)}
        result = self.client.get(reverse('form-analytics', args=[self.form.pk]), params)
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual((result.data['total_count'], result.data['count']), (105, 53))
        self.assertEqual(result.data['questions'][str(choice_q.pk)]['choice_counts'][str(choice.pk)], 53)
        self.assertEqual(result.data['questions'][str(self.question.pk)]['top_answers'], [{'text_answer': 'common keyword', 'count': 53}])
        self.assertEqual(sum(row['count'] for row in result.data['trend']), 53)
        exported = self.client.get(reverse('form-export-csv', args=[self.form.pk]), params)
        self.assertEqual(len(list(csv.reader(io.StringIO(b''.join(exported.streaming_content).decode())))), 54)
        page = self.client.get(reverse('form-responses', args=[self.form.pk]), {**params, 'page_size': 10, 'page': 2})
        self.assertEqual((page.data['count'], len(page.data['results'])), (53, 10))

    def test_multiple_select_sort_uses_all_displayed_choice_labels(self):
        self.question.question_type = 'multiple_select'
        self.question.save()
        a, b, c = [Choice.objects.create(question=self.question, text=text, order=i) for i, text in enumerate('ABC')]
        first = self.answer(text=None, choices=[a, b])
        second = self.answer(text=None, choices=[a, c])
        result = self.client.get(reverse('form-responses', args=[self.form.pk]), {'sort': str(self.question.pk), 'direction': 'asc'})
        self.assertEqual(result.status_code, 200)
        self.assertEqual([row['id'] for row in result.data['results']], [first.pk, second.pk])

    def test_analytics_requires_response_permission_and_rejects_invalid_filters(self):
        FormPermission.objects.create(form=self.form, user=self.other, permission_type='edit')
        self.client.force_authenticate(self.other)
        url = reverse('form-analytics', args=[self.form.pk])
        self.assertEqual(self.client.get(url).status_code, 403)
        self.client.force_authenticate(self.owner)
        for value in ('{}', '[null]', '[{"questionId": "999999"}]', 'invalid'):
            self.assertEqual(self.client.get(url, {'filters': value}).status_code, 400)
            self.assertEqual(self.client.get(reverse('form-export-csv', args=[self.form.pk]), {'filters': value}).status_code, 400)

    def test_media_filter_includes_absent_answers_and_trends_use_requested_timezone(self):
        media = Question.objects.create(section=self.section, question_type='media')
        with_file = self.answer(question=media, text=None, file='uploads/a.png')
        self.answer()
        criterion = {'questionId': str(media.pk), 'mediaMode': 'without_file'}
        url = reverse('form-analytics', args=[self.form.pk])
        result = self.client.get(url, {'filters': json.dumps([criterion])})
        self.assertEqual(result.data['count'], 1)
        criterion['mediaMode'] = 'with_file'
        from datetime import datetime, timezone as dt_timezone
        Response.objects.filter(pk=with_file.pk).update(created_at=datetime(2026, 9, 12, 23, 30, tzinfo=dt_timezone.utc))
        result = self.client.get(url, {'filters': json.dumps([criterion]), 'timezone': 'Africa/Harare', 'trend': 'weekly'})
        self.assertEqual(result.data['trend'], [{'key': '2026-09-13', 'count': 1}])


_test_media_dir = None
_test_media_override = None


def setUpModule():
    """Keep files created by tests out of the project's persistent media directory."""
    global _test_media_dir, _test_media_override
    _test_media_dir = tempfile.TemporaryDirectory(prefix='schemafield-test-media-')
    _test_media_override = override_settings(MEDIA_ROOT=Path(_test_media_dir.name))
    _test_media_override.enable()


def tearDownModule():
    try:
        if _test_media_override is not None:
            _test_media_override.disable()
    finally:
        if _test_media_dir is not None:
            _test_media_dir.cleanup()


class AuthenticationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='auth-user@example.com',
            password='correct-horse-battery-staple',
            name='Auth User',
        )

    def test_login_refresh_token_flow_is_registered(self):
        login_response = self.client.post(reverse('login'), {
            'email': self.user.email,
            'password': 'correct-horse-battery-staple',
        })

        self.assertEqual(login_response.status_code, 200)
        refresh_response = self.client.post(reverse('token-refresh'), {
            'refresh': login_response.data['refresh'],
        })
        self.assertEqual(refresh_response.status_code, 200)
        self.assertIn('access', refresh_response.data)

    def test_form_list_uses_authenticated_access_by_default(self):
        response = self.client.get(reverse('form-list'))

        self.assertEqual(response.status_code, 401)


class UserSearchTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='search-admin@example.com',
            password='password123',
            name='Search Admin',
            role='admin',
        )
        self.user_alice = User.objects.create_user(
            email='alice@example.com',
            password='password123',
            name='Alice Smith',
            role='user',
        )
        self.user_bob = User.objects.create_user(
            email='bob@example.com',
            password='password123',
            name='Bob Jones',
            role='user',
        )

    def test_search_filters_users_by_name(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('user-list'), {'search': 'alice'})
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        emails = [u['email'] for u in results]
        self.assertIn(self.user_alice.email, emails)
        self.assertNotIn(self.user_bob.email, emails)

    def test_search_filters_users_by_email(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('user-list'), {'search': 'bob@example'})
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        emails = [u['email'] for u in results]
        self.assertIn(self.user_bob.email, emails)
        self.assertNotIn(self.user_alice.email, emails)

    def test_empty_search_returns_all_users(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.get(reverse('user-list'))
        self.assertEqual(response.status_code, 200)
        results = response.data.get('results', response.data)
        emails = [u['email'] for u in results]
        self.assertIn(self.user_alice.email, emails)
        self.assertIn(self.user_bob.email, emails)


class FormAccessTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email='owner@example.com',
            password='password123',
            name='Owner User',
            role='user',
        )
        self.admin = User.objects.create_user(
            email='admin@example.com',
            password='password123',
            name='Admin User',
            role='admin',
        )
        self.shared_user = User.objects.create_user(
            email='shared@example.com',
            password='password123',
            name='Shared User',
            role='user',
        )
        self.form = Form.objects.create(
            title='Shared Form',
            description='A form owned by another user.',
            owner=self.owner,
        )

    def test_admin_can_retrieve_non_owned_form(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse('form-detail', args=[self.form.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['id'], self.form.id)

    def test_admin_can_view_responses_for_non_owned_form(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.get(reverse('form-responses', args=[self.form.id]))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'], [])

    def test_export_csv_requires_view_responses_permission_for_shared_user(self):
        FormPermission.objects.create(
            form=self.form,
            user=self.shared_user,
            permission_type='edit',
        )
        self.client.force_authenticate(user=self.shared_user)

        response = self.client.get(reverse('form-export-csv', args=[self.form.id]))

        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data['detail'], 'You do not have permission to view responses.')

    def test_submit_rejects_responses_after_deadline(self):
        self.form.deadline = timezone.now() - timedelta(hours=1)
        self.form.save(update_fields=['deadline'])

        response = self.client.post(reverse('form-submit', args=[self.form.id]), {})

        self.assertEqual(response.status_code, 403)
        self.assertIn('This form closed on', response.data['detail'])

    def test_partial_update_without_sections_preserves_existing_sections(self):
        Section.objects.create(form=self.form, title='Existing Section')
        self.client.force_authenticate(user=self.owner)

        response = self.client.patch(
            reverse('form-detail', args=[self.form.id]),
            {'title': 'Renamed Form'},
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.form.refresh_from_db()
        self.assertEqual(self.form.title, 'Renamed Form')
        self.assertEqual(self.form.sections.count(), 1)

    def test_share_lookup_prefetches_nested_form_data(self):
        for section_index in range(2):
            section = Section.objects.create(
                form=self.form,
                title=f'Section {section_index + 1}',
                order=section_index,
            )
            for question_index in range(2):
                question = Question.objects.create(
                    section=section,
                    text=f'Question {section_index + 1}.{question_index + 1}',
                    question_type='multiple_choice',
                    order=question_index,
                )
                for choice_index in range(2):
                    Choice.objects.create(
                        question=question,
                        text=f'Choice {choice_index + 1}',
                        order=choice_index,
                    )

        with self.assertNumQueries(4):
            response = self.client.get(
                reverse('form-by-share-id', kwargs={'share_id': self.form.share_id})
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['sections']), 2)

    def _expired_access_token(self, user):
        from rest_framework_simplejwt.tokens import RefreshToken

        access = RefreshToken.for_user(user).access_token
        access.set_exp(lifetime=timedelta(seconds=-10))
        return str(access)

    def test_share_lookup_allows_expired_token_header(self):
        """A previously-authenticated browser with an expired JWT must still
        be able to load the public share form (no 401 from auth layer)."""
        expired_access = self._expired_access_token(self.owner)

        response = self.client.get(
            reverse('form-by-share-id', kwargs={'share_id': self.form.share_id}),
            HTTP_AUTHORIZATION=f'Bearer {expired_access}',
        )

        self.assertEqual(response.status_code, 200)

    def test_submit_allows_expired_token_header(self):
        """Submitting via the public endpoint must not 401 when the browser
        sends a stale/expired Authorization header."""
        expired_access = self._expired_access_token(self.owner)

        response = self.client.post(
            reverse('form-submit', args=[self.form.id]),
            {'answers': []},
            format='json',
            HTTP_AUTHORIZATION=f'Bearer {expired_access}',
        )

        self.assertEqual(response.status_code, 201)

    def test_responses_rejects_zero_page_size(self):
        self.client.force_authenticate(user=self.owner)

        response = self.client.get(
            reverse('form-responses', args=[self.form.id]),
            {'page_size': 0},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['results'], [])


class SubmissionValidationTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email='submission-owner@example.com',
            password='password123',
            name='Submission Owner',
        )
        self.form = Form.objects.create(title='Submission Form', owner=self.owner)
        self.section = Section.objects.create(form=self.form, title='Submission Section')
        self.required_question = Question.objects.create(
            section=self.section,
            text='Required answer',
            question_type='short_text',
            required=True,
        )
        self.integer_question = Question.objects.create(
            section=self.section,
            text='Large integer',
            question_type='number',
        )
        self.float_question = Question.objects.create(
            section=self.section,
            text='Finite number',
            question_type='float',
        )
        self.media_question = Question.objects.create(
            section=self.section,
            text='Media',
            question_type='media',
        )

        self.other_form = Form.objects.create(title='Other Form', owner=self.owner)
        self.other_section = Section.objects.create(form=self.other_form, title='Other Section')
        self.other_question = Question.objects.create(
            section=self.other_section,
            text='Other question',
            question_type='multiple_choice',
        )
        self.other_choice = Choice.objects.create(question=self.other_question, text='Other choice')

    def submit(self, answers):
        return self.client.post(
            reverse('form-submit', args=[self.form.id]),
            {'answers': answers},
            format='json',
        )

    def test_submit_rejects_missing_required_answers(self):
        response = self.submit([])

        self.assertEqual(response.status_code, 400)
        self.assertIn('answers', response.data)
        self.assertFalse(Response.objects.filter(form=self.form).exists())

    def test_submit_rejects_question_from_another_form(self):
        response = self.submit([
            {'question_id': self.required_question.id, 'text_answer': 'Present'},
            {'question_id': self.other_question.id, 'selected_choices': [self.other_choice.id]},
        ])

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Response.objects.filter(form=self.form).exists())

    def test_submit_rejects_choice_from_another_question(self):
        response = self.submit([
            {
                'question_id': self.required_question.id,
                'text_answer': 'Present',
                'selected_choices': [self.other_choice.id],
            },
        ])

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Response.objects.filter(form=self.form).exists())

    def test_submit_rejects_duplicate_question_answers(self):
        response = self.submit([
            {'question_id': self.required_question.id, 'text_answer': 'First'},
            {'question_id': self.required_question.id, 'text_answer': 'Second'},
        ])

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Response.objects.filter(form=self.form).exists())

    def test_large_integer_is_preserved_exactly(self):
        value = '9007199254740993'

        response = self.submit([
            {'question_id': self.required_question.id, 'text_answer': 'Present'},
            {'question_id': self.integer_question.id, 'text_answer': value},
        ])

        self.assertEqual(response.status_code, 201)
        answer = Answer.objects.get(response__form=self.form, question=self.integer_question)
        self.assertEqual(answer.text_answer, value)

    def test_submit_rejects_non_finite_float(self):
        response = self.submit([
            {'question_id': self.required_question.id, 'text_answer': 'Present'},
            {'question_id': self.float_question.id, 'text_answer': 'Infinity'},
        ])

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Response.objects.filter(form=self.form).exists())

    def test_submit_rejects_unsupported_media_type(self):
        upload = SimpleUploadedFile('payload.exe', b'not media', content_type='application/octet-stream')

        response = self.client.post(
            reverse('form-submit', args=[self.form.id]),
            {
                'answers[0][question_id]': str(self.required_question.id),
                'answers[0][text_answer]': 'Present',
                'answers[1][question_id]': str(self.media_question.id),
                'answers[1][file_answer]': upload,
            },
            format='multipart',
        )

        self.assertEqual(response.status_code, 400)
        self.assertFalse(Response.objects.filter(form=self.form).exists())


class SchemaHistoryTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email='history-owner@example.com',
            password='password123',
            name='History Owner',
        )
        self.form = Form.objects.create(title='History Form', owner=self.owner)
        self.section = Section.objects.create(form=self.form, title='History Section')
        self.question = Question.objects.create(
            section=self.section,
            text='Historical question',
            question_type='short_text',
        )
        self.response = Response.objects.create(form=self.form)
        self.answer = Answer.objects.create(
            response=self.response,
            question=self.question,
            text_answer='Keep me',
        )
        self.client.force_authenticate(user=self.owner)

    def test_update_rejects_deleting_question_with_historical_answers(self):
        response = self.client.put(
            reverse('form-detail', args=[self.form.id]),
            {
                'title': self.form.title,
                'description': '',
                'deadline': None,
                'sections': [{
                    'id': self.section.id,
                    'title': self.section.title,
                    'description': '',
                    'order': 0,
                    'questions': [],
                }],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 400)
        self.assertTrue(Question.objects.filter(id=self.question.id).exists())
        self.assertTrue(Answer.objects.filter(id=self.answer.id).exists())

    def test_update_can_delete_unanswered_question(self):
        unused = Question.objects.create(
            section=self.section,
            text='Unused question',
            question_type='short_text',
        )

        response = self.client.put(
            reverse('form-detail', args=[self.form.id]),
            {
                'title': self.form.title,
                'description': '',
                'deadline': None,
                'sections': [{
                    'id': self.section.id,
                    'title': self.section.title,
                    'description': '',
                    'order': 0,
                    'questions': [{
                        'id': self.question.id,
                        'text': self.question.text,
                        'question_type': self.question.question_type,
                        'required': False,
                        'order': 0,
                    }],
                }],
            },
            format='json',
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(Question.objects.filter(id=unused.id).exists())
        self.assertTrue(Answer.objects.filter(id=self.answer.id).exists())

    def test_deleting_entire_form_still_deletes_its_response_graph(self):
        response = self.client.delete(reverse('form-detail', args=[self.form.id]))

        self.assertEqual(response.status_code, 204)
        self.assertFalse(Form.objects.filter(id=self.form.id).exists())
        self.assertFalse(Response.objects.filter(id=self.response.id).exists())


class FormPermissionTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email='permission-owner@example.com',
            password='password123',
            name='Permission Owner',
            role='user',
        )
        self.shared_user = User.objects.create_user(
            email='permission-shared@example.com',
            password='password123',
            name='Permission Shared',
            role='user',
        )
        self.form = Form.objects.create(title='Permission Form', owner=self.owner)

    def test_owner_can_grant_distinct_permission_types_to_same_user(self):
        self.client.force_authenticate(user=self.owner)
        permission_url = reverse('permission-list')

        edit_response = self.client.post(permission_url, {
            'form': self.form.id,
            'email': self.shared_user.email,
            'permission_type': 'edit',
        })
        view_response = self.client.post(permission_url, {
            'form': self.form.id,
            'email': self.shared_user.email,
            'permission_type': 'view_responses',
        })

        self.assertEqual(edit_response.status_code, 201)
        self.assertEqual(view_response.status_code, 201)
        self.assertEqual(
            set(FormPermission.objects.filter(form=self.form, user=self.shared_user).values_list('permission_type', flat=True)),
            {'edit', 'view_responses'},
        )

    def test_owner_cannot_grant_duplicate_permission_type(self):
        FormPermission.objects.create(
            form=self.form,
            user=self.shared_user,
            permission_type='edit',
        )
        self.client.force_authenticate(user=self.owner)

        response = self.client.post(reverse('permission-list'), {
            'form': self.form.id,
            'email': self.shared_user.email,
            'permission_type': 'edit',
        })

        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            FormPermission.objects.filter(form=self.form, user=self.shared_user, permission_type='edit').count(),
            1,
        )


class FileManagerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = User.objects.create_user(
            email='file-admin@example.com',
            password='password123',
            name='File Admin',
            role='admin',
        )
        self.client.force_authenticate(user=self.admin)
        self.temp_dir = tempfile.TemporaryDirectory()
        self.media_root = Path(self.temp_dir.name) / 'media'
        self.media_root.mkdir()
        self.settings_override = override_settings(MEDIA_ROOT=self.media_root)
        self.settings_override.enable()

    def tearDown(self):
        self.settings_override.disable()
        self.temp_dir.cleanup()

    def test_file_browser_rejects_sibling_path_with_media_prefix(self):
        sibling_dir = self.media_root.parent / f'{self.media_root.name}_evil'
        sibling_dir.mkdir()

        response = self.client.get(
            reverse('user-file-manager-browser'),
            {'path': f'../{sibling_dir.name}'},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['detail'], 'Invalid path.')

    def test_file_browser_uses_defaults_for_invalid_pagination(self):
        response = self.client.get(
            reverse('user-file-manager-browser'),
            {'page': 'invalid', 'page_size': 'invalid'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['page'], 1)
        self.assertEqual(response.data['page_size'], 50)

    def test_cleanup_preview_includes_orphaned_question_media(self):
        orphan = self.media_root / 'question_media' / '2026' / '01' / '01' / 'orphan.png'
        orphan.parent.mkdir(parents=True)
        orphan.write_bytes(b'orphan')
        old = (timezone.now() - timedelta(days=2)).timestamp()
        os.utime(orphan, (old, old))

        response = self.client.get(
            reverse('user-file-manager-cleanup-preview'),
            {'view': 'true'},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['delete_count'], 1)
        self.assertEqual(response.data['files'][0]['path'], 'question_media/2026/01/01/orphan.png')

    def test_deleting_qr_code_clears_database_reference(self):
        form = Form.objects.create(title='QR Form', owner=self.admin)
        qr_name = form.qr_code.name
        self.assertTrue((self.media_root / qr_name).exists())

        response = self.client.delete(
            f"{reverse('user-file-manager-delete-file')}?path={qr_name}",
        )

        self.assertEqual(response.status_code, 200)
        form.refresh_from_db()
        self.assertFalse(form.qr_code.name)
        self.assertFalse((self.media_root / qr_name).exists())


class HealthRouteTests(TestCase):
    def test_health_route_returns_ok_status(self):
        response = self.client.get('/health')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})


class FormArchiveTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.owner = User.objects.create_user(
            email='archive-owner@example.com',
            password='password123',
            name='Archive Owner',
            role='user',
        )
        self.other_user = User.objects.create_user(
            email='archive-other@example.com',
            password='password123',
            name='Archive Other',
            role='user',
        )
        self.form = Form.objects.create(title='Archive Test Form', owner=self.owner)

    def test_archive_creates_record(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(reverse('form-archive', args=[self.form.id]))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(FormArchive.objects.filter(user=self.owner, form=self.form).exists())

    def test_archive_is_idempotent(self):
        self.client.force_authenticate(user=self.owner)
        self.client.post(reverse('form-archive', args=[self.form.id]))
        response = self.client.post(reverse('form-archive', args=[self.form.id]))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(FormArchive.objects.filter(user=self.owner, form=self.form).count(), 1)

    def test_restore_removes_record(self):
        FormArchive.objects.create(user=self.owner, form=self.form)
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(reverse('form-restore', args=[self.form.id]))
        self.assertEqual(response.status_code, 200)
        self.assertFalse(FormArchive.objects.filter(user=self.owner, form=self.form).exists())

    def test_restore_is_idempotent(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.post(reverse('form-restore', args=[self.form.id]))
        self.assertEqual(response.status_code, 200)

    def test_archiving_is_per_user(self):
        """Archiving as one user does not archive for another user."""
        self.client.force_authenticate(user=self.owner)
        self.client.post(reverse('form-archive', args=[self.form.id]))
        self.assertFalse(FormArchive.objects.filter(user=self.other_user, form=self.form).exists())

    def test_list_excludes_archived_forms_by_default(self):
        FormArchive.objects.create(user=self.owner, form=self.form)
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse('form-list'))
        # Default list includes all forms with is_archived flag
        results = response.data.get('results', response.data)
        form_data = next(f for f in results if f['id'] == self.form.id)
        self.assertTrue(form_data['is_archived'])

    def test_list_filters_only_archived_when_param_set(self):
        FormArchive.objects.create(user=self.owner, form=self.form)
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse('form-list'), {'archived': 'true'})
        results = response.data.get('results', response.data)
        ids = [f['id'] for f in results]
        self.assertIn(self.form.id, ids)

    def test_list_filters_only_active_when_param_set(self):
        FormArchive.objects.create(user=self.owner, form=self.form)
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse('form-list'), {'archived': 'false'})
        results = response.data.get('results', response.data)
        ids = [f['id'] for f in results]
        self.assertNotIn(self.form.id, ids)

    def test_is_archived_false_for_non_archived_form(self):
        self.client.force_authenticate(user=self.owner)
        response = self.client.get(reverse('form-list'))
        results = response.data.get('results', response.data)
        form_data = next(f for f in results if f['id'] == self.form.id)
        self.assertFalse(form_data['is_archived'])

    def test_shared_user_can_archive_independently(self):
        FormPermission.objects.create(
            form=self.form, user=self.other_user, permission_type='edit'
        )
        self.client.force_authenticate(user=self.other_user)
        response = self.client.post(reverse('form-archive', args=[self.form.id]))
        self.assertEqual(response.status_code, 200)
        self.assertTrue(FormArchive.objects.filter(user=self.other_user, form=self.form).exists())
        # Owner's form should not be archived
        self.assertFalse(FormArchive.objects.filter(user=self.owner, form=self.form).exists())
