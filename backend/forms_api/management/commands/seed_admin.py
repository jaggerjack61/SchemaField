import os
import secrets

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError

User = get_user_model()


class Command(BaseCommand):
    help = (
        'Creates an admin user. The password comes from --password or '
        'SEED_ADMIN_PASSWORD; if neither is set a random one is generated and printed.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--email', default='admin@example.com')
        parser.add_argument('--name', default='Admin User')
        parser.add_argument('--password', help='Must pass the configured password validators.')

    def handle(self, *args, **options):
        email = options['email']
        if User.objects.filter(email=email).exists():
            self.stdout.write(self.style.WARNING(f'Admin user {email} already exists'))
            return

        password = options['password'] or os.environ.get('SEED_ADMIN_PASSWORD')
        generated = not password
        if generated:
            password = secrets.token_urlsafe(16)

        user = User(email=email, name=options['name'])
        try:
            validate_password(password, user)
        except ValidationError as exc:
            raise CommandError(' '.join(exc.messages))

        User.objects.create_superuser(email=email, name=options['name'], password=password)
        self.stdout.write(self.style.SUCCESS(f'Successfully created admin user: {email}'))
        if generated:
            self.stdout.write(f'Generated password (shown once): {password}')
