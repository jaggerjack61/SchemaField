from rest_framework import serializers
from .models import Form, Section, Question, Choice, Response, Answer, FormPermission


class ChoiceSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)

    class Meta:
        model = Choice
        fields = ['id', 'text', 'order']


class QuestionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    choices = ChoiceSerializer(many=True, required=False, default=[])
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


class SectionSerializer(serializers.ModelSerializer):
    id = serializers.IntegerField(required=False)
    questions = QuestionSerializer(many=True, required=False, default=[])

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
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'name', 'password', 'role']

    def create(self, validated_data):
        return User.objects.create_user(**validated_data)


class LoginSerializer(TokenObtainPairSerializer):
    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user).data
        return data


class ResetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(write_only=True)


class UpdateProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['name']


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True, min_length=8)


class FormPermissionSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)
    
    # Write-only field for creating permission by email
    email = serializers.EmailField(write_only=True)

    class Meta:
        model = FormPermission
        fields = ['id', 'form', 'user', 'user_email', 'user_name', 'permission_type', 'created_at', 'email']
        read_only_fields = ['user']
        validators = []

    def create(self, validated_data):
        email = validated_data.pop('email')
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
    owner_name = serializers.CharField(source='owner.name', read_only=True)
    is_owned = serializers.SerializerMethodField()
    user_permissions = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = ['id', 'title', 'description', 'created_at', 'updated_at',
                  'section_count', 'question_count', 'share_id', 'qr_code', 'owner_name', 'is_owned', 'user_permissions']

    def get_section_count(self, obj):
        if hasattr(obj, '_section_count'):
            return obj._section_count
        return obj.sections.count()

    def get_question_count(self, obj):
        if hasattr(obj, '_question_count'):
            return obj._question_count
        return sum(s.questions.count() for s in obj.sections.all())

    def get_is_owned(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return obj.owner == request.user
        return False

    def get_user_permissions(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return []
        if obj.owner == request.user:
            return ['edit', 'view_responses'] # Owner has all

        # Use prefetched permissions if available, avoiding N+1 query
        if hasattr(obj, '_prefetched_objects_cache') and 'permissions' in obj._prefetched_objects_cache:
            return [p.permission_type for p in obj.permissions.all() if p.user == request.user]

        # Fallback to queryset lookup (shouldn't happen if queryset is properly prefetched)
        return list(FormPermission.objects.filter(form=obj, user=request.user).values_list('permission_type', flat=True))


class FormDetailSerializer(serializers.ModelSerializer):
    """Full nested serializer for create / retrieve / update."""
    sections = SectionSerializer(many=True, required=False, default=[])

    class Meta:
        model = Form
        fields = ['id', 'title', 'description', 'deadline', 'created_at', 'updated_at', 'sections', 'share_id', 'qr_code']
        read_only_fields = ['created_at', 'updated_at', 'share_id', 'qr_code']

    # ------------------------------------------------------------------ create
    def create(self, validated_data):
        sections_data = validated_data.pop('sections', [])
        form = Form.objects.create(**validated_data)
        self._create_sections(form, sections_data)
        return form

    # ------------------------------------------------------------------ update
    def update(self, instance, validated_data):
        sections_data = validated_data.pop('sections', None)
        instance.title = validated_data.get('title', instance.title)
        instance.description = validated_data.get('description', instance.description)
        instance.deadline = validated_data.get('deadline', instance.deadline)
        instance.save()

        if sections_data is None:
            return instance

        # Diff-based update: keep existing sections/questions, create new, delete removed
        incoming_section_ids = {s.get('id') for s in sections_data if s.get('id')}
        existing_sections = {s.id: s for s in instance.sections.all()}

        # Delete sections that are no longer in the payload
        for section_id in existing_sections:
            if section_id not in incoming_section_ids:
                existing_sections[section_id].delete()

        for s_data in sections_data:
            questions_data = s_data.pop('questions', [])
            section_id = s_data.pop('id', None)

            if section_id and section_id in existing_sections:
                # Update existing section
                section = existing_sections[section_id]
                for attr, val in s_data.items():
                    setattr(section, attr, val)
                section.save()
            else:
                # Create new section
                section = Section.objects.create(form=instance, **s_data)

            # Handle questions within this section
            incoming_q_ids = {q.get('id') for q in questions_data if q.get('id')}
            existing_questions = {q.id: q for q in section.questions.all()}

            # Delete questions no longer present
            for q_id in existing_questions:
                if q_id not in incoming_q_ids:
                    existing_questions[q_id].delete()

            for q_data in questions_data:
                choices_data = q_data.pop('choices', [])
                q_id = q_data.pop('id', None)
                media_file = q_data.pop('media_file', None) or ''
                q_data.pop('media_url', None)

                if q_id and q_id in existing_questions:
                    # Update existing question
                    question = existing_questions[q_id]
                    question.media_file = media_file
                    for attr, val in q_data.items():
                        setattr(question, attr, val)
                    question.save()
                else:
                    # Create new question
                    question = Question.objects.create(section=section, media_file=media_file, **q_data)

                # Handle choices
                incoming_c_ids = {c.get('id') for c in choices_data if c.get('id')}
                existing_choices = {c.id: c for c in question.choices.all()}

                for c_id in existing_choices:
                    if c_id not in incoming_c_ids:
                        existing_choices[c_id].delete()

                for c_data in choices_data:
                    c_id = c_data.pop('id', None)
                    if c_id and c_id in existing_choices:
                        choice = existing_choices[c_id]
                        for attr, val in c_data.items():
                            setattr(choice, attr, val)
                        choice.save()
                    else:
                        Choice.objects.create(question=question, **c_data)

        return instance

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

        if question and text_answer is not None and text_answer != '':
            # Normalise whitespace for all text answers first
            text_answer = text_answer.strip()

            if question.question_type == 'number':
                try:
                    float_val = float(text_answer)
                    if float_val != int(float_val):
                        raise serializers.ValidationError(
                            {'text_answer': 'A whole number is required for this question.'}
                        )
                    # Normalise: remove leading zeros, store canonical int string
                    text_answer = str(int(float_val))
                except (ValueError, TypeError):
                    raise serializers.ValidationError(
                        {'text_answer': 'A valid integer is required for this question.'}
                    )
            elif question.question_type == 'float':
                try:
                    float_val = float(text_answer)
                    # Normalise: remove leading/trailing zeros artefacts
                    text_answer = str(float_val)
                except (ValueError, TypeError):
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

    def create(self, validated_data):
        answers_data = validated_data.pop('answers', [])
        response = Response.objects.create(**validated_data)
        for answer_data in answers_data:
            selected_choices = answer_data.pop('selected_choices', [])
            answer = Answer.objects.create(response=response, **answer_data)
            answer.selected_choices.set(selected_choices)
        return response

