from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.response import Response as DRFResponse
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from django.contrib.auth import get_user_model
from django.conf import settings

from pathlib import Path
import shutil
from datetime import datetime, timezone as dt_timezone

from .models import Form, FormPermission, Answer
from .serializers import (
    FormListSerializer, FormDetailSerializer, ResponseSerializer,
    UserSerializer, LoginSerializer, CreateUserSerializer, 
    ResetPasswordSerializer, FormPermissionSerializer
)
from .permissions import IsAdmin, IsFormOwner, HasFormPermission

User = get_user_model()


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return DRFResponse(serializer.data)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all()
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_serializer_class(self):
        if self.action == 'create':
            return CreateUserSerializer
        return UserSerializer

    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        user = self.get_object()
        serializer = ResetPasswordSerializer(data=request.data)
        if serializer.is_valid():
            user.set_password(serializer.validated_data['password'])
            user.save()
            return DRFResponse({'status': 'password reset'})
        return DRFResponse(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def _collect_orphaned_managed_files(self):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        media_root.mkdir(parents=True, exist_ok=True)

        uploads_root = (media_root / 'uploads').resolve()
        uploads_root.mkdir(parents=True, exist_ok=True)

        qrcodes_root = (media_root / 'qrcodes').resolve()
        qrcodes_root.mkdir(parents=True, exist_ok=True)

        referenced_upload_files = set(
            Answer.objects.exclude(file_answer='').exclude(file_answer__isnull=True).values_list('file_answer', flat=True)
        )
        referenced_qrcode_files = set(
            Form.objects.exclude(qr_code='').exclude(qr_code__isnull=True).values_list('qr_code', flat=True)
        )
        referenced_files = referenced_upload_files | referenced_qrcode_files

        orphaned_files = []
        for root in [uploads_root, qrcodes_root]:
            for path in root.rglob('*'):
                if not path.is_file():
                    continue
                relative_path = path.relative_to(media_root).as_posix()
                if relative_path not in referenced_files:
                    orphaned_files.append(path)

        return media_root, orphaned_files

    @action(detail=False, methods=['get'], url_path='file-manager/summary')
    def file_manager_summary(self, request):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        media_root.mkdir(parents=True, exist_ok=True)

        all_files = [p for p in media_root.rglob('*') if p.is_file()]
        total_size_bytes = sum(p.stat().st_size for p in all_files)
        total_files = len(all_files)

        try:
            disk = shutil.disk_usage(media_root)
            space_left_bytes = disk.free
            total_disk_bytes = disk.total
        except OSError:
            space_left_bytes = None
            total_disk_bytes = None

        forms_with_most_files = (
            Form.objects
            .filter(responses__answers__file_answer__isnull=False)
            .exclude(responses__answers__file_answer='')
            .annotate(file_count=Count('responses__answers__id', distinct=True))
            .order_by('-file_count', '-updated_at')
            .values('id', 'title', 'file_count')[:10]
        )

        extension_counts = {}
        for file_path in all_files:
            ext = file_path.suffix.lower().lstrip('.') or 'unknown'
            extension_counts[ext] = extension_counts.get(ext, 0) + 1

        sorted_extension_counts = sorted(
            [{'type': ext, 'count': count} for ext, count in extension_counts.items()],
            key=lambda item: (-item['count'], item['type'])
        )

        return DRFResponse({
            'total_storage_used_bytes': total_size_bytes,
            'space_left_bytes': space_left_bytes,
            'total_disk_bytes': total_disk_bytes,
            'total_files': total_files,
            'forms_with_most_files': list(forms_with_most_files),
            'file_types': sorted_extension_counts,
        })

    @action(detail=False, methods=['get'], url_path='file-manager/browser')
    def file_manager_browser(self, request):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        media_root.mkdir(parents=True, exist_ok=True)

        requested_path = (request.query_params.get('path') or '').strip().replace('\\', '/')
        relative_path = requested_path.strip('/')

        current_dir = (media_root / relative_path).resolve() if relative_path else media_root
        if not str(current_dir).startswith(str(media_root)):
            return DRFResponse({'detail': 'Invalid path.'}, status=status.HTTP_400_BAD_REQUEST)
        if not current_dir.exists() or not current_dir.is_dir():
            return DRFResponse({'detail': 'Directory not found.'}, status=status.HTTP_404_NOT_FOUND)

        answer_file_rows = Answer.objects.exclude(file_answer='').exclude(file_answer__isnull=True).values(
            'file_answer',
            'response__form__id',
            'response__form__title'
        )
        answer_map = {
            row['file_answer']: {
                'form_id': row['response__form__id'],
                'form_title': row['response__form__title'],
            }
            for row in answer_file_rows
        }

        directories = []
        files = []

        for entry in sorted(current_dir.iterdir(), key=lambda p: (not p.is_dir(), p.name.lower())):
            rel = entry.relative_to(media_root).as_posix()
            if entry.is_dir():
                directories.append({
                    'name': entry.name,
                    'path': rel,
                })
                continue

            stat_info = entry.stat()
            related = answer_map.get(rel)
            files.append({
                'name': entry.name,
                'path': rel,
                'size_bytes': stat_info.st_size,
                'modified_at': datetime.fromtimestamp(stat_info.st_mtime, tz=dt_timezone.utc).isoformat(),
                'extension': (entry.suffix.lower().lstrip('.') or 'unknown'),
                'url': request.build_absolute_uri(f"{settings.MEDIA_URL}{rel}"),
                'form_id': related['form_id'] if related else None,
                'form_title': related['form_title'] if related else None,
            })

        parent_path = None
        if current_dir != media_root:
            parent_path = current_dir.parent.relative_to(media_root).as_posix()

        return DRFResponse({
            'current_path': current_dir.relative_to(media_root).as_posix() if current_dir != media_root else '',
            'parent_path': parent_path,
            'directories': directories,
            'files': files,
        })

    @action(detail=False, methods=['delete'], url_path='file-manager/file')
    def file_manager_delete_file(self, request):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        media_root.mkdir(parents=True, exist_ok=True)

        requested_path = (request.query_params.get('path') or '').strip().replace('\\', '/')
        relative_path = requested_path.strip('/')
        if not relative_path:
            return DRFResponse({'detail': 'File path is required.'}, status=status.HTTP_400_BAD_REQUEST)

        file_path = (media_root / relative_path).resolve()
        if not str(file_path).startswith(str(media_root)):
            return DRFResponse({'detail': 'Invalid file path.'}, status=status.HTTP_400_BAD_REQUEST)
        if not file_path.exists() or not file_path.is_file():
            return DRFResponse({'detail': 'File not found.'}, status=status.HTTP_404_NOT_FOUND)

        linked_answers = Answer.objects.filter(file_answer=relative_path)
        linked_answers.update(file_answer=None)

        file_path.unlink()

        return DRFResponse({
            'status': 'deleted',
            'path': relative_path,
        })

    @action(detail=False, methods=['get'], url_path='file-manager/cleanup-preview')
    def file_manager_cleanup_preview(self, request):
        include_files = (request.query_params.get('view') or '').strip().lower() in ['1', 'true', 'yes']
        media_root, orphaned_files = self._collect_orphaned_managed_files()

        payload = {
            'delete_count': len(orphaned_files),
            'total_size_bytes': sum(path.stat().st_size for path in orphaned_files),
        }

        if include_files:
            payload['files'] = [
                {
                    'name': path.name,
                    'path': path.relative_to(media_root).as_posix(),
                    'size_bytes': path.stat().st_size,
                    'modified_at': datetime.fromtimestamp(path.stat().st_mtime, tz=dt_timezone.utc).isoformat(),
                    'url': request.build_absolute_uri(f"{settings.MEDIA_URL}{path.relative_to(media_root).as_posix()}"),
                }
                for path in sorted(orphaned_files, key=lambda file_path: file_path.as_posix().lower())
            ]

        return DRFResponse(payload)

    @action(detail=False, methods=['post'], url_path='file-manager/cleanup-orphaned-files')
    def file_manager_cleanup_orphaned_files(self, request):
        media_root, orphaned_files = self._collect_orphaned_managed_files()

        deleted_count = 0
        failed_files = []

        for path in orphaned_files:
            relative_path = path.relative_to(media_root).as_posix()
            try:
                path.unlink()
                deleted_count += 1
            except OSError as exc:
                failed_files.append({'path': relative_path, 'error': str(exc)})

        return DRFResponse({
            'deleted_count': deleted_count,
            'failed_count': len(failed_files),
            'failed_files': failed_files,
        })


class FormViewSet(viewsets.ModelViewSet):
    """
    CRUD API for forms.
    
    list   → FormListSerializer  (owned + shared forms)
    other  → FormDetailSerializer
    """
    def get_queryset(self):
        # Allow public submission and retrieval (for form filling)
        if self.action in ['submit', 'retrieve']:
            return Form.objects.all()

        user = self.request.user
        if not user.is_authenticated:
            return Form.objects.none()

        if user.role == 'admin':
            return Form.objects.all()

        # Regular user: owned forms + shared forms
        owned_forms = Form.objects.filter(owner=user)
        shared_forms = Form.objects.filter(permissions__user=user)
        return (owned_forms | shared_forms).distinct().order_by('-updated_at')

    def get_serializer_class(self):
        if self.action == 'list':
            return FormListSerializer
        return FormDetailSerializer

    def get_permissions(self):
        if self.action in ['submit', 'by_share_id']:
            return [permissions.AllowAny()]
        if self.action == 'create':
            return [permissions.IsAuthenticated()]
        if self.action in ['update', 'partial_update']:
            return [permissions.IsAuthenticated()]
        if self.action == 'destroy':
            return [IsFormOwner()]
            # Note: We might want to allow 'edit' permission holders to update too?
            # For now let's stick to owner-only for delete, maybe 'edit' perms for update.
            # Implementation plan said "allow owner + users with edit permission"
        if self.action == 'responses':
            # dealt with in the action logic or object permission? 
            # simplest is IsAuthenticated + check object perm
            return [permissions.IsAuthenticated()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        serializer.save(owner=self.request.user)

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        
        # Public actions don't need further checks
        if self.action in ['submit', 'by_share_id']:
            return

        # Owner can do anything
        if obj.owner == request.user:
            return

        # Granular checks for shared users
        if self.action in ['update', 'partial_update']:
            if not FormPermission.objects.filter(form=obj, user=request.user, permission_type='edit').exists():
                self.permission_denied(request, message="You do not have permission to edit this form.")
        
        elif self.action == 'responses':
             if not FormPermission.objects.filter(form=obj, user=request.user, permission_type='view_responses').exists():
                self.permission_denied(request, message="You do not have permission to view responses.")
        
        elif self.action == 'retrieve':
             # Queryset filtering already handles visibility, but explicit check matches plan
             # Any permission is enough to view
             if not FormPermission.objects.filter(form=obj, user=request.user).exists():
                 self.permission_denied(request, message="You do not have permission to view this form.")
        
        elif self.action == 'destroy':
            # Only owner can delete (logic above in get_permissions handles IsFormOwner, but double check)
            if obj.owner != request.user:
                self.permission_denied(request, message="Only the owner can delete this form.")

    @action(detail=False, methods=['get'], url_path='by-share-id/(?P<share_id>[^/.]+)')
    def by_share_id(self, request, share_id=None):
        # Public access allowed
        form = get_object_or_404(Form, share_id=share_id)
        serializer = FormDetailSerializer(form, context={'request': request})
        return DRFResponse(serializer.data)

    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        # Public access allowed
        form = self.get_object()
    @action(detail=True, methods=['post'])
    def submit(self, request, pk=None):
        # Public access allowed
        form = self.get_object()
        
        # Construct data for serializer manually to avoid QueryDict issues with nested data
        data = {'form': form.id}

        # Handle nested multipart data parsing
        import re

        is_multipart_nested = any(k.startswith('answers[') for k in request.data.keys())
        
        if is_multipart_nested:
            answers_dict = {}
            pattern = re.compile(r'answers\[(\d+)\]\[(.*?)\]')
            
            for key, value in request.data.items():
                match = pattern.match(key)
                if match:
                    index = int(match.group(1))
                    field = match.group(2)
                    
                    if index not in answers_dict:
                        answers_dict[index] = {}
                    
                    if field == 'selected_choices':
                        if hasattr(request.data, 'getlist'):
                            answers_dict[index]['selected_choices'] = request.data.getlist(key)
                        else:
                             answers_dict[index]['selected_choices'] = value
                    else:
                        answers_dict[index][field] = value
            
            # Fallback for answers[0]field format
            if not answers_dict:
                 pattern_no_bracket = re.compile(r'answers\[(\d+)\]([^\[]+)')
                 for key, value in request.data.items():
                    match = pattern_no_bracket.match(key)
                    if match:
                        index = int(match.group(1))
                        field = match.group(2)
                        if index not in answers_dict: answers_dict[index] = {}
                        answers_dict[index][field] = value

            data['answers'] = [answers_dict[i] for i in sorted(answers_dict.keys())]
        else:
             # Standard JSON or flat structure?
             # If strictly JSON request, request.data is already a dict/list
             # If using multipart without nesting? 
             # request.data might contain 'answers' if sent as string?
             if 'answers' in request.data:
                 data['answers'] = request.data['answers']  

        serializer = ResponseSerializer(data=data)
        if serializer.is_valid():
            serializer.save()
            return DRFResponse(serializer.data, status=201)
        return DRFResponse(serializer.errors, status=400)
        if serializer.is_valid():
            serializer.save()
            return DRFResponse(serializer.data, status=201)
        return DRFResponse(serializer.errors, status=400)

    @action(detail=True, methods=['get'])
    def responses(self, request, pk=None):
        form = self.get_object()
        # Permission check handled in check_object_permissions
        
        responses = form.responses.prefetch_related(
            'answers__question', 'answers__selected_choices'
        ).all()
        serializer = ResponseSerializer(responses, many=True)
        return DRFResponse(serializer.data)

    @action(detail=True, methods=['get'])
    def export_csv(self, request, pk=None):
        import csv
        from django.http import HttpResponse

        form = self.get_object()
        
        # Create the HttpResponse object with the appropriate CSV header.
        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{form.title}_responses.csv"'

        writer = csv.writer(response)
        
        # Build headers
        # Static headers
        headers = ['Response ID', 'Submitted At']
        
        # Dynamic headers based on questions (ordered)
        questions = []
        for section in form.sections.all():
            for question in section.questions.all():
                headers.append(question.text)
                questions.append(question)
        
        writer.writerow(headers)

        # Build rows
        responses = form.responses.prefetch_related(
            'answers__question', 'answers__selected_choices'
        ).order_by('-created_at')

        for r in responses:
            row = [r.id, r.created_at.strftime('%Y-%m-%d %H:%M:%S')]
            
            # Map answers to questions
            # We can't just iterate answers because they might be sparse or unordered
            # So we iterate the known questions and find the matching answer
            answers_map = {a.question_id: a for a in r.answers.all()}
            
            for q in questions:
                answer = answers_map.get(q.id)
                if not answer:
                    row.append('')
                    continue
                
                if q.question_type in ['multiple_choice', 'multiple_select']:
                    # Join selected choice texts
                    choices = [c.text for c in answer.selected_choices.all()]
                    row.append(', '.join(choices))
                elif q.question_type == 'media':
                    if answer.file_answer:
                        # Return absolute URL if possible, or relative
                        row.append(request.build_absolute_uri(answer.file_answer.url))
                    else:
                        row.append('')
                else:
                    row.append(answer.text_answer or '')
            
            writer.writerow(row)

        return response


class FormPermissionViewSet(viewsets.ModelViewSet):
    serializer_class = FormPermissionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only permissions for forms owned by current user
        return FormPermission.objects.filter(form__owner=self.request.user)

    def perform_create(self, serializer):
        # Ensure form belongs to user
        form = serializer.validated_data['form']
        if form.owner != self.request.user:
            raise permissions.PermissionDenied("You can only grant permissions for your own forms.")
            
        # Ensure user exists (validated by serializer, but good to check context if needed)
        serializer.save()
