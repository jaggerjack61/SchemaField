import os

from django.core.management.base import BaseCommand

from forms_api.models import Answer, answer_upload_to


class Command(BaseCommand):
    help = (
        'Renames respondent uploads saved under their original filename to an '
        'unguessable name. Uploads made after migration 0007 already use one.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='List the files that would be renamed.')

    def handle(self, *args, **options):
        renamed = 0
        answers = Answer.objects.exclude(file_answer='').exclude(file_answer__isnull=True)
        for answer in answers.iterator(chunk_size=200):
            old_name = answer.file_answer.name
            stem = os.path.splitext(os.path.basename(old_name))[0]
            if len(stem) == 32 and all(c in '0123456789abcdef' for c in stem):
                continue
            storage = answer.file_answer.storage
            if not storage.exists(old_name):
                self.stderr.write(f'Missing file, skipped: {old_name}')
                continue
            if options['dry_run']:
                self.stdout.write(old_name)
                renamed += 1
                continue
            with storage.open(old_name, 'rb') as source:
                new_name = storage.save(answer_upload_to(answer, old_name), source)
            Answer.objects.filter(pk=answer.pk).update(file_answer=new_name)
            storage.delete(old_name)
            renamed += 1

        verb = 'Would rename' if options['dry_run'] else 'Renamed'
        self.stdout.write(self.style.SUCCESS(f'{verb} {renamed} upload(s).'))
