from django.test import TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient
from datetime import timedelta

from .models import Form, FormPermission, User


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
        self.assertEqual(response.data, [])

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


class HealthRouteTests(TestCase):
    def test_health_route_returns_ok_status(self):
        response = self.client.get('/health')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {'status': 'ok'})