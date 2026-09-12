from django.apps import AppConfig


class FormsApiConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'forms_api'

    def ready(self):
        from django.db.backends.signals import connection_created
        from .numeric import register_numeric_functions
        connection_created.connect(register_numeric_functions, dispatch_uid='schemafield_numeric', weak=False)
