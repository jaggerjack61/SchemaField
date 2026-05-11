from django.test import TestCase
from django.test import override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from datetime import timedelta
from pathlib import Path
import tempfile

from .models import Choice, Form, FormPermission, Question, Section, User


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


class HealthRouteTests(TestCase):
    def test_health_route_returns_ok_status(self):
        response = self.client.get('/health')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})