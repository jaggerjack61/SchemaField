from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Page-number pagination that lets clients ask for up to 100 rows per page."""
    page_size_query_param = 'page_size'
    max_page_size = 100
