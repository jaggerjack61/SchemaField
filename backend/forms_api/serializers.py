from decimal import Decimal, DecimalException, InvalidOperation

from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from django.core.files.storage import default_storage
from rest_framework import serializers
from .models import Form, Section, Question, Choice, Response, Answer, FormPermission, FormArchive
from .upload_validation import media_upload_error


class ChoiceSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Choice
        fields = ['id', 'text', 'order']


class QuestionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    choices = ChoiceSerializer(many=True, required=False)
    media_file = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    media_url = serializers.SerializerMethodField()

    class Meta:
        model = Question
        fields = ['id', 'text', 'question_type', 'required', 'order', 'choices', 'media_file', 'media_url']

    def get_media_url(self, obj):
        if obj.media_file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.media_file.url)
            return obj.media_file.url
        return None

    def validate_media_file(self, value):
        if value:
            # Uploads can expire before an abandoned editor is saved. Never
            # persist a new reference to a file that cleanup has removed.
            from pathlib import PurePosixPath
            path = PurePosixPath(value)
            if path.is_absolute() or '..' in path.parts or not value.startswith('question_media/'):
                raise serializers.ValidationError('Invalid question media path.')
            if not default_storage.exists(value):
                raise serializers.ValidationError('This upload is no longer available. Please upload it again.')
        return value


class SectionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    questions = QuestionSerializer(many=True, required=False)

    class Meta:
        model = Section
        fields = ['id', 'title', 'description', 'order', 'questions']


from django.contrib.auth import get_user_model
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer

User = get_user_model()

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'role', 'is_active', 'date_joined']


class CreateUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8, validators=[validate_password])

    class Meta:
        model = User
        fields = ['id', 'email', 'name', 'password', 'role', 'is_active', 'date_joined']
        read_only_fields = ['id', 'is_active', 'date_joined']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class ResetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True, min_length=8, validators=[validate_password])


class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['name']


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8, validators=[validate_password])


class FormPermissionSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)
    
    # Write-only field for creating permission by email
    email = serializers.EmailField(write_only=True, required=False)

    class Meta:
        model = FormPermission
        fields = ['id', 'form', 'user', 'user_email', 'user_name', 'permission_type', 'created_at', 'email']
        read_only_fields = ['user']
        validators = []

    def validate(self, attrs):
        form = attrs.get('form', getattr(self.instance, 'form', None))
        if self.instance and form.pk != self.instance.form_id:
            raise serializers.ValidationError({'form': 'A permission cannot be moved to another form.'})
        request = self.context.get('request')
        if request and form.owner_id != request.user.pk:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('You can only grant permissions for your own forms.')
        if self.instance:
            if 'email' in attrs:
                raise serializers.ValidationError({'email': 'Remove and recreate the permission to change its user.'})
            permission_type = attrs.get('permission_type', self.instance.permission_type)
            if FormPermission.objects.filter(form=form, user=self.instance.user,
                                             permission_type=permission_type).exclude(pk=self.instance.pk).exists():
                raise serializers.ValidationError({'permission_type': 'This user already has this permission.'})
        return attrs

    def create(self, validated_data):
        email = validated_data.pop('email', None)
        if not email:
            raise serializers.ValidationError({'email': 'This field is required.'})
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({'email': 'User with this email does not exist.'})
        permission_type = validated_data['permission_type']
        if FormPermission.objects.filter(
            form=validated_data['form'],
            user=user,
            permission_type=permission_type,
        ).exists():
            raise serializers.ValidationError({'permission_type': 'This user already has this permission for this form.'})

        return FormPermission.objects.create(user=user, **validated_data)


class FormListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the dashboard list view."""
    question_count = serializers.SerializerMethodField()
    section_count = serializers.SerializerMethodField()
    response_count = serializers.SerializerMethodField()
    owner_name = serializers.CharField(source='owner.name', read_only=True)
    is_owned = serializers.SerializerMethodField()
    user_permissions = serializers.SerializerMethodField()
    is_archived = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = ['id', 'title', 'description', 'created_at', 'updated_at',
                  'section_count', 'question_count', 'response_count', 'share_id', 'qr_code',
                  'owner_name', 'is_owned', 'user_permissions', 'is_archived']

    def get_section_count(self, obj):
        if hasattr(obj, '_section_count'):
            return obj._section_count
        return obj.sections.count()

    def get_question_count(self, obj):
        if hasattr(obj, '_question_count'):
            return obj._question_count
        return sum(s.questions.count() for s in obj.sections.all())

    def get_response_count(self, obj):
        if hasattr(obj, '_response_count'):
            return obj._response_count
        return obj.responses.count()

    def get_is_owned(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.owner_id == request.user.id
        return False

    def get_user_permissions(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return []
        if obj.owner_id == request.user.id:
            return ['edit', 'view_responses'] # Owner has all

        if hasattr(obj, '_user_permissions'):
            return [permission.permission_type for permission in obj._user_permissions]

        # Use prefetched permissions if available, avoiding N+1 query.
        if hasattr(obj, '_prefetched_objects_cache') and 'permissions' in obj._prefetched_objects_cache:
            return [p.permission_type for p in obj.permissions.all() if p.user_id == request.user.id]

        # Fallback to queryset lookup (shouldn't happen if queryset is properly prefetched)
        return list(FormPermission.objects.filter(form=obj, user=request.user).values_list('permission_type', flat=True))

    def get_is_archived(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        # Use annotated value if available to avoid N+1 queries
        if hasattr(obj, '_is_archived'):
            return obj._is_archived
        return FormArchive.objects.filter(user=request.user, form=obj).exists()


class FormDetailSerializer(serializers.ModelSerializer):
    """Full nested serializer for create / retrieve / update."""
    sections = SectionSerializer(many=True, required=False)

    class Meta:
        model = Form
        fields = ['id', 'title', 'description', 'deadline', 'created_at', 'updated_at', 'sections', 'share_id', 'qr_code']
        read_only_fields = ['created_at', 'updated_at', 'share_id', 'qr_code']

    # ------------------------------------------------------------------ create
    @transaction.atomic
    def create(self, validated_data):
        sections_data = validated_data.pop('sections', [])
        form = Form.objects.create(**validated_data)
        self._create_sections(form, sections_data)
        return form

    # ------------------------------------------------------------------ update
    @transaction.atomic
    def update(self, instance, validated_data):
        sections_data = validated_data.pop('sections', None)
        instance.title = validated_data.get('title', instance.title)
        instance.description = validated_data.get('description', instance.description)
        instance.deadline = validated_data.get('deadline', instance.deadline)
        instance.save()

        if sections_data is None:
            return instance

        # Load the nested graph once so large forms do not issue a query per node.
        existing_sections = {
            section.id: section
            for section in instance.sections.prefetch_related('questions__choices').all()
        }
        incoming_section_ids = {s.get('id') for s in sections_data if s.get('id')}
        if len(incoming_section_ids) != len([s for s in sections_data if s.get('id')]):
            raise serializers.ValidationError({'sections': 'Duplicate section IDs are not allowed.'})
        unknown_section_ids = incoming_section_ids - set(existing_sections)
        if unknown_section_ids:
            raise serializers.ValidationError({'sections': 'A section does not belong to this form.'})

        removed_section_ids = set(existing_sections) - incoming_section_ids
        if removed_section_ids:
            removed_question_ids = list(
                Question.objects.filter(section_id__in=removed_section_ids).values_list('id', flat=True)
            )
            self._ensure_questions_can_be_deleted(removed_question_ids)
            self._ensure_choices_can_be_deleted(
                Choice.objects.filter(question_id__in=removed_question_ids).values_list('id', flat=True)
            )
            Section.objects.filter(id__in=removed_section_ids).delete()

        sections_to_update = []
        questions_to_update = []
        choices_to_update = []

        for raw_section_data in sections_data:
            s_data = dict(raw_section_data)
            questions_data = s_data.pop('questions', None)
            section_id = s_data.pop('id', None)

            if section_id:
                section = existing_sections[section_id]
                for attr in ('title', 'description', 'order'):
                    if attr not in s_data:
                        continue
                    val = s_data[attr]
                    setattr(section, attr, val)
                sections_to_update.append(section)
            else:
                section = Section.objects.create(form=instance, **s_data)

            if questions_data is None:
                continue

            existing_questions = {
                question.id: question for question in section.questions.all()
            } if section_id else {}
            incoming_q_ids = {q.get('id') for q in questions_data if q.get('id')}
            if len(incoming_q_ids) != len([q for q in questions_data if q.get('id')]):
                raise serializers.ValidationError({'sections': 'Duplicate question IDs are not allowed.'})
            unknown_question_ids = incoming_q_ids - set(existing_questions)
            if unknown_question_ids:
                raise serializers.ValidationError({'sections': 'A question does not belong to this section.'})

            removed_question_ids = set(existing_questions) - incoming_q_ids
            if removed_question_ids:
                self._ensure_questions_can_be_deleted(removed_question_ids)
                self._ensure_choices_can_be_deleted(
                    Choice.objects.filter(question_id__in=removed_question_ids).values_list('id', flat=True)
                )
                Question.objects.filter(id__in=removed_question_ids).delete()

            for raw_question_data in questions_data:
                q_data = dict(raw_question_data)
                choices_data = q_data.pop('choices', None)
                q_id = q_data.pop('id', None)
                media_file = q_data.pop('media_file', serializers.empty)
                q_data.pop('media_url', None)

                if q_id:
                    question = existing_questions[q_id]
                    new_type = q_data.get('question_type', question.question_type)
                    if new_type != question.question_type and question.answers.exists():
                        raise serializers.ValidationError({
                            'sections': 'The type of a question with historical answers cannot be changed. Add a new question instead.',
                        })
                    if media_file is not serializers.empty:
                        question.media_file = media_file or ''
                    for attr in ('text', 'question_type', 'required', 'order'):
                        if attr in q_data:
                            setattr(question, attr, q_data[attr])
                    questions_to_update.append(question)
                else:
                    question = Question.objects.create(
                        section=section,
                        media_file='' if media_file is serializers.empty else (media_file or ''),
                        **q_data,
                    )

                if choices_data is None:
                    continue

                existing_choices = {
                    choice.id: choice for choice in question.choices.all()
                } if q_id else {}
                incoming_c_ids = {c.get('id') for c in choices_data if c.get('id')}
                if len(incoming_c_ids) != len([c for c in choices_data if c.get('id')]):
                    raise serializers.ValidationError({'sections': 'Duplicate choice IDs are not allowed.'})
                unknown_choice_ids = incoming_c_ids - set(existing_choices)
                if unknown_choice_ids:
                    raise serializers.ValidationError({'sections': 'A choice does not belong to this question.'})

                removed_choice_ids = set(existing_choices) - incoming_c_ids
                if removed_choice_ids:
                    self._ensure_choices_can_be_deleted(removed_choice_ids)
                    Choice.objects.filter(id__in=removed_choice_ids).delete()

                new_choices = []
                for raw_choice_data in choices_data:
                    c_data = dict(raw_choice_data)
                    c_id = c_data.pop('id', None)
                    if c_id:
                        choice = existing_choices[c_id]
                        for attr in ('text', 'order'):
                            if attr in c_data:
                                setattr(choice, attr, c_data[attr])
                        choices_to_update.append(choice)
                    else:
                        new_choices.append(Choice(question=question, **c_data))

                if new_choices:
                    Choice.objects.bulk_create(new_choices)

        if sections_to_update:
            Section.objects.bulk_update(sections_to_update, ['title', 'description', 'order'])
        if questions_to_update:
            Question.objects.bulk_update(
                questions_to_update,
                ['text', 'question_type', 'required', 'order', 'media_file'],
            )
        if choices_to_update:
            Choice.objects.bulk_update(choices_to_update, ['text', 'order'])

        instance._prefetched_objects_cache = {}

        return instance

    @staticmethod
    def _ensure_questions_can_be_deleted(question_ids):
        question_ids = list(question_ids)
        if question_ids and Answer.objects.filter(question_id__in=question_ids).exists():
            raise serializers.ValidationError({
                'sections': 'Questions with historical answers cannot be deleted.',
            })

    @staticmethod
    def _ensure_choices_can_be_deleted(choice_ids):
        choice_ids = list(choice_ids)
        if choice_ids and Answer.objects.filter(selected_choices__id__in=choice_ids).exists():
            raise serializers.ValidationError({
                'sections': 'Choices used by historical answers cannot be deleted.',
            })

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _create_sections(form, sections_data):
        for s_data in sections_data:
            questions_data = s_data.pop('questions', [])
            s_data.pop('id', None)
            section = Section.objects.create(form=form, **s_data)

            question_objects = []
            question_choices_map = []

            for q_data in questions_data:
                choices_data = q_data.pop('choices', [])
                q_data.pop('id', None)
                media_file = q_data.pop('media_file', None) or ''
                q_data.pop('media_url', None)
                q = Question(section=section, media_file=media_file, **q_data)
                question_objects.append(q)
                question_choices_map.append(choices_data)

            created_questions = Question.objects.bulk_create(question_objects)

            all_choices = []
            for question, choices_data in zip(created_questions, question_choices_map):
                for c_data in choices_data:
                    c_data.pop('id', None)
                    all_choices.append(Choice(question=question, **c_data))

            if all_choices:
                Choice.objects.bulk_create(all_choices)


class AnswerSerializer(serializers.ModelSerializer):
    question_id = serializers.PrimaryKeyRelatedField(
        queryset=Question.objects.all(), source='question', write_only=True
    )
    question = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Answer
        fields = ['id', 'question_id', 'question', 'text_answer', 'file_answer', 'selected_choices']

    def validate(self, data):
        question = data.get('question')
        text_answer = data.get('text_answer')
        file_answer = data.get('file_answer')

        upload_error = media_upload_error(file_answer)
        if upload_error:
            raise serializers.ValidationError({'file_answer': upload_error})

        if question and text_answer is not None and text_answer != '':
            # Normalise whitespace for all text answers first
            text_answer = text_answer.strip()

            if question.question_type == 'number':
                try:
                    text_answer = str(int(text_answer, 10))
                except (ValueError, TypeError):
                    raise serializers.ValidationError(
                        {'text_answer': 'A valid integer is required for this question.'}
                    )
            elif question.question_type == 'float':
                try:
                    if len(text_answer) > 1024:
                        raise InvalidOperation
                    decimal_value = Decimal(text_answer)
                    if (not decimal_value.is_finite()
                            or abs(decimal_value.as_tuple().exponent) > 308
                            or abs(decimal_value.adjusted()) > 308):
                        raise InvalidOperation
                    # normalize() rounds to the current decimal context and can
                    # overflow. Decimal's string form retains the submitted precision.
                    text_answer = str(decimal_value)
                    if decimal_value == 0:
                        text_answer = '0'
                except (DecimalException, ValueError, TypeError):
                    raise serializers.ValidationError(
                        {'text_answer': 'A valid number is required for this question.'}
                    )

            data['text_answer'] = text_answer

        return data


class ResponseSerializer(serializers.ModelSerializer):
    answers = AnswerSerializer(many=True)

    class Meta:
        model = Response
        fields = ['id', 'form', 'created_at', 'answers']

    def validate(self, data):
        form = data.get('form')
        target_form = self.context.get('form') or form
        if form is None or target_form is None or form.id != target_form.id:
            raise serializers.ValidationError({'form': 'Invalid submission target.'})
        answers = data.get('answers', [])
        questions = {
            question.id: question
            for section in target_form.sections.all()
            for question in section.questions.all()
        }
        seen_question_ids = set()

        for answer in answers:
            question = answer['question']
            if question.id not in questions:
                raise serializers.ValidationError({
                    'answers': 'Every answer must reference a question on this form.',
                })
            if question.id in seen_question_ids:
                raise serializers.ValidationError({
                    'answers': 'Each question can only be answered once.',
                })
            seen_question_ids.add(question.id)

            selected_choices = list(answer.get('selected_choices', []))
            text_answer = (answer.get('text_answer') or '').strip()
            file_answer = answer.get('file_answer')

            if question.question_type in ('multiple_choice', 'multiple_select'):
                if text_answer or file_answer:
                    raise serializers.ValidationError({
                        'answers': f'Question {question.id} only accepts choices.',
                    })
                if question.question_type == 'multiple_choice' and len(selected_choices) > 1:
                    raise serializers.ValidationError({
                        'answers': f'Question {question.id} accepts only one choice.',
                    })
                if any(choice.question_id != question.id for choice in selected_choices):
                    raise serializers.ValidationError({
                        'answers': f'A selected choice does not belong to question {question.id}.',
                    })
            elif question.question_type == 'media':
                if text_answer or selected_choices:
                    raise serializers.ValidationError({
                        'answers': f'Question {question.id} only accepts a media file.',
                    })
            elif file_answer or selected_choices:
                raise serializers.ValidationError({
                    'answers': f'Question {question.id} only accepts a text or numeric answer.',
                })

        missing_required = []
        answers_by_question = {answer['question'].id: answer for answer in answers}
        for question in questions.values():
            if not question.required:
                continue
            answer = answers_by_question.get(question.id)
            if answer is None:
                missing_required.append(question.id)
                continue
            if question.question_type in ('multiple_choice', 'multiple_select'):
                has_value = bool(answer.get('selected_choices'))
            elif question.question_type == 'media':
                has_value = bool(answer.get('file_answer'))
            else:
                has_value = bool((answer.get('text_answer') or '').strip())
            if not has_value:
                missing_required.append(question.id)

        if missing_required:
            raise serializers.ValidationError({
                'answers': f'Required questions are missing answers: {missing_required}.',
            })

        return data

    @transaction.atomic
    def create(self, validated_data):
        answers_data = validated_data.pop('answers', [])
        response = Response.objects.create(**validated_data)
        for answer_data in answers_data:
            selected_choices = answer_data.pop('selected_choices', [])
            answer = Answer.objects.create(response=response, **answer_data)
            answer.selected_choices.set(selected_choices)
        return response
