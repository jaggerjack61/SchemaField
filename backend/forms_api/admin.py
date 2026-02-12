from django.contrib import admin
from django.contrib.auth import get_user_model
from .models import Form, Section, Question, Choice, Response, Answer, FormPermission

User = get_user_model()

admin.site.register(User)
admin.site.register(Form)
admin.site.register(Section)
admin.site.register(Question)
admin.site.register(Choice)
admin.site.register(Response)
admin.site.register(Answer)
admin.site.register(FormPermission)
