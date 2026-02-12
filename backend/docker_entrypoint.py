import os
import subprocess
import sys


def run_manage_py(*args: str) -> None:
    subprocess.check_call([sys.executable, "manage.py", *args])


def main() -> None:
    run_manage_py("migrate")

    email = os.environ.get("DJANGO_SUPERUSER_EMAIL")
    name = os.environ.get("DJANGO_SUPERUSER_NAME")
    password = os.environ.get("DJANGO_SUPERUSER_PASSWORD")

    if email and name and password:
        code = """
import os
from django.contrib.auth import get_user_model

User = get_user_model()
email = os.environ["DJANGO_SUPERUSER_EMAIL"]
name = os.environ["DJANGO_SUPERUSER_NAME"]
password = os.environ["DJANGO_SUPERUSER_PASSWORD"]

existed = User.objects.filter(email=email).exists()
if not existed:
    User.objects.create_superuser(email=email, name=name, password=password)
print("superuser:", email, "exists" if existed else "created")
""".strip()
        run_manage_py("shell", "-c", code)

    os.execvp(sys.executable, [sys.executable, "manage.py", "runserver", "0.0.0.0:8000"])


if __name__ == "__main__":
    main()
