from rest_framework import permissions
from .models import FormPermission

class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'


class IsFormOwner(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user


class HasFormPermission(permissions.BasePermission):
    def has_object_permission(self, request, view, obj):
        if not request.user.is_authenticated:
            return False
            
        # Owner always has permission
        if obj.owner == request.user:
            return True
            
        # Check specific permissions
        required_permission = getattr(view, 'required_permission', None)
        if not required_permission:
            return False
            
        return FormPermission.objects.filter(
            form=obj, 
            user=request.user, 
            permission_type=required_permission
        ).exists()

    def has_permission(self, request, view):
        return request.user.is_authenticated
