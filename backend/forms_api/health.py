from django.http import JsonResponse


def health_view(_request):
    return JsonResponse({'status': 'ok'})