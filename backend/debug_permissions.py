import requests

BASE_URL = 'http://127.0.0.1:8001/api'

def get_token(email, password):
    resp = requests.post(f'{BASE_URL}/auth/login/', json={'email': email, 'password': password})
    if resp.status_code != 200:
        print(f"Login failed for {email}: {resp.text}")
        return None
    return resp.json()['access']

def create_user(token, email, password):
    headers = {'Authorization': f'Bearer {token}'}
    data = {'email': email, 'password': password, 'name': 'Test User', 'role': 'user'}
    # Try to create, ignoring if exists
    requests.post(f'{BASE_URL}/users/', json=data, headers=headers)

def create_form(token):
    headers = {'Authorization': f'Bearer {token}'}
    data = {"title": "Permission Test Form"}
    resp = requests.post(f'{BASE_URL}/forms/', json=data, headers=headers)
    return resp.json()['id']

def add_permission(token, form_id, target_email):
    headers = {'Authorization': f'Bearer {token}'}
    data = {
        'form': form_id,
        'email': target_email,
        'permission_type': 'view_responses'
    }
    print(f"Attempting to share form {form_id} with {target_email}...")
    resp = requests.post(f'{BASE_URL}/permissions/', json=data, headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")

def main():
    # 1. Login as Admin
    admin_token = get_token('admin@example.com', '12345')
    if not admin_token: return

    # 2. Ensure target user exists
    target_email = 'share_target@example.com'
    create_user(admin_token, target_email, 'password123')

    # 3. Create a form
    form_id = create_form(admin_token)
    print(f"Created form {form_id}")

    # 4. Share with target user
    add_permission(admin_token, form_id, target_email)

if __name__ == '__main__':
    main()
