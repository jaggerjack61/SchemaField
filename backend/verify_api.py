import requests
import sys
import json

BASE_URL = 'http://127.0.0.1:8000/api'

def log(msg, success=True):
    icon = "✅" if success else "❌"
    print(f"{icon} {msg}")

def test_api():
    print("Testing Forms API...")
    
    # 1. Create a Form
    form_data = {
        "title": "Integration Test Form",
        "description": "Created via test script",
        "sections": [
            {
                "title": "Section 1",
                "description": "First section",
                "order": 0,
                "questions": [
                    {
                        "text": "What is your name?",
                        "question_type": "short_text",
                        "required": True,
                        "order": 0
                    },
                    {
                        "text": "Choose a color",
                        "question_type": "multiple_choice",
                        "required": False,
                        "order": 1,
                        "choices": [
                            {"text": "Red", "order": 0},
                            {"text": "Blue", "order": 1}
                        ]
                    }
                ]
            }
        ]
    }
    
    try:
        # CREATE
        response = requests.post(f"{BASE_URL}/forms/", json=form_data)
        if response.status_code == 201:
            log("Create Form: Success")
            form_id = response.json()['id']
        else:
            log(f"Create Form: Failed {response.status_code} {response.text}", False)
            return

        # LIST
        response = requests.get(f"{BASE_URL}/forms/")
        if response.status_code == 200 and len(response.json()) > 0:
            log("List Forms: Success")
        else:
            log("List Forms: Failed", False)

        # RETRIEVE
        response = requests.get(f"{BASE_URL}/forms/{form_id}/")
        if response.status_code == 200:
            data = response.json()
            if data['title'] == "Integration Test Form" and len(data['sections']) == 1:
                log("Retrieve Form: Success")
            else:
                log("Retrieve Form: Data mismatch", False)
        else:
            log("Retrieve Form: Failed", False)

        # UPDATE
        update_data = form_data.copy()
        update_data['title'] = "Updated Form Title"
        response = requests.put(f"{BASE_URL}/forms/{form_id}/", json=update_data)
        if response.status_code == 200 and response.json()['title'] == "Updated Form Title":
            log("Update Form: Success")
        else:
            log("Update Form: Failed", False)

        # DELETE
        response = requests.delete(f"{BASE_URL}/forms/{form_id}/")
        if response.status_code == 204:
            log("Delete Form: Success")
        else:
            log("Delete Form: Failed", False)

        # VERIFY DELETE
        response = requests.get(f"{BASE_URL}/forms/{form_id}/")
        if response.status_code == 404:
            log("Verify Delete: Success")
        else:
            log("Verify Delete: Failed (Form still exists)", False)

    except Exception as e:
        log(f"Exception during test: {e}", False)

if __name__ == "__main__":
    test_api()
