from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('forms_api', '0002_question_media_file'),
    ]

    operations = [
        migrations.AddField(
            model_name='form',
            name='deadline',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]