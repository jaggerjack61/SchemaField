import requests
import sys
import json

BASE_URL = 'http://127.0.0.1:8000/api'

def log(msg, success=True):
    icon = "✅" if success else "❌"
    print(f"{icon} {msg}")

def test_responses():
    print("Testing Responses API...")
    
    # 1. Create a Form
    form_data = {
        "title": "Response Test Form",
        "sections": [
            {
                "title": "S1",
                "questions": [
                    {
                        "text": "What is your name?",
                        "question_type": "short_text",
                        "order": 0
                    },
                    {
                        "text": "Favorite Color",
                        "question_type": "multiple_choice",
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
        # CREATE FORM
        response = requests.post(f"{BASE_URL}/forms/", json=form_data)
        if response.status_code != 201:
            log(f"Create Form Failed: {response.text}", False)
            return
        form_id = response.json()['id']
        questions = response.json()['sections'][0]['questions']
        q1_id = questions[0]['id']
        q2_id = questions[1]['id']
        c1_id = questions[1]['choices'][0]['id']
        log("Create Form: Success")

        # 2. SUBMIT RESPONSE
        submission_data = {
            "answers": [
                {
                    "question_id": q1_id,
                    "text_answer": "John Doe"
                },
                {
                    "question_id": q2_id,
                    "selected_choices": [c1_id]
                }
            ]
        }
        
        response = requests.post(f"{BASE_URL}/forms/{form_id}/submit/", json=submission_data)
        if response.status_code == 201:
            log("Submit Response: Success")
        else:
            log(f"Submit Response Failed: {response.status_code} {response.text}", False)
            return

        # 3. GET RESPONSES
        response = requests.get(f"{BASE_URL}/forms/{form_id}/responses/")
        if response.status_code == 200:
            data = response.json()
            if len(data) == 1:
                ans1 = next(a for a in data[0]['answers'] if a['question'] == q1_id)
                ans2 = next(a for a in data[0]['answers'] if a['question'] == q2_id)
                
                if ans1['text_answer'] == "John Doe" and ans2['selected_choices'] == [c1_id]:
                    log("Verify Response Data: Success")
                else:
                    log(f"Verify Response Data: Mismatch. Got {ans1} and {ans2}", False)
            else:
                log(f"Verify Response List: Expected 1 response, got {len(data)}", False)
        else:
             log(f"Get Responses Failed: {response.status_code}", False)

        # CLEANUP
        requests.delete(f"{BASE_URL}/forms/{form_id}/")

    except Exception as e:
        log(f"Exception: {e}", False)

if __name__ == "__main__":
    test_responses()
