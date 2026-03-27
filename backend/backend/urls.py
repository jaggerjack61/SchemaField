from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static

from forms_api.health import health_view

urlpatterns = [
    path('health', health_view, name='health'),
    path('admin/', admin.site.urls),
    path('api/', include('forms_api.urls')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
