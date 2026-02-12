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

    class Meta:
        model = Question
        fields = ['id', 'text', 'question_type', 'required', 'order', 'choices']


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


class FormPermissionSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source='user.email', read_only=True)
    user_name = serializers.CharField(source='user.name', read_only=True)
    
    # Write-only field for creating permission by email
    email = serializers.EmailField(write_only=True)

    class Meta:
        model = FormPermission
        fields = ['id', 'form', 'user', 'user_email', 'user_name', 'permission_type', 'created_at', 'email']
        read_only_fields = ['user']

    def create(self, validated_data):
        email = validated_data.pop('email')
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise serializers.ValidationError({'email': 'User with this email does not exist.'})
        
        # Check if permission already exists to avoid 500 IntegrityError
        if FormPermission.objects.filter(form=validated_data['form'], user=user).exists():
             raise serializers.ValidationError({'email': 'This user already has permission for this form.'})

        return FormPermission.objects.create(user=user, **validated_data)


class FormListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for the dashboard list view."""
    question_count = serializers.SerializerMethodField()
    section_count = serializers.SerializerMethodField()
    owner_name = serializers.CharField(source='owner.name', read_only=True)
    is_woned = serializers.SerializerMethodField()
    user_permissions = serializers.SerializerMethodField()

    class Meta:
        model = Form
        fields = ['id', 'title', 'description', 'created_at', 'updated_at',
                  'section_count', 'question_count', 'share_id', 'qr_code', 'owner_name', 'is_woned', 'user_permissions']

    def get_section_count(self, obj):
        return obj.sections.count()

    def get_question_count(self, obj):
        return sum(s.questions.count() for s in obj.sections.all())

    def get_is_woned(self, obj):
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
        
        # Return list of permission types
        perms = FormPermission.objects.filter(form=obj, user=request.user).values_list('permission_type', flat=True)
        return list(perms)


class FormDetailSerializer(serializers.ModelSerializer):
    """Full nested serializer for create / retrieve / update."""
    sections = SectionSerializer(many=True, required=False, default=[])

    class Meta:
        model = Form
        fields = ['id', 'title', 'description', 'created_at', 'updated_at', 'sections', 'share_id', 'qr_code']
        read_only_fields = ['created_at', 'updated_at', 'share_id', 'qr_code']

    # ------------------------------------------------------------------ create
    def create(self, validated_data):
        sections_data = validated_data.pop('sections', [])
        form = Form.objects.create(**validated_data)
        self._create_sections(form, sections_data)
        return form

    # ------------------------------------------------------------------ update
    def update(self, instance, validated_data):
        sections_data = validated_data.pop('sections', [])
        instance.title = validated_data.get('title', instance.title)
        instance.description = validated_data.get('description', instance.description)
        instance.save()

        # Replace strategy: delete old sections, create new ones
        instance.sections.all().delete()
        self._create_sections(instance, sections_data)
        return instance

    # ---------------------------------------------------------------- helpers
    @staticmethod
    def _create_sections(form, sections_data):
        for s_data in sections_data:
            questions_data = s_data.pop('questions', [])
            s_data.pop('id', None)
            section = Section.objects.create(form=form, **s_data)
            for q_data in questions_data:
                choices_data = q_data.pop('choices', [])
                q_data.pop('id', None)
                question = Question.objects.create(section=section, **q_data)
                for c_data in choices_data:
                    c_data.pop('id', None)
                    Choice.objects.create(question=question, **c_data)


class AnswerSerializer(serializers.ModelSerializer):
    question_id = serializers.PrimaryKeyRelatedField(
        queryset=Question.objects.all(), source='question', write_only=True
    )
    question = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Answer
        fields = ['id', 'question_id', 'question', 'text_answer', 'file_answer', 'selected_choices']


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

