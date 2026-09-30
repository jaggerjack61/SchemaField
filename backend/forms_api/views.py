from rest_framework import viewsets, permissions, status, pagination
import rest_framework
from rest_framework.decorators import action
from rest_framework.response import Response as DRFResponse
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.exceptions import ValidationError
from rest_framework.views import APIView
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count, Prefetch, Exists, OuterRef, Subquery
from django.db.models.functions import Coalesce
from django.contrib.auth import get_user_model
from django.conf import settings
from django.http import Http404, StreamingHttpResponse
from django.utils import timezone

from collections import Counter, namedtuple
from collections.abc import Mapping
from pathlib import Path
import csv
import heapq
import io
import os
import re
import shutil
import uuid as _uuid
from datetime import datetime, timezone as dt_timezone

from .models import Form, FormPermission, Answer, Question, Section, Response, FormArchive
from .csv_utils import safe_csv_cell
from .response_queries import filter_responses, order_responses, parse_timezone, response_analytics
from .serializers import (
    FormListSerializer, FormDetailSerializer, ResponseSerializer,
    UserSerializer, LoginSerializer, CreateUserSerializer,
    ResetPasswordSerializer, FormPermissionSerializer,
    UpdateProfileSerializer, ChangePasswordSerializer,
    RevocationAwareTokenRefreshSerializer,
)
from .permissions import IsAdmin, IsFormOwner, HasFormPermission
from .upload_validation import (
    MAX_MEDIA_UPLOAD_SIZE,
    MAX_SUBMISSION_UPLOAD_SIZE,
    REQUEST_OVERHEAD_ALLOWANCE,
    media_upload_error,
    request_body_too_large,
)


# Each throttle needs its own scope: throttles with the same scope share one
# cache key, so e.g. public submissions would use up the login allowance.
class UploadRateThrottle(UserRateThrottle):
    scope = 'media_upload'
    rate = '30/min'


class SubmissionRateThrottle(AnonRateThrottle):
    scope = 'submission'
    rate = '60/hour'


class UploadQuestionMediaView(APIView):
    """Upload a media file (image/video/audio) to attach to a question."""
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [UploadRateThrottle]

    def post(self, request):
        if request_body_too_large(request, MAX_MEDIA_UPLOAD_SIZE + REQUEST_OVERHEAD_ALLOWANCE):
            return DRFResponse({'detail': 'File too large. Maximum size is 10 MB.'},
                               status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        file = request.FILES.get('file')
        if not file:
            return DRFResponse({'detail': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        validation_error = media_upload_error(file)
        if validation_error:
            return DRFResponse({'detail': validation_error}, status=status.HTTP_400_BAD_REQUEST)

        ext = os.path.splitext(file.name)[1].lower()

        # Save using a temporary Question-like path
        from django.core.files.storage import default_storage
        from datetime import date

        today = date.today()
        safe_name = f'{_uuid.uuid4().hex}{ext}'
        path = f'question_media/{today.year}/{today.month:02d}/{today.day:02d}/{safe_name}'
        saved_path = default_storage.save(path, file)

        url = request.build_absolute_uri(f'{settings.MEDIA_URL}{saved_path}')

        return DRFResponse({
            'path': saved_path,
            'url': url,
        }, status=status.HTTP_201_CREATED)

User = get_user_model()

FILE_BROWSER_DEFAULT_PAGE = 1
FILE_BROWSER_DEFAULT_PAGE_SIZE = 50
FILE_BROWSER_MAX_PAGE_SIZE = 200


MANAGED_MEDIA_DIRS = ('uploads', 'qrcodes', 'question_media')
REFERENCE_CHECK_BATCH_SIZE = 500

OrphanedFile = namedtuple('OrphanedFile', ['path', 'relative_path', 'size', 'mtime'])


def _iter_files(root):
    """Yield DirEntry objects for every file below root, without following symlinks."""
    pending = [root]
    while pending:
        try:
            with os.scandir(pending.pop()) as iterator:
                for entry in iterator:
                    if entry.is_dir(follow_symlinks=False):
                        pending.append(entry.path)
                    elif entry.is_file(follow_symlinks=False):
                        yield entry
        except FileNotFoundError:
            continue


def _extension(name):
    return os.path.splitext(name)[1].lower().lstrip('.') or 'unknown'


def _referenced_media_paths(paths):
    referenced = set()
    for start in range(0, len(paths), REFERENCE_CHECK_BATCH_SIZE):
        batch = paths[start:start + REFERENCE_CHECK_BATCH_SIZE]
        referenced.update(Answer.objects.filter(file_answer__in=batch).values_list('file_answer', flat=True))
        referenced.update(Question.objects.filter(media_file__in=batch).values_list('media_file', flat=True))
        referenced.update(Form.objects.filter(qr_code__in=batch).values_list('qr_code', flat=True))
    return referenced


def _resolve_media_child(media_root, relative_path):
    target_path = (media_root / relative_path).resolve() if relative_path else media_root
    try:
        target_path.relative_to(media_root)
    except ValueError:
        return None
    return target_path


def _get_positive_int_query_param(query_params, name, default, maximum=None):
    try:
        value = int(query_params.get(name, default))
    except (TypeError, ValueError):
        return default

    if value < 1:
        return default
    if maximum is not None:
        return min(value, maximum)
    return value


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'
    rate = '5/min'


class TokenRefreshRateThrottle(AnonRateThrottle):
    scope = 'token_refresh'
    rate = '30/min'


class FileManagerRateThrottle(UserRateThrottle):
    scope = 'file_manager'
    rate = '30/min'


def _tokens_for(user):
    refresh = RefreshToken.for_user(user)
    return {'access': str(refresh.access_token), 'refresh': str(refresh)}


class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]


class RefreshTokenView(TokenRefreshView):
    serializer_class = RevocationAwareTokenRefreshSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [TokenRefreshRateThrottle]


class MeView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return DRFResponse(serializer.data)

    def patch(self, request):
        serializer = UpdateProfileSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return DRFResponse(UserSerializer(request.user).data)


class ChangePasswordView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = ChangePasswordSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not request.user.check_password(serializer.validated_data['current_password']):
            return DRFResponse({'current_password': ['Incorrect password.']}, status=status.HTTP_400_BAD_REQUEST)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save()
        # Changing the password revokes every existing token, including the
        # caller's, so hand this session a fresh pair.
        return DRFResponse({'status': 'password changed', **_tokens_for(request.user)})


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('-date_joined', '-id')
    serializer_class = UserSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        qs = User.objects.all().order_by('-date_joined', '-id')
        search = (self.request.query_params.get('search') or '').strip()
        if search:
            qs = qs.filter(
                Q(name__icontains=search) | Q(email__icontains=search)
            )
        return qs

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

        referenced_upload_files = set(
            Answer.objects.exclude(file_answer='').exclude(file_answer__isnull=True).values_list('file_answer', flat=True)
        )
        referenced_qrcode_files = set(
            Form.objects.exclude(qr_code='').exclude(qr_code__isnull=True).values_list('qr_code', flat=True)
        )
        referenced_question_media = set(
            Question.objects.exclude(media_file='').exclude(media_file__isnull=True).values_list('media_file', flat=True)
        )
        referenced_files = referenced_upload_files | referenced_qrcode_files | referenced_question_media

        orphaned_files = []
        cutoff = timezone.now().timestamp() - getattr(settings, 'ORPHAN_UPLOAD_GRACE_SECONDS', 86400)
        for managed_dir in MANAGED_MEDIA_DIRS:
            for entry in _iter_files(media_root / managed_dir):
                relative_path = Path(entry.path).relative_to(media_root).as_posix()
                stat_info = entry.stat(follow_symlinks=False)
                if relative_path not in referenced_files and stat_info.st_mtime < cutoff:
                    orphaned_files.append(OrphanedFile(
                        Path(entry.path), relative_path, stat_info.st_size, stat_info.st_mtime,
                    ))

        return media_root, orphaned_files

    @action(detail=False, methods=['get'], url_path='file-manager/summary', throttle_classes=[FileManagerRateThrottle])
    def file_manager_summary(self, request):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        media_root.mkdir(parents=True, exist_ok=True)

        # One directory walk and one stat per file.
        total_size_bytes = 0
        total_files = 0
        extension_counts = Counter()
        for entry in _iter_files(media_root):
            total_files += 1
            total_size_bytes += entry.stat(follow_symlinks=False).st_size
            extension_counts[_extension(entry.name)] += 1

        try:
            disk = shutil.disk_usage(media_root)
            space_left_bytes = disk.free
            total_disk_bytes = disk.total
        except OSError:
            space_left_bytes = None
            total_disk_bytes = None

        forms_with_most_files = (
            Form.objects
            .annotate(file_count=Count(
                'responses__answers__id',
                filter=Q(responses__answers__file_answer__isnull=False)
                & ~Q(responses__answers__file_answer=''),
                distinct=True,
            ))
            .filter(file_count__gt=0)
            .order_by('-file_count', '-updated_at')
            .values('id', 'title', 'file_count')[:10]
        )

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

    @action(detail=False, methods=['get'], url_path='file-manager/browser', throttle_classes=[FileManagerRateThrottle])
    def file_manager_browser(self, request):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        media_root.mkdir(parents=True, exist_ok=True)

        requested_path = (request.query_params.get('path') or '').strip().replace('\\', '/')
        relative_path = requested_path.strip('/')

        current_dir = _resolve_media_child(media_root, relative_path)
        if current_dir is None:
            return DRFResponse({'detail': 'Invalid path.'}, status=status.HTTP_400_BAD_REQUEST)
        if not current_dir.exists() or not current_dir.is_dir():
            return DRFResponse({'detail': 'Directory not found.'}, status=status.HTTP_404_NOT_FOUND)

        directories = []
        files = []

        # Pagination params
        page = _get_positive_int_query_param(
            request.query_params,
            'page',
            FILE_BROWSER_DEFAULT_PAGE,
        )
        page_size = _get_positive_int_query_param(
            request.query_params,
            'page_size',
            FILE_BROWSER_DEFAULT_PAGE_SIZE,
            FILE_BROWSER_MAX_PAGE_SIZE,
        )
        offset = (page - 1) * page_size

        # A single scandir pass; DirEntry.is_dir() usually needs no stat call.
        # Only the entries on the requested page are stat'ed below.
        with os.scandir(current_dir) as iterator:
            sortable_entries = [(not entry.is_dir(), entry.name.lower(), entry) for entry in iterator]
        total_entries = len(sortable_entries)
        paginated_entries = [
            entry for _, _, entry in heapq.nsmallest(
                offset + page_size, sortable_entries, key=lambda item: (item[0], item[1]),
            )[offset:]
        ]

        # Only query metadata for files shown on this page. Previously every
        # managed-file row was loaded for each page request.
        page_file_paths = [
            Path(entry.path).relative_to(media_root).as_posix()
            for entry in paginated_entries
            if entry.is_file()
        ]
        answer_map = {
            row['file_answer']: {
                'form_id': row['response__form__id'],
                'form_title': row['response__form__title'],
            }
            for row in Answer.objects.filter(file_answer__in=page_file_paths).values(
                'file_answer', 'response__form__id', 'response__form__title'
            )
        }
        question_media_map = {
            row['media_file']: {
                'form_id': row['section__form__id'],
                'form_title': row['section__form__title'],
            }
            for row in Question.objects.filter(media_file__in=page_file_paths).values(
                'media_file', 'section__form__id', 'section__form__title'
            )
        }
        qrcode_map = {
            row['qr_code']: {
                'form_id': row['id'],
                'form_title': row['title'],
            }
            for row in Form.objects.filter(qr_code__in=page_file_paths).values('qr_code', 'id', 'title')
        }
        file_map = {**qrcode_map, **question_media_map, **answer_map}

        for entry in paginated_entries:
            rel = Path(entry.path).relative_to(media_root).as_posix()
            if entry.is_dir():
                directories.append({
                    'name': entry.name,
                    'path': rel,
                })
                continue

            stat_info = entry.stat()
            related = file_map.get(rel)
            files.append({
                'name': entry.name,
                'path': rel,
                'size_bytes': stat_info.st_size,
                'modified_at': datetime.fromtimestamp(stat_info.st_mtime, tz=dt_timezone.utc).isoformat(),
                'extension': _extension(entry.name),
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
            'total_entries': total_entries,
            'page': page,
            'page_size': page_size,
        })

    @action(detail=False, methods=['delete'], url_path='file-manager/file', throttle_classes=[FileManagerRateThrottle])
    def file_manager_delete_file(self, request):
        media_root = Path(settings.MEDIA_ROOT).resolve()
        media_root.mkdir(parents=True, exist_ok=True)

        requested_path = (request.query_params.get('path') or '').strip().replace('\\', '/')
        relative_path = requested_path.strip('/')
        if not relative_path:
            return DRFResponse({'detail': 'File path is required.'}, status=status.HTTP_400_BAD_REQUEST)

        file_path = _resolve_media_child(media_root, relative_path)
        if file_path is None:
            return DRFResponse({'detail': 'Invalid file path.'}, status=status.HTTP_400_BAD_REQUEST)
        if not file_path.exists() or not file_path.is_file():
            return DRFResponse({'detail': 'File not found.'}, status=status.HTTP_404_NOT_FOUND)

        linked_answers = Answer.objects.filter(file_answer=relative_path)
        linked_answers.update(file_answer=None)

        Question.objects.filter(media_file=relative_path).update(media_file='')
        # The form's QR code is regenerated the next time the form is saved.
        Form.objects.filter(qr_code=relative_path).update(qr_code='')

        file_path.unlink()

        return DRFResponse({
            'status': 'deleted',
            'path': relative_path,
        })

    @action(detail=False, methods=['get'], url_path='file-manager/cleanup-preview', throttle_classes=[FileManagerRateThrottle])
    def file_manager_cleanup_preview(self, request):
        include_files = (request.query_params.get('view') or '').strip().lower() in ['1', 'true', 'yes']
        _, orphaned_files = self._collect_orphaned_managed_files()

        payload = {
            'delete_count': len(orphaned_files),
            'total_size_bytes': sum(orphan.size for orphan in orphaned_files),
        }

        if include_files:
            payload['files'] = [
                {
                    'name': orphan.path.name,
                    'path': orphan.relative_path,
                    'size_bytes': orphan.size,
                    'modified_at': datetime.fromtimestamp(orphan.mtime, tz=dt_timezone.utc).isoformat(),
                    'url': request.build_absolute_uri(f"{settings.MEDIA_URL}{orphan.relative_path}"),
                }
                for orphan in sorted(orphaned_files, key=lambda orphan: orphan.relative_path.lower())
            ]

        return DRFResponse(payload)

    @action(detail=False, methods=['post'], url_path='file-manager/cleanup-orphaned-files', throttle_classes=[FileManagerRateThrottle])
    def file_manager_cleanup_orphaned_files(self, request):
        _, orphaned_files = self._collect_orphaned_managed_files()

        # A form may have been saved since the cleanup scan began. Re-check all
        # candidates with a few batched queries rather than three per file.
        still_referenced = _referenced_media_paths([orphan.relative_path for orphan in orphaned_files])

        deleted_count = 0
        failed_files = []

        for orphan in orphaned_files:
            if orphan.relative_path in still_referenced:
                continue
            try:
                orphan.path.unlink()
                deleted_count += 1
            except OSError as exc:
                failed_files.append({'path': orphan.relative_path, 'error': str(exc)})

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
        # Public form filling uses the unguessable share ID. Numeric-ID retrieval
        # remains scoped to authenticated owners, collaborators, and admins.
        if self.action in ['submit', 'by_share_id']:
            return Form.objects.all().prefetch_related(
                'sections__questions__choices'
            )

        user = self.request.user
        if not user.is_authenticated:
            return Form.objects.none()

        if user.role == 'admin':
            qs = Form.objects.all()
        else:
            # Regular user: owned forms + shared forms
            owned_forms = Form.objects.filter(owner=user)
            shared_forms = Form.objects.filter(permissions__user=user)
            qs = (owned_forms | shared_forms).distinct()
        # The id tiebreaker keeps page boundaries stable for equal timestamps.
        qs = qs.order_by('-updated_at', '-id')

        if self.action == 'list':
            archive_subquery = FormArchive.objects.filter(
                user=user, form=OuterRef('pk')
            )
            def related_count(model, relation):
                counts = model.objects.filter(**{relation: OuterRef('pk')}).order_by().values(relation).annotate(total=Count('pk'))
                return Coalesce(Subquery(counts.values('total')), 0)

            qs = qs.select_related('owner').annotate(
                _section_count=related_count(Section, 'form'),
                _question_count=related_count(Question, 'section__form'),
                _response_count=related_count(Response, 'form'),
                _is_archived=Exists(archive_subquery),
            ).prefetch_related(
                Prefetch(
                    'permissions',
                    queryset=FormPermission.objects.filter(user=user),
                    to_attr='_user_permissions',
                )
            )

            # Filter by archived status if query param is provided
            archived_param = self.request.query_params.get('archived')
            if archived_param is not None:
                if archived_param.lower() == 'true':
                    qs = qs.filter(_is_archived=True)
                else:
                    qs = qs.filter(_is_archived=False)

            search = (self.request.query_params.get('search') or '').strip()
            if search:
                qs = qs.filter(
                    Q(title__icontains=search)
                    | Q(description__icontains=search)
                    | Q(owner__name__icontains=search)
                )

        if self.action in ['retrieve', 'update', 'partial_update']:
            qs = qs.prefetch_related('sections__questions__choices')

        return qs

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

    def _is_admin_user(self, user):
        return user.is_authenticated and user.role == 'admin'

    def check_object_permissions(self, request, obj):
        super().check_object_permissions(request, obj)
        
        # Public actions don't need further checks
        if self.action in ['submit', 'by_share_id']:
            return

        if self._is_admin_user(request.user):
            return

        # Owner can do anything
        if obj.owner == request.user:
            return

        # Granular checks for shared users
        if self.action in ['update', 'partial_update']:
            if not FormPermission.objects.filter(form=obj, user=request.user, permission_type='edit').exists():
                self.permission_denied(request, message="You do not have permission to edit this form.")
        
        elif self.action in ['responses', 'export_csv', 'analytics']:
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

    @action(
        detail=False,
        methods=['get'],
        url_path='by-share-id/(?P<share_id>[^/.]+)',
        # Public: skip auth entirely so a stale/expired Authorization header
        # from a previously-signed-in browser cannot cause a 401.
        authentication_classes=[],
        permission_classes=[permissions.AllowAny],
    )
    def by_share_id(self, request, share_id=None):
        # Public access allowed
        form = get_object_or_404(self.get_queryset(), share_id=share_id)
        serializer = FormDetailSerializer(form, context={'request': request})
        return DRFResponse(serializer.data)

    @action(detail=True, methods=['post'])
    def archive(self, request, pk=None):
        """Archive a form for the current user. Idempotent."""
        form = self.get_object()
        FormArchive.objects.get_or_create(user=request.user, form=form)
        return DRFResponse({'detail': 'Form archived.'}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore (un-archive) a form for the current user. Idempotent."""
        form = self.get_object()
        FormArchive.objects.filter(user=request.user, form=form).delete()
        return DRFResponse({'detail': 'Form restored.'}, status=status.HTTP_200_OK)

    @action(
        detail=False,
        methods=['post'],
        url_path=r'by-share-id/(?P<share_id>[^/.]+)/submit',
        throttle_classes=[SubmissionRateThrottle],
        # Public: skip auth entirely so a stale/expired Authorization header
        # from a previously-signed-in browser cannot cause a 401.
        authentication_classes=[],
        permission_classes=[permissions.AllowAny],
    )
    def submit(self, request, share_id=None):
        # Public access is keyed on the unguessable share ID, never the
        # sequential primary key, so only people with the link can respond.
        try:
            share_uuid = _uuid.UUID(str(share_id))
        except ValueError:
            raise Http404
        form = get_object_or_404(self.get_queryset(), share_id=share_uuid)

        if form.is_closed:
            deadline = form.deadline.astimezone(dt_timezone.utc)
            return DRFResponse(
                {
                    'detail': f'This form closed on {deadline.strftime("%b %d, %Y at %I:%M %p")} UTC.',
                    'deadline': form.deadline.isoformat(),
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Reject oversized bodies before Django reads and spools them to disk.
        if request_body_too_large(request, MAX_SUBMISSION_UPLOAD_SIZE + REQUEST_OVERHEAD_ALLOWANCE):
            return DRFResponse(
                {'detail': 'Submission uploads may not exceed 25 MB in total.'},
                status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            )

        total_upload_size = sum(upload.size for upload in request.FILES.values())
        if total_upload_size > MAX_SUBMISSION_UPLOAD_SIZE:
            return DRFResponse(
                {'detail': 'Submission uploads may not exceed 25 MB in total.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(request.data, Mapping):
            return DRFResponse(
                {'detail': 'Expected an object with an "answers" list.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Construct data for serializer manually to avoid QueryDict issues with nested data
        data = {'answers': []}

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
                        if index not in answers_dict:
                            answers_dict[index] = {}
                        answers_dict[index][field] = value

            data['answers'] = [answers_dict[i] for i in sorted(answers_dict.keys())]
        elif 'answers' in request.data:
            data['answers'] = request.data['answers']

        serializer = ResponseSerializer(data=data, context={'request': request, 'form': form})
        if serializer.is_valid():
            serializer.save()
            return DRFResponse(serializer.data, status=201)
        return DRFResponse(serializer.errors, status=400)

    @action(detail=True, methods=['get'])
    def responses(self, request, pk=None):
        form = self.get_object()
        # Permission check handled in check_object_permissions

        page_size = _get_positive_int_query_param(
            request.query_params,
            'page_size',
            25,
            100,
        )

        responses = order_responses(filter_responses(form, request.query_params), form, request.query_params).prefetch_related(
            'answers__selected_choices'
        )

        paginator = rest_framework.pagination.PageNumberPagination()
        paginator.page_size = page_size
        page = paginator.paginate_queryset(responses, request)
        serializer = ResponseSerializer(page, many=True)
        return paginator.get_paginated_response(serializer.data)

    @action(detail=True, methods=['get'])
    def analytics(self, request, pk=None):
        form = self.get_object()
        responses = filter_responses(form, request.query_params)
        return DRFResponse(response_analytics(form, responses, request.query_params))

    @action(detail=True, methods=['get'])
    def export_csv(self, request, pk=None):
        form = self.get_object()
        # Validate filters before sending a streaming response's headers.
        filtered_responses = filter_responses(form, request.query_params)
        tz = parse_timezone(request.query_params)

        def csv_rows():
            output = io.StringIO()
            writer = csv.writer(output, quoting=csv.QUOTE_ALL)

            # Headers
            headers = ['Response ID', f'Submitted At ({tz.key})']
            questions = []
            for section in form.sections.prefetch_related('questions').all():
                for question in section.questions.all():
                    label = f'{section.title} - {question.text}' if request.query_params.get('section_titles') == 'true' else question.text
                    headers.append(safe_csv_cell(label))
                    questions.append(question)
            writer.writerow(headers)
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

            # Rows
            responses = filtered_responses.prefetch_related(
                'answers__selected_choices'
            ).order_by('-created_at', '-id')

            # A chunked iterator keeps prefetching bounded so this streaming
            # response does not cache the full response history in memory.
            for r in responses.iterator(chunk_size=200):
                row = [r.id, r.created_at.astimezone(tz).strftime('%Y-%m-%d %H:%M:%S')]
                answers_map = {a.question_id: a for a in r.answers.all()}
                for q in questions:
                    answer = answers_map.get(q.id)
                    if not answer:
                        row.append('')
                    elif q.question_type in ['multiple_choice', 'multiple_select']:
                        choices = [c.text for c in answer.selected_choices.all()]
                        row.append(safe_csv_cell(', '.join(choices)))
                    elif q.question_type == 'media':
                        row.append(request.build_absolute_uri(answer.file_answer.url) if answer.file_answer else '')
                    else:
                        row.append(safe_csv_cell(answer.text_answer, numeric=q.question_type in ('number', 'float')))
                writer.writerow(row)
                yield output.getvalue()
                output.seek(0)
                output.truncate(0)

        safe_title = form.title.replace('"', '').replace('\r', '').replace('\n', '')[:100]
        response = StreamingHttpResponse(csv_rows(), content_type='text/csv')
        response['Content-Disposition'] = f'attachment; filename="{safe_title}_responses.csv"'
        return response


class FormPermissionViewSet(viewsets.ModelViewSet):
    serializer_class = FormPermissionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Only permissions for forms owned by current user
        queryset = FormPermission.objects.filter(
            form__owner=self.request.user,
        ).select_related('form', 'user')
        form_id = self.request.query_params.get('form')
        if form_id:
            try:
                queryset = queryset.filter(form_id=int(form_id))
            except ValueError:
                raise ValidationError({'form': 'Expected a numeric form ID.'})
        return queryset.order_by('id')

    def perform_create(self, serializer):
        # Ensure form belongs to user
        form = serializer.validated_data['form']
        if form.owner != self.request.user:
            self.permission_denied(self.request, message="You can only grant permissions for your own forms.")
            
        # Ensure user exists (validated by serializer, but good to check context if needed)
        serializer.save()
