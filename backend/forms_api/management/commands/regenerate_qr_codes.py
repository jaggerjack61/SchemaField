from django.core.management.base import BaseCommand

from forms_api.models import Form


class Command(BaseCommand):
    help = (
        'Regenerates form QR codes, e.g. after changing FRONTEND_BASE_URL. '
        'By default only forms without a QR code are processed.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--all', action='store_true', help='Regenerate every QR code, not just missing ones.')

    def handle(self, *args, **options):
        forms = Form.objects.all() if options['all'] else Form.objects.filter(qr_code='')
        count = 0
        for form in forms.iterator(chunk_size=200):
            form.regenerate_qr_code()
            count += 1
        self.stdout.write(self.style.SUCCESS(f'Regenerated {count} QR code(s).'))
