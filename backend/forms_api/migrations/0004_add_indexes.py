from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('forms_api', '0003_form_deadline'),
    ]

    operations = [
        migrations.AddIndex(
            model_name='form',
            index=models.Index(fields=['share_id'], name='forms_api_form_share_id_idx'),
        ),
        migrations.AddIndex(
            model_name='form',
            index=models.Index(fields=['owner'], name='forms_api_form_owner_idx'),
        ),
        migrations.AddIndex(
            model_name='form',
            index=models.Index(fields=['updated_at'], name='forms_api_form_updated_idx'),
        ),
        migrations.AddIndex(
            model_name='formpermission',
            index=models.Index(fields=['permission_type'], name='forms_api_formperm_perm_idx'),
        ),
        migrations.AddIndex(
            model_name='formpermission',
            index=models.Index(fields=['user'], name='forms_api_formperm_user_idx'),
        ),
        migrations.AddIndex(
            model_name='formpermission',
            index=models.Index(fields=['form', 'user', 'permission_type'], name='forms_api_formperm_form_user_idx'),
        ),
        migrations.AddIndex(
            model_name='question',
            index=models.Index(fields=['question_type'], name='forms_api_question_qtype_idx'),
        ),
        migrations.AddIndex(
            model_name='question',
            index=models.Index(fields=['section'], name='forms_api_question_section_idx'),
        ),
        migrations.AddIndex(
            model_name='response',
            index=models.Index(fields=['created_at'], name='forms_api_response_created_idx'),
        ),
        migrations.AddIndex(
            model_name='response',
            index=models.Index(fields=['form', 'created_at'], name='forms_api_response_form_created_idx'),
        ),
        migrations.AddIndex(
            model_name='answer',
            index=models.Index(fields=['question'], name='forms_api_answer_question_idx'),
        ),
        migrations.AddIndex(
            model_name='answer',
            index=models.Index(fields=['response'], name='forms_api_answer_response_idx'),
        ),
        migrations.AddIndex(
            model_name='choice',
            index=models.Index(fields=['question'], name='forms_api_choice_question_idx'),
        ),
        migrations.AddIndex(
            model_name='section',
            index=models.Index(fields=['form'], name='forms_api_section_form_idx'),
        ),
    ]