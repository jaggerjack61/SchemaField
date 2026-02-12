import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

print("--- Users ---")
for u in User.objects.all():
    print(f"ID: {u.id} | Email: {u.email} | Type: {type(u.id)}")

from forms_api.models import FormPermission
print("\n--- FormPermissions ---")
for fp in FormPermission.objects.all():
    print(f"ID: {fp.id} | User: {fp.user_id} | Form: {fp.form_id} | Perm: {fp.permission_type}")
