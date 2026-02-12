import requests
import sys

BASE_URL = 'http://127.0.0.1:8000/api'

def log(msg, success=True):
    icon = "✅" if success else "❌"
    print(f"{icon} {msg}")

def test_media_upload():
    print("Testing Media Upload API...")
    
    # 1. Create Form with Media Question
    form_data = {
        "title": "Media Upload Test",
        "sections": [
            {
                "title": "S1",
                "questions": [
                    {
                        "text": "Upload a file",
                        "question_type": "media",
                        "order": 0
                    }
                ]
            }
        ]
    }
    
    try:
        # CREATE FORM
        response = requests.post(f"{BASE_URL}/forms/", json=form_data)
        if response.status_code != 201:
            log(f"Create Form Failed: {response.text}", False)
            return

        form_id = response.json()['id']
        question_id = response.json()['sections'][0]['questions'][0]['id']
        log("Create Form: Success")

        # 2. SUBMIT RESPONSE WITH FILE
        # Create a dummy file
        files = {
            'answers[0]file_answer': ('test.txt', b'Hello World', 'text/plain')
        }
        data = {
            'answers[0]question_id': question_id
        }
        
        # Note: requests handles multipart automatically when 'files' is passed
        response = requests.post(f"{BASE_URL}/forms/{form_id}/submit/", data=data, files=files)
        
        if response.status_code == 201:
            log("Submit Response with File: Success")
        else:
            log(f"Submit Response Failed: {response.status_code} {response.text}", False)
            # requests might not format nested keys like answers[0]file_answer correctly for DRF if not configured?
            # DRF's MultiPartParser should handle it if keys match.
            return

        # 3. GET RESPONSES
        response = requests.get(f"{BASE_URL}/forms/{form_id}/responses/")
        if response.status_code == 200:
            data = response.json()
            if len(data) == 1:
                answer = data[0]['answers'][0]
                if answer['file_answer'] and 'test.txt' in answer['file_answer']:
                    log(f"Verify File Link: Success ({answer['file_answer']})")
                else:
                    log(f"Verify File Link: Failed. Got {answer}", False)
            else:
                log(f"Verify Response List: Expected 1 response", False)
        else:
             log(f"Get Responses Failed: {response.status_code}", False)

        # CLEANUP
        requests.delete(f"{BASE_URL}/forms/{form_id}/")

    except Exception as e:
        log(f"Exception: {e}", False)

if __name__ == "__main__":
    test_media_upload()
