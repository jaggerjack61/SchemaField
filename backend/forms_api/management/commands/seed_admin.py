from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds the database with a default admin user'

    def handle(self, *args, **options):
        email = 'admin@example.com'
        password = '12345'
        
        if not User.objects.filter(email=email).exists():
            User.objects.create_superuser(
                email=email,
                name='Admin User',
                password=password
            )
            self.stdout.write(self.style.SUCCESS(f'Successfully created admin user: {email}'))
        else:
            self.stdout.write(self.style.WARNING(f'Admin user {email} already exists'))
