from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import FormViewSet, UserViewSet, FormPermissionViewSet, LoginView, MeView

router = DefaultRouter()
router.register(r'forms', FormViewSet, basename='form')
router.register(r'users', UserViewSet, basename='user')
router.register(r'permissions', FormPermissionViewSet, basename='permission')

urlpatterns = [
    path('auth/login/', LoginView.as_view(), name='login'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('', include(router.urls)),
]
