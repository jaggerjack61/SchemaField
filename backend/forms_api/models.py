from django.db import models
import uuid
import qrcode
from io import BytesIO
from django.core.files.base import ContentFile
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.conf import settings


class UserManager(BaseUserManager):
    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Users must have an email address')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('role', 'admin')
        return self.create_user(email, password, **extra_fields)


class User(AbstractBaseUser, PermissionsMixin):
    ROLE_CHOICES = (
        ('admin', 'Admin'),
        ('user', 'User'),
    )
    email = models.EmailField(unique=True)
    name = models.CharField(max_length=255)
    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default='user')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    date_joined = models.DateTimeField(auto_now_add=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['name']

    def __str__(self):
        return self.email


class Form(models.Model):
    """A form — the top-level container."""
    title = models.CharField(max_length=255, default='Untitled Form')
    description = models.TextField(blank=True, default='')
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='forms', null=True, blank=True)
    share_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False, null=True)
    qr_code = models.ImageField(upload_to='qrcodes/', blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']

    def __str__(self):
        return self.title

    def save(self, *args, **kwargs):
        # Save first to ensure share_id is set
        is_new = self.pk is None
        super().save(*args, **kwargs)
        if is_new or not self.qr_code:
            self._generate_qr_code()

    def _generate_qr_code(self):
        url = f'http://localhost:5173/f/{self.share_id}'
        qr = qrcode.QRCode(version=1, box_size=10, border=4)
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(fill_color='#7c5cfc', back_color='#1c1c27')
        buf = BytesIO()
        img.save(buf, format='PNG')
        buf.seek(0)
        self.qr_code.save(f'qr_{self.share_id}.png', ContentFile(buf.read()), save=True)


class Section(models.Model):
    """A section within a form."""
    form = models.ForeignKey(Form, related_name='sections', on_delete=models.CASCADE)
    title = models.CharField(max_length=255, default='Untitled Section')
    description = models.TextField(blank=True, default='')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return f'{self.form.title} — {self.title}'


class Question(models.Model):
    """A question within a section."""

    QUESTION_TYPES = [
        ('short_text', 'Short Text'),
        ('long_text', 'Long Text'),
        ('number', 'Number'),
        ('float', 'Float'),
        ('multiple_choice', 'Multiple Choice'),
        ('multiple_select', 'Multiple Select'),
        ('media', 'Media'),
    ]

    section = models.ForeignKey(Section, related_name='questions', on_delete=models.CASCADE)
    text = models.CharField(max_length=500, default='Untitled Question')
    question_type = models.CharField(max_length=20, choices=QUESTION_TYPES, default='short_text')
    required = models.BooleanField(default=False)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.text


class Choice(models.Model):
    """A choice for multiple-choice / multiple-select questions."""
    question = models.ForeignKey(Question, related_name='choices', on_delete=models.CASCADE)
    text = models.CharField(max_length=255)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

    def __str__(self):
        return self.text


class Response(models.Model):
    """A submission of a form."""
    form = models.ForeignKey(Form, related_name='responses', on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Response to {self.form.title} at {self.created_at}'


class Answer(models.Model):
    """A single answer to a question within a response."""
    response = models.ForeignKey(Response, related_name='answers', on_delete=models.CASCADE)
    question = models.ForeignKey(Question, related_name='answers', on_delete=models.CASCADE)
    
    # Store text/number answers here
    text_answer = models.TextField(blank=True, null=True)

    # Store uploaded file for media questions
    file_answer = models.FileField(upload_to='uploads/%Y/%m/%d/', blank=True, null=True)
    
    # Store choices for MC/MS here
    selected_choices = models.ManyToManyField(Choice, blank=True)

    def __str__(self):
        return f'Answer to {self.question.text}'


class FormPermission(models.Model):
    PERMISSION_CHOICES = (
        ('edit', 'Edit'),
        ('view_responses', 'View Responses'),
    )
    form = models.ForeignKey(Form, related_name='permissions', on_delete=models.CASCADE)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, related_name='form_permissions', on_delete=models.CASCADE)
    permission_type = models.CharField(max_length=20, choices=PERMISSION_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('form', 'user', 'permission_type')

    def __str__(self):
        return f'{self.user.email} - {self.form.title} - {self.permission_type}'
